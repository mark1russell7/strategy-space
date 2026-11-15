/**
 * The sweep of a strategy space. A sweep evaluates each config of a grid or of a seeded sample of the space, and gives one
 * plain row for each evaluation. A row has the id of the config, the seed of the run and the value of each objective. It
 * also has the result of the hard constraints and the Pareto rank. Thus a query of the rows tells which configs are on the front.
 *
 * The space comes from `@mark1russell7/strategy-space`: `enumerateSpace` gives the configs, and `configId` gives their ids.
 * The seed of a name comes from `seedOf` of `@mark1russell7/rigor-generators`. The package knows no domain: the caller
 * gives the evaluation as a function.
 */
import { canonicalHash, seedOf } from "@mark1russell7/rigor-generators";
import {
  configId,
  enumerateSpace,
  type GridOptions,
  type SampleOptions,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/strategy-space";
import { GOALS, paretoRanks, type Goal } from "./pareto.ts";

/** The schema of a sweep run. */
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

/** One plain row for each evaluation of a sweep. */
export interface EvaluationRow {
  /** The id of the run. */
  readonly run: string;
  /** The place of the config in the order of the enumeration, from 0. A repeat of a config gets no row. */
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

/** The options of a sample of a sweep. The seed is a whole number or a name. A name gives the seed of `seedOf`. */
export type SweepSample = Omit<SampleOptions, "seed"> & { readonly seed: number | string };

/** The options of a sweep. */
export interface SweepOptions {
  /** The objectives, with unique names. */
  readonly objectives: readonly Objective[];
  /** The evaluation of one config. It is a pure function: the same config gives the same measure. */
  readonly evaluate: (config: StrategyConfig) => Measure;
  /** The configs to evaluate: a grid or a seeded sample of the space. */
  readonly enumerate: GridOptions | SweepSample;
  /** The name and the version of the evaluation. It is part of the id of the run. */
  readonly evaluator?: string;
}

/** The counts of the rows of a run by their status, and the count of the rows on the front. */
export interface SweepCounts {
  readonly feasible: number;
  readonly breaks: number;
  readonly unread: number;
  readonly front: number;
}

/** The record of a sweep: the identity of the run, one row for each evaluation, and the configs by their ids. */
export interface SweepRun {
  readonly schema: typeof STRATEGY_SEARCH_SCHEMA;
  /** The id of the run: the first 16 hex characters of the hash of the space, the enumeration, the objectives and the evaluator. */
  readonly run: string;
  /** The `engine` of the space. */
  readonly engine: string;
  /** The `version` of the space. */
  readonly version: string;
  readonly method: "grid" | "sample";
  /** The seed of the run, or `null` for a grid. */
  readonly seed: number | null;
  readonly objectives: readonly Objective[];
  readonly evaluator: string | null;
  /** The count of the configs of the enumeration, with the repeats. */
  readonly draws: number;
  /** The count of the configs that the enumeration gave again. A repeat gets no second evaluation. */
  readonly repeats: number;
  readonly counts: SweepCounts;
  readonly rows: readonly EvaluationRow[];
  /** The canonical config of each row, by its id. */
  readonly configs: Readonly<Record<string, StrategyConfig>>;
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
 * This function evaluates each config of a grid or of a seeded sample of a space, and gives the record of the run.
 *
 * - The configs come from `enumerateSpace`, so each config keeps the constraints of the space.
 * - A config that the enumeration gives again gets no second evaluation. The record counts the repeats.
 * - The Pareto rank is over the feasible rows only. A row that breaks a hard constraint, or that has a value that is not a read, gets no rank.
 * - The result is deterministic: one space, one enumeration, one evaluation and one seed give one record.
 *
 * @param space - The strategy space
 * @param options - The objectives, the evaluation, the enumeration and the name of the evaluator
 * @returns The record of the run
 * @throws RangeError when the objectives are bad, or when `enumerateSpace` refuses the enumeration
 */
export function sweep(space: StrategySpace, options: SweepOptions): SweepRun {
  const problems = objectiveProblems(options.objectives);
  if (problems.length > 0) throw new RangeError(`The objectives are not good: ${problems.join(" ")}`);
  const objectives = options.objectives.map((o) => (o.unit === undefined ? { name: o.name, goal: o.goal } : { name: o.name, goal: o.goal, unit: o.unit }));
  const given = options.enumerate;
  const seed = given.mode === "sample" ? seedOf(given.seed) : null;
  const enumerate = given.mode === "sample" ? { ...given, seed: seed as number } : given;
  const evaluator = options.evaluator ?? null;
  const run = canonicalHash({ schema: STRATEGY_SEARCH_SCHEMA, space: canonicalHash(space), enumerate, objectives, evaluator }).slice(0, 16);

  const drawn = enumerateSpace(space, enumerate);
  const configs: Record<string, StrategyConfig> = {};
  const measured: { config: string; status: RowStatus; breaks: string[]; missing: string[]; values: Record<string, number | null> }[] = [];
  for (const config of drawn) {
    const id = configId(space, config);
    if (Object.hasOwn(configs, id)) continue;
    configs[id] = config;
    const measure = options.evaluate(config);
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
    measured.push({ config: id, status, breaks, missing, values });
  }

  const feasible = measured.filter((m) => m.status === "feasible");
  const ranks = paretoRanks(
    feasible.map((m) => objectives.map(({ name }) => m.values[name] as number)),
    objectives.map((o) => o.goal),
  );
  const rankOf = new Map(feasible.map((m, i) => [m.config, ranks[i] ?? null]));
  const rows: EvaluationRow[] = measured.map((m, index) => {
    const rank = rankOf.get(m.config) ?? null;
    return { run, index, config: m.config, seed, status: m.status, breaks: m.breaks, missing: m.missing, values: m.values, rank, front: rank === 1 };
  });
  const count = (status: RowStatus): number => rows.filter((row) => row.status === status).length;
  return {
    schema: STRATEGY_SEARCH_SCHEMA,
    run,
    engine: space.engine,
    version: space.version,
    method: given.mode,
    seed,
    objectives,
    evaluator,
    draws: drawn.length,
    repeats: drawn.length - rows.length,
    counts: { feasible: count("feasible"), breaks: count("breaks"), unread: count("unread"), front: rows.filter((row) => row.front).length },
    rows,
    configs,
  };
}

/** This record is one row of the front and its config. */
export interface FrontEntry {
  readonly row: EvaluationRow;
  readonly config: StrategyConfig;
}

/**
 * This function gives the rows of the Pareto front of a run and their configs, in the order of the enumeration.
 *
 * @param run - The record of a sweep
 * @returns The rows of rank 1 and their configs
 */
export function frontOf(run: SweepRun): FrontEntry[] {
  return run.rows.filter((row) => row.front).map((row) => ({ row, config: run.configs[row.config] as StrategyConfig }));
}
