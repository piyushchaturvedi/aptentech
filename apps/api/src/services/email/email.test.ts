import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, sanitizeEmailHtml, htmlToText } from './template';
import { parseAddress, stripQuotedReply, verifyInboundSignature } from './inbound.service';
import { assertHeaderSafe, buildRawMessage, newMessageId } from './provider';
import { adminReplySchema, emailListSchema, unknownTemplateVariables } from '@aptentech/shared';

/**
 * Tests for the parts of the email layer where a mistake is silent or dangerous.
 *
 * Rendering, sanitising, header assembly and inbound matching are all pure enough to assert
 * directly, which is where they belong: a header-injection regression or a template that
 * suddenly executes something would otherwise only show up in a client's inbox.
 */

describe('template rendering', () => {
  it('substitutes only known variables', () => {
    const out = renderTemplate(
      { subject: 'Hello {{clientName}}', html: '<p>{{message}}</p>', text: '{{clientName}}' },
      { clientName: 'Priya', message: 'Hello there' },
    );

    assert.equal(out.subject, 'Hello Priya');
    assert.match(out.html, /Hello there/);
    assert.equal(out.text, 'Priya');
  });

  it('leaves an unknown variable visible rather than blanking it', () => {
    // A visible `{{clientNmae}}` is a bug an editor can see; a silent blank reaches a client.
    const out = renderTemplate({ subject: 'Hi {{clientNmae}}', html: '<p>x</p>', text: '' }, { clientName: 'Priya' });
    assert.equal(out.subject, 'Hi {{clientNmae}}');
  });

  it('escapes markup arriving through a variable', () => {
    const out = renderTemplate(
      { subject: 's', html: '<p>{{message}}</p>', text: '' },
      { message: '<img src=x onerror=alert(1)>' },
    );

    /*
      The test is that no *live* tag exists, not that the word "onerror" is absent.

      Escaping turns the payload into text, so the characters still appear in the output —
      as `&lt;img … onerror=…&gt;`, which a mail client renders as visible text and never
      executes. Asserting on the substring alone would fail on correct output.
    */
    assert.ok(out.html.includes('&lt;img'), 'the value was not escaped');
    assert.ok(!/<img/i.test(out.html), 'a live img tag survived rendering');
    // Only the template's own markup may remain as real tags.
    assert.deepEqual(out.html.match(/<[a-z/][^>]*>/gi), ['<p>', '</p>']);
  });

  it('never executes template syntax', () => {
    // There is no expression language: anything that is not a known name is left as text.
    const out = renderTemplate(
      { subject: '{{constructor.constructor("return 1")()}}', html: '<p>{{#each x}}</p>', text: '' },
      {},
    );

    assert.match(out.subject, /constructor/);
    assert.match(out.html, /\{\{#each x\}\}/);
  });

  it('strips a line break out of a rendered subject', () => {
    const out = renderTemplate({ subject: 'Hi {{clientName}}', html: '<p>x</p>', text: '' }, {
      clientName: 'Priya\r\nBcc: attacker@evil.test',
    });

    assert.ok(!/[\r\n]/.test(out.subject), 'a newline survived into a header value');
  });

  it('flags unknown variables at save time', () => {
    assert.deepEqual(unknownTemplateVariables('<p>{{clientName}}</p>'), []);
    assert.deepEqual(unknownTemplateVariables('<p>{{process.env.SECRET}}</p>'), ['process.env.SECRET']);
  });
});

describe('email html sanitising', () => {
  it('removes scripts, handlers and javascript: URLs', () => {
    const dirty = `<p onclick="steal()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>`;
    const clean = sanitizeEmailHtml(dirty);

    assert.ok(!clean.includes('<script'), 'a script tag survived');
    assert.ok(!clean.includes('onclick'), 'an event handler survived');
    assert.ok(!clean.includes('javascript:'), 'a javascript URL survived');
  });

  it('keeps the table and inline-style markup email actually needs', () => {
    const clean = sanitizeEmailHtml('<table><tr><td style="color:#111827">cell</td></tr></table>');
    assert.match(clean, /<table/);
    assert.match(clean, /color:#111827/);
  });

  it('refuses a data: URI in an image source', () => {
    const clean = sanitizeEmailHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">');
    assert.ok(!clean.includes('data:'), 'a data URI survived');
  });

  it('derives readable text from html when a template has none', () => {
    const text = htmlToText('<p>First line</p><p>Second line</p>');
    assert.equal(text, 'First line\nSecond line');
  });
});

describe('outgoing headers', () => {
  it('refuses a header value containing a line break', () => {
    assert.throws(() => assertHeaderSafe('subject', 'Hi\r\nBcc: attacker@evil.test'), /line break/);
    assert.equal(assertHeaderSafe('subject', 'Perfectly ordinary'), 'Perfectly ordinary');
  });

  it('mints a unique, unguessable message id', () => {
    const a = newMessageId();
    const b = newMessageId();

    assert.notEqual(a, b);
    assert.match(a, /^<[^>]+@[^>]+>$/);
    // Guessable ids would let anyone graft a message onto someone else's thread.
    assert.ok(a.length > 30, 'message id is too short to be unpredictable');
  });

  it('writes both bodies and the threading headers', () => {
    const raw = buildRawMessage({
      to: ['client@example.com'],
      cc: [],
      bcc: [],
      subject: 'Re: enquiry',
      html: '<p>Hello</p>',
      text: 'Hello',
      fromName: 'AptenTech',
      replyTo: 'hello@example.com',
      messageId: '<abc@aptentech.com>',
      inReplyTo: '<prev@aptentech.com>',
      references: ['<first@aptentech.com>', '<prev@aptentech.com>'],
    });

    assert.match(raw, /Message-ID: <abc@aptentech\.com>/);
    assert.match(raw, /In-Reply-To: <prev@aptentech\.com>/);
    assert.match(raw, /References: <first@aptentech\.com> <prev@aptentech\.com>/);
    assert.match(raw, /multipart\/alternative/);
    assert.match(raw, /text\/plain/);
    assert.match(raw, /text\/html/);
  });

  it('encodes a non-ASCII subject rather than sending it raw', () => {
    const raw = buildRawMessage({
      to: ['client@example.com'],
      cc: [],
      bcc: [],
      subject: 'Réponse — enquête',
      html: '<p>x</p>',
      text: 'x',
      fromName: 'AptenTech',
      replyTo: '',
      messageId: '<abc@aptentech.com>',
      inReplyTo: null,
      references: [],
    });

    assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  });
});

describe('inbound parsing', () => {
  it('reads the address out of a display-name header', () => {
    assert.deepEqual(parseAddress('Priya Sharma <priya@example.com>'), {
      name: 'Priya Sharma',
      email: 'priya@example.com',
    });
    assert.deepEqual(parseAddress('  plain@example.com '), { name: '', email: 'plain@example.com' });
  });

  it('trims the quoted history off a reply', () => {
    const reply = stripQuotedReply('Yes, Tuesday works.\n\nOn Mon 1 Sep, AptenTech wrote:\n> Are you free?');
    assert.equal(reply, 'Yes, Tuesday works.');
  });

  it('keeps the message when it is entirely quoted', () => {
    // Cutting to nothing would store an empty message and lose the reply altogether.
    const reply = stripQuotedReply('> Are you free?');
    assert.ok(reply.length > 0);
  });

  it('rejects a webhook call with a wrong or missing secret', () => {
    // No secret configured in the test environment, so the endpoint must stay shut.
    assert.equal(verifyInboundSignature(undefined), false);
    assert.equal(verifyInboundSignature('guess'), false);
  });
});

describe('admin reply validation', () => {
  it('refuses a newline in the subject', () => {
    const result = adminReplySchema.safeParse({
      subject: 'Hi\r\nBcc: attacker@evil.test',
      html: '<p>x</p>',
      dedupeKey: 'abcdefghij',
    });
    assert.equal(result.success, false);
  });

  it('refuses a newline inside a CC address', () => {
    const result = adminReplySchema.safeParse({
      subject: 'Hi',
      html: '<p>x</p>',
      cc: ['ok@example.com\nBcc: attacker@evil.test'],
      dedupeKey: 'abcdefghij',
    });
    assert.equal(result.success, false);
  });

  it('requires a dedupe key so a double submission cannot mail twice', () => {
    const result = adminReplySchema.safeParse({ subject: 'Hi', html: '<p>x</p>' });
    assert.equal(result.success, false);
  });

  it('normalises a typed address list', () => {
    assert.deepEqual(emailListSchema.parse('  A@Example.com , b@example.com\nc@example.com '), [
      'a@example.com',
      'b@example.com',
      'c@example.com',
    ]);
  });

  it('rejects a list containing an invalid address', () => {
    assert.equal(emailListSchema.safeParse('good@example.com, not-an-address').success, false);
  });
});
