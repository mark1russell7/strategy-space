import { mulberry32 } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { greedy, greedyProblems, type GreedyItem, type Selection } from "./greedy.ts";

/** The value of a choice when each unit of an item adds a fixed amount. */
const linear =
  (worth: Readonly<Record<string, number>>) =>
  (selection: Selection): number[] => [Object.entries(selection).reduce((total, [id, units]) => total + units * (worth[id] ?? 0), 0)];

describe("greedy", () => {
  it("adds the unit with the largest gain for each unit of cost, while the budget has money", () => {
    const items: GreedyItem[] = [
      { id: "a", cost: 2, max: 3 },
      { id: "b", cost: 1, max: 2 },
    ];
    const run = greedy({ items, budget: 5, value: linear({ a: 5, b: 3 }), single: false });
    // The ratio of b is 3 and the ratio of a is 2.5. So the two units of b come first, then one unit of a.
    expect(run.picks.map((pick) => pick.id)).toEqual(["b", "b", "a"]);
    expect(run.selection).toEqual({ b: 2, a: 1 });
    expect(run.spent).toBe(4);
    expect(run.before).toEqual([0]);
    expect(run.after).toEqual([11]);
    expect(run.stop).toBe("budget");
    expect(run.picks[2]).toEqual({ id: "a", cost: 2, gain: [5], value: [11] });
  });

  it("puts a gain on the first number before each gain on the second number", () => {
    // The item c gives much on the second number, and d gives a little on the first number.
    const value = (selection: Selection): number[] => [selection["d"] ?? 0, 100 * (selection["c"] ?? 0)];
    const run = greedy({ items: [{ id: "c", cost: 1 }, { id: "d", cost: 10 }], budget: 10, value, single: false });
    expect(run.picks.map((pick) => pick.id)).toEqual(["d"]);
    expect(run.stop).toBe("budget");
  });

  it("goes to the min goal: a smaller value is a gain", () => {
    const value = (selection: Selection): number[] => [10 - 2 * (selection["x"] ?? 0)];
    const run = greedy({ items: [{ id: "x", cost: 1, max: 9 }], budget: 100, value, goal: "min" });
    // After 5 units the value is 0, and it keeps falling. The max of 9 units stops it.
    expect(run.selection).toEqual({ x: 9 });
    expect(run.stop).toBe("units");
    expect(run.picks[0]?.gain).toEqual([2]);
  });

  it("stops when no unit has a gain", () => {
    const value = (selection: Selection): number[] => [Math.min(2, selection["y"] ?? 0)];
    const run = greedy({ items: [{ id: "y", cost: 1, max: 10 }], budget: 10, value });
    expect(run.selection).toEqual({ y: 2 });
    expect(run.stop).toBe("no-gain");
    expect(run.spent).toBe(2);
  });

  it("gives the best single unit when it is better than the greedy choice", () => {
    // The greedy choice takes a (ratio 2) and then b does not fit. The single unit b gives 10.
    const items: GreedyItem[] = [
      { id: "a", cost: 1 },
      { id: "b", cost: 10 },
    ];
    const run = greedy({ items, budget: 10, value: linear({ a: 2, b: 10 }) });
    expect(run.method).toBe("single");
    expect(run.selection).toEqual({ b: 1 });
    expect(run.after).toEqual([10]);
    expect(run.spent).toBe(10);
    const plain = greedy({ items, budget: 10, value: linear({ a: 2, b: 10 }), single: false });
    expect(plain.method).toBe("greedy");
    expect(plain.after).toEqual([2]);
  });

  it("starts from the units of start, and their cost is not in the budget", () => {
    const value = (selection: Selection): number[] => [Math.min(3, selection["z"] ?? 0)];
    const run = greedy({ items: [{ id: "z", cost: 4, max: 5 }], budget: 4, value, start: { z: 2 } });
    expect(run.before).toEqual([2]);
    expect(run.selection).toEqual({ z: 3 });
    expect(run.spent).toBe(4);
  });

  it("evaluates fewer choices with lazy evaluation, and gives the same choice", () => {
    const worth = { a: 9, b: 7, c: 5, d: 3 };
    // Concave gains: the square root of the units of each item.
    const value = (selection: Selection): number[] => [Object.entries(selection).reduce((total, [id, units]) => total + (worth[id as keyof typeof worth] ?? 0) * Math.sqrt(units), 0)];
    const items = Object.keys(worth).map((id) => ({ id, cost: 1, max: 6 }));
    const lazy = greedy({ items, budget: 12, value, single: false });
    const full = greedy({ items, budget: 12, value, lazy: false, single: false });
    expect(lazy.picks.map((pick) => pick.id)).toEqual(full.picks.map((pick) => pick.id));
    expect(lazy.evaluations).toBeLessThan(full.evaluations);
  });

  it("refuses bad options and bad values", () => {
    expect(greedyProblems({ items: [{ id: "a", cost: 0 }, { id: "a", cost: 1, max: 1.5 }], budget: -1, value: () => [0] })).toHaveLength(4);
    expect(() => greedy({ items: [{ id: "a", cost: -1 }], budget: 1, value: () => [0] })).toThrow(RangeError);
    expect(() => greedy({ items: [{ id: "a", cost: 1 }], budget: 1, value: () => [Number.NaN] })).toThrow(RangeError);
    let calls = 0;
    const growing = (): number[] => (calls++ === 0 ? [0] : [0, 1]);
    expect(() => greedy({ items: [{ id: "a", cost: 1 }], budget: 1, value: growing })).toThrow(RangeError);
  });

  it("gives an empty choice with a budget of 0", () => {
    const run = greedy({ items: [{ id: "a", cost: 1 }], budget: 0, value: linear({ a: 1 }) });
    expect(run.picks).toEqual([]);
    expect(run.stop).toBe("budget");
  });
});

describe("greedy laws on random coverage values", () => {
  /** A coverage value: a choice covers the union of the sets of its items. The gains diminish. */
  function coverage(seed: number): { items: GreedyItem[]; value: (selection: Selection) => number[]; weights: number[] } {
    const random = mulberry32(seed);
    const weights = Array.from({ length: 12 }, () => 1 + Math.floor(random() * 9));
    const sets = Array.from({ length: 6 }, () => weights.map((_, i) => i).filter(() => random() < 0.35));
    const items = sets.map((_, i) => ({ id: `i${String(i)}`, cost: 1 + Math.floor(random() * 5) }));
    const value = (selection: Selection): number[] => {
      const covered = new Set<number>();
      for (const [i, set] of sets.entries()) if ((selection[`i${String(i)}`] ?? 0) > 0) for (const e of set) covered.add(e);
      return [[...covered].reduce((total, e) => total + (weights[e] ?? 0), 0)];
    };
    return { items, value, weights };
  }

  /** The best value of a choice under the budget, by a search of each subset. */
  function best(items: readonly GreedyItem[], budget: number, value: (selection: Selection) => number[]): number {
    let top = 0;
    for (let mask = 0; mask < 1 << items.length; mask += 1) {
      const chosen = items.filter((_, i) => (mask >> i) & 1);
      if (chosen.reduce((total, item) => total + item.cost, 0) > budget) continue;
      top = Math.max(top, value(Object.fromEntries(chosen.map((item) => [item.id, 1])))[0] ?? 0);
    }
    return top;
  }

  it("gives the same choice with and without lazy evaluation", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { items, value } = coverage(seed);
      const lazy = greedy({ items, budget: 7, value });
      const full = greedy({ items, budget: 7, value, lazy: false });
      expect(lazy.selection, `seed ${String(seed)}`).toEqual(full.selection);
      expect(lazy.after).toEqual(full.after);
    }
  });

  it("holds (1 - 1/e) / 2 of the best value, and never spends more than the budget", () => {
    const bound = (1 - 1 / Math.E) / 2;
    for (let seed = 1; seed <= 40; seed += 1) {
      const { items, value } = coverage(seed);
      for (const budget of [3, 6, 9]) {
        const run = greedy({ items, budget, value });
        expect(run.spent).toBeLessThanOrEqual(budget);
        expect(run.after[0] ?? 0, `seed ${String(seed)} budget ${String(budget)}`).toBeGreaterThanOrEqual(bound * best(items, budget, value) - 1e-9);
      }
    }
  });
});
