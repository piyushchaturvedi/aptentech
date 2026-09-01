import type { Metadata } from 'next';
import type { TechStackGroup } from '@aptentech/shared';
import { content } from '@/lib/api/content';
import { buildMetadata } from '@/lib/seo/metadata';
import { BreadcrumbSchema } from '@/lib/seo/structuredData';
import { IndexBand } from '@/components/sections/IndexBand';
import { TechStackTabs } from '@/components/sections/Interactive';
import { ScrollReveal } from '@/components/sections/ScrollReveal';
import '@/styles/site.css';

/**
 * Technologies index — `/technologies/`.
 *
 * Two halves, and the order matters. The cards come first because each menu entry now has a
 * page of its own and this is the list of them; the stack tabs stay underneath because they
 * are real content the CMS already holds — the same groups the home page's technology band
 * shows — and dropping them to make room for the cards would lose it.
 *
 * The card grid is `IndexBand`, the same component `/services/` and `/solutions/` use, so
 * the three index pages match without any of them being styled separately.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [page, settings] = await Promise.all([content.page('technologies-index'), content.settings()]);
  return buildMetadata({
    seo: page?.seo,
    settings,
    path: '/technologies/',
    fallbackTitle: 'Technologies',
  });
}

export default async function TechnologiesIndex() {
  const [page, technologies] = await Promise.all([content.page('technologies-index'), content.technologyPages()]);
  const band = (page?.blocks?.find((b) => b.type === 'pageIndex') ?? {}) as Record<string, unknown>;
  const groups = (band.groups as TechStackGroup[] | undefined) ?? [];
  const crumbLabel = String(band.crumbLabel ?? 'Technologies');

  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', path: '/' },
          { name: crumbLabel, path: '/technologies/' },
        ]}
      />

      <IndexBand
        crumbLabel={crumbLabel}
        eyebrow={band.eyebrow ? String(band.eyebrow) : undefined}
        title={String(band.title ?? 'Technologies')}
        lede={band.lede ? String(band.lede) : undefined}
        items={technologies}
        prefix="/technologies/"
      />

      {groups.length ? (
        <section className="section" aria-labelledby="stack-h2">
          <div className="wrap">
            <div className="sect-head">
              <div>
                {/* An h2: the page's only h1 belongs to the band above. */}
                <h2 className="h2-sm rv" id="stack-h2">
                  The full stack
                </h2>
              </div>
            </div>

            <TechStackTabs groups={groups} />
          </div>
        </section>
      ) : null}

      <ScrollReveal />
    </>
  );
}
