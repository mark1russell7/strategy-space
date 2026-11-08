// The distinctness gate (`docs/DISTINCT.md`). A variant counts only when its output differs from each operator of its stage on at least one input.
// The caller gives the hash of the output of each strategy on each input of a fixed set. The gate came from `highways` 27b40c8.

/** The hashes of the outputs of one strategy: one hash for each input, by the id of the input. `probeHash` of `layout-contract` gives one hash. */
export interface OutputHashes {
  readonly id: string;
  readonly stage: string;
  readonly outputs: Readonly<Record<string, string>>;
}

/** The options of the gate. */
export interface DistinctOptions {
  /** The ids of the inputs of the set. Each variant needs a hash on each of them. */
  readonly inputs: readonly string[];
  /** The hash that a strategy gives for an input that it refuses, for example `REFUSED_PROBE` of `layout-contract`. A refused input is not a difference. */
  readonly refused?: string;
}

/**
 * The verdict of the gate on one variant.
 * `distinct`: on at least one input, its output differs from the output of each operator of its stage.
 * `same`: an operator of its stage has the same hash on each input of the set.
 * `no-read`: the gate cannot decide. An input has no hash, or no input shows a difference from an operator that is not the same.
 */
export type DistinctVerdict = "distinct" | "same" | "no-read";

/** The row of the gate for one variant. */
export interface DistinctRow {
  readonly id: string;
  readonly stage: string;
  readonly verdict: DistinctVerdict;
  /** The first id of the variants with the same hash on each input. A variant with a different id is a duplicate of it. */
  readonly canonical: string;
  /** The operators with the same hash on each input. */
  readonly sameAs: readonly string[];
  /** The operators with no difference on a compared input, and no equal hash on each input. */
  readonly undecided: readonly string[];
  /** The inputs of the set with no hash for this variant. */
  readonly missing: readonly string[];
  /** The first input where the outputs differ from each operator, by the id of the operator. */
  readonly differsOn: Readonly<Record<string, string>>;
}

/** This function gives the key of the hashes of a strategy on the inputs, in the order of the inputs. */
function vectorKey(s: OutputHashes, inputs: readonly string[]): string {
  return JSON.stringify(inputs.map((b) => s.outputs[b] ?? null));
}

/** This function gives the ids that are in the list more than once. */
function repeated(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(ids.filter((id) => seen.has(id) || !seen.add(id)))];
}

/**
 * This function gives the verdict of the gate on each variant, sorted by id.
 * It compares a variant only with the operators of its stage. A stage with no operator gives `distinct` to each complete variant.
 *
 * @param operators - The hashes of the existing operators.
 * @param variants - The hashes of the variants that the gate examines.
 * @param options - The inputs of the set and the refused hash.
 * @throws Error when an id is in the operators or in the variants more than once, or when the set has no input.
 */
export function distinctness(operators: readonly OutputHashes[], variants: readonly OutputHashes[], options: DistinctOptions): DistinctRow[] {
  const { inputs, refused } = options;
  if (inputs.length === 0) throw new Error("The gate has no input.");
  const twice = repeated([...operators.map((o) => o.id), ...variants.map((v) => v.id)]);
  if (twice.length > 0) throw new Error(`These ids are not unique: ${twice.join(", ")}.`);

  // The first id of each class of variants with the same hashes.
  const canonical = new Map<string, string>();
  for (const v of [...variants].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const key = `${v.stage}\u0000${vectorKey(v, inputs)}`;
    if (!canonical.has(key)) canonical.set(key, v.id);
  }

  const compared = (a: string | undefined, b: string | undefined): boolean => a !== undefined && b !== undefined && a !== refused && b !== refused;
  return [...variants]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((v) => {
      const missing = inputs.filter((b) => v.outputs[b] === undefined);
      const sameAs: string[] = [];
      const undecided: string[] = [];
      const differsOn: Record<string, string> = {};
      for (const op of operators.filter((o) => o.stage === v.stage).sort((a, b) => (a.id < b.id ? -1 : 1))) {
        const input = inputs.find((b) => compared(v.outputs[b], op.outputs[b]) && v.outputs[b] !== op.outputs[b]);
        if (input !== undefined) differsOn[op.id] = input;
        else if (missing.length === 0 && inputs.every((b) => op.outputs[b] === v.outputs[b])) sameAs.push(op.id);
        else undecided.push(op.id);
      }
      const verdict: DistinctVerdict = missing.length > 0 ? "no-read" : sameAs.length > 0 ? "same" : undecided.length > 0 ? "no-read" : "distinct";
      return { id: v.id, stage: v.stage, verdict, canonical: canonical.get(`${v.stage}\u0000${vectorKey(v, inputs)}`)!, sameAs, undecided, missing, differsOn };
    });
}

/** This function gives the count of the distinct variants: the canonical variants with the verdict `distinct`. A duplicate does not count. */
export function distinctCount(rows: readonly DistinctRow[]): number {
  return rows.filter((r) => r.verdict === "distinct" && r.canonical === r.id).length;
}
