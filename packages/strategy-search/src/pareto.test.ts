import { mulberry32 } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { crowdingDistances, dominates, isRead, paretoRanks, type Goal } from "./pareto.ts";

const MIN2: Goal[] = ["min", "min"];

/** This function gives the ranks by the definition: each rank is the set of the points that no point of the rest dominates. */
function naiveRanks(points: number[][], goals: Goal[]): (number | null)[] {
  const ranks: (number | null)[] = points.map(() => null);
  let rest = points.map((_, i) => i).filter((i) => isRead(points[i] as number[]));
  for (let rank = 1; rest.length > 0; rank += 1) {
    const level = rest.filter((i) => !rest.some((j) => dominates(points[j] as number[], points[i] as number[], goals)));
    for (const i of level) ranks[i] = rank;
    rest = rest.filter((i) => !level.includes(i));
  }
  return ranks;
}

describe("rule 1: dominance", () => {
  it("needs as good on each objective and better on one", () => {
    expect(dominates([1, 2], [2, 2], MIN2)).toBe(true);
    expect(dominates([1, 1], [2, 2], MIN2)).toBe(true);
    expect(dominates([1, 3], [2, 2], MIN2)).toBe(false);
    expect(dominates([2, 2], [1, 2], MIN2)).toBe(false);
  });

  it("reads the goal max as a larger value is better", () => {
    expect(dominates([5], [3], ["max"])).toBe(true);
    expect(dominates([3], [5], ["max"])).toBe(false);
    expect(dominates([1, 9], [2, 4], ["min", "max"])).toBe(true);
    expect(dominates([1, 3], [2, 4], ["min", "max"])).toBe(false);
  });
});

describe("rule 2: ties", () => {
  it("gives no dominance between equal points", () => {
    expect(dominates([1, 2], [1, 2], MIN2)).toBe(false);
    expect(dominates([0, 1], [-0, 1], MIN2)).toBe(false);
    expect(dominates([-0, 1], [0, 1], MIN2)).toBe(false);
  });

  it("gives equal points the same rank", () => {
    expect(paretoRanks([[1, 2], [1, 2], [2, 3], [-0, 5], [0, 5]], MIN2)).toEqual([1, 1, 2, 1, 1]);
  });
});

describe("rule 3: a value that is not a finite number", () => {
  const bad = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  it("gives no dominance in either direction", () => {
    for (const value of bad) {
      expect(dominates([value, 0], [1, 1], MIN2)).toBe(false);
      expect(dominates([0, 0], [value, 1], MIN2)).toBe(false);
    }
  });

  it("gives no rank, and does not change the ranks of the other points", () => {
    for (const value of bad) {
      expect(paretoRanks([[2, 2], [value, 0], [1, 1]], MIN2)).toEqual([2, null, 1]);
    }
  });
});

describe("rule 4: ranks", () => {
  it("gives the front rank 1, and each next level the next rank", () => {
    expect(paretoRanks([[3, 3], [1, 1], [2, 2], [1, 4], [4, 1]], MIN2)).toEqual([3, 1, 2, 2, 2]);
  });

  it("gives an empty list for no points", () => {
    expect(paretoRanks([], MIN2)).toEqual([]);
  });

  it("agrees with the definition on seeded points with many ties", () => {
    const next = mulberry32(20261115);
    const goals: Goal[] = ["min", "max", "min"];
    for (let round = 0; round < 40; round += 1) {
      const points = Array.from({ length: 30 }, () =>
        Array.from({ length: 3 }, () => (next() < 0.05 ? Number.NaN : Math.floor(next() * 5))),
      );
      expect(paretoRanks(points, goals)).toEqual(naiveRanks(points, goals));
    }
  });
});

describe("the input checks", () => {
  it("refuses an empty or bad list of goals", () => {
    expect(() => dominates([1], [2], [])).toThrow(RangeError);
    expect(() => paretoRanks([[1]], ["up" as Goal])).toThrow("The goal up is not min or max.");
  });

  it("refuses a point with another count of values than the goals", () => {
    expect(() => dominates([1, 2], [2], MIN2)).toThrow(RangeError);
    expect(() => paretoRanks([[1, 2, 3]], MIN2)).toThrow("The point has 3 values, and the goals have 2.");
  });
});

describe("the crowding distance", () => {
  it("gives each end of each objective Infinity, and each other point the gap of its neighbours over the range", () => {
    // On the first objective the order is 0, 1, 2, 3 with the range 6. On the second objective the order is 3, 2, 1, 0 with the range 6.
    const points = [
      [0, 6],
      [1, 4],
      [3, 1],
      [6, 0],
    ];
    const distances = crowdingDistances(points);
    expect(distances[0]).toBe(Infinity);
    expect(distances[3]).toBe(Infinity);
    expect(distances[1]).toBeCloseTo((3 - 0) / 6 + (6 - 1) / 6, 12);
    expect(distances[2]).toBeCloseTo((6 - 1) / 6 + (4 - 0) / 6, 12);
  });

  it("adds nothing for an objective with one value for each point", () => {
    expect(crowdingDistances([[1, 5], [2, 5], [4, 5]])).toEqual([Infinity, 1, Infinity]);
    expect(crowdingDistances([[5], [5]])).toEqual([0, 0]);
  });

  it("gives an empty list for no points, and 0 for one point", () => {
    expect(crowdingDistances([])).toEqual([]);
    expect(crowdingDistances([[3, 4]])).toEqual([0]);
  });

  it("gives each point the same distance when the points change their order, for distinct values", () => {
    const random = mulberry32(11);
    const points = Array.from({ length: 30 }, () => [random(), random(), random()]);
    const order = points.map((_, i) => i).reverse();
    const forward = crowdingDistances(points);
    const backward = crowdingDistances(order.map((i) => points[i] as number[]));
    for (const [j, i] of order.entries()) expect(backward[j]).toBe(forward[i]);
  });

  it("refuses points with different counts of values, and a value that is not a finite number", () => {
    expect(() => crowdingDistances([[1, 2], [3]])).toThrow(RangeError);
    expect(() => crowdingDistances([[1, Number.NaN]])).toThrow(RangeError);
  });
});
