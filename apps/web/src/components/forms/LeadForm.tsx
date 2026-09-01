'use client';

import { useState } from 'react';
import type { LeadFormConfig } from '@aptentech/shared';
import { useLeadSubmit } from './useLeadSubmit';
import { ArrowIcon } from '@/components/shared/Icon';
import { HoneypotField } from './HoneypotField';

/**
 * The main lead form.
 *
 * Markup, class names and field order are identical to the source, so the stylesheet
 * carried over from the original renders it unchanged. What differs is that it now
 * actually submits: the original called `preventDefault()`, showed a thank-you and threw
 * the enquiry away.
 *
 * Every label and option comes from the CMS, which is what lets one component serve all 21
 * pages while keeping each one's specific wording ("Get my free SEO audit" versus "Get a
 * Free Consultation", "Monthly SEO budget" versus "Approximate budget").
 */
/**
 * Dialling codes offered by the contact page's phone field.
 *
 * The source populated this select from a script; the list is design/content rather than
 * something to invent, so only the codes the original shipped are offered.
 */
const DIAL_CODES = ['+91', '+1', '+44', '+61', '+971', '+65', '+49', '+33', '+31', '+27'];

export function LeadForm({
  config,
  variant = 'standard',
}: {
  config: LeadFormConfig;
  /** The contact page's form adds a dialling code, a file drop and an NDA checkbox. */
  variant?: 'standard' | 'contact';
}) {
  const { state, submit, clearField } = useLeadSubmit('leadForm', 'lead_form_submit');
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    service: '',
    budget: '',
    details: '',
    website: '',
  });

  const set = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    clearField(field === 'details' ? 'message' : field);
  };

  const [dialCode, setDialCode] = useState(DIAL_CODES[0] ?? '');
  const [nda, setNda] = useState(true);
  const [fileName, setFileName] = useState('');

  const err = (field: string): boolean => Boolean(state.fieldErrors[field]?.length);
  const busy = state.status === 'submitting';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const ok = await submit({
      name: values.name,
      email: values.email,
      // The contact form splits the number across two controls; the API stores one string.
      phone: variant === 'contact' && values.phone ? `${dialCode} ${values.phone}` : values.phone,
      service: values.service,
      budget: values.budget,
      message: values.details,
      website: values.website,
    });

    if (ok) {
      setValues({ name: '', email: '', phone: '', service: '', budget: '', details: '', website: '' });
    }
  }

  return (
    <form id="leadForm" noValidate onSubmit={onSubmit}>
      <div className="fgrid">
        <div className={`field${err('name') ? ' err' : ''}`} id="f-name">
          <label htmlFor="name">Full name</label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            placeholder="Jane Mehta"
            value={values.name}
            onChange={set('name')}
            aria-invalid={err('name')}
          />
          <span className="msg">{state.fieldErrors.name?.[0] ?? 'Please enter your name.'}</span>
        </div>

        <div className={`field${err('email') ? ' err' : ''}`} id="f-email">
          <label htmlFor="email">Business email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="jane@company.com"
            value={values.email}
            onChange={set('email')}
            aria-invalid={err('email')}
          />
          <span className="msg">{state.fieldErrors.email?.[0] ?? 'Please enter a valid business email.'}</span>
        </div>

        {variant === 'contact' ? (
          <div className={`field full${err('phone') ? ' err' : ''}`} id="f-phone">
            <label htmlFor="phone">Phone number</label>
            <div className="phone-row">
              <select
                id="dialCode"
                name="dialCode"
                aria-label="Country dialling code"
                value={dialCode}
                onChange={(event) => setDialCode(event.target.value)}
              >
                {DIAL_CODES.map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                required
                placeholder="00000 00000"
                value={values.phone}
                onChange={set('phone')}
                aria-invalid={err('phone')}
              />
            </div>
            <span className="msg">{state.fieldErrors.phone?.[0] ?? 'Please enter a valid phone number.'}</span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+91 00000 00000"
              value={values.phone}
              onChange={set('phone')}
            />
          </div>
        )}

        <div className={`field${err('service') ? ' err' : ''}`} id="f-service">
          <label htmlFor="service">{config.serviceLabel}</label>
          <select id="service" name="service" required value={values.service} onChange={set('service')} aria-invalid={err('service')}>
            <option value="">Select a service</option>
            {config.serviceOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <span className="msg">{state.fieldErrors.service?.[0] ?? 'Please choose a service.'}</span>
        </div>

        {/* The contact page pairs budget beside the service select; service pages run it full width. */}
        <div className={variant === 'contact' ? 'field' : 'field full'}>
          <label htmlFor="budget">{config.budgetLabel}</label>
          <select id="budget" name="budget" value={values.budget} onChange={set('budget')}>
            <option value="">Select a range (optional)</option>
            {config.budgetOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          {config.budgetNote ? <span className="budget-note">{config.budgetNote}</span> : null}
        </div>

        <div className="field full">
          <label htmlFor="details">{config.detailsLabel}</label>
          <textarea
            id="details"
            name="details"
            placeholder={config.detailsPlaceholder}
            value={values.details}
            onChange={set('details')}
          />
        </div>

        {variant === 'contact' ? (
          <div className="field full" id="f-file">
            <label htmlFor="attachment">
              Attach a file <span className="opt">optional</span>
            </label>
            <div className="drop" id="drop">
              <input
                id="attachment"
                name="attachment"
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xls,.xlsx"
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
              />
              <span className="drop-ic" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <path
                    d="M11 15.5V4m0 0L7.5 7.5M11 4l3.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M4 15v2.5A1.5 1.5 0 0 0 5.5 19h11a1.5 1.5 0 0 0 1.5-1.5V15"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="drop-txt">
                <b>Choose a file</b> or drag it here
              </span>
              <span className="drop-hint">PDF, DOC, XLS, PNG, JPG · 10&nbsp;MB</span>
            </div>
            <p className="file-name" id="fileName" role="status">
              {fileName}
            </p>
            <span className="msg">Please attach a supported file under 10&nbsp;MB.</span>
          </div>
        ) : null}
      </div>

      <HoneypotField
        id="website"
        value={values.website}
        onChange={set('website')}
        {...(variant === 'contact' ? { className: 'hp' } : {})}
      />

      {variant === 'contact' ? (
        <label className="hf-nda">
          <input type="checkbox" id="nda" checked={nda} onChange={(event) => setNda(event.target.checked)} />{' '}
          <span>Send me an NDA before we discuss details.</span>
        </label>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Sending…' : config.submitLabel}
        <ArrowIcon size={15} />
      </button>

      {config.reassurance ? (
        <p className="reassure">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="3" y="7" width="10" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {config.reassurance}
        </p>
      ) : null}

      {/* role="status" so the confirmation is announced to screen readers. */}
      <p className={`form-ok${state.status === 'success' ? ' show' : ''}`} id="formOk" role="status">
        {state.status === 'success' ? state.message : ''}
      </p>

      {state.status === 'error' && !Object.keys(state.fieldErrors).length ? (
        <p role="alert" style={{ color: 'var(--pink)', marginTop: 10, fontSize: '.88rem' }}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
