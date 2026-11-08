# @mark1russell7/strategy-space

Layout strategies as data. A strategy space gives the stages of an engine, the options of each stage and the ranges of their params. The functions of this package check a space and its configs, and give the id of a config. They also count the space and make grids and seeded samples.

```ts
import { checkSpace, configId, enumerateSpace, spaceSize, type StrategySpace } from "@mark1russell7/strategy-space";

const space: StrategySpace = {
  schema: "strategy-space/1",
  engine: "pack",
  version: "0.0.1",
  stages: [
    { name: "order", options: [{ id: "area", params: [] }, { id: "height", params: [] }] },
    { name: "placement", options: [{ id: "shelf", params: [{ name: "gap", kind: "int", min: 0, max: 8, default: 2 }] }] },
  ],
};

checkSpace(space); // [] : the space is good
spaceSize(space, { levels: 3 }).base; // 6n : 2 orders, 3 levels of gap
const configs = enumerateSpace(space, { mode: "sample", n: 4, seed: 7 });
configId(space, configs[0]!); // the first 16 hex characters of a SHA-256
```

## What the package has

| Area | Functions |
| --- | --- |
| The checks | `checkSpace`, `checkConfig`, `paramProblem` |
| The id of a config | `canonicalConfig`, `configId` |
| The count | `spaceSize`, `paramLevels`, `spaceShapeKinds` |
| The configs | `enumerateSpace` (the modes `grid` and `sample`, the draws `uniform` and `walk`, fixed options) |
| Two spaces as one | `productSpace`, `joinConfigs`, `splitConfig` |
| The option schema of a strategy | `listOptions`, `optionDefaults`, `checkOptions`, `clampOptions`, `checkSchema` |
| The sweeps of the options | `sweepValues`, `sweepOf`, `sweepGrid` |
| The distinctness gate | `distinctness`, `distinctCount` |

[`docs/STRATEGY-SPACE.md`](../../docs/STRATEGY-SPACE.md) tells the schema `strategy-space/1` and the rules of each function. [`docs/DISTINCT.md`](../../docs/DISTINCT.md) tells the gate.

## Shape kinds

An option can give the shape kinds that it supports, as tags. The option `kinds` gives the list of the known tags. Without `kinds`, each string with text is a kind.

```ts
checkSpace(space, { kinds: ["rect", "circle"] });
spaceSize(space, { levels: 3, shapes: ["circle"], kinds: ["rect", "circle"] });
```

## The same ids as `layout-contract`

The schema, the ids and the samples come from `layout-contract` 0.6.1 with no change. A config has the same `configId`, and a seed gives the same sample. The hash and the random numbers come from `@mark1russell7/rigor-generators`.
