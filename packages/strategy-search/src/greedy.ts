/**
 * A budgeted greedy choice with lazy evaluation. Each step adds one unit of the item with the largest gain for each unit of
 * cost, while the budget has money for it. The value of a choice is a list of numbers, and the first number is the most
 * important. Thus a gain on the first number always comes before a gain on the second number.
 *
 * The lazy evaluation keeps the last gain of each item as a bound. It evaluates an item again only when its bound is the
 * largest. This is correct when the gain of an item does not increase as the choice grows (diminishing gains). With such
 * gains, the greedy choice and the best single unit together hold at least `(1 - 1/e) / 2` of the best value
 * (Khuller, Moss and Naor 1999). When the gains of two items increase together, set `lazy` to `false`.
 *
 * The package knows no domain: the caller gives the value of a choice as a function.
 */
import { GOALS, type Goal } from "./pareto.ts";

/** One item of a greedy choice: its id, the cost of one unit, and the largest count of its units. */
export interface GreedyItem {
  readonly id: string;
  /** The cost of one unit, a finite number more than 0. */
  readonly cost: number;
  /** The largest count of units that the choice adds to `start`. The default is 1. */
  readonly max?: number;
}

/** A choice: the count of the units of each item, by the id of the item. An item with no units is not in the record. */
export type Selection = Readonly<Record<string, number>>;

/** The options of a greedy choice. */
export interface GreedyOptions {
  readonly items: readonly GreedyItem[];
  /** The money for the units, a finite number of 0 or more. */
  readonly budget: number;
  /** The value of a choice, the most important number first. It is a pure function. Each list has the same length. */
  readonly value: (selection: Selection) => readonly number[];
  /** The goal of each number of the value. The default is `max`. */
  readonly goal?: Goal;
  /** The units that the choice has before the first step. Their cost is not in the budget. */
  readonly start?: Selection;
  /** With `false`, each step evaluates each item again. The default is `true`. */
  readonly lazy?: boolean;
  /** With `true`, the result is the best single unit when that unit has a better value than the greedy choice. The default is `true`. */
  readonly single?: boolean;
  /** A part of a gain at or below `tolerance * max(1, |value|)` is 0. The default is `1e-9`. */
  readonly tolerance?: number;
}

/** One step of a greedy choice: the item of one unit, its cost, its gain and the value after it. */
export interface GreedyPick {
  readonly id: string;
  readonly cost: number;
  /** The gain of the unit, in the direction of the goal. A positive part is better. */
  readonly gain: readonly number[];
  /** The value of the choice after the step. */
  readonly value: readonly number[];
}

/** The reason that a greedy choice stops. */
export type GreedyStop = "budget" | "units" | "no-gain";

/** The record of a greedy choice. */
export interface GreedyRun {
  /** `greedy` is the result of the steps. `single` tells that the best single unit has a better value. */
  readonly method: "greedy" | "single";
  /** The steps, one for each unit, in the order of the choice. */
  readonly picks: readonly GreedyPick[];
  /** The units of the result, with the units of `start`. */
  readonly selection: Selection;
  /** The cost of the units of the result, without `start`. */
  readonly spent: number;
  /** The value of `start`. */
  readonly before: readonly number[];
  /** The value of the result. */
  readonly after: readonly number[];
  /** The reason that the steps stop. */
  readonly stop: GreedyStop;
  /** The count of the calls of `value`. */
  readonly evaluations: number;
}

/**
 * This function gives the problems of the options of a greedy choice: bad items, a bad budget, a bad goal and a bad start.
 *
 * @param options - The options
 * @returns The problems, or an empty list for good options
 */
export function greedyProblems(options: GreedyOptions): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(options.items)) return ["The items are not a list."];
  for (const [i, item] of options.items.entries()) {
    if (typeof item?.id !== "string" || item.id.length === 0) problems.push(`The item ${String(i)} has no id.`);
    else if (seen.has(item.id)) problems.push(`The id ${item.id} is on two items.`);
    else seen.add(item.id);
    if (!(Number.isFinite(item?.cost) && item.cost > 0)) problems.push(`The cost of the item ${String(i)} is ${String(item?.cost)}. It must be a finite number more than 0.`);
    if (item?.max !== undefined && !(Number.isSafeInteger(item.max) && item.max >= 0)) problems.push(`The max of the item ${String(i)} is ${String(item.max)}. It must be a whole number of 0 or more.`);
  }
  if (!(Number.isFinite(options.budget) && options.budget >= 0)) problems.push(`The budget is ${String(options.budget)}. It must be a finite number of 0 or more.`);
  if (options.goal !== undefined && !GOALS.includes(options.goal)) problems.push(`The goal is ${String(options.goal)}, not min or max.`);
  if (options.tolerance !== undefined && !(Number.isFinite(options.tolerance) && options.tolerance >= 0)) problems.push(`The tolerance is ${String(options.tolerance)}. It must be a finite number of 0 or more.`);
  for (const [id, units] of Object.entries(options.start ?? {})) {
    if (!(Number.isSafeInteger(units) && units >= 0)) problems.push(`The start has ${String(units)} units of ${id}. It must be a whole number of 0 or more.`);
  }
  return problems;
}

/** This function compares two lists of numbers by their first different number. It gives a negative number when `a` is less. */
function compareLists(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** This function tells if a gain is better than no gain: its first part that is not 0 is positive. */
function isGain(gain: readonly number[]): boolean {
  return compareLists(gain, []) > 0;
}

/**
 * This function makes a budgeted greedy choice. Each step adds one unit of the item with the largest gain for each unit of
 * cost. The comparison of two gains is by their first different part. A step that does not fit the money left, or that has
 * no gain, is not a step. Equal gains go to the item that comes first in `items`.
 *
 * @param options - The items, the budget, the value of a choice and the goal
 * @returns The record of the choice
 * @throws RangeError when the options are bad, or when a value is not a list of finite numbers with one length
 */
export function greedy(options: GreedyOptions): GreedyRun {
  const problems = greedyProblems(options);
  if (problems.length > 0) throw new RangeError(`The options of the greedy choice are not good: ${problems.join(" ")}`);
  const sign = (options.goal ?? "max") === "max" ? 1 : -1;
  const lazy = options.lazy ?? true;
  const tolerance = options.tolerance ?? 1e-9;
  let evaluations = 0;
  let width: number | undefined;
  const valueOf = (selection: Selection): readonly number[] => {
    evaluations += 1;
    const value = [...options.value(selection)];
    if (!value.every((part) => typeof part === "number" && Number.isFinite(part))) throw new RangeError(`The value of a choice is not a list of finite numbers: ${JSON.stringify(value)}.`);
    width ??= value.length;
    if (value.length !== width) throw new RangeError(`The value of a choice has ${String(value.length)} numbers, and the first value has ${String(width)}.`);
    return value;
  };
  const gainOf = (from: readonly number[], to: readonly number[]): number[] =>
    to.map((part, i) => {
      const d = sign * (part - (from[i] ?? 0));
      return Math.abs(d) <= tolerance * Math.max(1, Math.abs(from[i] ?? 0)) ? 0 : d;
    });
  const add = (selection: Selection, id: string): Selection => ({ ...selection, [id]: (selection[id] ?? 0) + 1 });

  const start: Selection = Object.fromEntries(Object.entries(options.start ?? {}).filter(([, units]) => units > 0));
  const before = valueOf(start);
  let selection = start;
  let current = before;
  let left = options.budget;
  let spent = 0;
  const picks: GreedyPick[] = [];
  const items = options.items.map((item, index) => ({ item, index, max: item.max ?? 1, stamp: -1, bound: [Infinity] as readonly number[], gain: [] as readonly number[], after: [] as readonly number[] }));
  const units = (id: string): number => (selection[id] ?? 0) - (start[id] ?? 0);
  let stop: GreedyStop = "units";
  for (let step = 0; ; step += 1) {
    const open = items.filter((entry) => units(entry.item.id) < entry.max);
    if (open.length === 0) {
      stop = "units";
      break;
    }
    const fits = open.filter((entry) => entry.item.cost <= left * (1 + Number.EPSILON));
    if (fits.length === 0) {
      stop = "budget";
      break;
    }
    let pick: (typeof items)[number] | undefined;
    for (;;) {
      // The entry with the largest bound. Equal bounds go to the entry that comes first.
      let top: (typeof items)[number] | undefined;
      for (const entry of fits) if (top === undefined || compareLists(entry.bound, top.bound) > 0) top = entry;
      if (top === undefined || (top.stamp >= 0 && !isGain(top.bound))) break;
      if (top.stamp === step) {
        pick = top;
        break;
      }
      const after = valueOf(add(selection, top.item.id));
      top.after = after;
      top.gain = gainOf(current, after);
      top.bound = top.gain.map((part) => part / top.item.cost);
      top.stamp = step;
    }
    if (pick === undefined) {
      stop = "no-gain";
      break;
    }
    selection = add(selection, pick.item.id);
    picks.push({ id: pick.item.id, cost: pick.item.cost, gain: pick.gain, value: pick.after });
    current = pick.after;
    left -= pick.item.cost;
    spent += pick.item.cost;
    // Without lazy evaluation, each bound is evaluated again in the next step.
    if (!lazy) for (const entry of items) entry.bound = [Infinity];
  }

  if (options.single ?? true) {
    let best: { id: string; cost: number; after: readonly number[] } | undefined;
    for (const { item, max } of items) {
      if (max < 1 || item.cost > options.budget * (1 + Number.EPSILON)) continue;
      const after = valueOf(add(start, item.id));
      if (best === undefined || compareLists(gainOf(best.after, after), []) > 0) best = { id: item.id, cost: item.cost, after };
    }
    if (best !== undefined && isGain(gainOf(current, best.after))) {
      const gain = gainOf(before, best.after);
      return { method: "single", picks: [{ id: best.id, cost: best.cost, gain, value: best.after }], selection: add(start, best.id), spent: best.cost, before, after: best.after, stop, evaluations };
    }
  }
  return { method: "greedy", picks, selection, spent, before, after: current, stop, evaluations };
}
