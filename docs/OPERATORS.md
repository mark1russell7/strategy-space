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
| `test` | The path of the test file or the test folder of the operator, or a list of these paths. |
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
| `portfolio` | 2 to 16 | no | yes | It gives the input to each argument, and keeps the best result by the pick rule of its spec. |
| `sequence` | 2 | yes | no | It gives the result of the first argument to the second argument. |
| `fallback` | 2 | yes | yes | When the first argument refuses the input, it gives the result of the second argument. |
| `dispatch` | 2 to 16 | yes | no | It reads one measure of the input, and gives the input to the argument of its band. |

### The spec of a term

Some combinators take a spec, a JSON object of the term:

- `portfolio`: the pick rule. An example is a hard level, the measures with their smallest effect, a rule and a stretch cap. The format does not read the fields of the rule.
- `dispatch`: `{ measure, limits }`. A term with `m` arguments has `m - 1` increasing limits. A band includes its upper limit. So an input at or below the first limit goes to the first argument, and so on. An input above the last limit goes to the last argument. `dispatchIndex(limits, value)` gives the argument.

A spec has no time budget. A time budget makes the result change with the speed of the computer, so the term is not deterministic. `checkTerm` refuses a spec with a key that starts with a key of `BUDGET_KEYS` (`budget`, `deadline` and `timeout`), with case ignored, at any depth. An example is `budgetMs`.

### Ties

A `portfolio` has no order of its arguments. So a tie goes to the first argument of the canonical form. `canonicalTerm(term)` sorts the arguments of each unordered term by their canonical JSON. Two terms that differ only in this order give the same form.

The product of a packer and a router is `productSpace`. It makes one space of two spaces, so it is not a term over the configs of one space.

`checkTerm(space, term)` gives the breaks of a term. A break is a bad config, an unknown combinator or a bad count of arguments. A repeated argument, a bad spec and a time budget are breaks too. The `inputs` of a break give the path of the term, for example `1.0`.

## The count to a depth

`countSpace(space, { depth, levels })` gives the count of the terms of a depth of `depth` or less. The base is the count of the configs without a meta option, at `levels` levels of each numeric param.

For a pool of `n` terms, a combinator with `m` arguments gives this count of argument lists:

| Order | Arguments differ | Count |
| --- | --- | --- |
| yes | yes | `n! / (n - m)!` |
| yes | no | `n ^ m` |
| no | yes | `C(n, m)` |
| no | no | `C(n + m - 1, m)` |

The pool of the depth `k - 1` or less gives the argument lists of each combinator. Each list counts once for each spec. The option `specs` gives the count of the specs of each combinator, with one count or a count for each count of arguments. The default is 1. The count of the depth `k` or less is the base plus these terms. Two terms with a different tree count as two terms, also when they give the same layout. A test compares the count with a walk of all the terms of a small space.
