import { describe, expect, it } from "vitest";
import * as entry from "./index.ts";

describe("the entry", () => {
  it("exports the functions of the search", () => {
    expect(Object.keys(entry).sort()).toEqual(["EVOLVE_DEFAULTS", "GOALS", "STRATEGY_SEARCH_SCHEMA", "crowdingDistances", "dominates", "evolve", "evolveProblems", "frontOf", "isRead", "objectiveProblems", "paretoRanks", "sweep"]);
  });
});
