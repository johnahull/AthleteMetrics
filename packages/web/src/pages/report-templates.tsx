/**
 * Manage report templates: the organization's saved metrics, benchmark sets / picks and chart choices.
 * Coaches, org admins and site admins of the organization can edit and delete them. Deleting a template never
 * changes reports already created from it.
 */
import { useState } from "react";
import { Link, Redirect } from "wouter";
import { ArrowLeft, ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-permissions";
import { useDeleteReportTemplate, useReportTemplates, type ReportTemplate } from "@/lib/report-templates-api";
import { useToast } from "@/hooks/use-toast";
import { useTemplateOrganizationId } from "@/hooks/use-template-organization";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summary(t: ReportTemplate): string {
  const benchmarks = t.siteBenchmarkIds.length + t.customBenchmarkIds.length;
  return [plural(t.metrics.length, "metric"), plural(t.benchmarkSetIds.length, "benchmark set"), plural(benchmarks, "benchmark")].join(", ");
}

export default function ReportTemplates() {
  const { userOrganizations, user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const organizationId = useTemplateOrganizationId();
  const { data: templates, isLoading, isError, refetch } = useReportTemplates(organizationId ?? "");
  const deleteTemplate = useDeleteReportTemplate();

  if (!organizationId) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <p className="text-yellow-800">Please select an organization to manage report templates.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!canManageEvent(user, userOrganizations, { organizationId })) return <Redirect to="/" />;

  const handleDelete = async (t: ReportTemplate) => {
    try {
      await deleteTemplate.mutateAsync(t.id);
      setStatus(`Deleted "${t.name}".`);
    } catch {
      setStatus("Could not delete the template.");
      toast({ title: "Not deleted", description: "Could not delete the template. Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <Link href="/reports" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to reports
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Report templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Templates fill the metrics, benchmarks and charts of a new report. Changing or deleting one never changes reports already created.
          </p>
        </div>
        <Button asChild>
          <Link href="/reports/templates/new">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            New template
          </Link>
        </Button>
      </div>

      <div role="status" aria-live="polite" className="sr-only">{status}</div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : isError ? (
        <Card role="alert" className="border-red-200 bg-red-50">
          <CardContent className="flex flex-col items-start gap-3 pt-6">
            <p className="text-red-800">Could not load the templates.</p>
            <Button variant="outline" onClick={() => void refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : (templates ?? []).length === 0 ? (
        <Card className="border-dashed bg-gray-50">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <ClipboardList className="mb-3 h-10 w-10 text-gray-400" aria-hidden="true" />
            <p className="text-gray-600">No templates yet. Create one here, or save one from the last step of the report wizard.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates!.map((t) => (
            <li key={t.id}>
              <Card data-template-card className="flex h-full flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 pt-6">
                  <h2 className="break-words text-base font-semibold">{t.name}</h2>
                  <p className="text-sm text-muted-foreground">{summary(t)}</p>
                  {t.description && <p className="line-clamp-2 break-words text-sm text-gray-700">{t.description}</p>}
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Button asChild variant="outline">
                      <Link href={`/reports/templates/${t.id}`} aria-label={`Edit ${t.name}`}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                      </Link>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${t.name}`}>
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{t.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            It is removed for everyone in your organization. Existing reports are not affected. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleDelete(t)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
