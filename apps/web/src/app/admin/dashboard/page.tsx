'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardSummary } from '@aptentech/shared';
import { useAdmin } from '@/components/admin/AdminClient';

/**
 * Dashboard.
 *
 * Leads come first because they are the point of the site — the audit found every enquiry
 * was being discarded, so "how many came in and what state are they in" is the first thing
 * anyone opening the CMS should see. Content counts and outstanding drafts follow.
 */
export default function DashboardPage() {
  const { request, session } = useAdmin();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    request<DashboardSummary>('/dashboard')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the dashboard.'));
  }, [request, session]);

  if (error) return <div className="adm-alert error">{error}</div>;
  if (!data) return <p style={{ color: 'var(--a-muted)' }}>Loading…</p>;

  const { leads, counts, drafts, recentLeads } = data;

  return (
    <>
      <div className="adm-stats">
        <div className="adm-stat">
          <div className="k">Total leads</div>
          <div className="v">{leads.total}</div>
        </div>
        <div className="adm-stat">
          <div className="k">New</div>
          <div className="v">{leads.byStatus.NEW}</div>
        </div>
        <div className="adm-stat">
          <div className="k">Contacted</div>
          <div className="v">{leads.byStatus.CONTACTED}</div>
        </div>
        <div className="adm-stat">
          <div className="k">Qualified</div>
          <div className="v">{leads.byStatus.QUALIFIED}</div>
        </div>
        <div className="adm-stat">
          <div className="k">Last 7 days</div>
          <div className="v">{leads.last7Days}</div>
        </div>
        <div className="adm-stat">
          <div className="k">Last 30 days</div>
          <div className="v">{leads.last30Days}</div>
        </div>
      </div>

      <div className="adm-panel">
        <div className="adm-panel-head">
          <h2>Recent enquiries</h2>
          <span className="spacer" />
          <Link className="adm-btn ghost sm" href="/admin/leads">
            View all leads
          </Link>
        </div>

        {recentLeads.length ? (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Service</th>
                  <th>Page</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(lead.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td>
                      <Link href={`/admin/leads?id=${lead.id}`}>{lead.name}</Link>
                    </td>
                    <td>{lead.email}</td>
                    <td>{lead.service ?? '—'}</td>
                    <td>
                      <code>{lead.sourcePage}</code>
                    </td>
                    <td>
                      <span className={`adm-chip ${lead.status.toLowerCase()}`}>{lead.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="adm-empty">
            No enquiries yet. They will appear here as soon as someone submits a form.
          </div>
        )}
      </div>

      <div className="adm-stats">
        <div className="adm-stat">
          <div className="k">Services</div>
          <div className="v">{counts.services}</div>
        </div>
        <div className="adm-stat">
          <div className="k">Solutions</div>
          <div className="v">{counts.solutions}</div>
        </div>
        <div className="adm-stat">
          <div className="k">Case studies</div>
          <div className="v">{counts.caseStudies}</div>
        </div>
        <div className="adm-stat">
          <div className="k">Blog posts</div>
          <div className="v">{counts.blogPosts}</div>
        </div>
        <div className="adm-stat">
          <div className="k">Testimonials</div>
          <div className="v">{counts.testimonials}</div>
        </div>
        <div className="adm-stat">
          <div className="k">Media files</div>
          <div className="v">{counts.media}</div>
        </div>
      </div>

      {drafts.services + drafts.caseStudies + drafts.blogPosts + drafts.pages > 0 ? (
        <div className="adm-panel">
          <div className="adm-panel-head">
            <h2>Unpublished drafts</h2>
          </div>
          <div className="adm-panel-body">
            <p style={{ color: 'var(--a-muted)' }}>
              {drafts.services} service/solution pages, {drafts.caseStudies} case studies, {drafts.blogPosts} blog
              posts and {drafts.pages} pages are saved but not live.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
