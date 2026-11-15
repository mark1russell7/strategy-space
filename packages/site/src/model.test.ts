import { describe, expect, it } from "vitest";
import {
  ID_EXAMPLES,
  PACKER,
  RACE_INPUTS,
  RACE_TERMS,
  SPACE_EXAMPLES,
  bigText,
  choiceText,
  configRows,
  configText,
  exampleSpace,
  grownSpace,
  idCard,
  largestStage,
  parseSpace,
  raceResult,
  shares,
  spaceReport,
  spaceText,
} from "./model.ts";

describe("the space demo", () => {
  it("gives the packer as JSON text that reads back as the same space", () => {
    expect(parseSpace(spaceText(PACKER)).space).toEqual(PACKER);
    expect(parseSpace("{ not json").error).toMatch(/JSON/);
    expect(parseSpace("[]").error).toBe("The text is not a JSON object.");
  });

  it("counts each stage, and the constraint keeps out the input order with no local search", () => {
    const report = spaceReport(PACKER, 2);
    expect(report.breaks).toEqual([]);
    expect(report.stages.map((s) => [s.name, s.total])).toEqual([
      ["order", 4n],
      ["placement", 9n],
      ["local-search", 7n],
    ]);
    expect(report.stages[2]!.options).toEqual([
      { id: "swap", count: 2n },
      { id: "anneal", count: 4n },
    ]);
    // 4 orders x 9 placements x 7 local searches, less the 1 x 9 x 1 configs of the input order with no local search.
    expect(report.product).toBe(252n);
    expect(report.base).toBe(243n);
    expect(report.terms[0]).toBe(243n);
    expect(report.terms[1]).toBe(148419609701186648496095610964856470926n);
    expect(bigText(report.terms[1]!)).toBe("a number with 39 digits");
    expect(bigText(243n)).toBe("243");
  });

  it("gives a problem for each broken example, and none for the good examples", () => {
    const claims = SPACE_EXAMPLES.map(([label]) => [label, spaceReport(parseSpace(exampleSpace(label)).space!, 2).breaks.map((b) => b.claim)]);
    expect(claims).toEqual([
      ["The packer", []],
      ["A default out of its range", ["default"]],
      ["A log scale from 0", ["scale"]],
      ["One option id two times", ["duplicate"]],
      ["A constraint with an unknown option", ["unknown"]],
      ["A conditional param", []],
    ]);
    // The param k is active only with the fit first, so it adds 2 levels to one of the 3 fits: 4 shelf configs, not 6.
    const conditional = spaceReport(parseSpace(exampleSpace("A conditional param")).space!, 2);
    expect(conditional.stages[1]!.options[0]).toEqual({ id: "shelf", count: 4n });
  });
});

describe("the configs demo", () => {
  it("makes the grid, and gives a RangeError above the limit", () => {
    const grid = configRows(PACKER, { mode: "grid", levels: 2, n: 0, seed: 0, draw: "reject" });
    expect(grid.rows).toHaveLength(243);
    expect(grid.rows[0]).toEqual({ cells: ["input", "shelf fit=next", "swap rounds=10"], id: "cbd21b8b87eba222" });
    expect(configRows(PACKER, { mode: "grid", levels: 12, n: 0, seed: 0, draw: "reject" }).error).toMatch(/5000/);
  });

  it("gives the same sample for the same seed", () => {
    const settings = { mode: "sample", levels: 2, n: 5, seed: 7, draw: "reject" } as const;
    expect(configRows(PACKER, settings)).toEqual(configRows(PACKER, settings));
    expect(configRows(PACKER, { ...settings, seed: 8 }).rows).not.toEqual(configRows(PACKER, settings).rows);
    expect(choiceText(null)).toBe("(none)");
    expect(choiceText({ option: "anneal", params: { temperature: 0.351635, cooling: 0.902328 } })).toBe("anneal temperature=0.352 cooling=0.902");
  });

  it("shows that walk gives each order the same share, and reject does not", () => {
    expect(largestStage(PACKER)).toBe("order");
    const share = shares(PACKER, "order", 1);
    expect(share.map((s) => s.option)).toEqual(["input", "area", "height", "perimeter"]);
    expect(share.every((s) => s.walk === 0.25)).toBe(true);
    // The constraint keeps out one third of the draws of the input order: its share is near 2/11.
    expect(share[0]!.reject).toBeCloseTo(2 / 11, 1);
    expect(shares(PACKER, "local-search", 1).map((s) => s.option)).toEqual(["swap", "anneal", "(none)"]);
  });
});

describe("the id demo", () => {
  const card = (label: string, side: 1 | 2) => idCard(PACKER, configText(ID_EXAMPLES.find(([name]) => name === label)![side]));

  it("gives one id to two forms of one point", () => {
    for (const label of ["The order of the keys", "A default value left out", "An unused stage left out"]) {
      expect(card(label, 1).id).toMatch(/^[0-9a-f]{16}$/);
      expect(card(label, 2).id).toBe(card(label, 1).id);
    }
    expect(card("Another value", 2).id).not.toBe(card("Another value", 1).id);
  });

  it("gives the problems of a config that is not good, and no id", () => {
    expect(card("A value out of its range", 2)).toMatchObject({ id: null, breaks: [{ claim: "param" }] });
    expect(card("A broken constraint", 2)).toMatchObject({ id: null, breaks: [{ claim: "constraint" }] });
    expect(idCard(PACKER, "{").breaks[0]!.claim).toBe("json");
  });

  it("keeps each old id when a new optional stage has omitUnused", () => {
    const text = configText(ID_EXAMPLES[0]![1]);
    const before = idCard(PACKER, text).id;
    expect(idCard(grownSpace(PACKER, false), text).id).not.toBe(before);
    expect(idCard(grownSpace(PACKER, true), text).id).toBe(before);
    expect(grownSpace(grownSpace(PACKER, true), true).stages.map((s) => s.name)).toEqual(["order", "placement", "local-search", "rotate", "rotate-2"]);
  });
});

describe("the race demo", () => {
  const settings = { noise: 1.5, level: 0.05, first: 5, seed: 1, screen: false };

  it("measures fewer costs than a screen, and keeps the best strategy of the model", () => {
    const { result, lanes } = raceResult(settings);
    expect(result.full).toBe(RACE_TERMS.length * RACE_INPUTS);
    expect(result.measured).toBeLessThan(result.full);
    expect(lanes.reduce((sum, lane) => sum + lane.measured, 0)).toBe(result.measured);
    expect(result.live).toContain(RACE_TERMS[0]!.id);
    expect(lanes.filter((lane) => lane.drop !== null).every((lane) => lane.mean === null && lane.drop!.adjusted < 0.05)).toBe(true);
    expect(raceResult(settings)).toEqual(raceResult(settings));
  });

  it("is a screen when it keeps each strategy", () => {
    const { result, lanes } = raceResult({ ...settings, screen: true });
    expect(result.drops).toEqual([]);
    expect(result.measured).toBe(result.full);
    expect(lanes.every((lane) => lane.measured === RACE_INPUTS)).toBe(true);
  });
});
