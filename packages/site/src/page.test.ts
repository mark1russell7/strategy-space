import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("the home page", () => {
  it("names the package and gives the install command", () => {
    expect(page).toContain("<title>strategy-space</title>");
    expect(page).toContain("pnpm add @mark1russell7/strategy-space");
  });

  it("links to the pages of site-pages and to the repository", () => {
    expect(page).toContain('href="./releases/"');
    expect(page).toContain('href="./status/"');
    expect(page).toContain('href="https://github.com/mark1russell7/strategy-space"');
  });

  it("has each element that the script finds by its id", () => {
    const ids = [...script.matchAll(/byId(?:<\w+>)?\("([^"]+)"\)/g)].map((match) => match[1]!);
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) expect(page, id).toContain(`id="${id}"`);
  });

  it("has a door to each demo", () => {
    const doors = [...page.matchAll(/<li><a href="#([^"]+)">/g)].map((match) => match[1]!);
    expect(doors).toEqual(["space-title", "configs-title", "id-title", "race-title"]);
    for (const door of doors) expect(page).toContain(`id="${door}"`);
  });
});
