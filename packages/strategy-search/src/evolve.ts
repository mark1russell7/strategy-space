/**
 * The genetic search of a strategy space: NSGA-II (Deb and others, 2002) with the constrained dominance of Deb (2000).
 *
 * A run keeps a population of configs. Each generation makes children from parents of a tournament. Two parents mix
 * their stages, and then a child takes a new choice at some stages. A new choice comes from a seeded sample of the space,
 * so it keeps the ranges of the params. A child that breaks a constraint of the space gives way to its parent.
 * The best configs of the parents and the children make the next population:
 *
 * 1. The configs that keep each hard constraint come first, by their Pareto rank and then by their crowding distance.
 * 2. Then come the configs that break hard constraints, the fewest breaks first.
 * 3. The configs with a value that is not a read come last.
 *
 * The record has one plain row for each evaluation, as a sweep has. The Pareto ranks are over all the feasible rows
 * of the run, not only over the last population. Thus a run and a sweep with the same count of evaluations compare row for row.
 */
import { canonicalHash, deriveSeed, mulberry32, seedOf, type Source } from "@mark1russell7/rigor-generators";
import {
  canonicalConfig,
  checkConfig,
  configId,
  type SampleOptions,
  type StageChoice,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/strategy-space";
import { crowdingDistances, paretoRanks, type Goal } from "./pareto.ts";
import {
  countsOf,
  drawConfigs,
  measuredOf,
  objectiveProblems,
  objectivesOf,
  rowsOf,
  STRATEGY_SEARCH_SCHEMA,
  type EvaluationRow,
  type Measure,
  type Measured,
  type Objective,
  type SweepCounts,
} from "./rows.ts";

/** The options of the samples of a run, as in `enumerateSpace`: the draw, the meta options, the most tries and the shape filter. */
export type EvolveSample = Omit<SampleOptions, "mode" | "n" | "seed" | "fixed">;

/** The options of a genetic search. */
export interface EvolveOptions {
  /** The objectives, with unique names. */
  readonly objectives: readonly Objective[];
  /** The evaluation of one config. It is a pure function: the same config gives the same measure. */
  readonly evaluate: (config: StrategyConfig) => Measure;
  /** The seed of the run: a whole number, or a name for `seedOf`. */
  readonly seed: number | string;
  /** The most evaluations of the run, a whole number of 1 or more. A repeat of a config costs no evaluation. */
  readonly evaluations: number;
  /** The count of the configs of a generation, a whole number of 2 or more. The default is 40. */
  readonly population?: number;
  /** The chance that a child takes a new choice at a stage, from 0 to 1. The default is 1 over the count of the stages. */
  readonly mutation?: number;
  /** The chance that two parents mix their stages, from 0 to 1. The default is 0.9. */
  readonly crossover?: number;
  /** The options of the samples of the first population and of the new choices. */
  readonly sample?: EvolveSample;
  /** The name and the version of the evaluation. It is part of the id of the run. */
  readonly evaluator?: string;
}

/** The defaults of a genetic search. `stall` is the count of the generations in a row with no new config that stops a run. */
export const EVOLVE_DEFAULTS = { population: 40, crossover: 0.9, stall: 20 } as const;

/** One row of a genetic search: a row of a sweep, and the generation that made the config. The first population is generation 0. */
export interface EvolveRow extends EvaluationRow {
  readonly generation: number;
}

/** The reason that a run stops: it used each evaluation, or 20 generations in a row made no new config. */
export type EvolveStop = "budget" | "stall";

/** The record of a genetic search. Its rows have the form of the rows of a sweep. */
export interface EvolveRun {
  readonly schema: typeof STRATEGY_SEARCH_SCHEMA;
  /** The id of the run: the first 16 hex characters of the hash of the space, the options, the objectives and the evaluator. */
  readonly run: string;
  /** The `engine` of the space. */
  readonly engine: string;
  /** The `version` of the space. */
  readonly version: string;
  readonly method: "evolve";
  readonly seed: number;
  readonly objectives: readonly Objective[];
  readonly evaluator: string | null;
  readonly population: number;
  readonly mutation: number;
  readonly crossover: number;
  /** The count of the generations after the first population. */
  readonly generations: number;
  readonly stop: EvolveStop;
  /** The count of the configs that the run proposed, with the repeats. */
  readonly draws: number;
  /** The count of the proposed configs that the run evaluated before. A repeat gets no second evaluation. */
  readonly repeats: number;
  readonly counts: SweepCounts;
  readonly rows: readonly EvolveRow[];
  /** The canonical config of each row, by its id. */
  readonly configs: Readonly<Record<string, StrategyConfig>>;
}

const isWhole = (value: unknown, min: number): boolean => typeof value === "number" && Number.isInteger(value) && value >= min;
const isChance = (value: unknown): boolean => typeof value === "number" && value >= 0 && value <= 1;

/**
 * This function gives the problems of the options of a genetic search. A problem is a bad objective, a bad count of
 * evaluations, a bad population, or a chance that is not from 0 to 1.
 *
 * @param options - The options of a genetic search
 * @returns The problems, or an empty list for good options
 */
export function evolveProblems(options: EvolveOptions): string[] {
  const problems = objectiveProblems(options.objectives);
  if (!isWhole(options.evaluations, 1)) problems.push(`The count of the evaluations is ${String(options.evaluations)}, not a whole number of 1 or more.`);
  if (options.population !== undefined && !isWhole(options.population, 2)) problems.push(`The population is ${String(options.population)}, not a whole number of 2 or more.`);
  if (options.mutation !== undefined && !isChance(options.mutation)) problems.push(`The chance of a mutation is ${String(options.mutation)}, not a number from 0 to 1.`);
  if (options.crossover !== undefined && !isChance(options.crossover)) problems.push(`The chance of a crossover is ${String(options.crossover)}, not a number from 0 to 1.`);
  return problems;
}

/** One evaluated config of a run. `point` has the value of each objective in their order, or `NaN` for a value that is not a read. */
interface Member {
  readonly id: string;
  readonly config: StrategyConfig;
  readonly measured: Measured;
  readonly order: number;
  readonly point: readonly number[];
}

/** The place of a member in a population: its tier, its level in the tier, its crowding distance and its order of evaluation. */
interface Standing {
  readonly tier: number;
  readonly level: number;
  readonly crowd: number;
  readonly order: number;
}

/** This function compares two standings: a lower tier, then a lower level, then a larger crowding distance, then an earlier evaluation. */
function compare(a: Standing, b: Standing): number {
  return a.tier - b.tier || a.level - b.level || b.crowd - a.crowd || a.order - b.order;
}

/**
 * This function gives the standing of each member. A feasible member has the tier 0, its Pareto rank as its level and its
 * crowding distance on its rank. A member that breaks constraints has the tier 1 and the count of its breaks as its level.
 * A member with a value that is not a read has the tier 2.
 */
function standingsOf(members: readonly Member[], goals: readonly Goal[]): Map<Member, Standing> {
  const standings = new Map<Member, Standing>();
  const feasible = members.filter((m) => m.measured.status === "feasible");
  const ranks = paretoRanks(
    feasible.map((m) => m.point),
    goals,
  );
  const levels = new Map<number, Member[]>();
  for (const [i, member] of feasible.entries()) {
    const rank = ranks[i] ?? Number.MAX_SAFE_INTEGER;
    const level = levels.get(rank);
    if (level === undefined) levels.set(rank, [member]);
    else level.push(member);
  }
  for (const [rank, level] of levels) {
    const crowd = crowdingDistances(level.map((m) => m.point));
    for (const [i, member] of level.entries()) standings.set(member, { tier: 0, level: rank, crowd: crowd[i] ?? 0, order: member.order });
  }
  for (const member of members) {
    const { status, breaks, missing } = member.measured;
    if (status === "breaks") standings.set(member, { tier: 1, level: breaks.length, crowd: 0, order: member.order });
    else if (status === "unread") standings.set(member, { tier: 2, level: missing.length, crowd: 0, order: member.order });
  }
  return standings;
}

/** This function gives the better of two random members of a population: a binary tournament. */
function pick(population: readonly Member[], standings: ReadonlyMap<Member, Standing>, random: Source): Member {
  const a = population[Math.floor(random() * population.length)] as Member;
  const b = population[Math.floor(random() * population.length)] as Member;
  return compare(standings.get(a) as Standing, standings.get(b) as Standing) <= 0 ? a : b;
}

/** This function gives the best members of a pool, without repeats: the next population. */
function select(pool: readonly Member[], size: number, goals: readonly Goal[]): Member[] {
  const unique = [...new Map(pool.map((m) => [m.id, m])).values()];
  const standings = standingsOf(unique, goals);
  return unique.sort((a, b) => compare(standings.get(a) as Standing, standings.get(b) as Standing)).slice(0, size);
}

/** This function copies the choice of one stage, or its absence, from a config. */
function put(to: Record<string, StageChoice | null>, name: string, from: StrategyConfig): void {
  if (Object.hasOwn(from.stages, name)) to[name] = from.stages[name] as StageChoice | null;
}

/** This function mixes the stages of two parents: each stage of the first child comes from one parent, and the second child gets the other. */
function mix(space: StrategySpace, a: StrategyConfig, b: StrategyConfig, random: Source): [StrategyConfig, StrategyConfig] {
  const x: Record<string, StageChoice | null> = {};
  const y: Record<string, StageChoice | null> = {};
  for (const { name } of space.stages) {
    const swap = random() < 0.5;
    put(x, name, swap ? b : a);
    put(y, name, swap ? a : b);
  }
  return [
    { space: a.space, stages: x },
    { space: a.space, stages: y },
  ];
}

/** This function gives a child a new choice at each stage with the chance `rate`. The new choice comes from a config of a sample. */
function mutate(space: StrategySpace, child: StrategyConfig, donor: StrategyConfig, rate: number, random: Source): StrategyConfig {
  const changed = new Set(space.stages.filter(() => random() < rate).map((stage) => stage.name));
  if (changed.size === 0) return child;
  const stages: Record<string, StageChoice | null> = {};
  for (const { name } of space.stages) put(stages, name, changed.has(name) ? donor : child);
  return { space: child.space, stages };
}

/**
 * This function searches a space with a genetic algorithm, and gives the record of the run.
 *
 * - The first population comes from a seeded sample of the space. The new choices of the children come from more samples.
 *   Each sample has at least the size of the population, and at least the count of the choices of the widest stage.
 * - Each config of a row keeps the constraints of the space.
 * - A config that the run proposes again gets no second evaluation. The record counts the repeats.
 * - The run stops when it used each evaluation, or when 20 generations in a row made no new config.
 * - The result is deterministic: one space, one set of options and one evaluation give one record.
 *
 * @param space - The strategy space
 * @param options - The objectives, the evaluation, the seed, the count of the evaluations, and the options of the algorithm
 * @returns The record of the run
 * @throws RangeError when the options are bad, or when `enumerateSpace` refuses a sample
 */
export function evolve(space: StrategySpace, options: EvolveOptions): EvolveRun {
  const problems = evolveProblems(options);
  if (problems.length > 0) throw new RangeError(`The options of the search are not good: ${problems.join(" ")}`);
  const objectives = objectivesOf(options.objectives);
  const goals = objectives.map((o) => o.goal);
  const seed = seedOf(options.seed);
  const size = options.population ?? EVOLVE_DEFAULTS.population;
  const mutation = options.mutation ?? 1 / Math.max(1, space.stages.length);
  const crossover = options.crossover ?? EVOLVE_DEFAULTS.crossover;
  const budget = options.evaluations;
  const sample = options.sample ?? {};
  const evaluator = options.evaluator ?? null;
  const settings = { method: "evolve", seed, evaluations: budget, population: size, mutation, crossover, sample };
  const run = canonicalHash({ schema: STRATEGY_SEARCH_SCHEMA, space: canonicalHash(space), settings, objectives, evaluator }).slice(0, 16);

  const random = mulberry32(deriveSeed(seed, "choices"));
  // A seeded sample of n configs puts the choices of a stage in n strata. Thus a sample with fewer configs than the choices
  // of a stage never offers its last choices, and a sample of 1 config always takes the first choice of each stage.
  const widest = Math.max(...space.stages.map((stage) => stage.options.length + (stage.optional === true ? 1 : 0)));
  const drawSize = Math.max(size, widest);
  let batch = 0;
  const draw = (): StrategyConfig[] => {
    batch += 1;
    return drawConfigs(space, { ...sample, mode: "sample", n: drawSize, seed: deriveSeed(seed, `sample-${String(batch)}`) });
  };
  const valid = (config: StrategyConfig): boolean => checkConfig(space, config, sample).length === 0;

  const known = new Map<string, Member>();
  const members: Member[] = [];
  const generationOf: number[] = [];
  let draws = 0;
  let repeats = 0;
  const visit = (config: StrategyConfig, generation: number): Member => {
    draws += 1;
    const id = configId(space, config);
    const seen = known.get(id);
    if (seen !== undefined) {
      repeats += 1;
      return seen;
    }
    const canonical = canonicalConfig(space, config);
    const measured = measuredOf(id, options.evaluate(canonical), objectives);
    const point = objectives.map(({ name }) => measured.values[name] ?? Number.NaN);
    const member: Member = { id, config: canonical, measured, order: members.length, point };
    known.set(id, member);
    members.push(member);
    generationOf.push(generation);
    return member;
  };

  let population: Member[] = [];
  let stall = 0;
  while (population.length < size && members.length < budget && stall < EVOLVE_DEFAULTS.stall) {
    const before = population.length;
    for (const config of draw()) {
      if (population.length >= size || members.length >= budget) break;
      const member = visit(config, 0);
      if (!population.includes(member)) population.push(member);
    }
    stall = population.length === before ? stall + 1 : 0;
  }

  let generations = 0;
  stall = 0;
  while (population.length > 0 && members.length < budget && stall < EVOLVE_DEFAULTS.stall) {
    generations += 1;
    const before = members.length;
    const standings = standingsOf(population, goals);
    const donors = draw();
    const children: Member[] = [];
    for (let k = 0; k < size && members.length < budget; k += 2) {
      const a = pick(population, standings, random);
      const b = pick(population, standings, random);
      const crossed = random() < crossover ? mix(space, a.config, b.config, random) : undefined;
      const pair = crossed === undefined ? [a.config, b.config] : [valid(crossed[0]) ? crossed[0] : a.config, valid(crossed[1]) ? crossed[1] : b.config];
      for (const [i, child] of pair.entries()) {
        if (members.length >= budget || k + i >= size) break;
        const donor = donors[(k + i) % Math.max(1, donors.length)];
        const mutated = donor === undefined ? child : mutate(space, child, donor, mutation, random);
        children.push(visit(mutated !== child && valid(mutated) ? mutated : child, generations));
      }
    }
    population = select([...population, ...children], size, goals);
    stall = members.length === before ? stall + 1 : 0;
  }

  const rows: EvolveRow[] = rowsOf(
    run,
    seed,
    members.map((m) => m.measured),
    objectives,
  ).map((row, i) => ({ ...row, generation: generationOf[i] ?? 0 }));
  return {
    schema: STRATEGY_SEARCH_SCHEMA,
    run,
    engine: space.engine,
    version: space.version,
    method: "evolve",
    seed,
    objectives,
    evaluator,
    population: size,
    mutation,
    crossover,
    generations,
    stop: members.length >= budget ? "budget" : "stall",
    draws,
    repeats,
    counts: countsOf(rows),
    rows,
    configs: Object.fromEntries(members.map((m) => [m.id, m.config])),
  };
}
