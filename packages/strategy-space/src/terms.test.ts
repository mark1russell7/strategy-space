import { canonicalJson } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import {
  BUDGET_KEYS,
  canonicalTerm,
  checkCombinators,
  checkTerm,
  COMBINATORS,
  countSpace,
  enumerateSpace,
  spaceSize,
  termDepth,
  type Combinator,
  type StrategySpace,
  type StrategyTerm,
} from "./index.ts";

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
    // sequence 6 * 6, fallback 6 * 5, portfolio C(6, 2) + ... + C(6, 6) = 57, dispatch 6^2 + ... + 6^16.
    let dispatch = 0n;
    for (let m = 2n; m <= 16n; m++) dispatch += 6n ** m;
    expect(count.upTo).toEqual([6n, 6n + 36n + 30n + 57n + dispatch]);
    const firstThree = COMBINATORS.filter((c) => c.name !== "dispatch");
    expect(countSpace(space, { depth: 1, levels: 3, combinators: firstThree }).total).toBe(129n);
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

  it("counts each list once for each spec, with one count or a count for each count of arguments", () => {
    const portfolio = [COMBINATORS[0]!];
    const one = countSpace(space, { depth: 1, levels: 3, combinators: portfolio }).total - 6n;
    expect(countSpace(space, { depth: 1, levels: 3, combinators: portfolio, specs: { portfolio: 4n } }).total - 6n).toBe(4n * one);
    // A list of counts: 2 specs for 2 arguments, 0 for the other counts. C(6, 2) = 15.
    const counts = Array.from({ length: 15 }, (_, i) => (i === 0 ? 2n : 0n));
    expect(countSpace(space, { depth: 1, levels: 3, combinators: portfolio, specs: { portfolio: counts } }).total).toBe(6n + 30n);
    expect(() => countSpace(space, { depth: 1, levels: 3, combinators: portfolio, specs: { portfolio: [1n] } })).toThrow("specs of portfolio");
    expect(() => countSpace(space, { depth: 1, levels: 3, combinators: portfolio, specs: { portfolio: -1n } })).toThrow("specs of portfolio");
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
    expect(COMBINATORS.map((c) => c.name)).toEqual(["portfolio", "sequence", "fallback", "dispatch"]);
    expect(checkCombinators([COMBINATORS[0]!, COMBINATORS[0]!]).map((b) => b.claim)).toEqual(["duplicate"]);
    expect(checkCombinators([{ ...COMBINATORS[1]!, min: 0 }]).map((b) => b.claim)).toEqual(["arity"]);
    expect(checkCombinators([{ ...COMBINATORS[1]!, name: "" }]).map((b) => b.claim)).toEqual(["combinator"]);
  });
});

describe("checkTerm and termDepth", () => {
  const [a, b] = [{ config: configs[0]! }, { config: configs[1]! }];
  const pick = { level: "hard", measures: [{ id: "length", minEffect: 0.01 }] };

  it("accepts good terms and gives their depth", () => {
    const term: StrategyTerm = { combinator: "fallback", args: [a, { combinator: "portfolio", args: [a, b], spec: pick }] };
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
    expect(checkTerm(space, { combinator: "portfolio", args: [a, swapped], spec: pick }).map((x) => x.claim)).toEqual(["distinct"]);
  });

  it("finds a missing spec, a spec on a combinator with no spec, and bad limits", () => {
    expect(checkTerm(space, { combinator: "portfolio", args: [a, b] }).map((x) => x.claim)).toEqual(["spec"]);
    expect(checkTerm(space, { combinator: "sequence", args: [a, b], spec: {} }).map((x) => x.claim)).toEqual(["spec"]);
    const c = { config: configs[2]! };
    expect(checkTerm(space, { combinator: "dispatch", args: [a, b, c], spec: { measure: "nodes", limits: [50, 200] } })).toEqual([]);
    // dispatch takes the same argument in two bands.
    expect(checkTerm(space, { combinator: "dispatch", args: [a, b, a], spec: { measure: "nodes", limits: [50, 200] } })).toEqual([]);
    const bad = (spec: Record<string, unknown>) => checkTerm(space, { combinator: "dispatch", args: [a, b, c], spec }).map((x) => x.detail);
    expect(bad({ measure: "nodes", limits: [200, 50] })).toEqual(["the term dispatch at the root needs 2 increasing finite limits"]);
    expect(bad({ measure: "nodes", limits: [50] })).toHaveLength(1);
    expect(bad({ measure: "nodes", limits: [50, Number.POSITIVE_INFINITY] })).toHaveLength(1);
    expect(bad({ limits: [50, 200] })).toEqual(["the term dispatch at the root has no measure"]);
  });

  it("refuses a time budget at any depth of a spec", () => {
    expect(BUDGET_KEYS).toEqual(["budget", "deadline", "timeout"]);
    const breaks = checkTerm(space, { combinator: "portfolio", args: [a, b], spec: { ...pick, stretch: { cap: 2, timeout: 50 } } });
    expect(breaks.map((x) => [x.claim, x.detail])).toEqual([["budget", "the spec at the root has the time budget stretch.timeout, so the term is not deterministic"]]);
  });
});

describe("canonicalTerm", () => {
  const [a, b, c] = [{ config: configs[0]! }, { config: configs[1]! }, { config: configs[2]! }];

  it("sorts the arguments of an unordered combinator at each depth, and keeps the order of an ordered one", () => {
    const one: StrategyTerm = { combinator: "sequence", args: [c, { combinator: "portfolio", args: [b, a], spec: {} }] };
    const two: StrategyTerm = { combinator: "sequence", args: [c, { combinator: "portfolio", args: [a, b], spec: {} }] };
    expect(canonicalTerm(one)).toEqual(canonicalTerm(two));
    const swapped: StrategyTerm = { combinator: "sequence", args: [{ combinator: "portfolio", args: [a, b], spec: {} }, c] };
    expect(canonicalTerm(swapped)).not.toEqual(canonicalTerm(two));
    expect(canonicalTerm(canonicalTerm(one))).toEqual(canonicalTerm(one));
    expect(canonicalTerm(a)).toBe(a);
  });
});
