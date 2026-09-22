'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLeadSubmit } from './useLeadSubmit';
import { ArrowIcon } from '@/components/shared/Icon';
import { HoneypotField } from './HoneypotField';
import { CaptchaField, useCaptcha } from './Captcha';
import { DEFAULT_DIAL_CODE, DIAL_CODES } from './dialCodes';

/**
 * The compact hero form that sits alongside the headline on service and solution pages.
 *
 * Same markup and classes as the source, now wired to the real lead pipeline. The NDA
 * checkbox is checked by default exactly as it was, and its state is sent through as
 * `ndaRequested` so the admin can see whether the enquirer asked for one.
 *
 * Four fields, in the order they were asked for: name, email, phone with a dialling code,
 * and the project description. The dialling code is stored in its own column rather than
 * glued onto the number, which is what the admin's lead view already reads.
 */
export function HeroForm({ submitLabel = 'Submit your requirement' }: { submitLabel?: string }) {
  const { state, submit, clearField } = useLeadSubmit('heroForm', 'hero_form_submit');
  const [values, setValues] = useState({ hName: '', hEmail: '', hPhone: '', hDetails: '', website: '' });
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
  const [nda, setNda] = useState(true);
  const captcha = useCaptcha();

  const set =
    (field: keyof typeof values, errorKey: string) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
      clearField(errorKey);
    };

  const err = (field: string): boolean => Boolean(state.fieldErrors[field]?.length);
  const busy = state.status === 'submitting';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const ok = await submit({
      name: values.hName,
      email: values.hEmail,
      phone: values.hPhone,
      // Only meaningful alongside a number; an empty phone with a stray "+91" reads oddly
      // in the admin and in the notification email.
      dialCode: values.hPhone.trim() ? dialCode : '',
      message: values.hDetails,
      ndaRequested: nda,
      website: values.website,
      captchaId: captcha.id,
      captchaAnswer: captcha.answer,
    });

    if (ok) {
      setValues({ hName: '', hEmail: '', hPhone: '', hDetails: '', website: '' });
      setDialCode(DEFAULT_DIAL_CODE);
      setNda(true);
    }

    /*
      A challenge is spent as soon as the server checks it, so after a rejection the id the
      form is holding no longer exists — resubmitting the same answer would fail however
      correct it was. This is what puts a live question back in front of the visitor, and it
      runs for every rejection, not only a failed answer: a submission refused for a missing
      email has still consumed the challenge on its way through.
    */
    if (!ok) captcha.refresh();
  }

  return (
    <form id="heroForm" noValidate onSubmit={onSubmit}>
      <div className={`hf-field${err('name') ? ' err' : ''}`} id="hf-name">
        <input
          id="hName"
          name="hName"
          type="text"
          autoComplete="name"
          required
          placeholder="Full name*"
          aria-label="Full name"
          value={values.hName}
          onChange={set('hName', 'name')}
          aria-invalid={err('name')}
        />
        <span className="msg">{state.fieldErrors.name?.[0] ?? 'Please enter your name.'}</span>
      </div>

      <div className={`hf-field${err('email') ? ' err' : ''}`} id="hf-email">
        <input
          id="hEmail"
          name="hEmail"
          type="email"
          autoComplete="email"
          required
          placeholder="Email address*"
          aria-label="Email address"
          value={values.hEmail}
          onChange={set('hEmail', 'email')}
          aria-invalid={err('email')}
        />
        <span className="msg">{state.fieldErrors.email?.[0] ?? 'Please enter a valid email.'}</span>
      </div>

      <div className={`hf-field${err('phone') ? ' err' : ''}`} id="hf-phone">
        <div className="phone-row">
          <select
            id="hDialCode"
            name="hDialCode"
            aria-label="Country dialling code"
            value={dialCode}
            onChange={(event) => setDialCode(event.target.value)}
          >
            {DIAL_CODES.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
          <input
            id="hPhone"
            name="hPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="Phone number"
            aria-label="Phone number"
            value={values.hPhone}
            onChange={set('hPhone', 'phone')}
            aria-invalid={err('phone')}
          />
        </div>
        <span className="msg">{state.fieldErrors.phone?.[0] ?? 'Please enter a valid phone number.'}</span>
      </div>

      <div className={`hf-field${err('message') ? ' err' : ''}`} id="hf-msg">
        <textarea
          id="hDetails"
          name="hDetails"
          required
          placeholder="Tell us about your project*"
          aria-label="Tell us about your project"
          value={values.hDetails}
          onChange={set('hDetails', 'message')}
          aria-invalid={err('message')}
        />
        <span className="msg">{state.fieldErrors.message?.[0] ?? 'Please tell us briefly about the project.'}</span>
      </div>

      <label className="hf-nda">
        <input type="checkbox" id="hNda" checked={nda} onChange={(e) => setNda(e.target.checked)} />{' '}
        <span>Your idea is protected under our NDA.</span>
      </label>

      <CaptchaField
        captcha={captcha}
        error={state.fieldErrors.captcha?.[0]}
        wrapperClass="hf-field"
        labelClass="sr-only"
        idPrefix="h"
      />

      <HoneypotField id="hWebsite" value={values.website} onChange={set('website', 'website')} />

      <button type="submit" className="btn btn-primary hf-submit" disabled={busy}>
        {busy ? 'Sending…' : submitLabel}
        <ArrowIcon size={15} />
      </button>

      <p className="hf-note">
        By submitting this form you agree to our <Link href="/privacy-policy/">Privacy Policy</Link>.
      </p>

      <p className={`hf-ok${state.status === 'success' ? ' show' : ''}`} id="heroOk" role="status">
        {state.status === 'success' ? state.message : ''}
      </p>

      {state.status === 'error' && !Object.keys(state.fieldErrors).length ? (
        <p role="alert" style={{ color: 'var(--pink)', marginTop: 8, fontSize: '.85rem' }}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
