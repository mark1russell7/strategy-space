// The combinators of a strategy space (`docs/OPERATORS.md`): terms over configs, and the count of the terms to a depth.
import { canonicalJson } from "@mark1russell7/rigor-generators";
import type { ClaimBreak } from "./claim.ts";
import { checkConfig, spaceSize, type ShapeFilter, type StrategyConfig, type StrategySpace } from "./strategy-space.ts";

/** The declaration of a combinator: a term with a range of arguments. */
export interface Combinator {
  readonly name: string;
  /** The smallest count of the arguments, a whole number of 1 or more. */
  readonly min: number;
  /** The largest count of the arguments, a whole number of `min` or more. */
  readonly max: number;
  /** With `true`, the order of the arguments changes the term. */
  readonly ordered: boolean;
  /** With `true`, the arguments of a term are all different. */
  readonly distinct: boolean;
  /** The text that tells what the term does with its arguments. */
  readonly summary: string;
}

/** The combinators of the first format. A term of `product` takes a pack config and a route config, and a joint space joins them. */
export const COMBINATORS: readonly Combinator[] = /* @__PURE__ */ Object.freeze([
  { name: "portfolio", min: 2, max: 16, ordered: false, distinct: true, summary: "It gives the input to each argument, and keeps the best result by the score of the space." },
  { name: "sequence", min: 2, max: 2, ordered: true, distinct: false, summary: "It gives the result of the first argument to the second argument." },
  { name: "fallback", min: 2, max: 2, ordered: true, distinct: true, summary: "It gives the result of the first argument. When the first argument refuses the input, it gives the result of the second argument." },
]);

/** A term: a config of the space, or a combinator with its arguments. */
export type StrategyTerm = { readonly config: StrategyConfig } | { readonly combinator: string; readonly args: readonly StrategyTerm[] };

/** The options of `countSpace`. */
export interface CountOptions extends ShapeFilter {
  /** The largest depth of a term. A config has the depth 0. A term has the depth 1 more than its deepest argument. */
  readonly depth: number;
  /** The count of the levels of each numeric param of the space. */
  readonly levels: number;
  /** The combinators. The default is `COMBINATORS`. */
  readonly combinators?: readonly Combinator[];
}

/** The count of the terms of a space. */
export interface TermCount {
  /** The count of the configs without a meta option, the terms of the depth 0. */
  readonly base: bigint;
  /** The item `k` is the count of the terms of a depth of `k` or less. */
  readonly upTo: readonly bigint[];
  /** The count of the terms of a depth of `depth` or less. */
  readonly total: bigint;
}

/** This function throws a `RangeError` for a value that is not a whole number of `min` or more. */
function assertWhole(value: number, name: string, min: number): void {
  if (!Number.isInteger(value) || value < min) throw new RangeError(`The ${name} ${value} is not a whole number of ${min} or more.`);
}

/** This function gives the breaks of a list of combinators. The claims are `combinator`, `duplicate` and `arity`. */
export function checkCombinators(combinators: readonly Combinator[]): ClaimBreak[] {
  const out: ClaimBreak[] = [];
  const names = new Set<string>();
  for (const c of combinators) {
    if (typeof c.name !== "string" || c.name === "") out.push({ claim: "combinator", detail: "a combinator has no name", inputs: [] });
    else if (names.has(c.name)) out.push({ claim: "duplicate", detail: `the list has the combinator ${c.name} two times`, inputs: [c.name] });
    names.add(c.name);
    if (!Number.isInteger(c.min) || c.min < 1 || !Number.isInteger(c.max) || c.max < c.min)
      out.push({ claim: "arity", detail: `the combinator ${c.name} has the arity ${c.min} to ${c.max}, not whole numbers with 1 <= min <= max`, inputs: [c.name] });
  }
  return out;
}

/** This function gives the count of the argument lists of one combinator over a pool of `n` terms. */
function argumentLists(c: Combinator, n: bigint): bigint {
  let sum = 0n;
  for (let m = c.min; m <= c.max; m++) {
    const k = BigInt(m);
    if (c.ordered && c.distinct) sum += fallingFactorial(n, k);
    else if (c.ordered) sum += n ** k;
    else if (c.distinct) sum += fallingFactorial(n, k) / factorial(k);
    else sum += fallingFactorial(n + k - 1n, k) / factorial(k);
  }
  return sum;
}

function fallingFactorial(n: bigint, k: bigint): bigint {
  if (k > n) return 0n;
  let out = 1n;
  for (let i = 0n; i < k; i++) out *= n - i;
  return out;
}

function factorial(k: bigint): bigint {
  let out = 1n;
  for (let i = 2n; i <= k; i++) out *= i;
  return out;
}

/**
 * This function gives the count of the terms of a space to a depth. The base is the count of the configs without a meta option.
 * The terms of a depth of `k - 1` or less give the argument lists of each combinator. The count of a depth of `k` or less is the base plus these lists.
 * Two terms with a different tree count as two terms, also when they give the same layout.
 */
export function countSpace(space: StrategySpace, options: CountOptions): TermCount {
  assertWhole(options.depth, "depth", 0);
  const combinators = options.combinators ?? COMBINATORS;
  const breaks = checkCombinators(combinators);
  if (breaks.length > 0) throw new RangeError(`The combinators are not good: ${breaks.map((b) => b.detail).join("; ")}.`);
  // The meta count is not part of a term count, so maxMeta 0 stops it early.
  const filter = { ...(options.shapes === undefined ? {} : { shapes: options.shapes }), ...(options.kinds === undefined ? {} : { kinds: options.kinds }) };
  const base = spaceSize(space, { levels: options.levels, maxMeta: 0n, ...filter }).base;
  const upTo: bigint[] = [base];
  for (let k = 1; k <= options.depth; k++) {
    const pool = upTo[k - 1]!;
    upTo.push(combinators.reduce((sum, c) => sum + argumentLists(c, pool), base));
  }
  return { base, upTo, total: upTo[options.depth]! };
}

/** This function gives the depth of a term. A config has the depth 0. */
export function termDepth(term: StrategyTerm): number {
  return "config" in term ? 0 : 1 + Math.max(0, ...term.args.map(termDepth));
}

/**
 * This function gives the breaks of a term. The claims are the claims of `checkConfig` for each config, and `combinator`, `arity` and `distinct`.
 * The `inputs` of a break have the path of the term, for example `0.1` for the second argument of the first argument. The root has the path `""`.
 */
export function checkTerm(space: StrategySpace, term: StrategyTerm, combinators: readonly Combinator[] = COMBINATORS): ClaimBreak[] {
  const out: ClaimBreak[] = [];
  const walk = (t: StrategyTerm, path: string): void => {
    const at = path === "" ? "the root" : path;
    if ("config" in t) {
      for (const b of checkConfig(space, t.config)) out.push({ claim: b.claim, detail: `the config at ${at}: ${b.detail}`, inputs: [path] });
      return;
    }
    const c = combinators.find((x) => x.name === t.combinator);
    if (c === undefined) out.push({ claim: "combinator", detail: `the term at ${at} has the unknown combinator ${JSON.stringify(t.combinator)}`, inputs: [path] });
    else if (t.args.length < c.min || t.args.length > c.max)
      out.push({ claim: "arity", detail: `the term ${c.name} at ${at} has ${t.args.length} arguments, not ${c.min} to ${c.max}`, inputs: [path] });
    if (c?.distinct === true) {
      const keys = t.args.map((a) => canonicalJson(a, { form: "json" }));
      if (new Set(keys).size !== keys.length) out.push({ claim: "distinct", detail: `the term ${c.name} at ${at} has the same argument two times`, inputs: [path] });
    }
    t.args.forEach((a, i) => walk(a, path === "" ? String(i) : `${path}.${i}`));
  };
  walk(term, "");
  return out;
}
