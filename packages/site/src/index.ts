import { byId, copyText, h, setupTheme } from "@mark1russell7/site-pages/chrome";
import { examples, setField, verdict } from "@mark1russell7/site-pages/demo";
import type { ClaimBreak, StrategySpace } from "@mark1russell7/strategy-space";
import {
  ID_EXAMPLES,
  PACKER,
  RACE_INPUTS,
  SHARE_SAMPLE,
  SPACE_EXAMPLES,
  bigText,
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
  type ConfigSettings,
} from "./model.ts";

setupTheme(byId<HTMLButtonElement>("theme"), "theme");

const copy = byId<HTMLButtonElement>("copy");
copy.addEventListener("click", () => {
  void copyText(copy, byId("install").textContent ?? "");
});

/** This function gives a count with its noun, for example "1 problem" or "3 problems". */
const count = (n: number | bigint, one: string, many = `${one}s`): string => `${n.toLocaleString("en-US")} ${n === 1 || n === 1n ? one : many}`;
/** This function gives a code element with a text. */
const code = (text: string): HTMLElement => h("code", {}, text);
/** This function gives a percent with one decimal. */
const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;
/** This function gives the list of the problems of a check. */
const problems = (breaks: readonly ClaimBreak[]): HTMLUListElement =>
  h("ul", { class: "problems" }, ...breaks.map((b) => h("li", {}, h("b", {}, `${b.claim}: `), b.detail)));
/** This function starts `update` one time, and again at each `input` event of the controls. */
function watch(controls: readonly HTMLElement[], update: () => void, event = "input"): void {
  for (const control of controls) control.addEventListener(event, update);
  update();
}
/** This function gives a function that starts `fn` when no call came for `ms` milliseconds. */
function later(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/* 1. The count of a space. The good space of this demo is also the space of demos 2 and 3. */
let space: StrategySpace | null = PACKER;
const spaceJson = byId<HTMLTextAreaElement>("space-json");
const spaceLevels = byId<HTMLInputElement>("space-levels");
const spaceResult = byId("space-result");
const spaceStages = byId("space-stages");
const spaceSum = byId("space-sum");
const spaceTerms = byId("space-terms");
const listeners: (() => void)[] = [];
const spaceChanged = later(() => {
  for (const listener of listeners) listener();
}, 150);

examples(
  byId("space-chips"),
  SPACE_EXAMPLES.map(([label]) => [label, label]),
  (label) => setField(spaceJson, exampleSpace(label)),
);
spaceJson.value = spaceText(PACKER);

function updateSpace(): void {
  const levels = Number(spaceLevels.value);
  byId("space-levels-value").textContent = String(levels);
  const parsed = parseSpace(spaceJson.value);
  const clear = (): void => {
    spaceStages.replaceChildren();
    spaceSum.replaceChildren();
    spaceTerms.replaceChildren();
  };
  if (parsed.error !== undefined) {
    space = null;
    spaceResult.replaceChildren(verdict(false, "The text is not JSON:", parsed.error));
    clear();
    spaceChanged();
    return;
  }
  let report;
  try {
    report = spaceReport(parsed.space, levels);
  } catch (error) {
    space = null;
    spaceResult.replaceChildren(verdict(false, "The count stopped:", error instanceof Error ? error.message : String(error)));
    clear();
    spaceChanged();
    return;
  }
  if (report.breaks.length > 0) {
    space = null;
    spaceResult.replaceChildren(verdict(false, `The space has ${count(report.breaks.length, "problem")}:`, code("checkSpace"), report.breaks.length === 1 ? " gives it." : " gives each one.", problems(report.breaks)));
    clear();
    spaceChanged();
    return;
  }
  space = parsed.space;
  spaceResult.replaceChildren(verdict(true, "The space is good:", code("checkSpace"), " gives no problem."));
  spaceStages.replaceChildren(
    ...report.stages.map((stage) =>
      h(
        "div",
        { class: "stage" },
        h("p", { class: "stage-name" }, code(stage.name), stage.optional ? h("span", { class: "tag" }, "optional") : null),
        h(
          "ul",
          {},
          ...stage.options.map((option) => h("li", {}, code(option.id), h("span", { class: "times" }, option.count === null ? "meta" : `× ${option.count.toLocaleString("en-US")}`))),
          stage.optional ? h("li", { class: "none" }, h("span", {}, "no option"), h("span", { class: "times" }, "× 1")) : null,
        ),
        h("p", { class: "stage-total" }, h("span", {}, "stage"), h("b", {}, stage.total.toLocaleString("en-US"))),
      ),
    ),
  );
  const factors = report.stages.map((stage) => stage.total.toLocaleString("en-US")).join(" × ");
  const kept = report.product - report.base;
  const parts: (string | Node)[] = [h("b", {}, `${factors} = ${report.product.toLocaleString("en-US")}`), ` ${report.product === 1n ? "config" : "configs"} with no constraint. `];
  parts.push(
    kept > 0n ? `The constraints keep out ${kept.toLocaleString("en-US")}, so ` : "No constraint keeps out a config, so ",
    code("spaceSize"),
    " gives ",
    h("b", { class: "total" }, report.base.toLocaleString("en-US")),
    ".",
  );
  if (report.meta === null || report.meta > 0n) parts.push(` It also counts ${report.meta === null ? "more than 10^18" : report.meta.toLocaleString("en-US")} configs with a meta option.`);
  spaceSum.replaceChildren(...parts);
  const depth = ["Depth 0: the configs", "Depth 1: one combinator over configs", "Depth 2: combinators over depth 1"];
  spaceTerms.replaceChildren(...report.terms.flatMap((n, k) => [h("dt", {}, depth[k] ?? `Depth ${k}`), h("dd", {}, bigText(n))]));
  spaceChanged();
}
watch([spaceJson, spaceLevels], updateSpace);

/** This function gives the verdict for a demo that needs the space of demo 1, when that space is not good. */
const noSpace = (): HTMLDivElement => verdict(false, "No space:", "the space of demo 1 has a problem. Correct it, or pick the example ", h("b", {}, "The packer"), ".");

/* 2. A grid or a sample. */
const modes = ["grid", "sample"] as const;
let mode: ConfigSettings["mode"] = "sample";
const modeRow = byId("configs-mode");
const modeButtons = modes.map((value) => {
  const button = h("button", { type: "button", role: "radio", "aria-checked": String(value === mode) }, value === "grid" ? "A grid" : "A seeded sample");
  button.addEventListener("click", () => {
    mode = value;
    for (const [i, other] of modeButtons.entries()) other.setAttribute("aria-checked", String(modes[i] === mode));
    updateConfigs();
  });
  return button;
});
modeRow.replaceChildren(...modeButtons);
const configsLevels = byId<HTMLInputElement>("configs-levels");
const configsN = byId<HTMLInputElement>("configs-n");
const configsSeed = byId<HTMLInputElement>("configs-seed");
const configsDraw = byId<HTMLSelectElement>("configs-draw");
const configsResult = byId("configs-result");
const configsHead = byId("configs-head");
const configsRows = byId("configs-rows");
/** The largest count of rows that the table shows. */
const SHOWN = 12;
/** This function gives the whole number of a field, clamped to its range. */
const whole = (field: HTMLInputElement, fallback: number): number => {
  const value = Math.trunc(Number(field.value));
  if (!Number.isFinite(value) || field.value.trim() === "") return fallback;
  return Math.min(Number(field.max), Math.max(Number(field.min), value));
};

function updateConfigs(): void {
  for (const field of document.querySelectorAll<HTMLElement>("[data-mode]")) field.hidden = field.dataset["mode"] !== mode;
  if (space === null) {
    configsResult.replaceChildren(noSpace());
    configsHead.replaceChildren();
    configsRows.replaceChildren();
    return;
  }
  const settings: ConfigSettings = { mode, levels: whole(configsLevels, 2), n: whole(configsN, 8), seed: whole(configsSeed, 7), draw: configsDraw.value === "walk" ? "walk" : "reject" };
  const { rows, error } = configRows(space, settings);
  if (error !== null) {
    configsResult.replaceChildren(verdict(false, "No configs:", code("enumerateSpace"), ` stopped: ${error}`));
    configsHead.replaceChildren();
    configsRows.replaceChildren();
    return;
  }
  const shown = rows.slice(0, SHOWN);
  configsResult.replaceChildren(
    h(
      "p",
      { class: "summary" },
      h("b", {}, settings.mode === "grid" ? `The grid has ${count(rows.length, "config")}.` : `The seed ${settings.seed} gives ${count(rows.length, "config")}.`),
      rows.length > shown.length ? ` The table shows the first ${shown.length}.` : "",
      settings.mode === "sample" ? " Change the seed and change it back: the configs and their ids come back." : "",
    ),
  );
  configsHead.replaceChildren(h("tr", {}, h("th", { scope: "col" }, "#"), ...space.stages.map((stage) => h("th", { scope: "col" }, code(stage.name))), h("th", { scope: "col" }, code("configId"))));
  configsRows.replaceChildren(
    ...shown.map((row, i) =>
      h(
        "tr",
        {},
        h("td", { class: "n", "data-label": "#" }, String(i + 1)),
        ...row.cells.map((cell, k) => h("td", { class: cell === "(none)" ? "none" : undefined, "data-label": space!.stages[k]!.name }, cell)),
        h("td", { class: "id", "data-label": "configId" }, code(row.id)),
      ),
    ),
  );
}
watch([configsLevels, configsN, configsSeed, configsDraw], updateConfigs);
listeners.push(updateConfigs);

/* 2. The share of each option. */
const shareStage = byId<HTMLSelectElement>("share-stage");
const shareBars = byId("share-bars");
const shareNote = byId("share-note");
let shareNames = "";

function updateShares(): void {
  if (space === null) {
    shareStage.replaceChildren();
    shareNames = "";
    shareBars.replaceChildren();
    shareNote.replaceChildren(noSpace());
    return;
  }
  const names = space.stages.map((stage) => stage.name);
  if (names.join("\n") !== shareNames) {
    shareNames = names.join("\n");
    const largest = largestStage(space);
    shareStage.replaceChildren(...names.map((name) => h("option", { value: name, selected: name === largest }, name === largest ? `${name} (the largest)` : name)));
  }
  const stage = shareStage.value;
  let rows;
  try {
    rows = shares(space, stage, 1);
  } catch (error) {
    shareBars.replaceChildren();
    shareNote.replaceChildren(verdict(false, "No sample:", error instanceof Error ? error.message : String(error)));
    return;
  }
  const top = Math.max(...rows.flatMap((row) => [row.reject, row.walk]), 0.01);
  shareBars.replaceChildren(
    ...rows.map((row) =>
      h(
        "div",
        { class: "share" },
        h("span", { class: "share-name" }, row.option === "(none)" ? "no option" : code(row.option)),
        h("span", { class: "bar reject", style: `--share: ${(row.reject / top) * 100}%` }, h("span", {}, `reject ${percent(row.reject)}`)),
        h("span", { class: "bar walk", style: `--share: ${(row.walk / top) * 100}%` }, h("span", {}, `walk ${percent(row.walk)}`)),
      ),
    ),
  );
  const most = rows.reduce((a, b) => (Math.abs(b.reject - b.walk) > Math.abs(a.reject - a.walk) ? b : a));
  const spread = Math.max(...rows.map((row) => row.walk)) - Math.min(...rows.map((row) => row.walk));
  const even = spread < 0.005;
  const name = most.option === "(none)" ? "no option" : most.option;
  shareNote.replaceChildren(
    Math.abs(most.reject - most.walk) < 0.02
      ? verdict(true, "The same shares:", `in ${count(SHARE_SAMPLE, "config")} of each draw, no option of this stage differs by 2 points or more.`)
      : verdict(
          false,
          "Different shares:",
          `${name} has ${percent(most.reject)} with reject and ${percent(most.walk)} with walk.`,
          even ? " The walk gives each option of this stage the same share, so a mean over a walk sample is not a mean of the space." : " A mean over a walk sample is not a mean of the space.",
        ),
  );
}
watch([shareStage], updateShares);
listeners.push(updateShares);

/* 3. One id for each point. */
const idA = byId<HTMLTextAreaElement>("id-a");
const idB = byId<HTMLTextAreaElement>("id-b");
const idResult = byId("id-result");
const idCards = byId("id-cards");
const growOmit = byId<HTMLInputElement>("grow-omit");
const growResult = byId("grow-result");
const idButtons = examples(
  byId("id-chips"),
  ID_EXAMPLES.map(([label]) => [label, label]),
  (label) => {
    const example = ID_EXAMPLES.find(([name]) => name === label);
    if (example === undefined) return;
    idA.value = configText(example[1]);
    setField(idB, configText(example[2]));
    for (const button of idButtons) button.setAttribute("aria-pressed", String(button.textContent === label));
  },
);
idA.value = configText(ID_EXAMPLES[0]![1]);
idB.value = configText(ID_EXAMPLES[0]![2]);
idButtons[0]?.setAttribute("aria-pressed", "true");

function updateIds(): void {
  if (space === null) {
    idResult.replaceChildren(noSpace());
    idCards.replaceChildren();
    growResult.replaceChildren();
    return;
  }
  const a = idCard(space, idA.value);
  const b = idCard(space, idB.value);
  const card = (name: string, c: ReturnType<typeof idCard>): HTMLElement =>
    h(
      "div",
      { class: "sp-card" },
      h("p", { class: "call" }, `configId(space, ${name})`),
      c.id === null ? h("p", { class: "answer missing" }, "no id") : h("p", { class: "answer" }, code(c.id)),
      c.canonical === null ? problems(c.breaks) : h("p", { class: "canonical" }, h("span", {}, "The canonical form: "), code(c.canonical)),
    );
  idCards.replaceChildren(card("A", a), card("B", b));
  if (a.id === null || b.id === null) {
    const which = a.id === null && b.id === null ? "A and B are" : a.id === null ? "A is" : "B is";
    idResult.replaceChildren(verdict(false, "No id:", `config ${which} not good, so `, code("configId"), " throws. ", code("checkConfig"), " gives the problems."));
  } else if (a.id === b.id) {
    idResult.replaceChildren(verdict(true, "One point:", "A and B have the same canonical form, so they have one id."));
  } else {
    idResult.replaceChildren(verdict(false, "Two points:", "A and B have different canonical forms, so they have two ids."));
  }
  if (a.id === null) {
    growResult.replaceChildren(verdict(false, "No id:", "config A is not good."));
    return;
  }
  const grown = idCard(grownSpace(space, growOmit.checked), idA.value);
  const kept = grown.id === a.id;
  growResult.replaceChildren(
    h("dl", { class: "facts" }, h("dt", {}, "The id of A before"), h("dd", {}, code(a.id)), h("dt", {}, "The id of A after"), h("dd", {}, code(grown.id ?? "no id"))),
    kept
      ? verdict(true, "Each old id stays:", "with ", code("omitUnused"), ", the canonical form leaves out the new stage when a config does not use it.")
      : verdict(false, "Each old id changes:", "the canonical form of A now has the new stage as ", code("null"), ". Records with the old ids do not match."),
  );
}
watch([idA, idB, growOmit], updateIds);
listeners.push(updateIds);

/* 4. The race. */
const raceNoise = byId<HTMLInputElement>("race-noise");
const raceFirst = byId<HTMLInputElement>("race-first");
const raceLevel = byId<HTMLSelectElement>("race-level");
const raceSeed = byId<HTMLInputElement>("race-seed");
const raceScreen = byId<HTMLInputElement>("race-screen");
const raceOut = byId("race-result");
const raceLanes = byId("race-lanes");

function showRaceValues(): void {
  byId("race-noise-value").textContent = raceNoise.value;
  byId("race-first-value").textContent = raceFirst.value;
}

function updateRace(): void {
  showRaceValues();
  const settings = { noise: Number(raceNoise.value), level: Number(raceLevel.value), first: Number(raceFirst.value), seed: whole(raceSeed, 1), screen: raceScreen.checked };
  const { result, lanes } = raceResult(settings);
  const saved = 1 - result.measured / result.full;
  const best = lanes[0]!;
  raceOut.replaceChildren(
    h(
      "p",
      { class: "summary" },
      h("b", {}, `The race measured ${result.measured} of ${result.full} costs`),
      saved > 0 ? `, ${Math.round(saved * 100)}% fewer than a full screen.` : ", the same as a full screen.",
      ` It stopped after ${count(result.inputs, "input")}, with ${count(result.live.length, "live strategy", "live strategies")}.`,
    ),
    best.drop === null
      ? verdict(true, "The best strategy is live:", code(best.id), ` has the smallest gap in the model, and the race kept it.`)
      : verdict(false, "The race dropped the best strategy:", code(best.id), ` dropped at input ${best.drop.inputs}. The level is the level of one round, and a race has many rounds.`),
  );
  raceLanes.replaceChildren(
    ...lanes.map((lane) =>
      h(
        "li",
        { class: lane.drop === null ? "lane live" : "lane out" },
        h(
          "p",
          { class: "lane-head" },
          h("b", {}, lane.label),
          h("span", { class: "gap" }, `gap +${lane.gap}`),
          h(
            "span",
            { class: "state" },
            lane.drop === null ? `live, mean ${lane.mean!.toFixed(2)}%` : `dropped after ${lane.drop.inputs} inputs, Holm p ${lane.drop.adjusted.toPrecision(2)}`,
          ),
        ),
        h(
          "span",
          { class: "cells", role: "img", "aria-label": `${lane.measured} of ${RACE_INPUTS} inputs measured` },
          ...Array.from({ length: RACE_INPUTS }, (_, i) => h("span", { class: i >= lane.measured ? "cell" : lane.drop !== null && i === lane.measured - 1 ? "cell dropped" : "cell measured" })),
        ),
      ),
    ),
  );
}
// A race takes up to some hundred milliseconds, so a slider starts it at its release, not at each step.
raceNoise.addEventListener("input", showRaceValues);
raceFirst.addEventListener("input", showRaceValues);
watch([raceNoise, raceFirst, raceLevel, raceSeed, raceScreen], updateRace, "change");
