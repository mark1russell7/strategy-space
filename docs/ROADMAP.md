# Roadmap

This file is the plan of strategy-space. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| R1 | The first package | in progress | Move the schema `strategy-space/1` from `layout-contract` 0.6.1 whole, with its tests. The shape kinds become string tags. Release 0.0.1. |
| R2 | The operator format | done in 0.0.2 | Each operator has an id, a stage, a source (`literature`, `ours` or `mutation`) and a parent. A test and a declaration go with each operator. `needsOperator` tells which options need none. |
| R3 | The combinators | done in 0.0.2 | Portfolio, sequence, fallback and dispatch as terms over configs, each with an arity, a spec and a test. A product space joins two spaces. |
| R4 | The count to a depth | done in 0.0.2 | `countSpace(space, { depth })` gives the count of the configs and terms to a combinator depth. |
| R5 | The distinctness gate | in progress | A variant counts only when its output differs from each operator of its stage on one input. It came from `highways` with 0.0.1. |
| R6 | Screening and racing | done in 0.0.3 | `race` measures the live terms on one input at a time. A term drops when the paired sign-flip test with the Holm correction shows it is worse than the best. With `keep` equal to the count of the terms, the race is a screen. |
| R7 | The surrogate | open | A regression from `rigor-statistics` picks the next runs. This package only uses it. |
