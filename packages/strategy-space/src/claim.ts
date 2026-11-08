// The break of a claim: the one form of a problem that the checks of a space and of a config give.

/** One broken claim, with the ids of the inputs that break it. `layout-contract` uses the same form for the checks of a corpus. */
export interface ClaimBreak {
  /** The name of the claim, for example `schema`, `unknown`, `shape` or `members`. */
  readonly claim: string;
  /** The text of the break. */
  readonly detail: string;
  /** The ids of the inputs that break the claim. The list is empty when the break has no input. */
  readonly inputs: readonly string[];
}
