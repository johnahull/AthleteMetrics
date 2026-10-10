/**
 * Manage eval templates (AM-FEAT-019): the organization's templates plus the global default.
 * Organization templates can be edited and deleted by the organization's coaches and admins; the default only by a
 * site admin (and never deleted). Deleting a template never changes events created from it: they keep their tests.
 */
import { useState } from "react";
import { Link, Redirect } from "wouter";
import { ArrowLeft, ClipboardList, Pencil, Eye, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-permissions";
import { apiErrorMessage, useDeleteEvalTemplate, useEvalTemplates, type EvalTemplate } from "@/hooks/use-eval-report";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function testCount(template: EvalTemplate): string {
  const total = template.metrics.length;
  const required = template.metrics.filter((m) => m.isRequired).length;
  return `${total} ${total === 1 ? "test" : "tests"}, ${required} required`;
}

export default function EvalTemplates() {
  const { organizationContext, userOrganizations, user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState("");

  // Same organization as the Events page
  const effectiveOrganizationId =
    organizationContext ||
    (!user?.isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0 ? userOrganizations[0].organizationId : null);

  const { data: templates, isLoading } = useEvalTemplates(effectiveOrganizationId || undefined);
  const deleteTemplate = useDeleteEvalTemplate();

  if (!effectiveOrganizationId) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <p className="text-yellow-800">Please select an organization to manage eval templates.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canManageEvent(user, userOrganizations, { organizationId: effectiveOrganizationId })) {
    return <Redirect to="/" />;
  }

  const handleDelete = async (template: EvalTemplate) => {
    try {
      await deleteTemplate.mutateAsync(template.id);
      setStatus(`Deleted "${template.name}".`);
    } catch (error) {
      const message = apiErrorMessage(error, "Could not delete the template");
      setStatus(message);
      toast({ title: "Not deleted", description: message, variant: "destructive" });
    }
  };

  const own = (templates ?? []).filter((t) => t.organizationId);
  // Organization templates first, then the default (each group by name, as the API sorts them)
  const ordered = [...own, ...(templates ?? []).filter((t) => !t.organizationId)];

  return (
    <div className="p-4 sm:p-6">
      <Link href="/events" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to events
      </Link>
      <div className="mb-6 mt-2">
        <h1 className="text-2xl font-semibold text-gray-900">Eval templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Templates fill the tests of a new event. Changing or deleting one never changes events already created from it.
        </p>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <>
          {own.length === 0 && (
            <Card className="mb-4 border-dashed bg-gray-50">
              <CardContent className="flex flex-col items-center py-8 text-center">
                <ClipboardList className="mb-3 h-10 w-10 text-gray-400" aria-hidden="true" />
                <p className="text-gray-600">
                  No templates of your own yet. Open the default below and duplicate it, or save an event's tests as a template from the event page.
                </p>
              </CardContent>
            </Card>
          )}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((template) => {
              const isDefault = !template.organizationId;
              const editable = isDefault ? !!user?.isSiteAdmin : true;
              const action = editable ? "Edit" : "View";
              return (
                <li key={template.id}>
                  <Card data-template-card className="flex h-full flex-col">
                    <CardContent className="flex flex-1 flex-col gap-3 pt-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-base font-semibold">{template.name}</h2>
                        {isDefault && <Badge variant="secondary">Default</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{testCount(template)}</p>
                      {template.description && <p className="line-clamp-2 break-words text-sm text-gray-700">{template.description}</p>}
                      <div className="mt-auto flex flex-wrap gap-2 pt-2">
                        <Button asChild variant="outline">
                          <Link href={`/events/templates/${template.id}`} aria-label={`${action} ${template.name}`}>
                            {editable ? <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> : <Eye className="mr-2 h-4 w-4" aria-hidden="true" />}
                            {action}
                          </Link>
                        </Button>
                        {!isDefault && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${template.name}`}>
                                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{template.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Events already created from it keep their tests. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleDelete(template)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
