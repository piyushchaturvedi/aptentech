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
export function LeadForm({ config }: { config: LeadFormConfig }) {
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

  const err = (field: string): boolean => Boolean(state.fieldErrors[field]?.length);
  const busy = state.status === 'submitting';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const ok = await submit({
      name: values.name,
      email: values.email,
      phone: values.phone,
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

        <div className="field full">
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
      </div>

      <HoneypotField id="website" value={values.website} onChange={set('website')} />

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
