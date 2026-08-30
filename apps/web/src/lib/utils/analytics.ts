/**
 * Conversion event tracking.
 *
 * A single entry point used by every CTA, form and contact link, so events stay consistent
 * and the provider can change in one place. It is a no-op when analytics is disabled or the
 * tag has not loaded, which means call sites never guard and no error surfaces to a visitor
 * because a tracker was blocked.
 */

export type ConversionEvent =
  | 'lead_form_submit'
  | 'hero_form_submit'
  | 'contact_form_submit'
  | 'cta_click'
  | 'phone_click'
  | 'email_click'
  | 'whatsapp_click'
  | 'service_inquiry'
  | 'consultation_request';

type Payload = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(event: ConversionEvent, payload: Payload = {}): void {
  if (typeof window === 'undefined') return;

  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', event, payload);
      return;
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event, ...payload });
    }
  } catch {
    // Analytics must never break a form submission or a navigation.
  }
}

/**
 * Reads UTM parameters and referrer from the current page.
 *
 * These are sent as headers with a lead submission so the server can record attribution.
 * The server treats them as hints and stamps its own values where it can — a client-
 * supplied referrer is not authoritative.
 */
export function captureAttribution(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};

  const map: Array<[string, string]> = [
    ['utm_source', 'x-lead-utm-source'],
    ['utm_medium', 'x-lead-utm-medium'],
    ['utm_campaign', 'x-lead-utm-campaign'],
    ['utm_term', 'x-lead-utm-term'],
    ['utm_content', 'x-lead-utm-content'],
  ];

  for (const [param, header] of map) {
    const value = params.get(param);
    if (value) out[header] = value.slice(0, 200);
  }

  if (document.referrer) out['x-lead-referrer'] = document.referrer.slice(0, 2000);

  return out;
}
