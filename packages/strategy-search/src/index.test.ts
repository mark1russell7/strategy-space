import { describe, expect, it } from "vitest";
import * as entry from "./index.ts";

describe("the entry", () => {
  it("exports the functions of the search", () => {
    expect(Object.keys(entry).sort()).toEqual(["GOALS", "STRATEGY_SEARCH_SCHEMA", "dominates", "frontOf", "isRead", "objectiveProblems", "paretoRanks", "sweep"]);
  });
});
