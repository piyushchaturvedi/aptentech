import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captchaService } from './captcha.service';

/**
 * Tests for the verification challenge.
 *
 * Each of these is a way the challenge could be worthless without looking broken: a question
 * that can be answered twice lets one solved captcha cover a run of submissions, an id that
 * survives a wrong guess lets a script work through the answers, and an answer parsed
 * loosely accepts things that are not the answer. None of them would show up as a failure
 * anywhere — the form would keep working and the protection would simply not be there — so
 * they are asserted directly.
 */

/** Reads the answer out of the question the way a visitor does, to answer it correctly. */
function solve(question: string): number {
  const [a, b] = question.split(' + ').map(Number);
  return (a ?? 0) + (b ?? 0);
}

describe('captcha challenges', () => {
  it('issues a question that can be read and answered', () => {
    const challenge = captchaService.issue();

    assert.match(challenge.question, /^\d{2} \+ \d$/);
    assert.ok(challenge.id.length > 20, 'the id should not be guessable');
    assert.equal(captchaService.verify(challenge.id, String(solve(challenge.question))), true);
  });

  it('accepts the answer as a number or as a string with spaces', () => {
    const a = captchaService.issue();
    assert.equal(captchaService.verify(a.id, solve(a.question)), true);

    const b = captchaService.issue();
    assert.equal(captchaService.verify(b.id, `  ${solve(b.question)}  `), true);
  });

  it('spends a challenge on the first correct answer, so it cannot be replayed', () => {
    const challenge = captchaService.issue();
    const answer = String(solve(challenge.question));

    assert.equal(captchaService.verify(challenge.id, answer), true);
    assert.equal(captchaService.verify(challenge.id, answer), false);
  });

  it('spends a challenge on a wrong answer too, so guesses cannot be worked through', () => {
    const challenge = captchaService.issue();
    const answer = solve(challenge.question);

    assert.equal(captchaService.verify(challenge.id, String(answer + 1)), false);
    assert.equal(captchaService.verify(challenge.id, String(answer)), false);
  });

  it('rejects an id it never issued, and a missing one', () => {
    assert.equal(captchaService.verify('00000000-0000-4000-8000-000000000000', '12'), false);
    assert.equal(captchaService.verify('', '12'), false);
    assert.equal(captchaService.verify(undefined, '12'), false);
    assert.equal(captchaService.verify(null, '12'), false);
  });

  it('rejects answers that are not plainly a number', () => {
    for (const bad of ['', ' ', 'twelve', '1 2', '12abc', '+12', '1e1', '0x0c', [], {}, true]) {
      const challenge = captchaService.issue();
      assert.equal(
        captchaService.verify(challenge.id, bad as never),
        false,
        `expected ${JSON.stringify(bad)} to be rejected`,
      );
    }
  });

  it('rejects the answer to a different question', () => {
    const a = captchaService.issue();
    const b = captchaService.issue();

    // Two questions can happen to share an answer; skip that case rather than assert on luck.
    if (solve(a.question) === solve(b.question)) return;

    assert.equal(captchaService.verify(a.id, String(solve(b.question))), false);
  });

  it('does not leave answered challenges behind', () => {
    const before = captchaService.openCount();
    const challenge = captchaService.issue();
    assert.equal(captchaService.openCount(), before + 1);

    captchaService.verify(challenge.id, String(solve(challenge.question)));
    assert.equal(captchaService.openCount(), before);
  });
});
