import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BookOpen, RotateCcw, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

interface MetricExplanationItem {
  code: string;
  title: string;
  shortDescription: string;
  whatItMeasures: string;
  whyItMatters: string;
  unitNote: string;
  directionOfBetter: string;
  hasOverride: boolean;
  overrideFields: string[];
}

interface FormData {
  title: string;
  shortDescription: string;
  whatItMeasures: string;
  whyItMatters: string;
}

export default function AdminMetricExplanations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingMetric, setEditingMetric] = useState<MetricExplanationItem | null>(null);
  const [formData, setFormData] = useState<FormData>({ title: "", shortDescription: "", whatItMeasures: "", whyItMatters: "" });
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  if (!user?.isSiteAdmin) {
    return <Redirect to="/" />;
  }

  const { data, isLoading } = useQuery<{ metrics: MetricExplanationItem[] }>({
    queryKey: ["/api/admin/metric-explanations"],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ code, data: body }: { code: string; data: Partial<FormData> }) => {
      const res = await fetch(`/api/admin/metric-explanations/${code}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metric-explanations"] });
      setEditingMetric(null);
      toast({ title: "Saved", description: "Metric explanation updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/admin/metric-explanations/${code}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 404) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metric-explanations"] });
      setResetConfirm(null);
      setEditingMetric(null);
      toast({ title: "Reset", description: "Reverted to built-in defaults." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function openEditor(metric: MetricExplanationItem) {
    setEditingMetric(metric);
    setFormData({
      title: metric.hasOverride && metric.overrideFields.includes("title") ? metric.title : "",
      shortDescription: metric.hasOverride && metric.overrideFields.includes("shortDescription") ? metric.shortDescription : "",
      whatItMeasures: metric.hasOverride && metric.overrideFields.includes("whatItMeasures") ? metric.whatItMeasures : "",
      whyItMatters: metric.hasOverride && metric.overrideFields.includes("whyItMatters") ? metric.whyItMatters : "",
    });
    setShowPreview(false);
  }

  function handleSave() {
    if (!editingMetric) return;
    const body: Record<string, string | null> = {};
    // Only send fields that have content; empty string → null (clear override)
    if (formData.title.trim()) body.title = formData.title.trim();
    else if (editingMetric.overrideFields.includes("title")) body.title = null;
    if (formData.shortDescription.trim()) body.shortDescription = formData.shortDescription.trim();
    else if (editingMetric.overrideFields.includes("shortDescription")) body.shortDescription = null;
    if (formData.whatItMeasures.trim()) body.whatItMeasures = formData.whatItMeasures.trim();
    else if (editingMetric.overrideFields.includes("whatItMeasures")) body.whatItMeasures = null;
    if (formData.whyItMatters.trim()) body.whyItMatters = formData.whyItMatters.trim();
    else if (editingMetric.overrideFields.includes("whyItMatters")) body.whyItMatters = null;

    if (Object.keys(body).length === 0) {
      toast({ title: "No changes", description: "Enter text in at least one field to save an override." });
      return;
    }
    saveMutation.mutate({ code: editingMetric.code, data: body });
  }

  // Compute resolved preview values (override → built-in fallback)
  function getPreviewValue(field: keyof FormData): string {
    if (!editingMetric) return "";
    const overrideVal = formData[field].trim();
    if (overrideVal) return overrideVal;
    // Fall back to built-in (what the API returned, which is already merged)
    return editingMetric[field];
  }

  const metrics = data?.metrics ?? [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Metric Explanations</h1>
      </div>
      <p className="text-muted-foreground">
        Customize the explanation text shown in reports for built-in metrics. Overrides apply site-wide.
        Leave a field empty to use the built-in default.
      </p>

      {isLoading && <p className="text-muted-foreground">Loading...</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Card
            key={metric.code}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => openEditor(metric)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{metric.title}</CardTitle>
                <div className="flex items-center gap-1">
                  {metric.hasOverride && (
                    <Badge variant="secondary" className="text-xs">Edited</Badge>
                  )}
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2">{metric.shortDescription}</p>
              <p className="text-xs text-muted-foreground mt-2 italic">{metric.unitNote}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Editor Dialog */}
      <Dialog open={!!editingMetric} onOpenChange={(open) => !open && setEditingMetric(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Edit: {editingMetric?.title}
              {editingMetric?.hasOverride && (
                <Badge variant="secondary" className="text-xs">Has overrides</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? "Edit" : "Preview"}
              </Button>
              {editingMetric?.hasOverride && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setResetConfirm(editingMetric.code)}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset All to Default
                </Button>
              )}
            </div>

            {showPreview ? (
              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <p className="text-sm font-semibold mb-1">Title</p>
                  <p className="text-sm">{getPreviewValue("title")}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1">Short Description</p>
                  <p className="text-sm text-muted-foreground">{getPreviewValue("shortDescription")}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1">What It Measures</p>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                      {getPreviewValue("whatItMeasures")}
                    </ReactMarkdown>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1">Why It Matters</p>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                      {getPreviewValue("whyItMatters")}
                    </ReactMarkdown>
                  </div>
                </div>
                <div>
                  <p className="text-xs italic text-muted-foreground">{editingMetric?.unitNote} (read-only)</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder={editingMetric?.title}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave empty to use built-in default</p>
                </div>
                <div>
                  <Label htmlFor="shortDescription">Short Description</Label>
                  <Textarea
                    id="shortDescription"
                    value={formData.shortDescription}
                    onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                    placeholder={editingMetric?.shortDescription}
                    rows={2}
                  />
                </div>
                <div>
                  <Label htmlFor="whatItMeasures">What It Measures</Label>
                  <Textarea
                    id="whatItMeasures"
                    value={formData.whatItMeasures}
                    onChange={(e) => setFormData({ ...formData, whatItMeasures: e.target.value })}
                    placeholder={editingMetric?.whatItMeasures}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Supports Markdown</p>
                </div>
                <div>
                  <Label htmlFor="whyItMatters">Why It Matters</Label>
                  <Textarea
                    id="whyItMatters"
                    value={formData.whyItMatters}
                    onChange={(e) => setFormData({ ...formData, whyItMatters: e.target.value })}
                    placeholder={editingMetric?.whyItMatters}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Supports Markdown</p>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground italic">
                    {editingMetric?.unitNote} &middot; Direction: {editingMetric?.directionOfBetter} is better (read-only)
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMetric(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation */}
      <AlertDialog open={!!resetConfirm} onOpenChange={(open) => !open && setResetConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all custom overrides for this metric and revert to the built-in explanation text.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetConfirm && resetMutation.mutate(resetConfirm)}
            >
              Reset to Default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
