import { seedOf } from "@mark1russell7/rigor-generators";
import { STRATEGY_SPACE_SCHEMA, configId, type StrategyConfig, type StrategySpace } from "@mark1russell7/strategy-space";
import { describe, expect, it } from "vitest";
import { objectiveProblems, STRATEGY_SEARCH_SCHEMA, type Measure, type Objective } from "./rows.ts";
import { frontOf, sweep } from "./sweep.ts";

const space: StrategySpace = {
  schema: STRATEGY_SPACE_SCHEMA,
  engine: "toy",
  version: "1",
  stages: [
    { name: "shape", options: [{ id: "box", params: [] }, { id: "round", params: [] }] },
    { name: "size", options: [{ id: "n", params: [{ name: "count", kind: "int", min: 1, max: 4, default: 1 }] }] },
  ],
};

const objectives: Objective[] = [
  { name: "cost", goal: "min", unit: "USD" },
  { name: "speed", goal: "max" },
];

const shapeOf = (config: StrategyConfig): string => config.stages["shape"]?.option ?? "";
const countOf = (config: StrategyConfig): number => Number(config.stages["size"]?.params?.["count"] ?? 1);

/** The cost and the speed of a config. A box costs 2 and gives 1 for each count, and a round shape costs 3 and gives 3. */
function measure(config: StrategyConfig): Measure {
  const round = shapeOf(config) === "round";
  const count = countOf(config);
  return { breaks: [], values: { cost: count * (round ? 3 : 2), speed: count * (round ? 3 : 1) } };
}

const grid = { mode: "grid", levels: 4 } as const;
const pointOf = (run: ReturnType<typeof sweep>, id: string): string => {
  const config = run.configs[id] as StrategyConfig;
  return `${shapeOf(config)}${String(countOf(config))}`;
};

describe("a sweep of a grid", () => {
  const run = sweep(space, { objectives, evaluate: measure, enumerate: grid });

  it("gives one row for each config, in the order of the enumeration", () => {
    expect(run.schema).toBe(STRATEGY_SEARCH_SCHEMA);
    expect(run.method).toBe("grid");
    expect(run.seed).toBeNull();
    expect(run.rows).toHaveLength(8);
    expect(run.rows.map((row) => row.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const row of run.rows) {
      expect(row.run).toBe(run.run);
      expect(row.config).toBe(configId(space, run.configs[row.config] as StrategyConfig));
    }
    expect(run.counts).toEqual({ feasible: 8, breaks: 0, unread: 0, front: 5 });
  });

  it("puts the configs that no config dominates on the front", () => {
    const front = run.rows.filter((row) => row.front).map((row) => pointOf(run, row.config));
    expect(front.sort()).toEqual(["box1", "round1", "round2", "round3", "round4"]);
    const second = run.rows.filter((row) => row.rank === 2).map((row) => pointOf(run, row.config));
    expect(second.sort()).toEqual(["box2", "box3", "box4"]);
  });

  it("gives the front with its configs", () => {
    const entries = frontOf(run);
    expect(entries).toHaveLength(5);
    for (const { row, config } of entries) expect(configId(space, config)).toBe(row.config);
  });

  it("is deterministic", () => {
    expect(sweep(space, { objectives, evaluate: measure, enumerate: grid })).toEqual(run);
  });
});

describe("the hard constraints and the reads", () => {
  it("gives a config that breaks a hard constraint no rank", () => {
    const evaluate = (config: StrategyConfig): Measure => ({ ...measure(config), breaks: countOf(config) === 4 ? ["size"] : [] });
    const run = sweep(space, { objectives, evaluate, enumerate: grid });
    const broken = run.rows.filter((row) => row.status === "breaks");
    expect(broken).toHaveLength(2);
    for (const row of broken) expect(row).toMatchObject({ breaks: ["size"], rank: null, front: false });
    expect(run.counts).toEqual({ feasible: 6, breaks: 2, unread: 0, front: 4 });
  });

  it("gives a value that is not a finite number the status unread, with no rank", () => {
    const evaluate = (config: StrategyConfig): Measure => {
      const m = measure(config);
      return shapeOf(config) === "round" && countOf(config) === 4 ? { breaks: [], values: { cost: m.values["cost"] as number, speed: Number.NaN } } : m;
    };
    const run = sweep(space, { objectives, evaluate, enumerate: grid });
    const unread = run.rows.filter((row) => row.status === "unread");
    expect(unread).toHaveLength(1);
    expect(unread[0]).toMatchObject({ missing: ["speed"], values: { cost: 12, speed: null }, rank: null, front: false });
    expect(run.counts.front).toBe(4);
  });

  it("puts a break before a value that is not a read", () => {
    const run = sweep(space, { objectives, evaluate: () => ({ breaks: ["all"], values: {} }), enumerate: grid });
    expect(run.rows.every((row) => row.status === "breaks" && row.missing.length === 2)).toBe(true);
    expect(run.counts).toEqual({ feasible: 0, breaks: 8, unread: 0, front: 0 });
  });

  it("ignores a value of a name that is not an objective", () => {
    const run = sweep(space, { objectives, evaluate: (c) => ({ breaks: [], values: { ...measure(c).values, extra: 1 } }), enumerate: grid });
    expect(Object.keys(run.rows[0]?.values ?? {})).toEqual(["cost", "speed"]);
  });
});

describe("a sweep of a sample", () => {
  it("takes the seed of a name from seedOf, and puts it on each row", () => {
    const run = sweep(space, { objectives, evaluate: measure, enumerate: { mode: "sample", n: 5, seed: "home cluster" } });
    expect(run.seed).toBe(seedOf("home cluster"));
    expect(run.rows.every((row) => row.seed === run.seed)).toBe(true);
  });

  it("evaluates a repeat of a config one time, and counts the repeats", () => {
    let calls = 0;
    const evaluate = (config: StrategyConfig): Measure => {
      calls += 1;
      return measure(config);
    };
    const run = sweep(space, { objectives, evaluate, enumerate: { mode: "sample", n: 40, seed: 7 } });
    expect(run.draws).toBe(40);
    expect(run.rows.length).toBe(calls);
    expect(run.repeats).toBe(40 - run.rows.length);
    expect(new Set(run.rows.map((row) => row.config)).size).toBe(run.rows.length);
  });

  it("gives one record for one seed, and another run id for another seed or evaluator", () => {
    const options = { objectives, evaluate: measure, enumerate: { mode: "sample", n: 6, seed: 3 } } as const;
    const run = sweep(space, options);
    expect(sweep(space, options)).toEqual(run);
    expect(sweep(space, { ...options, enumerate: { mode: "sample", n: 6, seed: 4 } }).run).not.toBe(run.run);
    expect(sweep(space, { ...options, evaluator: "toy 2" }).run).not.toBe(run.run);
  });
});

describe("the objectives", () => {
  it("gives the problems of bad objectives", () => {
    expect(objectiveProblems([])).toEqual(["The list of the objectives is empty."]);
    expect(
      objectiveProblems([
        { name: "a", goal: "min" },
        { name: "a", goal: "max" },
        { name: "", goal: "up" as "min" },
      ]),
    ).toEqual(["The name a is on two objectives.", "The objective 2 has no name.", "The goal of the objective 2 is up, not min or max."]);
  });

  it("refuses a sweep with bad objectives", () => {
    expect(() => sweep(space, { objectives: [], evaluate: measure, enumerate: grid })).toThrow(RangeError);
  });
});
