import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * ImportExport Page - Redirect to Data Entry
 *
 * This page now redirects to the Data Entry page with the Import/Export tab active.
 * This maintains backward compatibility for existing bookmarks and links.
 *
 * Import/Export functionality has been consolidated into the Data Entry page
 * as the third tab for better workflow organization.
 */
export default function ImportExport() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to Data Entry page with import tab selected
    setLocation("/data-entry?tab=import", { replace: true });
  }, [setLocation]);

  // Show nothing during redirect (happens instantly)
  return null;
}
