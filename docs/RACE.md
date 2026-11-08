# The race of the terms

A race finds the best terms of a list with fewer measures than a full screen. It measures the live terms on one input at a time. It drops a term when a test shows that the term is worse than the best.

## The data

The caller gives the ids of the terms and a cost function:

```ts
race(["portfolio-a", "sequence-b", "shelf"], (id, input) => crossings(id, input), { inputs: 40 })
```

- A smaller cost is better. A cost is a finite number, for example a time, a count of crossings or a waste of area.
- The race measures the inputs in the order 0, 1, 2 and up. The caller decides which record each input number reads.
- For a time, the cost function reads the time from the bench harness of `rigor`. The race does not measure a time itself.

## A round

After `first` inputs (default 5), each input starts a round:

1. The best term is the live term with the smallest mean cost. A tie goes to the first term in the order of the ids.
2. Each other live term gets a test of its paired differences on the measured inputs. A difference is the cost of the term minus the cost of the best term.
3. The test is `signFlipTest` of `@mark1russell7/rigor-statistics`. It is exact up to `exactMax` inputs (default 16), and draws `runs` sign sets above that.
4. `holm` of `@mark1russell7/rigor-statistics` corrects the p of all tests of the round at `level` (default 0.05).
5. A term with a mean gap above 0 and a Holm reject drops. The next input measures only the live terms.

The race stops at the last input, or when a drop leaves `keep` terms or fewer (default 1).

## Why a sign-flip test

- A race tests few inputs in its first rounds. A bootstrap interval of a mean has a poor cover for 5 to 10 values.
- The exact sign-flip test has no condition on the shape of the costs. It only needs paired inputs.
- With 2 terms and an all-positive set of `k` gaps, the exact p is `2 / 2^k`. So the first drop of 1 test at the level 0.05 comes at 6 inputs.

The level is the level of one round. A race tests many rounds, so a race of many rounds drops a term that is not worse more often than `level`. The result is a list of terms for a full measure, not a claim. A claim comes from the full measure of the live terms.

## The result

| Field | Value |
| --- | --- |
| `best` | The live term with the smallest mean cost |
| `live` | The live terms, by their mean cost |
| `means` | The mean cost of each live term over the measured inputs |
| `drops` | Each dropped term with its count of inputs, the best term of its round, the gap, the p and the Holm p |
| `inputs` | The count of the inputs that the race measured |
| `measured` | The count of the calls of the cost function |
| `full` | The count of the calls of a full screen: the count of the terms times `inputs` |

## A screen

With `keep` equal to the count of the terms, the race tests nothing and drops no term. Then the race is a screen of each term on each input, and `measured` is equal to `full`.

## The seeds

Each test has its own seed, `deriveSeed(seed, "race.<inputs>.<id>")` of `@mark1russell7/rigor-generators`. So the same arguments give the same result, also with drawn sign sets.
