# Operators and combinators

This file tells the draft of the operator format and of the combinators. The format is open for review before it gets a version.

## What counts as an operator

An operator is its own mechanism at one stage of a space. It has a declaration and a test. A param value of an option is not an operator.

| Field | Value |
| --- | --- |
| `id` | The id of the option of the stage that the operator is. |
| `stage` | The name of the stage. |
| `source` | `literature` (a method from a paper or a book), `ours` (a method of this project) or `mutation` (a change of a parent operator). |
| `parent` | The id of the operator of the same stage that this operator changes. A `mutation` has a parent. |
| `cite` | The reference of a `literature` operator. |
| `test` | The path of the test file of the operator. |
| `summary` | The text that tells the mechanism. |

A set of operators has the schema `strategy-operators/1`, the `engine` of its space and the list. `checkOperators(space, set)` gives the breaks:

- `unknown`: the stage or the option is not in the space.
- `undeclared`: an option of the space has no operator. A meta option needs no operator.
- `parent`: a mutation has no parent, or the parent is not an operator of the same stage.
- `cycle`: the parents make a cycle.
- `duplicate`, `source`, `cite`, `test` and `summary`: a field is repeated, bad or empty.

`countOperators(set)` gives the count by stage and by source. A variant counts only when the distinctness gate (`docs/DISTINCT.md`) gives it the verdict `distinct`.

## Combinators

A combinator makes a term from terms. A config of the space is a term of the depth 0. A term has the depth 1 more than its deepest argument.

| Combinator | Arguments | Order | Arguments differ | What it does |
| --- | --- | --- | --- | --- |
| `portfolio` | 2 to 16 | no | yes | It gives the input to each argument, and keeps the best result by the score of the space. |
| `sequence` | 2 | yes | no | It gives the result of the first argument to the second argument. |
| `fallback` | 2 | yes | yes | When the first argument refuses the input, it gives the result of the second argument. |

The product of a packer and a router is `productSpace`. It makes one space of two spaces, so it is not a term over the configs of one space.

`checkTerm(space, term)` gives the breaks of a term: the breaks of each config, an unknown combinator, a bad count of arguments, and a repeated argument. The `inputs` of a break give the path of the term, for example `1.0`.

## The count to a depth

`countSpace(space, { depth, levels })` gives the count of the terms of a depth of `depth` or less. The base is the count of the configs without a meta option, at `levels` levels of each numeric param.

For a pool of `n` terms, a combinator with `m` arguments gives this count of argument lists:

| Order | Arguments differ | Count |
| --- | --- | --- |
| yes | yes | `n! / (n - m)!` |
| yes | no | `n ^ m` |
| no | yes | `C(n, m)` |
| no | no | `C(n + m - 1, m)` |

The pool of the depth `k - 1` or less gives the argument lists of each combinator. The count of the depth `k` or less is the base plus these lists. Two terms with a different tree count as two terms, also when they give the same layout. A test compares the count with a walk of all the terms of a small space.
