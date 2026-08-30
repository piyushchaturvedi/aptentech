import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessSpam, leadService, type LeadRequestContext } from './lead.service';
import { leadSubmissionRefined, safeHref, slugSchema } from '@aptentech/shared';

/**
 * Tests for the logic that decides whether a lead is kept, quarantined or rejected.
 *
 * This is where a mistake is expensive in both directions: a false positive silently loses
 * a real enquiry, and a false negative fills the inbox with spam. The scoring thresholds are
 * asserted directly rather than through the HTTP layer so a change to them fails loudly.
 */

const ctx = (over: Partial<LeadRequestContext> = {}): LeadRequestContext => ({
  ip: '203.0.113.10',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  referrer: 'https://www.google.com/',
  utm: {},
  ...over,
});

const lead = (over: Record<string, unknown> = {}) =>
  leadSubmissionRefined.parse({
    name: 'Priya Sharma',
    email: 'priya@example-corp.com',
    service: 'Technical SEO',
    message: 'We are replatforming and want SEO involved before design is finalised.',
    sourceForm: 'leadForm',
    sourcePath: '/services/seo/',
    elapsedMs: 45_000,
    ...over,
  });

describe('spam assessment', () => {
  it('lets a genuine enquiry through', () => {
    const result = assessSpam(lead(), ctx());
    assert.equal(result.isSpam, false);
    assert.equal(result.score, 0);
    assert.deepEqual(result.reasons, []);
  });

  it('treats a filled honeypot as certain spam on its own', () => {
    const result = assessSpam(lead({ website: 'http://spam.example' }), ctx());
    assert.equal(result.isSpam, true);
    assert.ok(result.score >= 100);
    assert.ok(result.reasons.includes('honeypot_filled'));
  });

  it('flags a sub-second submission but does not condemn it alone', () => {
    const result = assessSpam(lead({ elapsedMs: 300 }), ctx());
    assert.ok(result.reasons.includes('submitted_too_fast'));
    // 40 on its own is below the threshold: a fast typist is not a bot.
    assert.equal(result.isSpam, false);
  });

  it('quarantines when several weak signals combine', () => {
    const result = assessSpam(
      lead({
        email: 'throwaway@mailinator.com',
        message: 'http://a.example http://b.example http://c.example',
        elapsedMs: 200,
      }),
      ctx({ userAgent: null }),
    );
    assert.equal(result.isSpam, true);
    assert.ok(result.reasons.includes('disposable_email'));
    assert.ok(result.reasons.includes('excessive_links'));
    assert.ok(result.reasons.includes('missing_user_agent'));
  });

  it('does not punish a legitimate message that contains one link', () => {
    const result = assessSpam(
      lead({ message: 'Our current site is https://example-corp.com and we want it rebuilt properly.' }),
      ctx(),
    );
    assert.equal(result.isSpam, false);
  });

  it('flags a missing user agent without blocking on it', () => {
    const result = assessSpam(lead(), ctx({ userAgent: null }));
    assert.ok(result.reasons.includes('missing_user_agent'));
    assert.equal(result.isSpam, false);
  });
});

describe('lead submission validation', () => {
  it('requires a service on the standard lead form', () => {
    const result = leadSubmissionRefined.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      sourceForm: 'leadForm',
      sourcePath: '/',
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.issues.some((i) => i.path.includes('service')));
  });

  it('requires a message on the hero form instead', () => {
    const ok = leadSubmissionRefined.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      message: 'We need a ride-hailing platform for three cities.',
      sourceForm: 'heroForm',
      sourcePath: '/',
    });
    assert.equal(ok.success, true);

    const missing = leadSubmissionRefined.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      message: 'hi',
      sourceForm: 'heroForm',
      sourcePath: '/',
    });
    assert.equal(missing.success, false);
  });

  it('rejects an invalid email', () => {
    const result = leadSubmissionRefined.safeParse({
      name: 'Test User',
      email: 'not-an-email',
      service: 'SEO',
      sourceForm: 'leadForm',
      sourcePath: '/',
    });
    assert.equal(result.success, false);
  });

  it('normalises the email to lower case', () => {
    assert.equal(lead({ email: 'Priya@Example-Corp.COM' }).email, 'priya@example-corp.com');
  });

  it('ignores fields a client must not set', () => {
    // `status` and `spamScore` are server-owned; the schema simply does not carry them.
    const parsed = lead({ status: 'WON', spamScore: -999 } as Record<string, unknown>);
    assert.equal('status' in parsed, false);
    assert.equal('spamScore' in parsed, false);
  });

  it('caps an oversized message', () => {
    const result = leadSubmissionRefined.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      service: 'SEO',
      message: 'x'.repeat(20_000),
      sourceForm: 'leadForm',
      sourcePath: '/',
    });
    assert.equal(result.success, false);
  });
});

describe('CSV export', () => {
  it('quotes fields so a comma or newline cannot break a row', () => {
    const csv = leadService.toCsv([
      {
        createdAt: '2026-08-30T10:00:00.000Z',
        name: 'Sharma, Priya',
        email: 'priya@example-corp.com',
        message: 'Line one\nLine two',
        status: 'NEW',
        utm: { source: 'google' },
      },
    ]);

    const [header, row] = csv.split('\r\n');
    assert.ok(header?.startsWith('createdAt,name,email'));
    assert.ok(row?.includes('"Sharma, Priya"'));
    assert.ok(row?.includes('"Line one\nLine two"'));
  });

  it('escapes embedded quotes by doubling them', () => {
    const csv = leadService.toCsv([{ name: 'He said "hello"', email: 'a@b.com' }]);
    assert.ok(csv.includes('"He said ""hello"""'));
  });
});

describe('link safety', () => {
  it('allows site paths, anchors, absolute URLs and contact schemes', () => {
    for (const href of ['/services/seo/', '#contact', 'https://aptentech.com/', 'mailto:a@b.com', 'tel:+911234567890']) {
      assert.equal(safeHref.safeParse(href).success, true, href);
    }
  });

  it('allows the source placeholders so they survive migration', () => {
    assert.equal(safeHref.safeParse('mailto:[EMAIL ADDRESS]').success, true);
    assert.equal(safeHref.safeParse('tel:[PHONE NUMBER]').success, true);
  });

  it('rejects javascript: and data: URIs', () => {
    // These are the stored-XSS vectors a compromised editor account would reach for.
    assert.equal(safeHref.safeParse('javascript:alert(1)').success, false);
    assert.equal(safeHref.safeParse('data:text/html;base64,PHNjcmlwdD4=').success, false);
  });
});

describe('slugs', () => {
  it('accepts the slugs the original site published', () => {
    for (const slug of ['seo', 'ai-development', 'taxi-app-development', 'generative-engine-optimization']) {
      assert.equal(slugSchema.safeParse(slug).success, true, slug);
    }
  });

  it('rejects anything that would change the URL shape', () => {
    for (const slug of ['Has Spaces', 'UPPERCASE', 'trailing-', '-leading', 'sla/shes', '..']) {
      assert.equal(slugSchema.safeParse(slug).success, false, slug);
    }
  });
});
