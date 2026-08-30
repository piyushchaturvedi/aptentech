'use client';

import { ServicePagesAdmin } from '@/components/admin/ServicePagesAdmin';

/** Solution pages — `/solutions/<slug>/`. Nine pages migrated from the original site. */
export default function AdminSolutionsPage() {
  return <ServicePagesAdmin kind="solution" />;
}
