'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The verification question that sits under the NDA checkbox on the enquiry forms.
 *
 * The question is issued by the server and the expected answer never leaves it, so there is
 * nothing in the page for a script to read. What the form holds is an opaque id and whatever
 * the visitor typed; the API decides.
 *
 * A challenge is spent the moment it is checked, right or wrong, so `refresh` is not a
 * courtesy button — the form has to call it after every rejected submission or the visitor
 * would be answering a question the server has already forgotten.
 *
 * It is a plain arithmetic question rather than a third-party widget on purpose: no site key
 * to register, no script loaded from another origin on every page that carries a form, and
 * nothing about the visitor sent anywhere. If AptenTech would rather have Cloudflare
 * Turnstile or reCAPTCHA, this component and the API middleware behind it are the two places
 * that change.
 */

interface Challenge {
  id: string;
  question: string;
}

export interface CaptchaState {
  id: string;
  question: string;
  answer: string;
  setAnswer: (value: string) => void;
  /** Fetches a new question and clears the answer. Call after a rejected submission. */
  refresh: () => void;
  loading: boolean;
  /** Set when the question could not be loaded at all, as opposed to answered wrongly. */
  unavailable: boolean;
}

export function useCaptcha(): CaptchaState {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  /*
    Guards against a late response from a request that has been superseded.

    Submitting twice in quick succession, or clicking the refresh button while the first
    fetch is still open, would otherwise let the earlier response land last and leave the
    form holding an id the server has already discarded.
  */
  const requestId = useRef(0);

  const load = useCallback(() => {
    const mine = ++requestId.current;
    setLoading(true);
    setUnavailable(false);
    setAnswer('');

    // Trailing slash avoids the 308 that trailingSlash:true would otherwise issue.
    fetch('/api/leads/captcha/', { cache: 'no-store' })
      .then((res) => res.json())
      .then((body: { success?: boolean; data?: Challenge }) => {
        if (mine !== requestId.current) return;
        if (body?.success && body.data?.id) {
          setChallenge(body.data);
        } else {
          setChallenge(null);
          setUnavailable(true);
        }
      })
      .catch(() => {
        if (mine !== requestId.current) return;
        setChallenge(null);
        setUnavailable(true);
      })
      .finally(() => {
        if (mine === requestId.current) setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  return {
    id: challenge?.id ?? '',
    question: challenge?.question ?? '',
    answer,
    setAnswer,
    refresh: load,
    loading,
    unavailable,
  };
}

/**
 * The question, the answer box and a button for a different question.
 *
 * `wrapperClass` is how one component serves both form designs: the banner form's fields are
 * `.hf-field`, the contact form's are `.field`, and each already styles its own label, error
 * message and invalid state. Passing the class in means this inherits whichever it is inside
 * rather than introducing a third look.
 *
 * `labelClass` exists for the same reason. The banner form labels its fields with
 * placeholders and styles no visible label at all — a bare `<label>` there inherits the
 * card's white text and renders as an invisible 26px gap — so it passes `sr-only` and the
 * label stays for screen readers only. The contact form labels every field, and gets one.
 */
export function CaptchaField({
  captcha,
  error,
  wrapperClass = 'hf-field',
  labelClass = '',
  idPrefix = 'hf',
}: {
  captcha: CaptchaState;
  error?: string;
  wrapperClass?: string;
  labelClass?: string;
  idPrefix?: string;
}) {
  const inputId = `${idPrefix}Captcha`;
  const message = error ?? (captcha.unavailable ? 'Could not load the question. Please try again.' : '');

  return (
    <div className={`${wrapperClass} cap-field${message ? ' err' : ''}`}>
      <label htmlFor={inputId} className={labelClass}>
        Verification
      </label>

      <div className="cap-row">
        {/*
          `aria-live` because the question changes underneath a visitor who has just been told
          their answer was wrong. Without it a screen reader announces the error and leaves
          them answering the question they can no longer see.
        */}
        <span className="cap-q" aria-live="polite">
          {captcha.loading ? 'Loading…' : captcha.question ? `${captcha.question} =` : '—'}
        </span>

        <input
          id={inputId}
          name="captchaAnswer"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          required
          aria-label={captcha.question ? `What is ${captcha.question}?` : 'Verification answer'}
          aria-invalid={Boolean(message)}
          value={captcha.answer}
          onChange={(event) => captcha.setAnswer(event.target.value)}
        />

        <button
          type="button"
          className="cap-new"
          onClick={captcha.refresh}
          disabled={captcha.loading}
          title="Show a different question"
        >
          <span aria-hidden="true">↻</span>
          <span className="sr-only">Show a different question</span>
        </button>
      </div>

      <span className="msg">{message || 'Please answer the question above.'}</span>
    </div>
  );
}
