/**
 * Pareto dominance and the Pareto ranks of points with many objectives. Each objective has a goal: `min` or `max`.
 *
 * The rules:
 *
 * 1. A point dominates a point when it is as good on each objective, and better on one or more objectives.
 * 2. Two points with equal values on each objective do not dominate each other. They get the same rank. The value `-0` equals `0`.
 * 3. A point with a value that is not a finite number (`NaN`, `Infinity` or `-Infinity`) is not a read. It does not dominate,
 *    a point does not dominate it, and it gets no rank.
 * 4. The rank of a point is 1 when no point dominates it. The rank is `k + 1` when only points of rank `k` or less dominate it.
 *    The points of rank 1 are the Pareto front.
 */

/** The goal of one objective: a smaller value is better (`min`), or a larger value is better (`max`). */
export type Goal = "min" | "max";

/** The goals that this package accepts. */
export const GOALS: readonly Goal[] = ["min", "max"];

function assertGoals(goals: readonly Goal[]): void {
  if (goals.length === 0) throw new RangeError("The list of the goals is empty.");
  for (const goal of goals) if (goal !== "min" && goal !== "max") throw new RangeError(`The goal ${String(goal)} is not min or max.`);
}

function assertLength(point: readonly number[], goals: readonly Goal[]): void {
  if (point.length !== goals.length) throw new RangeError(`The point has ${String(point.length)} values, and the goals have ${String(goals.length)}.`);
}

/** This function tells if each value of a point is a finite number. Rule 3 refuses a point with another value. */
export const isRead = (point: readonly number[]): boolean => point.every((value) => Number.isFinite(value));

/**
 * This function tells if the point `a` dominates the point `b` (rule 1). A point that is not a read gives `false` (rule 3).
 *
 * @param a - The values of the first point, in the order of the goals
 * @param b - The values of the second point, in the order of the goals
 * @param goals - The goal of each objective
 * @returns `true` when `a` dominates `b`
 * @throws RangeError when the goals are empty or bad, or when a point has another count of values than the goals
 */
export function dominates(a: readonly number[], b: readonly number[], goals: readonly Goal[]): boolean {
  assertGoals(goals);
  assertLength(a, goals);
  assertLength(b, goals);
  return isRead(a) && isRead(b) && dominatesRead(a, b, goals);
}

function dominatesRead(a: readonly number[], b: readonly number[], goals: readonly Goal[]): boolean {
  let better = false;
  for (let i = 0; i < goals.length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    if (x === y) continue;
    if ((x < y) !== (goals[i] === "min")) return false;
    better = true;
  }
  return better;
}

/** This function compares two read points on the objectives in their order: a better value comes first. */
function lexical(a: readonly number[], b: readonly number[], goals: readonly Goal[]): number {
  for (let i = 0; i < goals.length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    if (x !== y) return (x < y) === (goals[i] === "min") ? -1 : 1;
  }
  return 0;
}

/**
 * This function gives the Pareto rank of each point (rule 4), or `null` for a point that is not a read (rule 3).
 *
 * The points of each rank are found in the lexical order of their values. A point can come only after a point that
 * dominates it. Thus each point is compared only with the points of the current rank. For each rank, the cost is the
 * count of the points times the size of the rank times the count of the objectives.
 *
 * @param points - The values of each point, in the order of the goals
 * @param goals - The goal of each objective
 * @returns The rank of each point, in the order of the points
 * @throws RangeError when the goals are empty or bad, or when a point has another count of values than the goals
 */
export function paretoRanks(points: readonly (readonly number[])[], goals: readonly Goal[]): (number | null)[] {
  assertGoals(goals);
  for (const point of points) assertLength(point, goals);
  const ranks: (number | null)[] = points.map(() => null);
  let left = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => isRead(point))
    .sort((a, b) => lexical(a.point, b.point, goals) || a.index - b.index);
  for (let rank = 1; left.length > 0; rank += 1) {
    const level: (typeof left)[number][] = [];
    const later: typeof left = [];
    for (const item of left) {
      if (level.some((member) => dominatesRead(member.point, item.point, goals))) later.push(item);
      else level.push(item);
    }
    for (const member of level) ranks[member.index] = rank;
    left = later;
  }
  return ranks;
}

/**
 * This function gives the crowding distance of each point of one rank (Deb and others, 2002). For each objective, the
 * points go in the order of their values. Each of the two ends gets `Infinity`. Each other point gets the gap between its
 * two neighbours, over the range of the objective. The distance of a point is the sum over the objectives.
 *
 * An objective with one value for each point adds nothing. A larger distance tells that a point is more alone on its rank.
 *
 * @param points - The values of each point. Each value is a finite number (rule 3).
 * @returns The crowding distance of each point, in the order of the points
 * @throws RangeError when the points have different counts of values, or when a value is not a finite number
 */
export function crowdingDistances(points: readonly (readonly number[])[]): number[] {
  const count = points[0]?.length ?? 0;
  for (const point of points) {
    if (point.length !== count) throw new RangeError(`A point has ${String(point.length)} values, and the first point has ${String(count)}.`);
    if (!isRead(point)) throw new RangeError("A point has a value that is not a finite number.");
  }
  const distances = points.map(() => 0);
  for (let k = 0; k < count; k += 1) {
    const at = (i: number): number => points[i]?.[k] as number;
    const order = points.map((_, i) => i).sort((a, b) => at(a) - at(b) || a - b);
    const first = order[0] as number;
    const last = order[order.length - 1] as number;
    const range = at(last) - at(first);
    if (range === 0) continue;
    distances[first] = Infinity;
    distances[last] = Infinity;
    for (let j = 1; j < order.length - 1; j += 1) {
      const i = order[j] as number;
      distances[i] = (distances[i] as number) + (at(order[j + 1] as number) - at(order[j - 1] as number)) / range;
    }
  }
  return distances;
}
