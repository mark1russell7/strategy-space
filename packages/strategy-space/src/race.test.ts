import { mulberry32 } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { race } from "./index.ts";

/** This function gives a cost table: the base cost of each id, plus a small seeded noise on each input. */
function table(base: Readonly<Record<string, number>>, noise: number, seed = 7): (id: string, input: number) => number {
  const r = mulberry32(seed);
  const rows: Record<string, number[]> = {};
  for (const id of Object.keys(base)) rows[id] = Array.from({ length: 64 }, () => base[id]! + noise * r());
  return (id, input) => rows[id]![input]!;
}

describe("race", () => {
  it("drops two worse terms at the first input count where the Holm test can reject both", () => {
    // With 2 tests, an all-positive set of k gaps has the exact p 2 / 2^k. Holm needs 2 × p < 0.05, so k is 7.
    const result = race(["a", "b", "c"], table({ a: 1, b: 1.5, c: 3 }, 0.1), { inputs: 20 });
    expect(result.best).toBe("a");
    expect(result.live).toEqual(["a"]);
    expect(result.drops.map((d) => [d.id, d.inputs, d.best])).toEqual([
      ["b", 7, "a"],
      ["c", 7, "a"],
    ]);
    expect(result.drops[0]!.p).toBe(2 / 128);
    expect(result.drops[0]!.adjusted).toBe(4 / 128);
    expect(result.inputs).toBe(7);
    expect(result.measured).toBe(21);
    expect(result.full).toBe(60);
  });

  it("measures only the live terms after a drop", () => {
    const calls = { a: 0, b: 0, c: 0 } as Record<"a" | "b" | "c", number>;
    const cost = (id: string): number => (id === "c" ? 5 : 1);
    const result = race(["a", "b", "c"], (id) => (calls[id as "a"]++, cost(id)), { inputs: 30, first: 3 });
    const drop = result.drops.find((d) => d.id === "c")!;
    expect(calls.c).toBe(drop.inputs);
    expect(calls.a).toBe(result.inputs);
    expect(result.measured).toBe(calls.a + calls.b + calls.c);
  });

  it("keeps two equal terms to the last input, and a tie goes to the first id", () => {
    const result = race(["b", "a", "c"], (id) => (id === "c" ? 2 : 1), { inputs: 12 });
    expect(result.drops.map((d) => d.id)).toEqual(["c"]);
    expect(result.live).toEqual(["b", "a"]);
    expect(result.best).toBe("b");
    expect(result.inputs).toBe(12);
    expect(result.means).toEqual({ a: 1, b: 1 });
  });

  it("is a screen with keep equal to the count of the terms", () => {
    const result = race(["a", "b", "c"], table({ a: 1, b: 2, c: 3 }, 0.1), { inputs: 10, keep: 3 });
    expect(result.drops).toEqual([]);
    expect(result.live).toEqual(["a", "b", "c"]);
    expect(result.measured).toBe(result.full);
  });

  it("gives the same result for the same arguments, also with drawn sign sets", () => {
    const go = (seed: number) => race(["a", "b", "c", "d"], table({ a: 1, b: 1.05, c: 1.1, d: 1.5 }, 0.4), { inputs: 40, exactMax: 6, runs: 500, seed });
    expect(JSON.stringify(go(3))).toBe(JSON.stringify(go(3)));
    expect(go(3).drops.length).toBeGreaterThan(0);
  });

  it("does not drop a term before the first input count", () => {
    const result = race(["a", "b"], (id) => (id === "a" ? 1 : 2), { inputs: 20, first: 8 });
    expect(result.drops).toEqual([{ id: "b", inputs: 8, best: "a", gap: 1, p: 2 / 256, adjusted: 2 / 256 }]);
  });

  it("refuses bad arguments", () => {
    const one = () => 1;
    expect(() => race([], one, { inputs: 1 })).toThrow(RangeError);
    expect(() => race(["a", "a"], one, { inputs: 1 })).toThrow(RangeError);
    expect(() => race(["a"], one, { inputs: 0 })).toThrow(RangeError);
    expect(() => race(["a"], one, { inputs: 1, first: 1.5 })).toThrow(RangeError);
    expect(() => race(["a"], one, { inputs: 1, level: 1 })).toThrow(RangeError);
    expect(() => race(["a", "b"], () => Number.NaN, { inputs: 1 })).toThrow(/finite/);
  });
});
