# The strategy space

Each packer and each router is a pipeline of typed stages. A strategy space gives these stages, their options and the ranges of their params as data. A generator then makes the configs of the space. Thus new combinations come from the space, and not from new code for each named strategy.

The package `@mark1russell7/strategy-space` has the schema and the functions. Each engine publishes its own space against this schema. `layout-contract` exports the same functions, and its joint bench sweeps the product of two spaces.

## The schema

A space has the schema `strategy-space/1`.

| Field | Value |
|---|---|
| `schema` | `strategy-space/1`. |
| `engine` | The name of the space, for example `packing`. A config names the space with this value. |
| `version` | The version of the space. A record writes it. A config and its id do not include it. |
| `stages` | The stages of the pipeline, in order. |
| `constraints` | The rules that keep out invalid combinations of options. |
| `named` | The named strategies of the engine, as points of the space. |
| `parts` | Only in a product space: the two spaces of the product. |

The stage names belong to the engine. The contract does not fix them, and it does not fix their count. For example, a packer can have the stages `order`, `size-search`, `placement`, `local-search` and `combine`. A router can have the stages `grouping`, `lane-order`, `routing` and `smoothing`.

### Stages, options and params

- A stage (`SpaceStage`) has a name and a list of options. A config of an `optional` stage can have no option. Then the value of the stage is `null`.
- An option (`StageOption`) is one implementation of a stage. It has an id and a list of params.
- A param (`SpaceParam`) has a name, a kind and a default. The kinds are `int`, `real`, `enum` and `bool`.
- An `int` or `real` param has `min` and `max`. It can have a `step` from `min`, and the scale `linear` or `log`.
- An `enum` param has a list `values`. A `bool` param has the values `false` and `true`.

A param is active only when its option is in the config. A param with `when` is active only when an earlier param of the same option has one of the values `when.in`. A config that sets an inactive param is not good.

```json
{ "name": "k", "kind": "int", "min": 1, "max": 5, "default": 2, "when": { "param": "fit", "in": ["first"] } }
```

A range without a finite end is not in the schema. Use a `bool` param and a conditional param for it. For example, `bounded: false` stands for an infinite limit, and `limit` has `when: { "param": "bounded", "in": [true] }`.

### Constraints

A constraint has the form `{ if: { stage, option }, then: { stage, option } }` or `{ if: { stage, option }, then: { not: { stage, option } } }`. The option `null` refers to an unused optional stage.

```json
{ "if": { "stage": "routing", "option": "corners" }, "then": { "stage": "grouping", "option": null } }
```

### Meta options

A meta option chooses between whole configs, or wraps them. Examples are a portfolio, a selector and an aspect search around an inner config. The option has the field `members: { min, max, ordered }`.

- The config of a meta option has a list `members`. Each member is a config of the same space. The count of the members is from `min` to `max`.
- A member has no meta option. The depth of a meta config is 1.
- A meta option replaces the pipeline of its space. The other stages of the config are `null`.
- In a product space, a meta option of one part takes members of that part. The stages of the other part do not change.
- Two equal members are not good. Members with `ordered: false` are sorted by their `configId`.
- A stage with only meta options is optional, because a config without a meta option exists.
- The member rule can have a `pool`: a fixed list of member lists. Each entry is a list of whole configs of the space of the members.
- With a `pool`, the members of a config are the members of one entry. An unordered rule compares the sorted `configId` values of the members.
- The `pool` is part of the space, not of a config. Thus a `pool` does not change a `configId`.
- The rule `{ "min": 0, "max": 0, "ordered": false }` states an option that chooses its members from the input. A config of this option has the empty list `members`.
- This form has no `pool` and no `view`. Each other rule with a count of 0 is not good.
- A default sample has no meta option, so it does not hold this option. A sample with `meta: "sample"` holds it.

```json
{ "id": "cell-portfolio", "params": [], "members": { "min": 11, "max": 11, "ordered": false, "pool": [[{ "space": "packing", "stages": {} }]] } }
```

### Configs

A config (`StrategyConfig`) has the name of its space and one choice for each stage. A choice has an option, the values of its params and, for a meta option, its members.

```json
{ "space": "packing", "stages": { "order": { "option": "area" }, "placement": { "option": "maxrects", "params": { "rule": "cp" } } } }
```

A config can leave out a param. Then the param has its default. A config can also leave out an optional stage. Then the stage is `null`.

## The rules of the id

`canonicalConfig(space, config)` gives the canonical form of a config:

- Each stage of the space, in the order of the space. An unused optional stage is `null`.
- Only the active params, with the defaults of the params that the config does not set.
- Stable numbers: whole numbers as integers, `-0` as `0`, and real numbers with 12 significant digits.
- The canonical form of each member. The members of an unordered meta option are sorted by their `configId`.

`configId(space, config)` is the first 16 hex characters of the SHA-256 of `canonicalJson` of the canonical form. `canonicalJson` and `sha256Hex` are the functions of `corpusHashOf`, so each engine gets the same id.

- Two spellings of one config get one id. For example, a default that the config leaves out and the same default in the config give one id.
- The version of the engine is not part of a config or of its id. The `space` of a config names the space without its version. The record writes the version.

## The checks

`checkSpace(space)` gives one `ClaimBreak` for each problem. An empty list tells that the space is good. The `claim` of a break is the kind of the problem.

| Claim | Problem |
|---|---|
| `schema` | The schema is not `strategy-space/1`, or the space has no engine name or no version. |
| `duplicate` | Two stages, two options of a stage, two params of an option or two values of an enum have one name. |
| `options` | A stage has no options. |
| `range` | A numeric param has no finite `min` and `max`, an empty range or a bad step. |
| `default` | The default of a param is not in its range or not on its step. |
| `values` | An enum has no values. |
| `scale` | A param with the scale `log` has a `min` of 0 or less. |
| `when` | A `when` refers to a later param, or has values that are not values of that param. |
| `meta` | A stage that is not optional has only meta options. |
| `unknown` | A constraint or a named config has an unknown stage, option or param. |
| `constraint` | A named config breaks a constraint. |
| `shape` | The `supports.shape` of an option is empty, or has a kind that is not declared. |
| `pool` | A `pool` is not a list of one or more member lists. A bad entry gives `members`, `duplicate` or the claim of its member. |

`checkConfig(space, config)` checks one config. It also finds `missing` (a stage that is not optional, without an option), `inactive`, `param` (a value out of range), `members` and `depth`.
It finds `pool` for a member list that is not an entry of the `pool` of its option.
With `{ shapes }`, it also finds `shape`: a chosen option that does not support a kind of the input. A shape kind is a tag, for example `rect` or `circle`. The option `kinds` gives the list of the known tags, and `layout-contract` gives `SHAPE_KIND_IDS`. Without `kinds`, each string that is not empty is a kind. The breaks of a named config of `checkSpace` have the name of the config in `inputs`.

## The size and the enumeration

`spaceSize(space, { levels })` counts the grid points with `levels` levels for each numeric param. The count includes only active params, and only the combinations that keep the constraints.

- With 1 level, a numeric param has its default. With k levels, it has k points from `min` to `max` on its scale and its step.
- An `enum` param has each value, and a `bool` param has 2 values.
- The result has two counts. `base` counts the configs without a meta option. `meta` counts the configs with a meta option. Each count is a `bigint`.
- When the meta count is more than `maxMeta` (default `10n ** 18n`), `meta` is `null`.
- A meta option with a `pool` counts each entry one time. Without a `pool`, it counts each list of base configs with a good count. An option with no member list counts one list.
- An example is `cell-portfolio` of `packing`, with 1 list of 11 members. Without a `pool`, the meta count of `packing` at 3 levels is approximately 1.49e25. With the `pool`, it is approximately 1.72e15.
- With `shapes`, `spaceSize` and `enumerateSpace` count only the options that support each kind. Without `shapes`, the result does not change.
- With `shapes`, a `pool` keeps only the entries whose members support each kind. A meta option without such an entry does not count.

`enumerateSpace(space, options)` gives configs in their canonical form:

- The mode `grid` gives each grid point without a meta option, in a stable order. A grid of more than `limit` configs (default 100000) causes a `RangeError`.
- The mode `sample` gives `n` configs of a seeded Latin hypercube. The options of a stage get equal strata. Each active param gets its own strata among the configs that use it.
- A sample is deterministic for its seed.
- A sample draws again when a config breaks a constraint. After `maxTries` draws, it throws an `Error`.
- The option `meta` is `skip` by default, so a sample has no meta option. With `sample`, a meta option draws its members from a base sample of its part.
- A meta option with a `pool` draws one entry of its `pool`. The entries get equal strata.

## The product of two spaces

`productSpace(a, b, name)` joins two spaces, for example a packer and a router. Each stage gets the prefix of its engine, for example `packing.order` and `highways.routing`. The constraints get the same prefixes. The named configs are the pairs `<name in a>+<name in b>`.

A joint config is one object with one id. `joinConfigs(space, parts)` makes a joint config from the configs of the parts. `splitConfig(config, engine)` gives the config of one part back.

## A sample of a space with many constraints

A sample of `enumerateSpace` draws each stage alone, and it draws again when a point breaks a constraint. This default fails on a space whose constraints reject most draws. On `routeSpace` of `highways` 0.15.0, the 360 constraints kept 27 of 40,000 draws, so a sample of 400 configs throws.

The option `draw: "walk"` gets the sample of such a space. A point draws its stages from the largest to the smallest. Each stage draws only from the options that keep the constraints with the stages before it.

- The largest stage keeps its equal strata. A smaller stage has equal strata only over the options that stay open.
- A point can still fail when a rule asks for an option that another rule refuses. It then draws again and counts against `maxTries`.
- The default stays `reject`, so a seeded sample of each current user does not change. The two values give different configs for one seed.
- A member list of a meta option draws its pool with the same draw.

A sample of `walk` is not uniform over the valid configs. Each option of the largest stage gets an equal share, whatever count of valid configs it has. Thus a mean over this sample is not a mean of the space. Each record of such a sample states its draw.

This table shows the size of the difference on `routeSpace` of `highways` 0.15.0. The uniform column reads the 38,558 valid combinations of the grid at one level. The walk column reads 3,200 configs with the seed 20261105.

| Stage | Option | Uniform | Walk |
| --- | --- | --- | --- |
| `routing` | `search` | 32.53 % | 1.50 % |
| `routing` | `straight` | 1 combination | 1.50 % |
| `grouping` | none | 55.96 % | 91.06 % |
| `gate` | none | 42.46 % | 24.22 % |
| `levels` | none | 72.11 % | 98.50 % |

The total variation against uniform reads 0.818 on `routing`. It reads 0.015 to 0.016 on `plugs` and 0.186 to 0.364 on the other stages, over the seeds 20261105, 3 and 77. A routing option has 1 to 12,544 valid combinations, and the median is 28.

## A sample with fixed options

The option `fixed` of a sample gives each config the same option at a stage. A key is the name of a stage, and its value is the id of an option. The other stages draw as before, with `reject` or `walk`. A bench can thus give an option of a small stage the count of configs that its floor needs.

- A stage of a product space has the name of its part before its own name, for example `pack.placement`.
- A fixed meta option needs `meta: "sample"`. Its members come from the space before the fix.
- A meta option of another stage of the same part goes out of the sample, because such an option replaces the fixed stage.
- The sample refuses a stage or an option that the space does not have, and a fixed option that the shape filter removes. It refuses these with a `RangeError`, also for `n` 0.
- When a constraint between two fixed options breaks, the `RangeError` names the broken constraints.
- When the constraints with the other stages remove each config, the `RangeError` tells that no constraint between two fixed options breaks.
- With `draw: "walk"`, the fixed stages draw first. The other stages then draw only from the options that keep the constraints with the fixed options. With the largest stage first, most points of a tight constraint break at the fixed stage.
- A sample with fixed options is not a sample of the space. Each record of such a sample states its fixed options.

## An example space

The example has a packer and a router. The stage names are examples. Each engine gives its own names.

```json
{
  "schema": "strategy-space/1",
  "engine": "packing",
  "version": "0.3.0",
  "stages": [
    { "name": "order", "options": [{ "id": "height-desc", "params": [] }, { "id": "area-desc", "params": [] }] },
    { "name": "split", "optional": true, "options": [{ "id": "guillotine", "params": [{ "name": "rule", "kind": "enum", "values": ["short", "long"], "default": "short" }] }] },
    { "name": "assignment", "options": [
      { "id": "maxrects", "params": [{ "name": "rule", "kind": "enum", "values": ["bssf", "bl", "cp"], "default": "bssf" }, { "name": "rotate", "kind": "bool", "default": false }] },
      { "id": "push", "params": [{ "name": "maxShoves", "kind": "int", "min": 1, "max": 32, "scale": "log", "default": 8 }] }
    ] },
    { "name": "local-search", "optional": true, "options": [{ "id": "anneal", "params": [{ "name": "temp", "kind": "real", "min": 0, "max": 1, "default": 0.5 }] }] },
    { "name": "combine", "optional": true, "options": [{ "id": "portfolio", "params": [], "members": { "min": 2, "max": 5, "ordered": false } }] }
  ],
  "constraints": [{ "if": { "stage": "split", "option": "guillotine" }, "then": { "not": { "stage": "assignment", "option": "push" } } }],
  "named": { "maxrects-cp": { "space": "packing", "stages": { "order": { "option": "height-desc" }, "assignment": { "option": "maxrects", "params": { "rule": "cp" } } } } }
}
```

```json
{
  "schema": "strategy-space/1",
  "engine": "highways",
  "version": "0.9.0",
  "stages": [
    { "name": "grouping", "optional": true, "options": [{ "id": "quadtree", "params": [{ "name": "cap", "kind": "int", "min": 1, "max": 32, "scale": "log", "default": 8 }] }] },
    { "name": "lane-order", "optional": true, "options": [{ "id": "bundle", "params": [] }, { "id": "run", "params": [] }] },
    { "name": "routing", "options": [
      { "id": "corners", "params": [{ "name": "margin", "kind": "real", "min": 1, "max": 20, "default": 5 }] },
      { "id": "shared", "params": [{ "name": "discount", "kind": "real", "min": 0.05, "max": 1, "default": 0.5 }] }
    ] },
    { "name": "smoothing", "optional": true, "options": [{ "id": "rounded", "params": [{ "name": "radius", "kind": "real", "min": 0, "max": 48, "default": 12 }] }] }
  ],
  "constraints": [
    { "if": { "stage": "routing", "option": "corners" }, "then": { "stage": "grouping", "option": null } },
    { "if": { "stage": "routing", "option": "corners" }, "then": { "stage": "lane-order", "option": null } }
  ],
  "named": { "shared": { "space": "highways", "stages": { "lane-order": { "option": "bundle" }, "routing": { "option": "shared" } } } }
}
```

With 3 levels, `spaceSize` gives these counts:

- The packer has 2 × 3 × (6 + 3) × 4 = 216 combinations. The constraint removes 2 × 2 × 3 × 4 = 48 of them, so `base` is 168.
- The router has 4 × 3 × 3 × 4 = 144 configs with `shared`. It has 3 × 4 = 12 configs with `corners`, so `base` is 156.
- The product of the two spaces has 168 × 156 = 26208 base configs.
