/**
 * Splits the merged benchmark picker selection back into the wizard's site and custom fields.
 * An id in neither list (stale) stays in the field it was already in, and is dropped otherwise.
 */
export function splitBenchmarkSelection(
  ids: string[],
  siteIds: Set<string>,
  customIds: Set<string>,
  previous: { site: string[]; custom: string[] },
): { site: string[]; custom: string[] } {
  const site: string[] = [];
  const custom: string[] = [];
  for (const id of ids) {
    if (siteIds.has(id)) site.push(id);
    else if (customIds.has(id)) custom.push(id);
    else if (previous.site.includes(id)) site.push(id);
    else if (previous.custom.includes(id)) custom.push(id);
  }
  return { site, custom };
}
