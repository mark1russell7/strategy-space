# Roadmap

This file is the plan of strategy-space. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| R1 | The first package | done in 0.0.1 | Move the schema `strategy-space/1` from `layout-contract` 0.6.1 whole, with its tests. The shape kinds become string tags. `layout-contract` 0.9.0 re-exports the format of 0.0.2 with the same names. |
| R2 | The operator format | done in 0.0.2 | Each operator has an id, a stage, a source (`literature`, `ours` or `mutation`) and a parent. A test and a declaration go with each operator. `needsOperator` tells which options need none. |
| R3 | The combinators | done in 0.0.2 | Portfolio, sequence, fallback and dispatch as terms over configs, each with an arity, a spec and a test. A product space joins two spaces. |
| R4 | The count to a depth | done in 0.0.2 | `countSpace(space, { depth })` gives the count of the configs and terms to a combinator depth. |
| R5 | The distinctness gate | in progress | A variant counts only when its output differs from each operator of its stage on one input. It came from `highways` with 0.0.1. |
| R6 | Screening and racing | done in 0.0.3 | `race` measures the live terms on one input at a time. A term drops when the paired sign-flip test with the Holm correction shows it is worse than the best. With `keep` equal to the count of the terms, the race is a screen. |
| R7 | The surrogate | open | A regression from `rigor-statistics` picks the next runs. This package only uses it. |
| R8 | The search package | in progress | `@mark1russell7/strategy-search` 0.0.1: a sweep over a grid or a seeded sample, hard constraints, many objectives, Pareto ranks, and one plain row for each evaluation. 0.0.2 adds `evolve`: a genetic search (NSGA-II with constrained dominance) with the rows of a sweep, and `crowdingDistances`. 0.0.3 gives each sample of `evolve` at least the choices of the widest stage, and a `RangeError` for each refusal of a sample. In 0.1.0, a sample of `evolve` has the size of the population again, because a sample of `strategy-space` 0.1.0 can give each option of a stage. Soft constraints come later. |
