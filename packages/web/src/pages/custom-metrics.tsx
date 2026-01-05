/**
 * Legacy Custom Metrics Page
 *
 * This page now redirects to the unified Metrics Configuration page.
 * Kept for backwards compatibility with bookmarks and external links.
 */

import { useParams, Redirect } from "wouter";

export default function CustomMetricsPage() {
  const { id } = useParams();

  // Handle missing ID parameter
  if (!id) {
    return <Redirect to="/" />;
  }

  // Redirect to the new unified metrics page
  return <Redirect to={`/organizations/${id}/metrics`} />;
}
