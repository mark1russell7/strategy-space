# strategy-space

Layout strategies as data. A strategy space gives the stages of an engine, the options of each stage and the ranges of their params. A generator then makes the configs of the space, so a new combination comes from data and not from new code.

| Package | What it has |
| --- | --- |
| [`@mark1russell7/strategy-space`](packages/strategy-space) | The schema `strategy-space/1`, its checks, the id of a config, the count of a space, grids and seeded samples, the option schemas of a strategy, the distinctness gate |

[`docs/STRATEGY-SPACE.md`](docs/STRATEGY-SPACE.md) tells the schema and the rules. [`docs/ROADMAP.md`](docs/ROADMAP.md) has the plan.

The next parts are the operators of a stage, the combinators (portfolio, sequence, fallback and product), the count of a space to a combinator depth, and screening and racing.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm lint:ste
```

The license is MIT.
