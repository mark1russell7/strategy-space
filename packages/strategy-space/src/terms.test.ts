import { canonicalJson } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { checkCombinators, checkTerm, COMBINATORS, countSpace, enumerateSpace, spaceSize, termDepth, type Combinator, type StrategySpace, type StrategyTerm } from "./index.ts";

// 2 orders and a gap of 3 levels: 6 configs.
const space: StrategySpace = {
  schema: "strategy-space/1",
  engine: "pack",
  version: "0.0.1",
  stages: [
    { name: "order", options: [{ id: "area", params: [] }, { id: "height", params: [] }] },
    { name: "placement", options: [{ id: "shelf", params: [{ name: "gap", kind: "int", min: 0, max: 8, default: 2 }] }] },
  ],
};

const configs = enumerateSpace(space, { mode: "grid", levels: 3 });

/** This function makes each term to a depth by brute force, and gives the count of the terms that `checkTerm` accepts. */
function bruteCount(combinators: readonly Combinator[], depth: number): number {
  let pool: StrategyTerm[] = configs.map((config) => ({ config }));
  for (let k = 1; k <= depth; k++) {
    const next = new Map<string, StrategyTerm>(pool.map((t) => [canonicalJson(t, { form: "json" }), t]));
    for (const c of combinators)
      for (let m = c.min; m <= c.max; m++) {
        const lists = (left: number): StrategyTerm[][] => (left === 0 ? [[]] : lists(left - 1).flatMap((l) => pool.map((t) => [...l, t])));
        for (const args of lists(m)) {
          const term: StrategyTerm = { combinator: c.name, args };
          if (checkTerm(space, term, combinators).length > 0) continue;
          // An unordered combinator: the sorted list of the argument keys is the key of the term.
          const keys = args.map((a) => canonicalJson(a, { form: "json" }));
          const key = c.ordered ? canonicalJson(term, { form: "json" }) : `${c.name}(${[...keys].sort().join(",")})`;
          next.set(key, term);
        }
      }
    pool = [...next.values()];
  }
  return pool.length;
}

describe("countSpace", () => {
  it("gives the counts by hand at the depths 0 and 1", () => {
    expect(configs).toHaveLength(6);
    const count = countSpace(space, { depth: 1, levels: 3 });
    expect(count.base).toBe(6n);
    // sequence 6 * 6, fallback 6 * 5, portfolio C(6, 2) + ... + C(6, 6) = 57.
    expect(count.upTo).toEqual([6n, 6n + 36n + 30n + 57n]);
    expect(count.total).toBe(129n);
    expect(countSpace(space, { depth: 0, levels: 3 }).total).toBe(spaceSize(space, { levels: 3 }).base);
  });

  it("agrees with a brute-force walk of the terms for each kind of combinator", () => {
    const kinds: Combinator[] = [
      { name: "seq", min: 2, max: 2, ordered: true, distinct: false, summary: "s" },
      { name: "alt", min: 2, max: 2, ordered: true, distinct: true, summary: "a" },
      { name: "set", min: 1, max: 3, ordered: false, distinct: true, summary: "p" },
      { name: "bag", min: 2, max: 2, ordered: false, distinct: false, summary: "b" },
    ];
    for (const c of kinds) expect(countSpace(space, { depth: 1, levels: 3, combinators: [c] }).total).toBe(BigInt(bruteCount([c], 1)));
    expect(countSpace(space, { depth: 1, levels: 3, combinators: kinds }).total).toBe(BigInt(bruteCount(kinds, 1)));
    // Depth 2 with one small combinator: the pool of depth 1 has 6 + 15 = 21 terms.
    const pair = [kinds[1]!];
    expect(countSpace(space, { depth: 2, levels: 3, combinators: pair }).total).toBe(BigInt(bruteCount(pair, 2)));
  });

  it("grows with the depth, and gives the base with no combinator", () => {
    const { upTo } = countSpace(space, { depth: 3, levels: 3 });
    for (let k = 1; k < upTo.length; k++) expect(upTo[k]! > upTo[k - 1]!).toBe(true);
    expect(countSpace(space, { depth: 4, levels: 3, combinators: [] }).upTo).toEqual([6n, 6n, 6n, 6n, 6n]);
  });

  it("refuses a bad depth and bad combinators", () => {
    expect(() => countSpace(space, { depth: -1, levels: 3 })).toThrow(RangeError);
    expect(() => countSpace(space, { depth: 1.5, levels: 3 })).toThrow(RangeError);
    expect(() => countSpace(space, { depth: 1, levels: 3, combinators: [{ ...COMBINATORS[0]!, min: 3, max: 2 }] })).toThrow("arity");
  });
});

describe("checkCombinators", () => {
  it("accepts the first format and finds bad lists", () => {
    expect(checkCombinators(COMBINATORS)).toEqual([]);
    expect(COMBINATORS.map((c) => c.name)).toEqual(["portfolio", "sequence", "fallback"]);
    expect(checkCombinators([COMBINATORS[0]!, COMBINATORS[0]!]).map((b) => b.claim)).toEqual(["duplicate"]);
    expect(checkCombinators([{ ...COMBINATORS[1]!, min: 0 }]).map((b) => b.claim)).toEqual(["arity"]);
    expect(checkCombinators([{ ...COMBINATORS[1]!, name: "" }]).map((b) => b.claim)).toEqual(["combinator"]);
  });
});

describe("checkTerm and termDepth", () => {
  const [a, b] = [{ config: configs[0]! }, { config: configs[1]! }];

  it("accepts good terms and gives their depth", () => {
    const term: StrategyTerm = { combinator: "fallback", args: [a, { combinator: "portfolio", args: [a, b] }] };
    expect(checkTerm(space, term)).toEqual([]);
    expect(termDepth(a)).toBe(0);
    expect(termDepth(term)).toBe(2);
  });

  it("finds an unknown combinator, a bad arity, a repeated argument and a bad config, with the path", () => {
    expect(checkTerm(space, { combinator: "loop", args: [a, b] }).map((x) => [x.claim, x.inputs])).toEqual([["combinator", [""]]]);
    expect(checkTerm(space, { combinator: "sequence", args: [a] }).map((x) => x.claim)).toEqual(["arity"]);
    expect(checkTerm(space, { combinator: "fallback", args: [a, a] }).map((x) => x.claim)).toEqual(["distinct"]);
    // sequence takes the same argument two times.
    expect(checkTerm(space, { combinator: "sequence", args: [a, a] })).toEqual([]);
    const bad = { config: { space: "pack", stages: { order: { option: "none" } } } };
    const breaks = checkTerm(space, { combinator: "sequence", args: [a, { combinator: "fallback", args: [b, bad] }] });
    expect(breaks.length).toBeGreaterThan(0);
    expect(breaks.every((x) => x.inputs[0] === "1.1")).toBe(true);
  });

  it("finds a repeated argument when only the key order of the configs differs", () => {
    const stages = configs[0]!.stages;
    const swapped = { config: { space: "pack", stages: Object.fromEntries(Object.entries(stages).reverse()) } };
    expect(checkTerm(space, { combinator: "portfolio", args: [a, swapped] }).map((x) => x.claim)).toEqual(["distinct"]);
  });
});
