# Lead CRM

Every enquiry becomes a lead, a conversation and — where configured — two emails. This
document describes how those pieces fit together, what happens when the mail provider is
unavailable, and the two rules that shaped the design.

## The two rules

**An enquiry is never lost to an email failure.** The lead and its thread are committed
before any provider is contacted. Outbound messages are appended in `QUEUED` state and
delivered afterwards, and a delivery error is recorded on the message rather than thrown. A
provider outage therefore costs a delayed notification and nothing else. This is why the
visitor sees the thank-you page as soon as the enquiry is stored, not when the mail leaves.

**A reply is never attached to the wrong lead.** Inbound matching is tried strongest-first
and stops at the first confident answer. Anything it cannot place with certainty is held for
review instead of guessed at — putting one client's words into another client's history is a
confidentiality failure, and it is unrecoverable once someone has replied to it.

## The flow

```
Form → Next.js route → API → validate → spam score → MongoDB (Lead)
                                                         ↓
                                              MongoDB (Conversation)
                                                         ↓
                                     queue admin notification + client confirmation
                                                         ↓
                                              provider → status on each message
Visitor → /thank-you/
```

The form redirects to `/thank-you/` after a successful submission. The inline success state
is still set first, so a visitor whose navigation fails still sees a confirmation — the
enquiry is saved either way, and the confirmation must not depend on the redirect.

## One lead, one thread

A conversation holds every message in both directions:

| Kind | Author | Carried by |
| --- | --- | --- |
| `FORM` | client | nothing — the submission itself |
| `ADMIN_NOTIFICATION` | system | email to the notification recipients |
| `CONFIRMATION` | system | email to the client |
| `ADMIN_REPLY` | admin | email to the client |
| `CLIENT_REPLY` | client | inbound webhook |
| `FOLLOW_UP` | admin | email to the client |

The submission is stored as a message even though no email carried it. Without it the thread
would begin with a reply to something the reader cannot see.

Messages are embedded in the conversation document rather than kept in their own collection.
A thread is always read whole, is bounded in practice by how much correspondence one enquiry
attracts, and embedding makes the admin's lead screen a single query.

### Threading headers

Each outbound message is minted a `Message-ID`, attached to the previous message with
`In-Reply-To`, and accumulates the chain in `References`. All three are stored, because they
are the only reliable way to recognise a client's reply later — a subject line is a guess,
an identifier the client's mail program echoes back is proof.

Internal notifications and client correspondence are threaded **separately**. They go to
different people, so chaining one onto the other would make a client's reply appear to answer
a message they never received, and would file the two together in every mailbox that groups
by `References`.

## Inbound replies

`POST /api/v1/email/inbound` takes a normalised payload — providers disagree on shape, so an
adapter converts theirs before anything downstream sees it.

Matching, in order:

1. **`In-Reply-To` / `References` against a stored `Message-ID`.** This is proof, because the
   id was minted here and is unguessable.
2. **Sender address, only when unambiguous.** If the sender has exactly one lead on record, a
   reply from that address can only belong to its thread. Two or more and there is no way to
   choose.
3. **Otherwise, held for review** under Unmatched inbound, with the reason recorded.

Held messages can be attached to a lead an administrator identifies, or discarded. Nothing is
deleted on arrival: an unanswered client reply is worse than an untidy queue.

The endpoint is unauthenticated by session — the caller is a machine — so
`INBOUND_WEBHOOK_SECRET` is the only thing standing between it and anyone who can post JSON.
Without that variable set, the endpoint refuses every call. The comparison is timing-safe.

It answers `200` for every outcome it has handled, including one it could not place, because
a non-2xx makes the provider redeliver a message that is already recorded. Replays are
recognised by `Message-ID` and ignored.

Quoted history is trimmed from inbound text. Storing it verbatim makes a thread unreadable —
every message repeats all the ones before it. The trim is conservative: with no quote marker
found, nothing is removed, and a reply that is *only* quoted text is kept whole.

## Templates

Four built-in templates fill the slots the application sends from: new-lead notification,
client confirmation, admin reply and client follow-up. They can be rewritten or switched off
but not deleted, and a built-in template cannot change its type — the application sends by
kind, so an empty slot would silently stop a message going out.

**Templates are data, not code.** Rendering substitutes `{{name}}` for a value from a fixed
list and does nothing else. There is no expression syntax, no property path, no loop and no
include, so a compromised editor account cannot turn a template into a way of running code or
reading state it was never given. The cost is that templates cannot express conditionals; the
benefit is that the worst a malicious template can do is render the wrong words.

An unknown variable name is refused at save time and, if one somehow reaches rendering, is
left visible as written rather than replaced with an empty string — a visible
`{{clientNmae}}` is a bug an editor can see, a silent blank is one that reaches a client.

Values are HTML-escaped as they are substituted, and the whole document is sanitised
afterwards. Order matters: sanitising the template alone would leave a hole, because a value
containing markup would then be injected into already-cleaned HTML.

The email sanitiser is narrower than the site's own rich text and for a different reason —
this HTML is rendered by mail clients we do not control, so anything scriptable, anything
that loads a remote resource on open, and `data:` URIs are refused. Inline styles are allowed
because email has no other styling mechanism, but only for a short list of properties.

### Variables

`clientName`, `clientEmail`, `clientPhone`, `clientCompany`, `serviceName`, `budget`,
`message`, `leadId`, `leadStatus`, `siteName`, `siteUrl`, `sourcePage`, `submittedAt`,
`adminName`, `replyBody`, `leadUrl`.

## Delivery

`EMAIL_DRIVER` selects the provider behind one interface:

| Driver | Behaviour |
| --- | --- |
| `log` | records the message and reports success without contacting anyone — the default, so a fresh checkout exercises every path without mailing real people |
| `ses` | Amazon SES, via `SendEmail` with a raw MIME body |
| `smtp` | any SMTP relay |

SES uses the raw form rather than the simpler templated call because only raw lets us set
`Message-ID`, `In-Reply-To` and `References`. Without those, replies cannot be threaded,
which is most of what this feature is for.

Every message is sent as `multipart/alternative` with both a text and an HTML part. The plain
part is not decoration: it is what makes the message readable in clients that refuse HTML,
and its absence is one of the strongest spam signals there is. A template that leaves the
text body empty has one generated from its HTML.

`EMAIL_DRIVER=log` is refused in production. Silently discarding every notification would
look exactly like working software right up until someone asks why no enquiry was answered.

### Statuses and retry

`QUEUED → SENDING → SENT | FAILED`. Every attempt is recorded with its reason, so a
persistent failure shows its history rather than only its most recent symptom. Failed
messages are retried manually from the lead screen.

Retry is deliberately manual rather than on a timer. Most delivery failures are permanent — a
rejected address, a body a provider refuses — and retrying those automatically burns sender
reputation without ever succeeding.

### Duplicate suppression

Two independent guards:

- **Lead level.** An identical enquiry within ten minutes is collapsed by fingerprint. The
  visitor still sees success: they did submit, and telling them "duplicate" for a double-click
  would be confusing and would leak how the guard works.
- **Message level.** Every outbound message carries a `dedupeKey`. The admin composer
  generates one when it opens and sends it unchanged, so a double-click or a retried request
  finds the existing message and returns it rather than mailing the client twice. The
  automatic emails use a key derived from the lead id, so re-running intake cannot duplicate
  them either.

## What the admin owns, and what it does not

| Owned by the CMS | Owned by server configuration |
| --- | --- |
| notification recipient, CC, BCC | provider credentials |
| sender display name | envelope sender (`EMAIL_FROM`) |
| reply-to address | `Message-ID` domain |
| whether each automatic email sends | inbound webhook secret |
| every template's subject, HTML and text | |

The split is deliberate: the CMS is reachable by more people than the server is, and a stolen
editor session must not become a working mail relay.

With no notification recipient configured the application falls back to the site's public
contact address; a placeholder value such as `[EMAIL ADDRESS]` counts as unset, because
sending to it would only produce a bounce. When neither is usable the lead is still saved and
the omission is logged and surfaced in Settings.

## Security

- **Header injection.** Every address, display name and subject is refused if it contains a
  carriage return or line feed, both at validation and again at the last point before the
  message is assembled. A header built from several sources is exactly where an unvalidated
  one slips through.
- **Non-ASCII headers** are RFC 2047 encoded, so an accented name survives instead of
  arriving as mojibake.
- **Stored XSS.** Message bodies are sanitised before storage and rendered from the sanitised
  copy; the admin never re-sanitises on read.
- **Unauthorised sending.** Replying requires an authenticated admin session and a CSRF
  token, and is rate-limited — a compromised session should not become a bulk mailer.
- **Unauthorised inbound.** Covered above: shared secret, timing-safe, closed by default.

## Verification

```bash
node scripts/verify-crm.js
```

Needs both apps running, `API_SERVICE_TOKEN` and `INBOUND_WEBHOOK_SECRET` in the environment,
and an admin account. It creates its own lead, exercises intake, threading, reply, dedupe,
inbound matching, the review queue, template rules and header injection, then removes its own
fixtures — so it can be run repeatedly rather than only against a clean database.

Unit coverage for the pure logic — rendering, sanitising, header assembly, inbound parsing —
lives in `apps/api/src/services/email/email.test.ts` and runs with `npm test`.
