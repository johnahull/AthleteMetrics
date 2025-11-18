import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Edit, Save, X, RefreshCw, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { useToast } from "@/hooks/use-toast";
import { useGenerateInsights, useUpdateInsights } from "@/lib/reports-api";

interface CoachingInsightsCardProps {
  reportId: string;
  initialInsights?: string | null;
  generatedAt?: string | null;
  model?: string | null;
  aiEnabled: boolean;
}

/**
 * Maximum character limit for coaching insights content.
 * This limit ensures reasonable storage size and prevents excessive AI generation costs.
 * Matches the database column constraint for coachingInsights (10,000 chars).
 */
const MAX_CHARS = 10000;

export function CoachingInsightsCard({
  reportId,
  initialInsights,
  generatedAt,
  model,
  aiEnabled,
}: CoachingInsightsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(initialInsights || "");
  const { toast } = useToast();

  const generateMutation = useGenerateInsights(reportId);
  const updateMutation = useUpdateInsights(reportId);

  // Sync editedContent when initialInsights prop changes (e.g., after regeneration)
  useEffect(() => {
    if (!isEditing) {
      setEditedContent(initialInsights || "");
    }
  }, [initialInsights, isEditing]);

  // Don't render if AI is not enabled
  if (!aiEnabled) {
    return null;
  }

  const hasInsights = !!initialInsights;
  const isGenerating = generateMutation.isPending;

  const handleGenerate = useCallback(() => {
    generateMutation.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Coaching insights generated successfully",
        });
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to generate insights",
          variant: "destructive",
        });
      },
    });
  }, [generateMutation, toast]);

  const handleEdit = useCallback(() => {
    setEditedContent(initialInsights || "");
    setIsEditing(true);
  }, [initialInsights]);

  const handleCancel = useCallback(() => {
    setEditedContent(initialInsights || "");
    setIsEditing(false);
  }, [initialInsights]);

  const handleSave = useCallback(() => {
    if (editedContent.length > MAX_CHARS) {
      toast({
        title: "Content too long",
        description: `Please keep insights under ${MAX_CHARS} characters`,
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate(editedContent, {
      onSuccess: () => {
        setIsEditing(false);
        toast({
          title: "Success",
          description: "Coaching insights updated successfully",
        });
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to update insights",
          variant: "destructive",
        });
      },
    });
  }, [editedContent, updateMutation, toast]);

  const handleRegenerate = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

  // State 1: Not Generated
  if (!hasInsights && !isGenerating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Coaching Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-4">
            <p className="text-muted-foreground">
              Generate insights to get personalized coaching recommendations based on this
              report's performance data.
            </p>
            <Button onClick={handleGenerate}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Insights
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State 2: Generating (Loading)
  if (isGenerating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Coaching Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Generating insights...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State 4: Editing
  if (isEditing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Coaching Insights
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={12}
            className="font-mono text-sm"
            placeholder="Enter coaching insights..."
            data-testid="insights-editor"
          />
          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <span>
              Characters: {editedContent.length} / {MAX_CHARS}
            </span>
            {editedContent.length > MAX_CHARS && (
              <span className="text-destructive font-medium">
                Exceeds maximum length
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // State 3: Generated (Display)
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Coaching Insights
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={isGenerating}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose prose-sm max-w-none dark:prose-invert" data-testid="insights-display">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{initialInsights || ""}</ReactMarkdown>
        </div>
        <div className="flex items-center gap-2 pt-4 border-t text-sm text-muted-foreground">
          <span>
            Generated on:{" "}
            {generatedAt
              ? new Date(generatedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
              : "Unknown"}
          </span>
          {model && (
            <>
              <span>•</span>
              <Badge variant="secondary">{model}</Badge>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
