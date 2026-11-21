# @mark1russell7/strategy-search

A search over a strategy space of [`@mark1russell7/strategy-space`](../strategy-space). A sweep evaluates each config of a grid or of a seeded sample. A greedy choice adds units of items under a budget. It gives one plain row for each evaluation, with the Pareto rank of the row. The package knows no domain: you give the evaluation as a function.

## Install

```sh
npm install @mark1russell7/strategy-search
```

## A sweep

```ts
import { frontOf, sweep } from "@mark1russell7/strategy-search";

const run = sweep(space, {
  objectives: [
    { name: "cost", goal: "min", unit: "USD" },
    { name: "speed", goal: "max" },
  ],
  evaluate: (config) => ({ breaks: [], values: { cost: costOf(config), speed: speedOf(config) } }),
  enumerate: { mode: "sample", n: 200, seed: "my study" },
  evaluator: "my-evaluator 1",
});

run.rows.filter((row) => row.front); // the rows of the Pareto front
frontOf(run); // the same rows, each with its config
```

- `enumerate` takes the options of `enumerateSpace`: a grid, or a sample with a seed. A seed can be a name. `seedOf` of `@mark1russell7/rigor-generators` gives its number.
- `evaluate` gives the hard constraints that a config breaks, and the value of each objective. It is a pure function.
- `evaluator` names the evaluation and its version. It is part of the id of the run.
- When `enumerateSpace` refuses the space or the enumeration, the search throws a `RangeError` with the text of the refusal. An example is a sample that the constraints of the space empty.

## A genetic search

```ts
import { evolve, frontOf } from "@mark1russell7/strategy-search";

const run = evolve(space, {
  objectives: [
    { name: "cost", goal: "min", unit: "USD" },
    { name: "speed", goal: "max" },
  ],
  evaluate: (config) => ({ breaks: [], values: { cost: costOf(config), speed: speedOf(config) } }),
  seed: "my study",
  evaluations: 500,
});

frontOf(run); // the rows of the Pareto front, each with its config
```

`evolve` is NSGA-II (Deb and others, 2002) with the constrained dominance of Deb (2000). Use it when a space is too large for a grid, and a sample finds few good configs.

1. The first population comes from a seeded sample of the space. Each sample of a run has the size of the population. A sample can give each choice of a stage, also of a stage with more choices than the population.
2. A tournament of two picks each parent. The better parent wins.
3. Two parents mix their stages. Each stage of a child comes from one parent, and the second child gets the other parent.
4. A child takes the choice of a sampled config at some stages. Thus a new choice keeps the ranges of the params.
5. A child that breaks a constraint of the space gives way to its parent. Thus each config of a run keeps the constraints.
6. The best configs of the parents and the children make the next population.

The order of the configs:

1. The configs that keep each hard constraint come first, by their Pareto rank. On one rank, a config with a larger crowding distance comes first.
2. Then come the configs that break hard constraints, the fewest breaks first.
3. The configs with a value that is not a read come last.

| Option | Default | Meaning |
| --- | --- | --- |
| `evaluations` | | The most evaluations of the run. A repeat of a config costs no evaluation. |
| `population` | 40 | The count of the configs of a generation |
| `mutation` | 1 over the count of the stages | The chance that a child takes a new choice at a stage |
| `crossover` | 0.9 | The chance that two parents mix their stages |
| `sample` | | The options of the samples, as in `enumerateSpace`. A space with many constraints needs `{ draw: "walk" }`. |

The run stops when it used each evaluation (`stop: "budget"`), or when 20 generations in a row gave no new config (`stop: "stall"`). A small space stops with `stall` after each config has its row.

The rows of a genetic search have the fields of the rows of a sweep, and the field `generation`. The first population is generation 0. The Pareto rank is over each feasible row of the run, not only over the last population. Thus a sweep and a genetic search with the same count of evaluations compare row for row.

## A budgeted greedy choice

`greedy` chooses units of items under a budget. Each step adds one unit of the item with the largest gain for each unit of cost. The value of a choice is a list of numbers, and the first number is the most important. Thus a gain on the first number always comes before a gain on the second number.

```ts
import { greedy } from "@mark1russell7/strategy-search";

const run = greedy({
  items: [
    { id: "lamp", cost: 20, max: 2 },
    { id: "radio", cost: 35 },
  ],
  budget: 60,
  // The value of a choice: the most important number first. The function is pure.
  value: (selection) => [Math.min(2, selection["lamp"] ?? 0), selection["radio"] ?? 0],
});
// run.picks gives the steps in order. run.selection gives the units, and run.after gives the value of the choice.
```

- `goal: "min"` makes a smaller value a gain, for example a shortfall.
- `start` gives the units of an earlier choice. Their cost is not in the budget. Use it for a second target after a first target.
- A step must fit the money left. The steps stop at the first of these: no unit fits (`budget`), each item has its `max` (`units`), or no unit has a gain (`no-gain`).
- A part of a gain at or below `tolerance * max(1, |value|)` is 0. The default tolerance is `1e-9`.
- At the end, `greedy` compares the choice with the best single unit. It gives the single unit when that unit has a better value (`method: "single"`). Set `single` to `false` to stop this.

The lazy evaluation keeps the last gain of each item as a bound. It evaluates an item again only when its bound is the largest. This is correct when the gain of an item does not increase as the choice grows. With such gains, the result holds at least `(1 - 1/e) / 2` of the best value (Khuller, Moss and Naor 1999). When two items give more together than apart, set `lazy` to `false`. Then each step evaluates each item again.

## The rows

Each evaluation gives one row. A row is plain data, so a store can keep it and a query can read it.

| Field | Value |
| --- | --- |
| `run` | The id of the run: a hash of the space, the enumeration, the objectives and the evaluator |
| `index` | The place of the config in the enumeration, from 0 |
| `config` | The id of the config, from `configId` |
| `seed` | The seed of the run, or `null` for a grid |
| `status` | `feasible`, `breaks` or `unread` |
| `breaks` | The hard constraints that the config breaks |
| `missing` | The objectives without a finite value |
| `values` | The value of each objective, or `null` |
| `rank` | The Pareto rank among the feasible rows, from 1, or `null` |
| `front` | `true` for the rank 1 |

A sample can give a config two times. The second time gets no evaluation and no row. The field `repeats` of the run counts them.

## The rules of dominance

1. A point dominates a point when it is as good on each objective, and better on one or more objectives.
2. Two points with equal values do not dominate each other. They get the same rank. The value `-0` equals `0`.
3. A value that is not a finite number (`NaN`, `Infinity` or `-Infinity`) is not a read. Its row has the status `unread` and no rank. It does not dominate, and no row dominates it.
4. The rank is 1 when no feasible row dominates the row. The rank is `k + 1` when only rows of rank `k` or less dominate it.

A row that breaks a hard constraint gets no rank. A break comes before a value that is not a read.

`dominates` and `paretoRanks` give the same rules for plain lists of numbers. `crowdingDistances` gives the crowding distance of each point of one rank.

## The cost

`paretoRanks` sorts the points in the lexical order of their values. A point can come only after a point that dominates it. Thus each point is compared only with the points of the current rank.
