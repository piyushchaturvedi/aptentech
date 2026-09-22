/**
 * Dialling codes offered by the phone fields.
 *
 * The source populated this select from a script; the list is design and content rather than
 * something to invent, so only the codes the original shipped are offered.
 *
 * It lives here because two forms now show it — the banner form on every service and
 * solution page, and the contact page's form. Two hand-maintained copies of a list like this
 * drift without anything failing: each stays a valid list while the pair stops agreeing, and
 * whichever one an editor is looking at seems correct.
 */
export const DIAL_CODES = ['+91', '+1', '+44', '+61', '+971', '+65', '+49', '+33', '+31', '+27'] as const;

/** The code a form starts on, matching the source's first option. */
export const DEFAULT_DIAL_CODE: string = DIAL_CODES[0];
