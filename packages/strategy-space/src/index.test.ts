import { describe, expect, it } from "vitest";
import * as entry from "./index.ts";
import { checkSpace, configId, enumerateSpace, spaceSize, STRATEGY_SPACE_SCHEMA, type StrategySpace } from "./index.ts";

// The example of the README. A change here needs the same change in the README.
const space: StrategySpace = {
  schema: "strategy-space/1",
  engine: "pack",
  version: "0.0.1",
  stages: [
    { name: "order", options: [{ id: "area", params: [] }, { id: "height", params: [] }] },
    { name: "placement", options: [{ id: "shelf", params: [{ name: "gap", kind: "int", min: 0, max: 8, default: 2 }] }] },
  ],
};

describe("the entry", () => {
  it("exports the schema and the functions", () => {
    expect(entry.STRATEGY_SPACE_SCHEMA).toBe(STRATEGY_SPACE_SCHEMA);
    for (const name of ["checkSpace", "checkConfig", "configId", "canonicalConfig", "spaceSize", "enumerateSpace", "productSpace", "spaceShapeKinds"] as const) {
      expect(entry[name]).toBeTypeOf("function");
    }
  });

  it("gives the values of the README example", () => {
    expect(checkSpace(space)).toEqual([]);
    expect(spaceSize(space, { levels: 3 }).base).toBe(6n);
    const configs = enumerateSpace(space, { mode: "sample", n: 4, seed: 7 });
    expect(configs).toHaveLength(4);
    expect(configId(space, configs[0]!)).toMatch(/^[0-9a-f]{16}$/);
  });
});
