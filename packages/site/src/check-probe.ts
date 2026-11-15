// The probe of the home page for `site-pages check`: it uses each demo as a visitor does, at each width of the check.
declare const check: (name: string, ok: boolean, detail?: unknown) => void;
declare const $: (selector: string) => HTMLElement | null;
declare const $$: (selector: string) => HTMLElement[];
declare const click: (element: Element | string | null) => void;
declare const type: (element: Element | string | null, text: string) => void;
declare const until: (fn: () => unknown, ms?: number) => Promise<boolean>;

/** This function gives the text of an element, or an empty text. */
const text = (selector: string): string => $(selector)?.textContent ?? "";
/** This function finds a button of a row by its text. */
const chip = (row: string, label: string): HTMLElement | null => $$(`#${row} button`).find((element) => element.textContent === label) ?? null;

check("the packer is good", $("#space-result .sp-verdict.sp-pass") !== null, text("#space-result"));
check("the count is 4 x 9 x 7 = 252, and spaceSize gives 243", text("#space-sum").includes("4 × 9 × 7 = 252") && text("#space-sum .total") === "243", text("#space-sum"));
check("the stages show three cards", $$("#space-stages .stage").length === 3, $$("#space-stages .stage").length);
click(chip("space-chips", "A log scale from 0"));
check("a log scale from 0 is a problem", await until(() => text("#space-result").includes("scale:")), text("#space-result"));
check("the other demos need a good space", await until(() => text("#configs-result").includes("No space")), text("#configs-result"));
click(chip("space-chips", "The packer"));
check("the packer is good again", await until(() => $("#space-result .sp-verdict.sp-pass") !== null && $$("#configs-rows tr").length === 8), text("#configs-result"));

check("the seed 7 gives 8 configs with ids", $$("#configs-rows tr").length === 8 && /^[0-9a-f]{16}$/.test(text("#configs-rows tr td:last-child")), text("#configs-result"));
const first = text("#configs-rows tr td:last-child");
type("#configs-seed", "8");
check("another seed gives other configs", await until(() => text("#configs-rows tr td:last-child") !== first), text("#configs-rows tr td:last-child"));
type("#configs-seed", "7");
check("the seed 7 gives the same configs again", await until(() => text("#configs-rows tr td:last-child") === first), text("#configs-rows tr td:last-child"));
click($$("#configs-mode button")[0] ?? null);
check("the grid has 243 configs", await until(() => text("#configs-result").includes("The grid has 243 configs")), text("#configs-result"));
check("walk gives a share that reject does not", text("#share-note").includes("Different shares") && $$("#share-bars .share").length === 4, text("#share-note"));

check("the order of the keys does not change the id", $("#id-result .sp-verdict.sp-pass") !== null, text("#id-result"));
check("a new stage changes the old ids", text("#grow-result").includes("Each old id changes"), text("#grow-result"));
click("#grow-omit");
check("with omitUnused, the old ids stay", await until(() => text("#grow-result").includes("Each old id stays")), text("#grow-result"));
click(chip("id-chips", "A value out of its range"));
check("a value out of its range has no id", await until(() => text("#id-result").includes("No id") && text("#id-cards").includes("param:")), text("#id-result"));

check("the race measures fewer costs than a screen", /The race measured \d+ of 240 costs, \d+% fewer/.test(text("#race-result")), text("#race-result"));
check("the race gives six lanes of 40 cells", $$("#race-lanes .lane").length === 6 && $$("#race-lanes .cell").length === 240, $$("#race-lanes .cell").length);
click("#race-screen");
check("a screen measures each cost", await until(() => text("#race-result").includes("240 of 240") && $$("#race-lanes .cell.measured").length === 240), text("#race-result"));

export {};
