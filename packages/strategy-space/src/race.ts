// The race of the terms (`docs/RACE.md`). The race measures the live terms on one input at a time, and drops a term that is worse than the best.
// The test is the paired sign-flip test of `@mark1russell7/rigor-statistics`, with the Holm correction over the terms of a round.
import { deriveSeed } from "@mark1russell7/rigor-generators";
import { holm, mean, signFlipTest } from "@mark1russell7/rigor-statistics";

/** The options of `race`. */
export interface RaceOptions {
  /** The count of the inputs. The race measures the inputs in the order 0, 1, 2 and up. */
  readonly inputs: number;
  /** The count of the inputs before the first test. The default is 5. */
  readonly first?: number;
  /** The level of the test of a round, for all its terms together. The default is 0.05. */
  readonly level?: number;
  /**
   * The race stops when a drop leaves this count of terms or fewer. The default is 1.
   * With the count of the terms, the race tests nothing and drops no term. So it is a screen of each term on each input.
   */
  readonly keep?: number;
  /** The seed of the draws of the sign-flip test. The default is 1. */
  readonly seed?: number;
  /** The largest count of inputs for which the test reads each sign set. The default is 16. */
  readonly exactMax?: number;
  /** The count of the drawn sign sets above `exactMax`. The default is 10 000. */
  readonly runs?: number;
}

/** A term that the race dropped. */
export interface RaceDrop {
  readonly id: string;
  /** The count of the inputs that the race measured for the term. */
  readonly inputs: number;
  /** The best term of the round. */
  readonly best: string;
  /** The mean of the cost of the term minus the cost of the best term, over the measured inputs. */
  readonly gap: number;
  /** The two-sided p of the sign-flip test of the paired differences. */
  readonly p: number;
  /** The p after the Holm correction over the terms of the round. */
  readonly adjusted: number;
}

/** The result of `race`. */
export interface RaceResult {
  /** The live term with the smallest mean cost. A tie goes to the first term in the order of the ids. */
  readonly best: string;
  /** The live terms, by their mean cost. */
  readonly live: readonly string[];
  /** The mean cost of each live term over the measured inputs. */
  readonly means: Readonly<Record<string, number>>;
  /** The dropped terms, in the order of the drops. */
  readonly drops: readonly RaceDrop[];
  /** The count of the inputs that the race measured. */
  readonly inputs: number;
  /** The count of the calls of the cost function. */
  readonly measured: number;
  /** The count of the calls of a screen of each term on each input. */
  readonly full: number;
}

/** This function throws a `RangeError` for a value that is not a whole number of `min` or more. */
function whole(value: number, name: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) throw new RangeError(`race: the ${name} ${value} is not a whole number of ${min} or more.`);
}

/**
 * This function races terms on a set of inputs. A smaller cost is better. A cost is a finite number, for example a time or a count of crossings.
 * After `first` inputs, each round finds the best live term by its mean. It tests the paired differences of each other live term against it.
 * A term drops when its gap is above 0 and its Holm p is less than `level`. The next input measures only the live terms.
 * The race stops at the last input, or when a drop leaves `keep` terms or fewer.
 * Each test has its own seed, `deriveSeed(seed, "race.<inputs>.<id>")`. So the same arguments give the same result.
 */
export function race(ids: readonly string[], cost: (id: string, input: number) => number, options: RaceOptions): RaceResult {
  const { inputs, first = 5, level = 0.05, keep = 1, seed = 1, exactMax = 16, runs = 10_000 } = options;
  if (ids.length === 0) throw new RangeError("race: the list of the ids is empty.");
  if (new Set(ids).size !== ids.length) throw new RangeError("race: an id is in the list two times.");
  whole(inputs, "count of the inputs", 1);
  whole(first, "count of the first inputs", 1);
  whole(keep, "count of the kept terms", 1);
  if (!(level > 0 && level < 1)) throw new RangeError(`race: the level ${level} is not between 0 and 1.`);

  const costs = new Map<string, number[]>(ids.map((id) => [id, []]));
  let live = [...ids];
  const drops: RaceDrop[] = [];
  let measured = 0;
  let k = 0;
  while (k < inputs) {
    for (const id of live) {
      const c = cost(id, k);
      if (!Number.isFinite(c)) throw new RangeError(`race: the cost of ${id} on the input ${k} is ${c}, not a finite number.`);
      costs.get(id)!.push(c);
      measured++;
    }
    k++;
    if (k < first || live.length <= keep) continue;
    const means = live.map((id) => mean(costs.get(id)!));
    let at = 0;
    for (let i = 1; i < live.length; i++) if (means[i]! < means[at]!) at = i;
    const best = live[at]!;
    const bestCosts = costs.get(best)!;
    const others = live.filter((id) => id !== best);
    const tests = others.map((id) => {
      const own = costs.get(id)!;
      const terms = own.map((c, j) => (c - bestCosts[j]!) / k);
      const gap = terms.reduce((s, t) => s + t, 0);
      const { p } = signFlipTest(terms, { exactMax, runs, seed: deriveSeed(seed, `race.${k}.${id}`) });
      return { id, gap, p };
    });
    const corrected = holm(
      tests.map((t) => t.p),
      level,
    );
    const out = new Set<string>();
    tests.forEach((t, i) => {
      const c = corrected[i]!;
      if (t.gap > 0 && c.reject) {
        out.add(t.id);
        drops.push({ id: t.id, inputs: k, best, gap: t.gap, p: t.p, adjusted: c.adjusted });
      }
    });
    live = live.filter((id) => !out.has(id));
    if (live.length <= keep) break;
  }

  const means: Record<string, number> = {};
  for (const id of live) means[id] = mean(costs.get(id)!);
  const order = ids.filter((id) => live.includes(id));
  const sorted = [...order].sort((a, b) => means[a]! - means[b]! || order.indexOf(a) - order.indexOf(b));
  return { best: sorted[0]!, live: sorted, means, drops, inputs: k, measured, full: ids.length * inputs };
}
