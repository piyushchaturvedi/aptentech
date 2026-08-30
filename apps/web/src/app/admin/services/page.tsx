'use client';

import { ServicePagesAdmin } from '@/components/admin/ServicePagesAdmin';

/** Service pages — `/services/<slug>/`. Eight pages migrated from the original site. */
export default function AdminServicesPage() {
  return <ServicePagesAdmin kind="service" />;
}
