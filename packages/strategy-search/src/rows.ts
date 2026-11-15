/**
 * The parts that each search shares: the objectives, the measure of a config and the rows of a run. A sweep and a genetic
 * search make their rows with these functions. Thus a row has one meaning in each run, and two runs compare row for row.
 */
import { enumerateSpace, type EnumerateOptions, type StrategyConfig, type StrategySpace } from "@mark1russell7/strategy-space";
import { GOALS, paretoRanks, type Goal } from "./pareto.ts";

/**
 * This function gives the configs of a grid or of a seeded sample of a space, from `enumerateSpace`. A refusal of the
 * space or of the enumeration is a `RangeError` with the text of the refusal. `enumerateSpace` gives a refusal of the
 * enumeration as a `RangeError`, but a space with a break of `checkSpace` gets a plain `Error`.
 *
 * @param space - The strategy space
 * @param options - The grid or the sample
 * @returns The configs
 * @throws RangeError when `enumerateSpace` refuses the space or the enumeration
 */
export function drawConfigs(space: StrategySpace, options: EnumerateOptions): StrategyConfig[] {
  try {
    return enumerateSpace(space, options);
  } catch (error) {
    if (error instanceof Error && error.constructor === Error) throw new RangeError(error.message, { cause: error });
    throw error;
  }
}

/** The schema of the record of a run. */
export const STRATEGY_SEARCH_SCHEMA = "strategy-search/1";

/** One objective of a search: its name, its goal, and the unit of its values for a reader. */
export interface Objective {
  readonly name: string;
  readonly goal: Goal;
  /** The unit of the values, as text for a reader. The search does not read it. */
  readonly unit?: string;
}

/**
 * The measure of one config, from the evaluation of the caller. `breaks` names each hard constraint that the config breaks.
 * An empty list tells that the config keeps each hard constraint. `values` gives the value of each objective by its name.
 * The search ignores a value of a name that is not an objective.
 */
export interface Measure {
  readonly breaks: readonly string[];
  readonly values: Readonly<Record<string, number>>;
}

/** The status of an evaluation: it keeps each hard constraint and has each value, it breaks a constraint, or a value is not a read. */
export type RowStatus = "feasible" | "breaks" | "unread";

/** One plain row for each evaluation of a run. */
export interface EvaluationRow {
  /** The id of the run. */
  readonly run: string;
  /** The place of the config in the order of the evaluations, from 0. A repeat of a config gets no row. */
  readonly index: number;
  /** The id of the config, from `configId`. */
  readonly config: string;
  /** The seed of the run, or `null` for a grid. */
  readonly seed: number | null;
  /** The status. A break of a hard constraint comes before a value that is not a read. */
  readonly status: RowStatus;
  /** The hard constraints that the config breaks. */
  readonly breaks: readonly string[];
  /** The objectives without a finite value. */
  readonly missing: readonly string[];
  /** The value of each objective, or `null` when the value is not a finite number. */
  readonly values: Readonly<Record<string, number | null>>;
  /** The Pareto rank among the feasible rows, from 1. A row that is not feasible has no rank. */
  readonly rank: number | null;
  /** This value is `true` when the rank is 1. */
  readonly front: boolean;
}

/** The counts of the rows of a run by their status, and the count of the rows on the front. */
export interface SweepCounts {
  readonly feasible: number;
  readonly breaks: number;
  readonly unread: number;
  readonly front: number;
}

/**
 * This function gives the problems of a list of objectives: an empty list, a name that is empty or not unique, and a bad goal.
 *
 * @param objectives - The objectives of a search
 * @returns The problems, or an empty list for good objectives
 */
export function objectiveProblems(objectives: readonly Objective[]): string[] {
  if (!Array.isArray(objectives) || objectives.length === 0) return ["The list of the objectives is empty."];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [i, objective] of objectives.entries()) {
    if (typeof objective?.name !== "string" || objective.name.length === 0) problems.push(`The objective ${String(i)} has no name.`);
    else if (seen.has(objective.name)) problems.push(`The name ${objective.name} is on two objectives.`);
    else seen.add(objective.name);
    if (!GOALS.includes(objective?.goal)) problems.push(`The goal of the objective ${String(i)} is ${String(objective?.goal)}, not min or max.`);
  }
  return problems;
}

/**
 * This function gives the objectives of a run, with only their name, their goal and their unit.
 *
 * @throws RangeError when the objectives are bad
 */
export function objectivesOf(objectives: readonly Objective[]): Objective[] {
  const problems = objectiveProblems(objectives);
  if (problems.length > 0) throw new RangeError(`The objectives are not good: ${problems.join(" ")}`);
  return objectives.map((o) => (o.unit === undefined ? { name: o.name, goal: o.goal } : { name: o.name, goal: o.goal, unit: o.unit }));
}

/** The status, the breaks and the values of one evaluated config, before its rank. */
export interface Measured {
  readonly config: string;
  readonly status: RowStatus;
  readonly breaks: readonly string[];
  readonly missing: readonly string[];
  readonly values: Readonly<Record<string, number | null>>;
}

/** This function reads the measure of the caller for one config. A value that is not a finite number is not a read. */
export function measuredOf(config: string, measure: Measure, objectives: readonly Objective[]): Measured {
  const breaks = [...(measure.breaks ?? [])];
  const values: Record<string, number | null> = {};
  const missing: string[] = [];
  for (const { name } of objectives) {
    const value = measure.values?.[name];
    const read = typeof value === "number" && Number.isFinite(value);
    values[name] = read ? value : null;
    if (!read) missing.push(name);
  }
  const status: RowStatus = breaks.length > 0 ? "breaks" : missing.length > 0 ? "unread" : "feasible";
  return { config, status, breaks, missing, values };
}

/** This function gives one row for each evaluated config, in its order. The Pareto rank is over the feasible configs only. */
export function rowsOf(run: string, seed: number | null, measured: readonly Measured[], objectives: readonly Objective[]): EvaluationRow[] {
  const feasible = measured.filter((m) => m.status === "feasible");
  const ranks = paretoRanks(
    feasible.map((m) => objectives.map(({ name }) => m.values[name] as number)),
    objectives.map((o) => o.goal),
  );
  const rankOf = new Map(feasible.map((m, i) => [m.config, ranks[i] ?? null]));
  return measured.map((m, index) => {
    const rank = rankOf.get(m.config) ?? null;
    return { run, index, config: m.config, seed, status: m.status, breaks: m.breaks, missing: m.missing, values: m.values, rank, front: rank === 1 };
  });
}

/** This function counts the rows of a run by their status, and the rows on the front. */
export function countsOf(rows: readonly EvaluationRow[]): SweepCounts {
  const count = (status: RowStatus): number => rows.filter((row) => row.status === status).length;
  return { feasible: count("feasible"), breaks: count("breaks"), unread: count("unread"), front: rows.filter((row) => row.front).length };
}
