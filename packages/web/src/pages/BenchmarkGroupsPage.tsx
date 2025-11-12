/**
 * Benchmark Groups Management Page
 * Site admin page for managing benchmark groups
 */

import { useState } from "react";
import { BenchmarkGroupsList, BenchmarkGroupEditor } from "@/components/benchmarks";
import type { SiteBenchmarkGroup, SiteBenchmarkGroupWithMembers } from "@shared/schema";

export function BenchmarkGroupsPage() {
  const [showEditor, setShowEditor] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SiteBenchmarkGroup | SiteBenchmarkGroupWithMembers | null>(null);

  const handleCreate = () => {
    setEditingGroup(null);
    setShowEditor(true);
  };

  const handleEdit = (group: SiteBenchmarkGroup | SiteBenchmarkGroupWithMembers) => {
    setEditingGroup(group);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingGroup(null);
  };

  return (
    <>
      <BenchmarkGroupsList
        onCreate={handleCreate}
        onEdit={handleEdit}
      />
      <BenchmarkGroupEditor
        open={showEditor}
        onOpenChange={setShowEditor}
        group={editingGroup}
        onSuccess={handleCloseEditor}
      />
    </>
  );
}
