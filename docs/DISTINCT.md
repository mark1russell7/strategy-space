# The distinctness gate

A new variant of a strategy counts only when its output differs from each operator of its stage. The gate decides this from hashes of the outputs on a fixed set of inputs.

## The data

The caller gives an `OutputHashes` for each operator and for each variant:

```ts
{ id: "shelf-tight", stage: "placement", outputs: { "probe-1": "9f2c...", "probe-2": "refused" } }
```

- `outputs` has one hash for each input of the set, by the id of the input.
- `probeHash` of `layout-contract` gives one hash. `fingerprintOf` of `layout-contract` makes one fingerprint from the same record.
- The option `refused` names the hash of a refused input, for example `REFUSED_PROBE` (`"refused"`) of `layout-contract`.

## The verdicts

`distinctness(operators, variants, { inputs, refused })` gives one row for each variant, sorted by id. The gate compares a variant only with the operators of its stage.

| Verdict | When |
| --- | --- |
| `distinct` | On at least one input, the output of the variant differs from the output of each operator of its stage. |
| `same` | An operator of the stage has the same hash on each input of the set. |
| `no-read` | The gate cannot decide. The variant has no hash on an input, or no input shows a difference from an operator. |

A refused input is not a difference. Thus a variant that refuses each input where it differs gets `no-read`, not `distinct`.

The field `differsOn` gives the first input that differs from each operator. The field `canonical` gives the first id of the variants with the same hashes. `distinctCount(rows)` counts each canonical variant with the verdict `distinct` one time, so a duplicate does not count.

## The source

The gate came from `highways` at commit `27b40c8`, with general names: `outputs` and `inputs` take the place of `boards`. The logic and the tests did not change.
