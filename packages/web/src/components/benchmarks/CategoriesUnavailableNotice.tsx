/** Shown when the metric list needed to categorise benchmarks failed to load; the benchmarks are still listed under Other. */
export function CategoriesUnavailableNotice() {
  return (
    <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Categories are unavailable because the metric list failed to load. Benchmarks are shown under Other.
    </div>
  );
}
