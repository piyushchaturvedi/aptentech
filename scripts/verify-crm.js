/** End-to-end check of the CRM: reply, threading headers, inbound match, retry, dedupe. */
const API = 'http://localhost:4000/api/v1';
const { MongoClient } = require('mongodb');

/** The API requires the service token on every call, exactly as the Next.js server sends it. */
const TOKEN = process.env.API_SERVICE_TOKEN || '';

/**
 * Every run creates its own lead and its own message ids.
 *
 * Reusing one fixture made the script pass once and then fail on replay: the thread already
 * held the messages it was about to assert on, and the inbound ids were already recorded as
 * duplicates. A verification script that only works on a clean database is not one you can
 * trust after a change.
 */
const RUN = Date.now().toString(36);
const CLIENT_EMAIL = `crm-${RUN}@example.com`;

const line = (s) => console.log(s);
let failures = 0;
const pass = (name, ok, extra) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
};

(async () => {
  const mongo = await MongoClient.connect('mongodb://127.0.0.1:27017');
  const db = mongo.db('aptentech');

  const loginRes = await fetch(`${API}/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': TOKEN },
    body: JSON.stringify({ email: 'crm@aptentech.com', password: 'Crm-Verify-2026!aptn' }),
  });
  const login = await loginRes.json();
  if (!login.success) {
    console.error('login failed', JSON.stringify(login));
    process.exit(1);
  }
  const cookie = (loginRes.headers.getSetCookie?.() ?? []).join('; ');
  const H = { cookie, 'x-csrf-token': login.data.csrfToken, 'content-type': 'application/json', 'x-api-key': TOKEN };

  line('\n-- Lead intake ----------------------------------');
  const submit = await fetch(`${API}/leads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': TOKEN },
    body: JSON.stringify({
      name: 'CRM Verify',
      email: CLIENT_EMAIL,
      phone: '9876500000',
      company: 'Verify Co',
      service: 'AI Development',
      message: 'Automated verification run.',
      sourceForm: 'contactForm',
      sourcePath: '/contact/',
      elapsedMs: 9000,
    }),
  });
  const submitted = await submit.json();
  pass('Form creates a lead', submit.status === 201 && submitted.success, `HTTP ${submit.status}`);

  const lead = await db.collection('leads').findOne({ email: CLIENT_EMAIL });
  const leadId = String(lead._id);

  let thread0 = await db.collection('conversations').findOne({ leadId: lead._id });
  pass('Thread opened with form, notification and confirmation', thread0?.messages.length === 3, `${thread0?.messages.length} messages`);
  pass(
    'Admin notification was sent',
    thread0.messages.some((m) => m.kind === 'ADMIN_NOTIFICATION' && m.status === 'SENT'),
  );
  pass(
    'Client confirmation was sent',
    thread0.messages.some((m) => m.kind === 'CONFIRMATION' && m.status === 'SENT' && m.to.includes(CLIENT_EMAIL)),
  );

  line('\n-- Conversation ---------------------------------');
  const conv = await (await fetch(`${API}/admin/leads/${leadId}/conversation`, { headers: H })).json();
  pass('Admin can read the thread', conv.success && conv.data.conversation.messages.length === 3);
  pass(
    'Every message carries an id the admin can key on',
    (conv.data.conversation.messages ?? []).every((m) => typeof m.id === 'string' && m.id.length > 0),
  );
  pass('Reply templates are offered', (conv.data.templates ?? []).length >= 2, `${conv.data.templates.length} templates`);

  line('\n-- Admin reply ----------------------------------');
  const dedupeKey = 'testkey' + Date.now();
  const replyBody = {
    subject: 'Re: your enquiry',
    html: '<p>Thanks for getting in touch. Here is our RAG overview.</p>',
    cc: ['cc@example.com'],
    dedupeKey,
  };

  const r1 = await fetch(`${API}/admin/leads/${leadId}/reply`, { method: 'POST', headers: H, body: JSON.stringify(replyBody) });
  const reply1 = await r1.json();
  pass('Reply sends', r1.status === 201 && reply1.success, `HTTP ${r1.status}`);

  const r2 = await fetch(`${API}/admin/leads/${leadId}/reply`, { method: 'POST', headers: H, body: JSON.stringify(replyBody) });
  await r2.json();

  let thread = await db.collection('conversations').findOne({ leadId: lead._id });
  const replies = thread.messages.filter((m) => m.kind === 'ADMIN_REPLY');
  pass('Duplicate reply suppressed', replies.length === 1, `${replies.length} admin replies stored`);

  const adminReply = replies[0];
  pass('Reply carries CC', (adminReply.cc ?? []).includes('cc@example.com'));
  pass('Reply threads onto the confirmation', Boolean(adminReply.inReplyTo));
  pass('Reply was delivered', adminReply.status === 'SENT', adminReply.status);

  const leadAfter = await db.collection('leads').findOne({ _id: lead._id });
  pass('Lead moved to CONTACTED', leadAfter.status === 'CONTACTED', leadAfter.status);

  line('\n-- Client reply (inbound webhook) ---------------');
  const secret = process.env.INBOUND_WEBHOOK_SECRET || '';

  const noAuth = await fetch(`${API}/email/inbound`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': TOKEN },
    body: JSON.stringify({ from: CLIENT_EMAIL, subject: 'Re', text: 'Sounds good.' }),
  });
  pass('Webhook refuses an unsigned call', noAuth.status === 401, `HTTP ${noAuth.status}`);

  const inbound = {
    from: `CRM Verify <${CLIENT_EMAIL}>`,
    subject: 'Re: your enquiry',
    text: 'That looks great, can we talk Tuesday?\n\nOn Mon, AptenTech wrote:\n> Thanks for getting in touch.',
    messageId: `<client-reply-${RUN}@mail.example.com>`,
    inReplyTo: adminReply.messageId,
    references: [adminReply.messageId],
  };

  const inJson = await (
    await fetch(`${API}/email/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-inbound-secret': secret, 'x-api-key': TOKEN },
      body: JSON.stringify(inbound),
    })
  ).json();
  pass('Signed webhook attaches the reply', inJson.data?.status === 'attached', JSON.stringify(inJson.data ?? inJson.error));

  const dupJson = await (
    await fetch(`${API}/email/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-inbound-secret': secret, 'x-api-key': TOKEN },
      body: JSON.stringify(inbound),
    })
  ).json();
  pass('Replayed webhook is ignored', dupJson.data?.status === 'duplicate', dupJson.data?.status);

  thread = await db.collection('conversations').findOne({ leadId: lead._id });
  const clientReplies = thread.messages.filter((m) => m.kind === 'CLIENT_REPLY');
  pass('Client reply is on the SAME thread', clientReplies.length === 1, `${thread.messages.length} messages total`);
  pass('Quoted history was trimmed', Boolean(clientReplies[0]) && !clientReplies[0].text.includes('Thanks for getting in touch'));

  line('\n-- Unmatched inbound ----------------------------');
  const stray = await (
    await fetch(`${API}/email/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-inbound-secret': secret, 'x-api-key': TOKEN },
      body: JSON.stringify({ from: `stranger-${RUN}@nowhere.test`, subject: 'Hello', text: 'Who are you?', messageId: `<stray-${RUN}@x.test>` }),
    })
  ).json();
  pass('Unknown sender is held, not misfiled', stray.data?.status === 'unmatched', stray.data?.status);

  const unmatched = await (await fetch(`${API}/admin/inbound/unmatched`, { headers: H })).json();
  pass('Held message appears for review', (unmatched.data?.items ?? []).length >= 1);

  line('\n-- Templates ------------------------------------');
  const tpl = await (await fetch(`${API}/admin/email-templates`, { headers: H })).json();
  pass('Four built-in templates exist', (tpl.data?.templates ?? []).filter((t) => t.builtIn).length === 4);

  const builtIn = tpl.data.templates.find((t) => t.builtIn);
  const delRes = await fetch(`${API}/admin/email-templates/${builtIn._id}`, { method: 'DELETE', headers: H });
  pass('Built-in template cannot be deleted', delRes.status === 403, `HTTP ${delRes.status}`);

  const badVar = await fetch(`${API}/admin/email-templates`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ kind: 'ADMIN_REPLY', name: 'Bad', subject: 'Hi', html: '<p>{{process.env.SECRET}}</p>', text: '' }),
  });
  pass('Unknown template variable is rejected', badVar.status === 400, `HTTP ${badVar.status}`);

  const preview = await (
    await fetch(`${API}/admin/email-templates/preview`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ subject: 'Hi {{clientName}}', html: '<p>{{message}}</p><script>alert(1)</script>', leadId }),
    })
  ).json();
  pass('Preview substitutes variables', preview.data?.subject === 'Hi CRM Verify', preview.data?.subject);
  pass('Preview strips script tags', !String(preview.data?.html).includes('<script'));

  line('\n-- Header injection -----------------------------');
  const inject = await fetch(`${API}/admin/leads/${leadId}/reply`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ subject: 'Hi\r\nBcc: attacker@evil.test', html: '<p>x</p>', dedupeKey: 'inject' + Date.now() }),
  });
  pass('Newline in subject is refused', inject.status === 400, `HTTP ${inject.status}`);

  const ccInject = await fetch(`${API}/admin/leads/${leadId}/reply`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      subject: 'Hi',
      html: '<p>x</p>',
      cc: ['ok@example.com\nBcc: attacker@evil.test'],
      dedupeKey: 'inject2' + Date.now(),
    }),
  });
  pass('Newline in CC is refused', ccInject.status === 400, `HTTP ${ccInject.status}`);

  line('\n-- Cleanup --------------------------------------');
  const removedThread = await db.collection("conversations").deleteMany({ leadId: lead._id });
  const leads = await db.collection('leads').deleteMany({ email: CLIENT_EMAIL });
  const removedHeld = await db.collection('unmatchedinbounds').deleteMany({ fromEmail: `stranger-${RUN}@nowhere.test` });
  pass(
    'Fixtures removed',
    leads.deletedCount === 1 && removedThread.deletedCount === 1 && removedHeld.deletedCount === 1,
    `lead ${leads.deletedCount}, thread ${removedThread.deletedCount}, held ${removedHeld.deletedCount}`,
  );

  await mongo.close();
  line(`\n${failures === 0 ? 'All checks passed.' : failures + ' check(s) failed.'}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
