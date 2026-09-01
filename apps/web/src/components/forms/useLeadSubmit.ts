'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadFormType } from '@aptentech/shared';
import { captureAttribution, trackEvent, type ConversionEvent } from '@/lib/utils/analytics';

/**
 * Shared submission logic for every lead form.
 *
 * All three form variants behave identically once the fields differ: validate, post,
 * report field errors, confirm. Keeping that here means the visible components stay thin
 * and the spam signals (honeypot, elapsed time) cannot be forgotten on a new form.
 */

export interface SubmitState {
  status: 'idle' | 'submitting' | 'success' | 'error';
  message: string;
  fieldErrors: Record<string, string[]>;
}

const IDLE: SubmitState = { status: 'idle', message: '', fieldErrors: {} };

export function useLeadSubmit(sourceForm: LeadFormType, event: ConversionEvent) {
  const router = useRouter();
  const [state, setState] = useState<SubmitState>(IDLE);

  // Set once when the hook mounts, so the server can see how long the form was open.
  // A sub-second completion is not a human filling in four fields.
  const mountedAt = useRef<number>(Date.now());

  const submit = useCallback(
    async (fields: Record<string, unknown>) => {
      setState({ status: 'submitting', message: '', fieldErrors: {} });

      try {
        // Trailing slash avoids the 308 that trailingSlash:true would otherwise issue.
        const res = await fetch('/api/leads/', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...captureAttribution() },
          body: JSON.stringify({
            ...fields,
            sourceForm,
            sourcePath: window.location.pathname,
            elapsedMs: Date.now() - mountedAt.current,
          }),
        });

        const body = (await res.json().catch(() => null)) as
          | { success: boolean; data?: { message?: string }; error?: { message?: string; details?: Record<string, string[]> } }
          | null;

        if (!res.ok || !body?.success) {
          setState({
            status: 'error',
            message: body?.error?.message ?? 'We could not send that just now. Please try again.',
            fieldErrors: body?.error?.details ?? {},
          });
          return false;
        }

        trackEvent(event, { source_form: sourceForm, page: window.location.pathname });

        setState({
          status: 'success',
          message: body.data?.message ?? 'Thank you. We will be in touch within one business day.',
          fieldErrors: {},
        });

        /*
          The success state above is set before navigating, not instead of it.

          It is what the visitor sees for the moment the route takes to load, and it is what
          they see if navigation is blocked or JavaScript routing fails — the enquiry is
          already saved either way, so the confirmation must not depend on the redirect
          succeeding.

          `push`, not `replace`: going back from the thank-you page should return to the page
          the visitor was reading, and the form is theirs to use again if they want to.
        */
        router.push('/thank-you/');
        return true;
      } catch {
        setState({
          status: 'error',
          message: 'We could not reach the server. Please check your connection and try again.',
          fieldErrors: {},
        });
        return false;
      }
    },
    [sourceForm, event, router],
  );

  const clearField = useCallback((name: string) => {
    setState((prev) => {
      if (!prev.fieldErrors[name]) return prev;
      const next = { ...prev.fieldErrors };
      delete next[name];
      return { ...prev, fieldErrors: next };
    });
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { state, submit, clearField, reset };
}
