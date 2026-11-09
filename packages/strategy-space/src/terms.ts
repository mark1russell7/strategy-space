// The combinators of a strategy space (`docs/OPERATORS.md`): terms over configs, and the count of the terms to a depth.
import { canonicalJson } from "@mark1russell7/rigor-generators";
import type { ClaimBreak } from "./claim.ts";
import { canonicalConfig, checkConfig, spaceSize, type ShapeFilter, type StrategyConfig, type StrategySpace } from "./strategy-space.ts";

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
  /**
   * The spec of a term of this combinator. With no value, a term has no spec.
   * `object`: the term has a spec object, for example the rule that picks the best result of a portfolio.
   * `limits`: the spec is `{ measure, limits }`. The limits are increasing numbers, one fewer than the arguments.
   */
  readonly spec?: "object" | "limits";
  /** The text that tells what the term does with its arguments. */
  readonly summary: string;
}

/**
 * The combinators of the first format. A term of `product` takes a pack config and a route config, and a joint space joins them.
 * A tie of a `portfolio` goes to the first argument in the order of `canonicalTerm`. So the order of the arguments does not change the result.
 */
export const COMBINATORS: readonly Combinator[] = /* @__PURE__ */ Object.freeze([
  {
    name: "portfolio",
    min: 2,
    max: 16,
    ordered: false,
    distinct: true,
    spec: "object",
    summary: "It gives the input to each argument, and keeps the best result by the pick rule of its spec. A tie goes to the first argument in the canonical order.",
  },
  { name: "sequence", min: 2, max: 2, ordered: true, distinct: false, summary: "It gives the result of the first argument to the second argument." },
  { name: "fallback", min: 2, max: 2, ordered: true, distinct: true, summary: "It gives the result of the first argument. When the first argument refuses the input, it gives the result of the second argument." },
  {
    name: "dispatch",
    min: 2,
    max: 16,
    ordered: true,
    distinct: false,
    spec: "limits",
    summary: "It reads one measure of the input. At or below the first limit, it gives the result of the first argument, and so on up the limits.",
  },
]);

/**
 * The starts of the keys that a spec can not have at any depth, with case ignored, for example `budgetMs` or `timeoutMs`.
 * A time budget makes the result change with the speed of the computer. A key that ends with `work`, for example `budgetWork`, is a count of steps, so a spec can have it.
 */
export const BUDGET_KEYS: readonly string[] = /* @__PURE__ */ Object.freeze(["budget", "deadline", "timeout"]);

/**
 * This function gives the index of the argument of a `dispatch` term for a value of its measure. A band includes its upper limit.
 * So the value `limits[i]` goes to the argument `i`, and a value above the last limit goes to the last argument.
 */
export function dispatchIndex(limits: readonly number[], value: number): number {
  if (Number.isNaN(value)) throw new RangeError("The value of the measure is NaN.");
  const i = limits.findIndex((limit) => value <= limit);
  return i === -1 ? limits.length : i;
}

/** A term: a config of the space, or a combinator with its arguments. */
export type StrategyTerm =
  | { readonly config: StrategyConfig }
  | { readonly combinator: string; readonly args: readonly StrategyTerm[]; readonly spec?: Readonly<Record<string, unknown>> };

/** The options of `countSpace`. */
export interface CountOptions extends ShapeFilter {
  /** The largest depth of a term. A config has the depth 0. A term has the depth 1 more than its deepest argument. */
  readonly depth: number;
  /** The count of the levels of each numeric param of the space. */
  readonly levels: number;
  /** The combinators. The default is `COMBINATORS`. */
  readonly combinators?: readonly Combinator[];
  /**
   * The count of the specs of a term of each combinator, by its name. A list gives a count for each count of arguments, from `min` to `max`.
   * The default is 1. A `dispatch` term with `m` arguments has the count of its measures times the count of the lists of `m - 1` limits.
   */
  readonly specs?: Readonly<Record<string, bigint | readonly bigint[]>>;
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

/** This function gives the count of the specs of one combinator for each count of arguments, from `min` to `max`. */
function specCounts(c: Combinator, specs: CountOptions["specs"]): bigint[] {
  const given = specs?.[c.name];
  const width = c.max - c.min + 1;
  const counts = given === undefined ? Array<bigint>(width).fill(1n) : typeof given === "bigint" ? Array<bigint>(width).fill(given) : [...given];
  if (counts.length !== width || counts.some((x) => typeof x !== "bigint" || x < 0n))
    throw new RangeError(`The specs of ${c.name} are not ${width} whole numbers of 0 or more.`);
  return counts;
}

/** This function gives the count of the terms of one combinator over a pool of `n` terms: the argument lists times the specs. */
function argumentLists(c: Combinator, n: bigint, specs: readonly bigint[]): bigint {
  let sum = 0n;
  for (let m = c.min; m <= c.max; m++) {
    const k = BigInt(m);
    let lists: bigint;
    if (c.ordered && c.distinct) lists = fallingFactorial(n, k);
    else if (c.ordered) lists = n ** k;
    else if (c.distinct) lists = fallingFactorial(n, k) / factorial(k);
    else lists = fallingFactorial(n + k - 1n, k) / factorial(k);
    sum += lists * specs[m - c.min]!;
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
 * The terms of a depth of `k - 1` or less give the argument lists of each combinator. Each list counts once for each spec.
 * The count of a depth of `k` or less is the base plus these terms. Two terms with a different tree count as two terms, also when they give the same layout.
 */
export function countSpace(space: StrategySpace, options: CountOptions): TermCount {
  assertWhole(options.depth, "depth", 0);
  const combinators = options.combinators ?? COMBINATORS;
  const breaks = checkCombinators(combinators);
  if (breaks.length > 0) throw new RangeError(`The combinators are not good: ${breaks.map((b) => b.detail).join("; ")}.`);
  // The meta count is not part of a term count, so maxMeta 0 stops it early.
  const filter = { ...(options.shapes === undefined ? {} : { shapes: options.shapes }), ...(options.kinds === undefined ? {} : { kinds: options.kinds }) };
  const base = spaceSize(space, { levels: options.levels, maxMeta: 0n, ...filter }).base;
  const specs = combinators.map((c) => specCounts(c, options.specs));
  const upTo: bigint[] = [base];
  for (let k = 1; k <= options.depth; k++) {
    const pool = upTo[k - 1]!;
    upTo.push(combinators.reduce((sum, c, i) => sum + argumentLists(c, pool, specs[i]!), base));
  }
  return { base, upTo, total: upTo[options.depth]! };
}

/** This function gives the depth of a term. A config has the depth 0. */
export function termDepth(term: StrategyTerm): number {
  return "config" in term ? 0 : 1 + Math.max(0, ...term.args.map(termDepth));
}

/** This function gives the path of the first key that starts with a key of `BUDGET_KEYS`, or `undefined` when the value has none. */
function budgetKey(value: unknown, path: string): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  for (const [key, inner] of Object.entries(value)) {
    const at = path === "" ? key : `${path}.${key}`;
    const lower = key.toLowerCase();
    if (BUDGET_KEYS.some((start) => lower.startsWith(start)) && !lower.endsWith("work")) return at;
    const found = budgetKey(inner, at);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** This function gives the breaks of the spec of a term of the combinator `c`. */
function specBreaks(c: Combinator, t: { readonly args: readonly StrategyTerm[]; readonly spec?: unknown }, at: string): string[] {
  const spec = t.spec;
  const isObject = spec !== null && typeof spec === "object" && !Array.isArray(spec);
  if (c.spec === undefined) return spec === undefined ? [] : [`the term ${c.name} at ${at} has a spec, but ${c.name} takes no spec`];
  if (!isObject) return [`the term ${c.name} at ${at} has no spec object`];
  if (c.spec === "object") return [];
  const { measure, limits } = spec as { measure?: unknown; limits?: unknown };
  const out: string[] = [];
  if (typeof measure !== "string" || measure === "") out.push(`the term ${c.name} at ${at} has no measure`);
  const good =
    Array.isArray(limits) &&
    limits.length === t.args.length - 1 &&
    limits.every((x, i) => typeof x === "number" && Number.isFinite(x) && (i === 0 || x > (limits[i - 1] as number)));
  if (!good) out.push(`the term ${c.name} at ${at} needs ${t.args.length - 1} increasing finite limits`);
  return out;
}

/**
 * This function gives the breaks of a term. The claims are the claims of `checkConfig` for each config, and `combinator`, `arity`, `distinct`, `spec` and `budget`.
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
    if (c !== undefined) for (const detail of specBreaks(c, t, at)) out.push({ claim: "spec", detail, inputs: [path] });
    const budget = budgetKey(t.spec, "");
    if (budget !== undefined) out.push({ claim: "budget", detail: `the spec at ${at} has the time budget ${budget}, so the term is not deterministic`, inputs: [path] });
    if (c?.distinct === true) {
      // Two spellings of one config are one argument, so the key is the canonical form. A config with a break keeps its spelling.
      const keys = t.args.map((a) => canonicalJson(formOf(a, combinators, space, true), { form: "json" }));
      if (new Set(keys).size !== keys.length) out.push({ claim: "distinct", detail: `the term ${c.name} at ${at} has the same argument two times`, inputs: [path] });
    }
    t.args.forEach((a, i) => walk(a, path === "" ? String(i) : `${path}.${i}`));
  };
  walk(term, "");
  return out;
}

/**
 * This function gives the canonical form of a term. It sorts the arguments of each term of an unordered combinator by their canonical JSON.
 * Two terms that differ only in the order of such arguments give the same form. A tie of a `portfolio` goes to the first argument of this form.
 *
 * With a `space`, each config of the term becomes its `canonicalConfig` before the sort. Then two spellings of one config give one form and one order.
 * With a `space`, the function throws an `Error` for a config with a break of `checkConfig`.
 */
export function canonicalTerm(term: StrategyTerm, combinators: readonly Combinator[] = COMBINATORS, space?: StrategySpace): StrategyTerm {
  return formOf(term, combinators, space, false);
}

/** This function gives the form of `canonicalTerm`. With `keepBad`, a config with a break keeps its spelling, and the function does not throw. */
function formOf(term: StrategyTerm, combinators: readonly Combinator[], space: StrategySpace | undefined, keepBad: boolean): StrategyTerm {
  if ("config" in term) {
    if (space === undefined || (keepBad && checkConfig(space, term.config).length > 0)) return term;
    return { ...term, config: canonicalConfig(space, term.config) };
  }
  const args = term.args.map((a) => formOf(a, combinators, space, keepBad));
  const c = combinators.find((x) => x.name === term.combinator);
  if (c !== undefined && !c.ordered) {
    const keyed = args.map((a) => [canonicalJson(a, { form: "json" }), a] as const);
    keyed.sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
    return { ...term, args: keyed.map(([, a]) => a) };
  }
  return { ...term, args };
}
