import { describe, expect, it } from "vitest";
import { checkOperators, countOperators, OPERATOR_SCHEMA, type Operator, type OperatorSet, type StrategySpace } from "./index.ts";

const space: StrategySpace = {
  schema: "strategy-space/1",
  engine: "pack",
  version: "0.0.1",
  stages: [
    { name: "order", options: [{ id: "area", params: [] }, { id: "height", params: [] }] },
    {
      name: "placement",
      options: [
        { id: "shelf", params: [] },
        { id: "shelf-tight", params: [] },
        { id: "best", params: [], members: { min: 2, max: 2, ordered: false } },
      ],
    },
  ],
};

const operators: readonly Operator[] = [
  { id: "area", stage: "order", source: "literature", cite: "Baker, Coffman and Rivest, 1980", test: "src/order.test.ts", summary: "It sorts the items by area, largest first." },
  { id: "height", stage: "order", source: "ours", test: "src/order.test.ts", summary: "It sorts the items by height, tallest first." },
  { id: "shelf", stage: "placement", source: "literature", cite: "Coffman and others, 1980", test: "src/shelf.test.ts", summary: "It fills rows from the left." },
  { id: "shelf-tight", stage: "placement", source: "mutation", parent: "shelf", test: "src/shelf.test.ts", summary: "It closes a row at the first item that does not fit." },
];
const set: OperatorSet = { schema: OPERATOR_SCHEMA, engine: "pack", operators };
const claims = (s: OperatorSet): string[] => checkOperators(space, s).map((b) => b.claim);
const change = (i: number, o: Partial<Operator>): OperatorSet => ({ ...set, operators: operators.map((x, j) => (j === i ? ({ ...x, ...o } as Operator) : x)) });

describe("checkOperators", () => {
  it("accepts a good set, and a meta option needs no operator", () => {
    expect(checkOperators(space, set)).toEqual([]);
  });

  it("finds a bad schema, engine, stage, option and source", () => {
    expect(claims({ ...set, schema: "x" as never })).toEqual(["schema"]);
    expect(claims({ ...set, engine: "route" })).toEqual(["engine"]);
    expect(claims(change(1, { stage: "nowhere" }))).toEqual(["unknown", "undeclared"]);
    expect(claims(change(1, { id: "width" }))).toEqual(["unknown", "undeclared"]);
    expect(claims(change(1, { source: "luck" as never }))).toEqual(["source"]);
  });

  it("finds a duplicate, an operator with no option, and missing fields", () => {
    expect(claims({ ...set, operators: [...operators, operators[0]!] })).toEqual(["duplicate"]);
    expect(claims({ ...set, operators: operators.slice(1) })).toEqual(["undeclared"]);
    expect(checkOperators(space, { ...set, operators: operators.slice(1) })[0]!.inputs).toEqual(["order.area"]);
    expect(claims(change(0, { cite: "" }))).toEqual(["cite"]);
    expect(claims(change(1, { test: " " }))).toEqual(["test"]);
    expect(claims(change(1, { summary: "" }))).toEqual(["summary"]);
  });

  it("finds a mutation with no parent, a parent of another stage and a cycle", () => {
    const { parent: _parent, ...orphan } = operators[3]!;
    expect(claims({ ...set, operators: [...operators.slice(0, 3), orphan as Operator] })).toEqual(["parent"]);
    expect(claims(change(3, { parent: "area" }))).toEqual(["parent"]);
    expect(claims(change(2, { parent: "shelf-tight" }))).toEqual(["cycle", "cycle"]);
    expect(claims(change(2, { parent: "shelf" }))).toEqual(["cycle", "cycle"]);
    // Flip: a literature operator can have a parent when it is not a cycle.
    expect(claims(change(1, { parent: "area" }))).toEqual([]);
  });
});

describe("countOperators", () => {
  it("gives the counts by stage and by source", () => {
    expect(countOperators(set)).toEqual({ total: 4, byStage: { order: 2, placement: 2 }, bySource: { literature: 2, ours: 1, mutation: 1 } });
  });
});
