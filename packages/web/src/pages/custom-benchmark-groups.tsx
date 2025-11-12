/**
 * Custom Benchmark Groups Page - Organization Admin Management
 * Allows org admins to create and manage custom benchmark groups for their organization
 */

import { useState } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/lib/auth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CustomBenchmarkGroupsList } from "@/components/benchmarks/CustomBenchmarkGroupsList";
import { CustomBenchmarkGroupEditor } from "@/components/benchmarks/CustomBenchmarkGroupEditor";
import type { CustomBenchmarkGroup, CustomBenchmarkGroupWithMembers } from "@shared/schema";

export default function CustomBenchmarkGroupsPage() {
  const { id } = useParams();
  const { user, userOrganizations } = useAuth();
  const [showEditor, setShowEditor] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CustomBenchmarkGroup | CustomBenchmarkGroupWithMembers | null>(null);

  if (!id) {
    return <LoadingSpinner text="Loading organization..." />;
  }

  // Check if user has access to this organization
  const isSiteAdmin = user?.isSiteAdmin || user?.role === "site_admin";
  const hasAccess = isSiteAdmin || userOrganizations?.some(org => org.organizationId === id);

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">You do not have access to this organization.</p>
      </div>
    );
  }

  const handleCreate = () => {
    setEditingGroup(null);
    setShowEditor(true);
  };

  const handleEdit = (group: CustomBenchmarkGroup | CustomBenchmarkGroupWithMembers) => {
    setEditingGroup(group);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingGroup(null);
  };

  return (
    <>
      <CustomBenchmarkGroupsList
        organizationId={id}
        onCreate={handleCreate}
        onEdit={handleEdit}
      />
      <CustomBenchmarkGroupEditor
        organizationId={id}
        open={showEditor}
        onOpenChange={setShowEditor}
        group={editingGroup}
        onSuccess={handleCloseEditor}
      />
    </>
  );
}
