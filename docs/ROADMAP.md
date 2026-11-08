# Roadmap

This file is the plan of strategy-space. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| R1 | The first package | in progress | Move the schema `strategy-space/1` from `layout-contract` 0.6.1 whole, with its tests. The shape kinds become string tags. Release 0.0.1. |
| R2 | The operator format | open | Each operator has an id, a stage, a source (`literature`, `ours` or `mutation`) and a parent. A test and a declaration go with each operator. |
| R3 | The combinators | open | Portfolio, sequence, fallback and product as terms over configs, each with an arity and a test. |
| R4 | The count to a depth | open | `countSpace(space, { depth })` gives the count of the configs and terms to a combinator depth. |
| R5 | The distinctness gate | in progress | A variant counts only when its output differs from each operator of its stage on one input. It came from `highways` with 0.0.1. |
| R6 | Screening and racing | open | A screen measures each term on a small slice. A race drops a term when its interval is worse than the best. |
| R7 | The surrogate | open | A regression from `rigor-statistics` picks the next runs. This package only uses it. |
