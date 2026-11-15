/**
 * The model of the demos. Each function uses the real functions of `@mark1russell7/strategy-space` on a space.
 * It gives the data that the page shows. The model does not touch the page.
 */
import { random } from "@mark1russell7/rigor-generators";
import {
  canonicalConfig,
  checkConfig,
  checkSpace,
  configId,
  countSpace,
  enumerateSpace,
  race,
  spaceSize,
  type ClaimBreak,
  type RaceResult,
  type StageChoice,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/strategy-space";

/** The sample space of the demos: a packer with three stages and one constraint. */
export const PACKER: StrategySpace = {
  schema: "strategy-space/1",
  engine: "pack",
  version: "0.1.0",
  stages: [
    {
      name: "order",
      options: [
        { id: "input", params: [], identity: true },
        { id: "area", params: [] },
        { id: "height", params: [] },
        { id: "perimeter", params: [] },
      ],
    },
    {
      name: "placement",
      options: [
        { id: "shelf", params: [{ name: "fit", kind: "enum", values: ["next", "first", "best"], default: "next" }] },
        { id: "skyline", params: [{ name: "waste-map", kind: "bool", default: false }] },
        { id: "max-rects", params: [{ name: "rule", kind: "enum", values: ["short-side", "long-side", "area", "corner"], default: "short-side" }] },
      ],
    },
    {
      name: "local-search",
      optional: true,
      options: [
        { id: "swap", params: [{ name: "rounds", kind: "int", min: 10, max: 10000, scale: "log", default: 100 }] },
        {
          id: "anneal",
          params: [
            { name: "temperature", kind: "real", min: 0.01, max: 10, scale: "log", default: 1 },
            { name: "cooling", kind: "real", min: 0.8, max: 0.99, default: 0.95 },
          ],
        },
      ],
    },
  ],
  constraints: [{ if: { stage: "order", option: "input" }, then: { not: { stage: "local-search", option: null } } }],
};

/** This function gives the JSON text of a space, with each option on one line. */
export function spaceText(space: StrategySpace): string {
  const stage = (s: StrategySpace["stages"][number]): string => {
    const { options, ...rest } = s;
    const head = JSON.stringify(rest).slice(1, -1);
    return `    {${head}, "options": [\n${options.map((o) => `      ${JSON.stringify(o)}`).join(",\n")}\n    ]}`;
  };
  const { stages, constraints, ...rest } = space;
  const lines = Object.entries(rest).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  lines.push(`  "stages": [\n${stages.map(stage).join(",\n")}\n  ]`);
  if (constraints !== undefined) lines.push(`  "constraints": [\n${constraints.map((c) => `    ${JSON.stringify(c)}`).join(",\n")}\n  ]`);
  return `{\n${lines.join(",\n")}\n}`;
}

/** A change of the sample space for an example. The function changes a copy. */
type Change = (space: { stages: { options: { id: string; params: Record<string, unknown>[] }[] }[]; constraints: { then: { not: { option: string } } }[] }) => void;

/** The examples of the space demo: a label and a change of the packer. */
export const SPACE_EXAMPLES: readonly (readonly [label: string, change: Change])[] = [
  ["The packer", () => {}],
  ["A default out of its range", (s) => void (s.stages[2]!.options[0]!.params[0]!["default"] = 50000)],
  ["A log scale from 0", (s) => void (s.stages[2]!.options[0]!.params[0]!["min"] = 0)],
  ["One option id two times", (s) => void (s.stages[0]!.options[3]!.id = "area")],
  ["A constraint with an unknown option", (s) => void (s.constraints[0]!.then.not.option = "tabu")],
  [
    "A conditional param",
    (s) => void s.stages[1]!.options[0]!.params.push({ name: "k", kind: "int", min: 1, max: 4, default: 2, when: { param: "fit", in: ["first"] } }),
  ],
];

/** This function gives the JSON text of an example of the space demo. */
export function exampleSpace(label: string): string {
  const example = SPACE_EXAMPLES.find(([name]) => name === label);
  if (example === undefined) throw new RangeError(`There is no example "${label}".`);
  const copy = structuredClone(PACKER) as unknown as Parameters<Change>[0];
  example[1](copy);
  return spaceText(copy as unknown as StrategySpace);
}

/** The result of a parse: a space, or the error of the JSON text. */
export type Parsed = { readonly space: StrategySpace; readonly error?: undefined } | { readonly space?: undefined; readonly error: string };

/** This function reads the JSON text of a space. It gives the error of `JSON.parse` for a text that is not JSON. */
export function parseSpace(text: string): Parsed {
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { error: "The text is not a JSON object." };
    return { space: value as StrategySpace };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** The count of one option of a stage. The value `null` is a meta option, which a count of one stage cannot give. */
export interface OptionCount {
  readonly id: string;
  readonly count: bigint | null;
}

/** The count of one stage: each option, and the total. An optional stage also counts the config with no option. */
export interface StageCount {
  readonly name: string;
  readonly optional: boolean;
  readonly options: readonly OptionCount[];
  readonly total: bigint;
}

/** The report of the space demo. */
export interface SpaceReport {
  readonly breaks: readonly ClaimBreak[];
  /** The count of each stage without the constraints. It is empty when the space has problems. */
  readonly stages: readonly StageCount[];
  /** The product of the stage totals: the count without the constraints. */
  readonly product: bigint;
  /** The count of `spaceSize`, with the constraints. */
  readonly base: bigint;
  readonly meta: bigint | null;
  /** The count of the terms of each depth of 2 or less, from `countSpace` with the default combinators. */
  readonly terms: readonly bigint[];
}

/**
 * This function checks a space and counts it. The count of one stage comes from `spaceSize` of a space with only that stage.
 * The product of the stage counts is the count without the constraints. `spaceSize` gives the count with them.
 */
export function spaceReport(space: StrategySpace, levels: number): SpaceReport {
  const breaks = checkSpace(space);
  if (breaks.length > 0) return { breaks, stages: [], product: 0n, base: 0n, meta: null, terms: [] };
  const alone = (stage: StrategySpace["stages"][number]): bigint => spaceSize({ ...space, stages: [stage], constraints: [] }, { levels, maxMeta: 0n }).base;
  const stages = space.stages.map((stage): StageCount => {
    const options = stage.options.map((option): OptionCount => ({
      id: option.id,
      count: option.members === undefined ? alone({ name: stage.name, options: [option] }) : null,
    }));
    return { name: stage.name, optional: stage.optional === true, options, total: alone(stage) };
  });
  const size = spaceSize(space, { levels });
  const terms = countSpace(space, { depth: 2, levels }).upTo;
  return { breaks, stages, product: stages.reduce((p, s) => p * s.total, 1n), base: size.base, meta: size.meta, terms };
}

/** This function gives a short text of a whole number: its digits up to 15, else its count of digits. */
export function bigText(value: bigint): string {
  const digits = value.toString();
  if (digits.length <= 15) return value.toLocaleString("en-US");
  return `a number with ${digits.length.toLocaleString("en-US")} digits`;
}

/** The settings of the configs demo. */
export interface ConfigSettings {
  readonly mode: "grid" | "sample";
  readonly levels: number;
  readonly n: number;
  readonly seed: number;
  readonly draw: "reject" | "walk";
}

/** One row of the table of configs: the text of each stage and the id. */
export interface ConfigRow {
  readonly cells: readonly string[];
  readonly id: string;
}

/** The largest grid of the demo. A larger grid gets the `RangeError` of `enumerateSpace`. */
export const GRID_LIMIT = 5000;

/** This function gives the short text of the choice of a stage: the option, then each param as `name=value`. */
export function choiceText(choice: StageChoice | null | undefined): string {
  if (choice === null || choice === undefined) return "(none)";
  const params = Object.entries(choice.params ?? {}).map(([name, value]) => `${name}=${typeof value === "number" ? Number(value.toPrecision(3)) : value}`);
  const members = choice.members === undefined ? [] : [`${choice.members.length} members`];
  return [choice.option, ...params, ...members].join(" ");
}

/** This function makes the configs of a space as a grid or a sample. It gives the rows, or the error of `enumerateSpace`. */
export function configRows(space: StrategySpace, settings: ConfigSettings): { readonly rows: readonly ConfigRow[]; readonly error: string | null } {
  try {
    const configs =
      settings.mode === "grid"
        ? enumerateSpace(space, { mode: "grid", levels: settings.levels, limit: GRID_LIMIT })
        : enumerateSpace(space, { mode: "sample", n: settings.n, seed: settings.seed, draw: settings.draw });
    const rows = configs.map((config) => ({ cells: space.stages.map((stage) => choiceText(config.stages[stage.name])), id: configId(space, config) }));
    return { rows, error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/** The share of one option of a stage in a sample of each draw. */
export interface Share {
  readonly option: string;
  readonly reject: number;
  readonly walk: number;
}

/** The count of the configs of each sample of the share chart. */
export const SHARE_SAMPLE = 2000;

/** This function gives the share of each option of a stage in a sample of `reject` and a sample of `walk`, with one seed. */
export function shares(space: StrategySpace, stage: string, seed: number): Share[] {
  const of = (draw: "reject" | "walk"): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const config of enumerateSpace(space, { mode: "sample", n: SHARE_SAMPLE, seed, draw })) {
      const option = config.stages[stage]?.option ?? "(none)";
      counts.set(option, (counts.get(option) ?? 0) + 1);
    }
    return counts;
  };
  const reject = of("reject");
  const walk = of("walk");
  const found = space.stages.find((s) => s.name === stage);
  const ids = [...(found?.options.map((o) => o.id) ?? []), ...(found?.optional === true ? ["(none)"] : [])];
  return ids.map((option) => ({ option, reject: (reject.get(option) ?? 0) / SHARE_SAMPLE, walk: (walk.get(option) ?? 0) / SHARE_SAMPLE }));
}

/** This function gives the name of the stage with the most choices. An optional stage has one more choice. A tie goes to the first. */
export function largestStage(space: StrategySpace): string {
  const choices = (s: StrategySpace["stages"][number]): number => s.options.length + (s.optional === true ? 1 : 0);
  return space.stages.reduce((best, s) => (choices(s) > choices(best) ? s : best)).name;
}

/** The id of one config: its canonical form and its id, or the problems of `checkConfig`. */
export interface IdCard {
  readonly breaks: readonly ClaimBreak[];
  readonly id: string | null;
  readonly canonical: string | null;
}

/** This function reads the JSON text of a config, and gives its problems or its id. */
export function idCard(space: StrategySpace, text: string): IdCard {
  let config: StrategyConfig;
  try {
    config = JSON.parse(text) as StrategyConfig;
  } catch (error) {
    return { breaks: [{ claim: "json", detail: error instanceof Error ? error.message : String(error), inputs: [] }], id: null, canonical: null };
  }
  const breaks = checkConfig(space, config);
  if (breaks.length > 0) return { breaks, id: null, canonical: null };
  return { breaks, id: configId(space, config), canonical: JSON.stringify(canonicalConfig(space, config)) };
}

/** This function gives the space with a new optional stage `rotate`, with or without `omitUnused`. */
export function grownSpace(space: StrategySpace, omitUnused: boolean): StrategySpace {
  const names = new Set(space.stages.map((s) => s.name));
  let name = "rotate";
  for (let i = 2; names.has(name); i++) name = `rotate-${i}`;
  const stage = { name, optional: true, ...(omitUnused ? { omitUnused: true } : {}), options: [{ id: "quarter-turns", params: [] }] };
  return { ...space, stages: [...space.stages, stage] };
}

/** This function gives the JSON text of a config, with each stage on one line. */
export function configText(config: unknown): string {
  const { stages, ...rest } = config as { stages: Record<string, unknown> };
  const head = Object.entries(rest).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},\n`);
  const lines = Object.entries(stages).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  return `{\n${head.join("")}  "stages": {\n${lines.join(",\n")}\n  }\n}`;
}

const AREA_SHELF = { space: "pack", stages: { order: { option: "area" }, placement: { option: "shelf", params: { fit: "best" } }, "local-search": null } };

/** The examples of the id demo: a label and the two configs. */
export const ID_EXAMPLES: readonly (readonly [label: string, a: unknown, b: unknown])[] = [
  ["The order of the keys", AREA_SHELF, { stages: { "local-search": null, placement: { params: { fit: "best" }, option: "shelf" }, order: { option: "area" } }, space: "pack" }],
  [
    "A default value left out",
    { space: "pack", stages: { order: { option: "area" }, placement: { option: "shelf", params: { fit: "next" } }, "local-search": null } },
    { space: "pack", stages: { order: { option: "area" }, placement: { option: "shelf" }, "local-search": null } },
  ],
  ["An unused stage left out", AREA_SHELF, { space: "pack", stages: { order: { option: "area" }, placement: { option: "shelf", params: { fit: "best" } } } }],
  ["Another value", AREA_SHELF, { space: "pack", stages: { order: { option: "area" }, placement: { option: "shelf", params: { fit: "first" } }, "local-search": null } }],
  ["A value out of its range", AREA_SHELF, { space: "pack", stages: { order: { option: "area" }, placement: { option: "shelf", params: { fit: "worst" } }, "local-search": null } }],
  ["A broken constraint", AREA_SHELF, { space: "pack", stages: { order: { option: "input" }, placement: { option: "shelf", params: { fit: "best" } }, "local-search": null } }],
];

/** A strategy of the race: an id, a label and the gap of its mean cost above the best strategy of the model. */
export interface RaceTerm {
  readonly id: string;
  readonly label: string;
  readonly gap: number;
}

/** The strategies of the race demo. The first has the smallest gap. */
export const RACE_TERMS: readonly RaceTerm[] = [
  { id: "max-rects", label: "max-rects, area order", gap: 0 },
  { id: "portfolio", label: "portfolio of shelf and skyline", gap: 0.15 },
  { id: "skyline", label: "skyline, height order", gap: 0.4 },
  { id: "shelf-best", label: "shelf with best fit", gap: 1 },
  { id: "sequence", label: "shelf, then swap", gap: 2 },
  { id: "shelf-next", label: "shelf with next fit, input order", gap: 3.5 },
];

/** The count of the inputs of the race demo. */
export const RACE_INPUTS = 40;

/** The settings of the race demo. */
export interface RaceSettings {
  /** The standard deviation of the noise of each cost, in points of waste. */
  readonly noise: number;
  readonly level: number;
  readonly first: number;
  readonly seed: number;
  /** With `true`, the race keeps each strategy, so it is a screen. */
  readonly screen: boolean;
}

/** One strategy after the race: the count of its measured inputs, and its drop or its mean. */
export interface RaceLane extends RaceTerm {
  readonly measured: number;
  readonly drop: { readonly inputs: number; readonly adjusted: number } | null;
  readonly mean: number | null;
}

/**
 * This function gives the cost table of the model: the waste of area in percent, for each strategy and input.
 * Each input has its own difficulty from 20 to 30, and each cost adds the gap of the strategy and a normal noise.
 */
export function raceCosts(settings: Pick<RaceSettings, "noise" | "seed">): Map<string, number[]> {
  const draw = random(`race-costs:${settings.seed}`);
  const difficulty = Array.from({ length: RACE_INPUTS }, () => draw.range(20, 30));
  return new Map(RACE_TERMS.map((term) => [term.id, difficulty.map((d) => d + term.gap + draw.normal(0, settings.noise))]));
}

/** This function races the strategies of the model, and gives the result of `race` and a lane for each strategy. */
export function raceResult(settings: RaceSettings): { readonly result: RaceResult; readonly lanes: readonly RaceLane[] } {
  const costs = raceCosts(settings);
  const result = race(
    RACE_TERMS.map((term) => term.id),
    (id, input) => costs.get(id)![input]!,
    { inputs: RACE_INPUTS, first: settings.first, level: settings.level, seed: settings.seed, ...(settings.screen ? { keep: RACE_TERMS.length } : {}) },
  );
  const lanes = RACE_TERMS.map((term): RaceLane => {
    const drop = result.drops.find((d) => d.id === term.id);
    return {
      ...term,
      measured: drop?.inputs ?? result.inputs,
      drop: drop === undefined ? null : { inputs: drop.inputs, adjusted: drop.adjusted },
      mean: result.means[term.id] ?? null,
    };
  });
  return { result, lanes };
}
