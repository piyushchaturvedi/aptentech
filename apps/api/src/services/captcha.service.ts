import { randomInt, randomUUID } from 'node:crypto';

/**
 * The verification question shown under the NDA checkbox on the enquiry forms.
 *
 * A challenge is issued by the server, kept here, and spent the first time it is answered.
 * Keeping the answer server-side is the whole point: a signed token carrying the answer —
 * even hashed — can be broken offline in a moment, because there are only a few dozen
 * possible answers to try. Nothing that leaves this process tells the caller what the
 * answer is.
 *
 * Three properties matter, and each is deliberate:
 *
 *  - **Single use.** `verify` removes the challenge whether or not the answer was right, so
 *    one solved challenge cannot be replayed across a run of submissions, and a wrong guess
 *    costs the caller a fresh round trip rather than another try at the same question.
 *  - **Short-lived.** Ten minutes is long enough to write a paragraph about a project and
 *    well short of leaving a tab open overnight.
 *  - **Bounded.** The map is swept on every issue and hard-capped, so an attacker who asks
 *    for challenges in a loop cannot grow it without limit.
 *
 * The arithmetic is deliberately easy — a two-digit number plus a single digit — because
 * this sits in front of a sales enquiry, and a visitor who cannot read a distorted image
 * must not be the person this turns away. It does not have to defeat a human attacker; it
 * has to cost more than a scripted POST, which it does, alongside the honeypot, the
 * time-to-submit signal and the eight-per-ten-minutes limit on the route.
 *
 * State lives in this process, so it assumes the API runs as one instance, which is how it
 * is deployed. Behind more than one instance the store has to move to Mongo (a TTL index on
 * `expiresAt`) or the load balancer has to be sticky — otherwise a challenge issued by one
 * instance is unknown to the one that receives the answer, and every enquiry is rejected.
 */

export interface CaptchaChallenge {
  /** Opaque handle the form sends back with the answer. Carries no information itself. */
  id: string;
  /** The question as the visitor reads it, e.g. `27 + 6`. */
  question: string;
}

interface PendingChallenge {
  answer: number;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;

/**
 * How many unanswered challenges may be held at once.
 *
 * Each entry is a few dozen bytes, so this is roughly a megabyte at the ceiling, and the
 * route that issues them is behind the service token. When the cap is reached the oldest
 * entries go first: a visitor whose challenge is evicted is asked a new question, which is
 * recoverable, whereas unbounded growth is not.
 */
const MAX_OPEN = 20_000;

const open = new Map<string, PendingChallenge>();

function sweep(now: number): void {
  for (const [id, pending] of open) {
    if (pending.expiresAt <= now) open.delete(id);
  }

  // Map iterates in insertion order, so this drops the oldest first.
  while (open.size >= MAX_OPEN) {
    const oldest = open.keys().next();
    if (oldest.done) break;
    open.delete(oldest.value);
  }
}

export const captchaService = {
  /** Mints a challenge and remembers its answer until it is used or expires. */
  issue(): CaptchaChallenge {
    const now = Date.now();
    sweep(now);

    const a = randomInt(10, 50);
    const b = randomInt(2, 10);
    const id = randomUUID();

    open.set(id, { answer: a + b, expiresAt: now + TTL_MS });

    return { id, question: `${a} + ${b}` };
  },

  /**
   * Checks an answer and spends the challenge.
   *
   * Returns false for anything that is not a live challenge answered correctly — unknown id,
   * expired, already used, non-numeric answer. The caller does not learn which, because
   * telling a script that its id was fine but its arithmetic was wrong is free information.
   */
  verify(id: unknown, answer: unknown): boolean {
    if (typeof id !== 'string' || !id) return false;

    const pending = open.get(id);
    if (!pending) return false;

    // Spent on sight, so a wrong answer cannot be followed by a second attempt at the same
    // question and a right one cannot be submitted twice.
    open.delete(id);

    if (pending.expiresAt <= Date.now()) return false;

    const given = typeof answer === 'string' ? answer.trim() : typeof answer === 'number' ? String(answer) : '';
    if (!/^-?\d{1,4}$/.test(given)) return false;

    return Number(given) === pending.answer;
  },

  /** Test and diagnostic hook; not used by request handling. */
  openCount(): number {
    return open.size;
  },
};
