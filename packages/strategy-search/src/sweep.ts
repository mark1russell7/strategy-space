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
import {
  countsOf,
  measuredOf,
  objectivesOf,
  rowsOf,
  STRATEGY_SEARCH_SCHEMA,
  type EvaluationRow,
  type Measure,
  type Measured,
  type Objective,
  type SweepCounts,
} from "./rows.ts";

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
  const objectives = objectivesOf(options.objectives);
  const given = options.enumerate;
  const seed = given.mode === "sample" ? seedOf(given.seed) : null;
  const enumerate = given.mode === "sample" ? { ...given, seed: seed as number } : given;
  const evaluator = options.evaluator ?? null;
  const run = canonicalHash({ schema: STRATEGY_SEARCH_SCHEMA, space: canonicalHash(space), enumerate, objectives, evaluator }).slice(0, 16);

  const drawn = enumerateSpace(space, enumerate);
  const configs: Record<string, StrategyConfig> = {};
  const measured: Measured[] = [];
  for (const config of drawn) {
    const id = configId(space, config);
    if (Object.hasOwn(configs, id)) continue;
    configs[id] = config;
    measured.push(measuredOf(id, options.evaluate(config), objectives));
  }

  const rows = rowsOf(run, seed, measured, objectives);
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
    counts: countsOf(rows),
    rows,
    configs,
  };
}

/** This record is one row of the front and its config. */
export interface FrontEntry {
  readonly row: EvaluationRow;
  readonly config: StrategyConfig;
}

/** The rows and the configs of a run: a sweep or a genetic search. */
export interface RunRows {
  readonly rows: readonly EvaluationRow[];
  readonly configs: Readonly<Record<string, StrategyConfig>>;
}

/**
 * This function gives the rows of the Pareto front of a run and their configs, in the order of the evaluations.
 *
 * @param run - The record of a sweep or of a genetic search
 * @returns The rows of rank 1 and their configs
 */
export function frontOf(run: RunRows): FrontEntry[] {
  return run.rows.filter((row) => row.front).map((row) => ({ row, config: run.configs[row.config] as StrategyConfig }));
}
