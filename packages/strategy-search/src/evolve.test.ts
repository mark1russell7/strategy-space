import { seedOf } from "@mark1russell7/rigor-generators";
import { checkConfig, STRATEGY_SPACE_SCHEMA, type StrategyConfig, type StrategySpace } from "@mark1russell7/strategy-space";
import { describe, expect, it } from "vitest";
import { evolve, evolveProblems, type EvolveOptions } from "./evolve.ts";
import { frontOf, sweep, type Measure, type Objective } from "./index.ts";

/** A space of `n` bits: one stage for each bit, with the options 0 and 1. */
function bits(n: number): StrategySpace {
  return {
    schema: STRATEGY_SPACE_SCHEMA,
    engine: "bits",
    version: "1",
    stages: Array.from({ length: n }, (_, i) => ({ name: `b${String(i)}`, options: [{ id: "0", params: [] }, { id: "1", params: [] }] })),
  };
}

const onesOf = (config: StrategyConfig): number => Object.values(config.stages).filter((choice) => choice?.option === "1").length;
const ones: Objective[] = [{ name: "ones", goal: "max" }];
const countOnes = (config: StrategyConfig): Measure => ({ breaks: [], values: { ones: onesOf(config) } });

/** The toy space of the tests of the sweep: two shapes, and a count from 1 to 4. */
const toy: StrategySpace = {
  schema: STRATEGY_SPACE_SCHEMA,
  engine: "toy",
  version: "1",
  stages: [
    { name: "shape", options: [{ id: "box", params: [] }, { id: "round", params: [] }] },
    { name: "size", options: [{ id: "n", params: [{ name: "count", kind: "int", min: 1, max: 4, default: 1 }] }] },
  ],
};
const toyObjectives: Objective[] = [
  { name: "cost", goal: "min", unit: "USD" },
  { name: "speed", goal: "max" },
];
function toyMeasure(config: StrategyConfig): Measure {
  const round = config.stages["shape"]?.option === "round";
  const count = Number(config.stages["size"]?.params?.["count"] ?? 1);
  return { breaks: [], values: { cost: count * (round ? 3 : 2), speed: count * (round ? 3 : 1) } };
}

describe("a genetic search", () => {
  const options: EvolveOptions = { objectives: ones, evaluate: countOnes, seed: "bits", evaluations: 200, population: 20 };
  const run = evolve(bits(20), options);

  it("is deterministic: the same space and options give the same record", () => {
    expect(evolve(bits(20), options)).toEqual(run);
  });

  it("takes its seed from seedOf, and another seed gives another run", () => {
    expect(run.seed).toBe(seedOf("bits"));
    const other = evolve(bits(20), { ...options, seed: "other" });
    expect(other.run).not.toBe(run.run);
    expect(other.rows.map((row) => row.config)).not.toEqual(run.rows.map((row) => row.config));
  });

  it("uses each evaluation of the budget, and gives one row for each, in order", () => {
    expect(run.stop).toBe("budget");
    expect(run.rows).toHaveLength(200);
    expect(run.rows.map((row) => row.index)).toEqual(Array.from({ length: 200 }, (_, i) => i));
    expect(run.draws).toBe(run.rows.length + run.repeats);
    expect(new Set(run.rows.map((row) => row.config)).size).toBe(200);
    expect(Object.keys(run.configs).sort()).toEqual(run.rows.map((row) => row.config).sort());
  });

  it("gives generation 0 to the first population, and a later generation never comes before an earlier one", () => {
    expect(run.rows.slice(0, 20).every((row) => row.generation === 0)).toBe(true);
    for (let i = 1; i < run.rows.length; i += 1) expect(run.rows[i]?.generation).toBeGreaterThanOrEqual(run.rows[i - 1]?.generation ?? 0);
    expect(run.rows.at(-1)?.generation).toBe(run.generations);
  });

  it("gives the options of the run in the record, with the defaults", () => {
    expect(run).toMatchObject({ method: "evolve", engine: "bits", population: 20, crossover: 0.9, mutation: 1 / 20, evaluator: null });
  });

  it("finds more ones than a seeded sample with the same count of evaluations", () => {
    const sample = sweep(bits(20), { objectives: ones, evaluate: countOnes, enumerate: { mode: "sample", n: 200, seed: "bits" } });
    const best = (values: (number | null)[]): number => Math.max(...values.map((v) => v ?? 0));
    const evolved = best(run.rows.map((row) => row.values["ones"] ?? null));
    const sampled = best(sample.rows.map((row) => row.values["ones"] ?? null));
    expect(evolved).toBeGreaterThan(sampled);
  });

  it("gives frontOf the rows of rank 1 and their configs", () => {
    const front = frontOf(run);
    expect(front.length).toBe(run.counts.front);
    const top = Math.max(...run.rows.map((row) => row.values["ones"] ?? 0));
    for (const { row, config } of front) {
      expect(row.values["ones"]).toBe(top);
      expect(onesOf(config)).toBe(top);
    }
  });
});

describe("a genetic search of a small space", () => {
  const run = evolve(toy, { objectives: toyObjectives, evaluate: toyMeasure, seed: 3, evaluations: 100, population: 6 });

  it("evaluates each config one time and stops when no generation gives a new config", () => {
    expect(run.stop).toBe("stall");
    expect(run.rows).toHaveLength(8);
    expect(run.repeats).toBeGreaterThan(0);
  });

  it("gives the front of the grid when it evaluates the whole space", () => {
    const grid = sweep(toy, { objectives: toyObjectives, evaluate: toyMeasure, enumerate: { mode: "grid", levels: 4 } });
    const frontIds = (rows: readonly { config: string; front: boolean }[]): string[] => rows.filter((row) => row.front).map((row) => row.config).sort();
    expect(frontIds(run.rows)).toEqual(frontIds(grid.rows));
    const rankOf = new Map(grid.rows.map((row) => [row.config, row.rank]));
    for (const row of run.rows) expect(row.rank).toBe(rankOf.get(row.config));
  });
});

describe("the constraints", () => {
  // Each pair of stages must agree: a crossover of x0y0 and x1y1 gives x0y1, which the space refuses.
  const pairs = 6;
  const space: StrategySpace = {
    ...bits(pairs * 2),
    engine: "pairs",
    constraints: Array.from({ length: pairs }, (_, i) => [
      { if: { stage: `b${String(2 * i)}`, option: "0" }, then: { stage: `b${String(2 * i + 1)}`, option: "0" } },
      { if: { stage: `b${String(2 * i)}`, option: "1" }, then: { stage: `b${String(2 * i + 1)}`, option: "1" } },
    ]).flat(),
  };

  it("keeps each constraint of the space in each config of the run", () => {
    const run = evolve(space, { objectives: ones, evaluate: countOnes, seed: 5, evaluations: 60, population: 10, mutation: 0.3, sample: { draw: "walk" } });
    expect(run.rows.length).toBeGreaterThan(10);
    for (const config of Object.values(run.configs)) expect(checkConfig(space, config)).toEqual([]);
  });

  it("puts the configs that keep the hard constraints of the measure first", () => {
    // A config with more than 12 ones of 16 breaks the limit. The best feasible configs have 12 ones.
    const limited = (config: StrategyConfig): Measure => {
      const count = onesOf(config);
      return { breaks: count > 12 ? ["too-many"] : [], values: { ones: count } };
    };
    const run = evolve(bits(16), { objectives: ones, evaluate: limited, seed: 9, evaluations: 400, population: 20 });
    expect(run.counts.breaks).toBeGreaterThan(0);
    for (const row of run.rows) expect(row.status === "breaks").toBe((row.values["ones"] ?? 0) > 12);
    for (const { row } of frontOf(run)) expect(row.values["ones"]).toBe(12);
    const last = run.rows.filter((row) => row.generation === run.generations);
    expect(last.filter((row) => row.status === "feasible").length).toBeGreaterThan(last.length / 2);
  });

  it("gives a value that is not a read no rank", () => {
    const holes = (config: StrategyConfig): Measure => {
      const count = onesOf(config);
      return { breaks: [], values: { ones: count % 3 === 0 ? Number.NaN : count } };
    };
    const run = evolve(bits(10), { objectives: ones, evaluate: holes, seed: 2, evaluations: 80, population: 10 });
    const unread = run.rows.filter((row) => row.status === "unread");
    expect(unread.length).toBe(run.counts.unread);
    expect(unread.length).toBeGreaterThan(0);
    for (const row of unread) expect(row).toMatchObject({ rank: null, front: false, missing: ["ones"], values: { ones: null } });
  });
});

describe("the options", () => {
  const good: EvolveOptions = { objectives: ones, evaluate: countOnes, seed: 1, evaluations: 10 };

  it("gives no problem for good options", () => {
    expect(evolveProblems(good)).toEqual([]);
    expect(evolveProblems({ ...good, population: 2, mutation: 0, crossover: 1 })).toEqual([]);
  });

  it("names each bad option", () => {
    expect(evolveProblems({ ...good, evaluations: 0 })).toHaveLength(1);
    expect(evolveProblems({ ...good, evaluations: 2.5 })).toHaveLength(1);
    expect(evolveProblems({ ...good, population: 1 })).toHaveLength(1);
    expect(evolveProblems({ ...good, mutation: 1.5 })).toHaveLength(1);
    expect(evolveProblems({ ...good, crossover: -0.1 })).toHaveLength(1);
    expect(evolveProblems({ ...good, objectives: [] })).toHaveLength(1);
  });

  it("refuses bad options with a RangeError", () => {
    expect(() => evolve(bits(4), { ...good, population: 1 })).toThrow(RangeError);
  });

  it("stops at a budget smaller than the population", () => {
    const run = evolve(bits(8), { ...good, evaluations: 5, population: 10 });
    expect(run.rows).toHaveLength(5);
    expect(run.generations).toBe(0);
    expect(run.stop).toBe("budget");
  });
});

describe("the parts of the algorithm, over the seeds 1 to 5", () => {
  const seeds = [1, 2, 3, 4, 5];
  const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
  const oneMax = seeds.map((seed) => evolve(bits(40), { objectives: ones, evaluate: countOnes, seed, evaluations: 300, population: 20 }));

  it("selects the better parent in a tournament: the best of 40 bits is 38 or more on average", () => {
    // Measured on 2026-11-15: 39.6 with the better parent, 35.2 with the worse parent.
    expect(mean(oneMax.map((run) => Math.max(...run.rows.map((row) => row.values["ones"] ?? 0))))).toBeGreaterThanOrEqual(38);
  });

  it("makes two different children from a crossover: fewer than 30 percent of the proposals repeat", () => {
    // Measured on 2026-11-15: 24 percent with two children of the two halves, 35 percent with two equal children.
    const repeats = oneMax.reduce((sum, run) => sum + run.repeats, 0);
    const draws = oneMax.reduce((sum, run) => sum + run.draws, 0);
    expect(repeats / draws).toBeLessThan(0.3);
  });

  it("keeps the ends of a trade-off with the crowding distance: the values span 14 or more on average", () => {
    // The two objectives pull the count of ones up and down, so each count is on the front.
    // Measured on 2026-11-15: a span of 15.4 with the larger distance first, 10.8 with the smaller distance first.
    const tradeOff: Objective[] = [
      { name: "up", goal: "max" },
      { name: "down", goal: "min" },
    ];
    const both = (config: StrategyConfig): Measure => ({ breaks: [], values: { up: onesOf(config), down: onesOf(config) } });
    const spans = seeds.map((seed) => {
      const values = evolve(bits(20), { objectives: tradeOff, evaluate: both, seed, evaluations: 400, population: 20 }).rows.map((row) => row.values["up"] ?? 0);
      return Math.max(...values) - Math.min(...values);
    });
    expect(mean(spans)).toBeGreaterThanOrEqual(14);
  });
});

describe("the samples of a run", () => {
  /** A space of one stage with six choices: wider than a population of 2. */
  const wide: StrategySpace = {
    schema: STRATEGY_SPACE_SCHEMA,
    engine: "wide",
    version: "1",
    stages: [{ name: "pick", options: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, params: [] })) }],
  };
  const place: Objective[] = [{ name: "place", goal: "max" }];
  const placeOf = (config: StrategyConfig): Measure => ({ breaks: [], values: { place: "abcdef".indexOf(config.stages["pick"]?.option ?? "") } });

  it("offers each choice of a stage that is wider than the population", () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const run = evolve(wide, { objectives: place, evaluate: placeOf, seed, evaluations: 6, population: 2 });
      expect(run.rows).toHaveLength(6);
      expect(run.rows.filter((row) => row.generation === 0)).toHaveLength(2);
      expect(run.stop).toBe("budget");
    }
  });

  // The config with the first choice of each stage breaks the constraint, and a sample of 1 config always takes the first choices.
  // Three configs keep the constraint, so a sample of 2 or 3 configs often repeats one.
  const tight: StrategySpace = { ...bits(2), engine: "tight", constraints: [{ if: { stage: "b0", option: "0" }, then: { stage: "b1", option: "1" } }] };

  it("fills the first population when a sample repeats a config, on a space with constraints", () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      for (const population of [2, 3]) {
        const run = evolve(tight, { objectives: ones, evaluate: countOnes, seed, evaluations: 10, population });
        expect(run.rows).toHaveLength(3);
        expect(run.stop).toBe("stall");
        for (const config of Object.values(run.configs)) expect(checkConfig(tight, config)).toEqual([]);
      }
    }
  });

  // Each config breaks a constraint: b1 cannot follow each choice of b0.
  const closed: StrategySpace = {
    ...bits(2),
    engine: "closed",
    constraints: [
      { if: { stage: "b0", option: "0" }, then: { stage: "b1", option: "1" } },
      { if: { stage: "b0", option: "1" }, then: { stage: "b1", option: "0" } },
      { if: { stage: "b1", option: "1" }, then: { stage: "b0", option: "1" } },
      { if: { stage: "b1", option: "0" }, then: { stage: "b0", option: "0" } },
    ],
  };

  it("gives a RangeError with the text of strategy-space when the constraints remove each config of a sample", () => {
    const evolving = (): unknown => evolve(closed, { objectives: ones, evaluate: countOnes, seed: 1, evaluations: 10, population: 2, sample: { maxTries: 50 } });
    expect(evolving).toThrow(RangeError);
    expect(evolving).toThrow(/remove too many points/);
    const sweeping = (): unknown => sweep(closed, { objectives: ones, evaluate: countOnes, enumerate: { mode: "sample", n: 4, seed: 1, maxTries: 50 } });
    expect(sweeping).toThrow(RangeError);
    expect(sweeping).toThrow(/remove too many points/);
  });
});
