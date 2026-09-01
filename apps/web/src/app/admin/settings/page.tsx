'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccentToken, SiteSettings } from '@aptentech/shared';
import { EMPTY_MEDIA } from '@aptentech/shared';
import { useAdmin } from '@/components/admin/AdminClient';
import { AccentPicker, MediaPicker, Repeater, StringList, Text, TextArea, Toggle } from '@/components/admin/Fields';

/**
 * Site settings.
 *
 * Everything that appears on every page — logo, contact details, the mega-menu, the footer
 * and the default SEO — lives here, so changing it once changes it everywhere. Saving
 * invalidates the sitewide cache tags, which is why a nav edit shows up across all 25 pages
 * within seconds rather than needing a rebuild.
 *
 * Contact fields still hold the source's `[EMAIL ADDRESS]` and `[PHONE NUMBER]`
 * placeholders. The footer renders a placeholder as plain text rather than a broken
 * `mailto:` link, so nothing is clickable until real values are entered here.
 */
export default function AdminSettingsPage() {
  const { request, session } = useAdmin();

  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwNotice, setPwNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setSettings(await request<SiteSettings>('/settings'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load settings.');
    }
  }, [request]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const patch = (p: Partial<SiteSettings>) => setSettings((prev) => (prev ? { ...prev, ...p } : prev));

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { id, updatedAt, ...payload } = settings as SiteSettings & Record<string, unknown>;
      await request('/settings', { method: 'PUT', json: payload });
      setNotice('Saved. Header, footer and navigation update across the site within a few seconds.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPwError('');
    setPwNotice('');

    if (newPassword !== confirmPassword) {
      setPwError('The two passwords do not match.');
      return;
    }

    try {
      await request('/auth/change-password', {
        method: 'POST',
        json: { currentPassword, newPassword, confirmPassword },
      });
      setPwNotice('Password changed. Other devices have been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Re-read the session so `mustChangePassword` clears and the CMS unlocks.
      window.location.reload();
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Could not change the password.');
    }
  }

  return (
    <>
      {error ? <div className="adm-alert error">{error}</div> : null}
      {notice ? <div className="adm-alert ok">{notice}</div> : null}

      <div className="adm-panel">
        <div className="adm-panel-head">
          <h2>Your password</h2>
          {session?.user.mustChangePassword ? (
            <span className="adm-chip draft">Change required</span>
          ) : null}
        </div>
        <div className="adm-panel-body">
          {pwError ? <div className="adm-alert error">{pwError}</div> : null}
          {pwNotice ? <div className="adm-alert ok">{pwNotice}</div> : null}

          <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
            <div className="adm-field">
              <label htmlFor="cur">Current password</label>
              <input
                id="cur"
                className="adm-input"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="adm-field">
              <label htmlFor="new">New password</label>
              <input
                id="new"
                className="adm-input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <span className="hint">At least 12 characters, with upper case, lower case and a number.</span>
            </div>
            <div className="adm-field">
              <label htmlFor="confirm">Confirm new password</label>
              <input
                id="confirm"
                className="adm-input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <button className="adm-btn" type="submit">
                Change password
              </button>
            </div>
          </form>
        </div>
      </div>

      {!settings ? (
        <p style={{ color: 'var(--a-muted)' }}>Loading settings…</p>
      ) : (
        <>
          <Panel title="Company">
            <div className="adm-grid2">
              <Text label="Company name" value={settings.companyName} onChange={(v) => patch({ companyName: v })} />
              <Text
                label="Email address"
                value={settings.email}
                onChange={(v) => patch({ email: v })}
                hint="Currently a placeholder from the source. A placeholder renders as text, not a link."
              />
              <Text
                label="Phone number"
                value={settings.phone}
                onChange={(v) => patch({ phone: v })}
                hint="Currently a placeholder from the source."
              />
            </div>
            <StringList label="Address lines" items={settings.addressLines} onChange={(v) => patch({ addressLines: v })} />
            <MediaPicker label="Logo" value={settings.logo} onChange={(v) => patch({ logo: v })} />
            <MediaPicker label="Favicon" value={settings.favicon} onChange={(v) => patch({ favicon: v })} />
            <TextArea label="Footer tagline" value={settings.footerTagline} onChange={(v) => patch({ footerTagline: v })} />

            <Repeater
              label="Social links"
              items={settings.socials}
              onChange={(socials) => patch({ socials })}
              itemLabel={(s) => s.label || 'Link'}
              create={() => ({ label: '', href: '', icon: '' })}
              render={(item, update) => (
                <div className="adm-grid2">
                  <Text label="Label" value={item.label} onChange={(v) => update({ label: v })} />
                  <Text
                    label="Profile URL"
                    value={item.href}
                    onChange={(v) => update({ href: v })}
                    hint="Leave blank until the real profile exists — the icon then renders without a link."
                  />
                </div>
              )}
            />

            <Repeater
              label="Offices"
              items={settings.offices}
              onChange={(offices) => patch({ offices })}
              itemLabel={(o) => o.city || 'Office'}
              create={() => ({ city: '', lines: [] })}
              render={(item, update) => (
                <>
                  <Text label="City" value={item.city} onChange={(v) => update({ city: v })} />
                  <StringList label="Address lines" items={item.lines} onChange={(v) => update({ lines: v })} />
                </>
              )}
            />
          </Panel>

          <Panel title="Navigation">
            <p className="hint">
              The mega-menu. Several links in the original still point at placeholder paths such as{' '}
              <code>/services/</code> and <code>/technologies/</code> — repoint them here as those pages are built.
            </p>
            <Repeater
              label="Menu groups"
              items={settings.navigation}
              onChange={(navigation) => patch({ navigation })}
              itemLabel={(g) => g.label || 'Group'}
              create={() => ({ label: '', href: '#', columns: [], promoTitle: '', promoBody: '', promoCta: null })}
              render={(group, updateGroup) => (
                <>
                  <div className="adm-grid2">
                    <Text label="Label" value={group.label} onChange={(v) => updateGroup({ label: v })} />
                    <Text
                      label="Direct link"
                      value={group.href}
                      onChange={(v) => updateGroup({ href: v })}
                      hint="Used when the group has no columns."
                    />
                  </div>

                  <Repeater
                    label="Columns"
                    items={group.columns}
                    onChange={(columns) => updateGroup({ columns })}
                    itemLabel={(c) => c.heading || 'Unlabelled column'}
                    create={() => ({ heading: '', accent: 'indigo' as AccentToken, links: [] })}
                    render={(column, updateColumn) => (
                      <>
                        <Text label="Heading" value={column.heading} onChange={(v) => updateColumn({ heading: v })} />
                        <AccentPicker value={column.accent} onChange={(v) => updateColumn({ accent: v })} />
                        <Repeater
                          label="Links"
                          items={column.links}
                          onChange={(links) => updateColumn({ links })}
                          itemLabel={(l) => l.label || 'Link'}
                          create={() => ({ label: '', href: '/' })}
                          render={(link, updateLink) => (
                            <div className="adm-grid2">
                              <Text label="Label" value={link.label} onChange={(v) => updateLink({ label: v })} />
                              <Text label="URL" value={link.href} onChange={(v) => updateLink({ href: v })} />
                            </div>
                          )}
                        />
                      </>
                    )}
                  />

                  <div className="adm-grid2">
                    <Text label="Promo title" value={group.promoTitle ?? ''} onChange={(v) => updateGroup({ promoTitle: v })} />
                    <Text label="Promo body" value={group.promoBody ?? ''} onChange={(v) => updateGroup({ promoBody: v })} />
                  </div>
                </>
              )}
            />

            <Text
              label="Header button label"
              value={settings.headerCta?.label ?? ''}
              onChange={(v) =>
                patch({ headerCta: { label: v, href: settings.headerCta?.href ?? '/contact/', style: 'primary' } })
              }
            />
            <Text
              label="Header button link"
              value={settings.headerCta?.href ?? ''}
              onChange={(v) =>
                patch({ headerCta: { label: settings.headerCta?.label ?? '', href: v, style: 'primary' } })
              }
            />
          </Panel>

          <Panel title="Footer">
            <Repeater
              label="Footer columns"
              items={settings.footerColumns}
              onChange={(footerColumns) => patch({ footerColumns })}
              itemLabel={(c) => c.heading || 'Column'}
              create={() => ({ heading: '', links: [] })}
              render={(column, updateColumn) => (
                <>
                  <Text label="Heading" value={column.heading} onChange={(v) => updateColumn({ heading: v })} />
                  <Repeater
                    label="Links"
                    items={column.links}
                    onChange={(links) => updateColumn({ links })}
                    itemLabel={(l) => l.label || 'Link'}
                    create={() => ({ label: '', href: '/' })}
                    render={(link, updateLink) => (
                      <div className="adm-grid2">
                        <Text label="Label" value={link.label} onChange={(v) => updateLink({ label: v })} />
                        <Text label="URL" value={link.href} onChange={(v) => updateLink({ href: v })} />
                      </div>
                    )}
                  />
                </>
              )}
            />

            <Repeater
              label="Legal links"
              items={settings.legalLinks}
              onChange={(legalLinks) => patch({ legalLinks })}
              itemLabel={(l) => l.label || 'Link'}
              create={() => ({ label: '', href: '/' })}
              render={(link, updateLink) => (
                <div className="adm-grid2">
                  <Text label="Label" value={link.label} onChange={(v) => updateLink({ label: v })} />
                  <Text label="URL" value={link.href} onChange={(v) => updateLink({ href: v })} />
                </div>
              )}
            />
          </Panel>

          <Panel title="Lead email">
            <p className="hint">
              Who lead mail reaches and how it signs itself. The mail provider&rsquo;s credentials
              are server configuration and are deliberately not editable here — the CMS is
              reachable by more people than the server is.
            </p>

            <div className="adm-grid2">
              <Text
                label="Notification recipient"
                value={settings.emailDelivery?.notifyTo ?? ''}
                onChange={(v) => patch({ emailDelivery: { ...settings.emailDelivery, notifyTo: v } })}
                placeholder="leads@yourdomain.com"
              />
              <Text
                label="Reply-To"
                value={settings.emailDelivery?.replyTo ?? ''}
                onChange={(v) => patch({ emailDelivery: { ...settings.emailDelivery, replyTo: v } })}
                placeholder="hello@yourdomain.com"
              />
            </div>

            <div className="adm-grid2">
              <Text
                label="CC (comma separated)"
                value={(settings.emailDelivery?.notifyCc ?? []).join(', ')}
                onChange={(v) =>
                  patch({ emailDelivery: { ...settings.emailDelivery, notifyCc: splitAddresses(v) } })
                }
                placeholder="sales@yourdomain.com, ops@yourdomain.com"
              />
              <Text
                label="BCC (comma separated)"
                value={(settings.emailDelivery?.notifyBcc ?? []).join(', ')}
                onChange={(v) =>
                  patch({ emailDelivery: { ...settings.emailDelivery, notifyBcc: splitAddresses(v) } })
                }
                placeholder="archive@yourdomain.com"
              />
            </div>

            <Text
              label="Sender name"
              value={settings.emailDelivery?.senderName ?? ''}
              onChange={(v) => patch({ emailDelivery: { ...settings.emailDelivery, senderName: v } })}
              placeholder="AptenTech"
            />

            <Toggle
              label="Email the notification recipients when a lead arrives"
              value={settings.emailDelivery?.sendAdminNotification !== false}
              onChange={(v) => patch({ emailDelivery: { ...settings.emailDelivery, sendAdminNotification: v } })}
            />
            <Toggle
              label="Send the client a confirmation"
              value={settings.emailDelivery?.sendClientConfirmation !== false}
              onChange={(v) => patch({ emailDelivery: { ...settings.emailDelivery, sendClientConfirmation: v } })}
            />

            {!settings.emailDelivery?.notifyTo ? (
              <p className="adm-error">
                No notification recipient is set, so nobody is emailed when an enquiry arrives.
                Leads are still saved and visible under Leads.
              </p>
            ) : null}
          </Panel>

          <Panel title="Analytics">
            <p className="hint">
              Nothing third-party loads until this is switched on, so the site ships no tracking scripts by default.
            </p>
            <Toggle
              label="Enable analytics"
              value={settings.analytics.enabled}
              onChange={(v) => patch({ analytics: { ...settings.analytics, enabled: v } })}
            />
            <div className="adm-grid2">
              <Text
                label="GA4 measurement ID"
                value={settings.analytics.gaMeasurementId}
                onChange={(v) => patch({ analytics: { ...settings.analytics, gaMeasurementId: v } })}
                placeholder="G-XXXXXXXXXX"
              />
              <Text
                label="Google Tag Manager container ID"
                value={settings.analytics.gtmContainerId}
                onChange={(v) => patch({ analytics: { ...settings.analytics, gtmContainerId: v } })}
                placeholder="GTM-XXXXXXX"
              />
            </div>
          </Panel>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="adm-btn" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="adm-panel">
      <div className="adm-panel-head">
        <h2>{title}</h2>
      </div>
      <div className="adm-panel-body">{children}</div>
    </div>
  );
}

/**
 * Turns a typed list of addresses into an array.
 *
 * The field is a single text input because that is how an administrator thinks about a CC
 * list; the stored shape is an array because that is what the mailer needs.
 */
function splitAddresses(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
