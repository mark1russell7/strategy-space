// The operators of a strategy space (`docs/OPERATORS.md`): the declaration of each mechanism at one stage, with its source and its parent.
import type { ClaimBreak } from "./claim.ts";
import type { StageOption, StrategySpace } from "./strategy-space.ts";

/** The schema of a set of operators. */
export const OPERATOR_SCHEMA = "strategy-operators/1";

/** The sources of an operator: a method from a paper or a book, a method of this project, or a change of a parent operator. */
export const OPERATOR_SOURCES = ["literature", "ours", "mutation"] as const;

/** The source of an operator. */
export type OperatorSource = (typeof OPERATOR_SOURCES)[number];

/** The declaration of one operator: one mechanism at one stage of a space. A param value of an option is not an operator. */
export interface Operator {
  /** The id of the option of the stage that this operator is. */
  readonly id: string;
  /** The name of the stage of the operator. */
  readonly stage: string;
  readonly source: OperatorSource;
  /** The id of the operator of the same stage that this operator changes. A `mutation` has a parent. The other sources can have one. */
  readonly parent?: string;
  /** The reference of a `literature` operator, for example the authors, the year and the title. */
  readonly cite?: string;
  /** The path of the test file or the test folder of the operator, from the root of its repository, or a list of these paths. */
  readonly test: string | readonly string[];
  /** The text that tells the mechanism of the operator. */
  readonly summary: string;
}

/** The operators of one space. */
export interface OperatorSet {
  readonly schema: typeof OPERATOR_SCHEMA;
  /** The `engine` of the space. */
  readonly engine: string;
  readonly operators: readonly Operator[];
}

/** The count of the operators of a set, by stage and by source. */
export interface OperatorCount {
  readonly total: number;
  readonly byStage: Readonly<Record<string, number>>;
  readonly bySource: Readonly<Record<OperatorSource, number>>;
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/**
 * This function gives the breaks of a set of operators against its space. An empty list tells that the set is good.
 * The claims are `schema`, `engine`, `unknown`, `duplicate`, `source`, `parent`, `cycle`, `cite`, `test`, `summary`, `undeclared` and `not-operator`.
 * An option that `needsOperator` accepts and that has no operator gives the claim `undeclared`. An operator of another option gives `not-operator`.
 * The `inputs` of each break have the stage and the id.
 */
/**
 * This function tells if an option is its own mechanism, so it needs an operator. An identity option needs none.
 * A meta option with `chooses: true` needs none. A meta option that changes the output of its members needs one.
 */
export function needsOperator(option: StageOption): boolean {
  if (option.identity === true) return false;
  return option.members?.chooses !== true;
}

export function checkOperators(space: StrategySpace, set: OperatorSet): ClaimBreak[] {
  const out: ClaimBreak[] = [];
  const add = (claim: string, detail: string, inputs: readonly string[] = []): void => {
    out.push({ claim, detail, inputs });
  };
  if (set.schema !== OPERATOR_SCHEMA) add("schema", `the schema is ${JSON.stringify(set.schema)}, not ${OPERATOR_SCHEMA}`);
  if (set.engine !== space.engine) add("engine", `the set is for the engine ${JSON.stringify(set.engine)}, not ${space.engine}`);
  const seen = new Map<string, Operator>();
  for (const o of set.operators) {
    const key = `${o.stage}.${o.id}`;
    const stage = space.stages.find((s) => s.name === o.stage);
    const option = stage?.options.find((x) => x.id === o.id);
    if (stage === undefined) add("unknown", `the operator ${key} names the unknown stage ${o.stage}`, [key]);
    else if (option === undefined) add("unknown", `the operator ${key} is not an option of the stage ${o.stage}`, [key]);
    else if (!needsOperator(option)) add("not-operator", `the option ${key} is an identity option or only chooses a member, so it is not an operator`, [key]);
    if (seen.has(key)) add("duplicate", `the set has the operator ${key} two times`, [key]);
    else seen.set(key, o);
    if (!(OPERATOR_SOURCES as readonly string[]).includes(o.source)) add("source", `the operator ${key} has the source ${JSON.stringify(o.source)}, not one of ${OPERATOR_SOURCES.join(", ")}`, [key]);
    if (o.source === "mutation" && o.parent === undefined) add("parent", `the mutation ${key} has no parent`, [key]);
    if (o.source === "literature" && !isText(o.cite)) add("cite", `the literature operator ${key} has no cite`, [key]);
    const tests: readonly unknown[] = Array.isArray(o.test) ? o.test : [o.test];
    if (tests.length === 0 || !tests.every(isText)) add("test", `the operator ${key} has no test file or test folder`, [key]);
    if (!isText(o.summary)) add("summary", `the operator ${key} has no summary`, [key]);
  }
  for (const o of seen.values()) {
    if (o.parent === undefined) continue;
    const key = `${o.stage}.${o.id}`;
    if (!seen.has(`${o.stage}.${o.parent}`)) {
      add("parent", `the parent ${o.parent} of the operator ${key} is not an operator of the stage ${o.stage}`, [key]);
      continue;
    }
    // A walk up the parents finds a cycle when it comes back to an operator that it saw.
    const path = new Set<string>([o.id]);
    for (let p = seen.get(`${o.stage}.${o.parent}`); p?.parent !== undefined; p = seen.get(`${o.stage}.${p.parent}`)) {
      if (path.has(p.id)) {
        add("cycle", `the parents of the operator ${key} make a cycle`, [key]);
        break;
      }
      path.add(p.id);
    }
  }
  for (const s of space.stages)
    for (const option of s.options)
      if (needsOperator(option) && !seen.has(`${s.name}.${option.id}`)) add("undeclared", `the option ${s.name}.${option.id} has no operator`, [`${s.name}.${option.id}`]);
  return out;
}

/**
 * This function gives the count of the operators of a set, by stage and by source. It counts each operator of the set.
 * `checkOperators` refuses an operator of an option that `needsOperator` refuses. So a good set counts only the mechanisms.
 */
export function countOperators(set: OperatorSet): OperatorCount {
  const byStage: Record<string, number> = {};
  const bySource: Record<OperatorSource, number> = { literature: 0, ours: 0, mutation: 0 };
  for (const o of set.operators) {
    byStage[o.stage] = (byStage[o.stage] ?? 0) + 1;
    bySource[o.source] += 1;
  }
  return { total: set.operators.length, byStage, bySource };
}
