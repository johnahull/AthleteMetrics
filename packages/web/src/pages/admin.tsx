import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Heart, Zap, AlertTriangle, FileText, Bell, Calculator, Loader2 } from "lucide-react";
import { AdminNotificationSettingsCard } from "@/components/notifications/admin-notification-settings-card";
import { DEFAULT_AI_MODEL_KEY } from "@shared/ai-models";

interface AiModelInfo {
  key: string;
  label: string;
  tier: "budget" | "premium";
  note: string | null;
  pricing: { inputPer1M: number; outputPer1M: number };
  available: boolean; // provider API key configured on the server
  live: boolean | null; // provider still lists the model (null = unknown)
  retireAfter: string | null;
  retiringSoon: boolean;
}

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Site Settings - hooks must be called unconditionally (React Rules of Hooks)
  const { data: siteSettings } = useQuery<{ aiModel: string; wellnessModuleEnabled: boolean; sprintFvEnabled: boolean }>({
    queryKey: ["/api/site-settings"],
    enabled: !!user?.isSiteAdmin, // Only fetch if user is site admin
  });

  // Selectable AI models come from the server (registry + live provider check)
  const { data: aiModelsData, isLoading: aiModelsLoading, isError: aiModelsError } = useQuery<{ all: AiModelInfo[] }>({
    queryKey: ["/api/site-settings/ai-models"],
    enabled: !!user?.isSiteAdmin,
  });

  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_AI_MODEL_KEY);
  const [wellnessEnabled, setWellnessEnabled] = useState<boolean>(true);
  const [sprintFvEnabled, setSprintFvEnabled] = useState<boolean>(false);

  // Redirect non-site-admins to home
  useEffect(() => {
    if (user && !user.isSiteAdmin) {
      setLocation("/");
    }
  }, [user, setLocation]);

  useEffect(() => {
    if (siteSettings?.aiModel) {
      setSelectedModel(siteSettings.aiModel);
    }
    if (siteSettings?.wellnessModuleEnabled !== undefined) {
      setWellnessEnabled(siteSettings.wellnessModuleEnabled);
    }
    if (siteSettings?.sprintFvEnabled !== undefined) {
      setSprintFvEnabled(siteSettings.sprintFvEnabled);
    }
  }, [siteSettings]);

  const updateAiModelMutation = useMutation({
    mutationFn: async (model: string) => {
      const res = await apiRequest("PATCH", "/api/site-settings", { aiModel: model });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      toast({ title: "AI model updated successfully!" });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating AI model",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const updateWellnessMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/site-settings", { wellnessModuleEnabled: enabled });
      return res.json();
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      toast({
        title: enabled ? "Wellness module enabled" : "Wellness module disabled",
        description: enabled
          ? "All organizations can now use wellness features."
          : "Wellness features are now disabled for all organizations.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating wellness module",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const updateSprintFvMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/site-settings", { sprintFvEnabled: enabled });
      return res.json();
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-settings/public"] });
      toast({
        title: enabled ? "Sprint F-V profiling enabled" : "Sprint F-V profiling disabled",
        description: enabled
          ? "Organizations can now enable force-velocity profiling."
          : "Sprint F-V profiling is now disabled for all organizations.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating Sprint F-V setting",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const recalculateDerivedMetricsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/recalculate-derived-metrics", {});
      return res.json();
    },
    onSuccess: (data: { recalculated: number; total: number; skipped: number; errors: string[] }) => {
      toast({
        title: "Derived metrics recalculated",
        description: `Updated ${data.recalculated} of ${data.total} measurements.${data.skipped > 0 ? ` Skipped ${data.skipped}.` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Recalculation failed",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Don't render anything while checking authorization or if not authorized
  if (!user?.isSiteAdmin) {
    return null;
  }

  const aiModels = (aiModelsData?.all ?? []).map(m => ({
    value: m.key,
    label: m.label,
    tier: m.tier === "budget" ? "Budget" : "Premium",
    inputPrice: m.pricing.inputPer1M,
    outputPrice: m.pricing.outputPer1M,
    // Provider no longer serves the model, or no API key is configured for it
    disabled: !m.available || m.live === false,
    status: !m.available ? "No API key" : m.live === false ? "Unavailable" : null,
    note: m.note,
    retireAfter: m.retiringSoon ? m.retireAfter : null,
  }));

  const renderModelItem = (model: (typeof aiModels)[number]) => (
    <SelectItem key={model.value} value={model.value} disabled={model.disabled}>
      <div className="flex items-center justify-between w-full gap-4">
        <span>{model.label}</span>
        <div className="ml-auto flex items-center gap-2">
          {model.status && <Badge variant="destructive">{model.status}</Badge>}
          {model.retireAfter && <Badge variant="outline">Retires {model.retireAfter}</Badge>}
          <Badge variant="secondary">
            ${model.inputPrice.toFixed(2)}/${model.outputPrice.toFixed(2)} per 1M
          </Badge>
        </div>
      </div>
    </SelectItem>
  );

  const handleModelChange = (model: string) => {
    // Client-side validation: ensure model exists in available models
    const modelExists = aiModels.some(m => m.value === model);
    if (!modelExists) {
      toast({
        title: "Invalid model selection",
        description: "Please select a valid AI model",
        variant: "destructive"
      });
      return;
    }
    setSelectedModel(model);
    updateAiModelMutation.mutate(model);
  };

  const handleWellnessToggle = (enabled: boolean) => {
    setWellnessEnabled(enabled);
    updateWellnessMutation.mutate(enabled);
  };

  const handleSprintFvToggle = (enabled: boolean) => {
    setSprintFvEnabled(enabled);
    updateSprintFvMutation.mutate(enabled);
  };

  const selectedModelData = aiModels.find(m => m.value === selectedModel);
  const estimatedCostPer100 = selectedModelData
    ? ((selectedModelData.inputPrice * 0.5 + selectedModelData.outputPrice * 1.5) / 10000 * 100).toFixed(2)
    : "0.00";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Site Administration</h1>
      </div>

      {/* AI Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Model Configuration
          </CardTitle>
          <CardDescription>
            Select the AI model to use for generating coaching insights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">AI Model</label>
            <Select
              value={selectedModel}
              onValueChange={handleModelChange}
              disabled={updateAiModelMutation.isPending || aiModelsError}
            >
              <SelectTrigger data-testid="ai-model-select">
                <SelectValue placeholder={aiModelsLoading ? "Loading models…" : "Select AI model"} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Budget Tier</SelectLabel>
                  {aiModels.filter(m => m.tier === "Budget").map(renderModelItem)}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Premium Tier</SelectLabel>
                  {aiModels.filter(m => m.tier === "Premium").map(renderModelItem)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {aiModelsError && (
            <p className="text-sm text-destructive" role="alert">
              Could not load the AI model list. Refresh the page to try again.
            </p>
          )}

          {aiModelsData && siteSettings?.aiModel && !selectedModelData && (
            <p className="text-sm text-destructive" role="alert">
              The current model ({siteSettings.aiModel}) is no longer available. Select another model.
            </p>
          )}

          {selectedModelData?.disabled && (
            <p className="text-sm text-destructive" role="alert">
              {selectedModelData.label} is currently unavailable ({selectedModelData.status}). Report insights will
              fail until you select another model.
            </p>
          )}

          {selectedModelData && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Selected Model:</span>
                <Badge>{selectedModelData.label}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Tier:</span>
                <span className="text-muted-foreground">{selectedModelData.tier}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Estimated Cost:</span>
                <span className="text-muted-foreground">${estimatedCostPer100} per 100 reports</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wellness Module Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Wellness Module
          </CardTitle>
          <CardDescription>
            Control global access to wellness questionnaires and health tracking
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <div className="font-medium">Enable Wellness Module</div>
              <div className="text-sm text-muted-foreground">
                When disabled, wellness features are hidden for all organizations
              </div>
            </div>
            <Switch
              checked={wellnessEnabled}
              onCheckedChange={handleWellnessToggle}
              disabled={updateWellnessMutation.isPending}
              data-testid="wellness-module-toggle"
            />
          </div>

          {!wellnessEnabled && (
            <div className="flex items-start gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Wellness Module Disabled</p>
                <p className="mt-1">
                  All organizations are currently unable to access wellness features.
                  Organization-level settings are frozen until you re-enable this module.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sprint F-V Profiling Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Sprint F-V Profiling
          </CardTitle>
          <CardDescription>
            Control global access to JB Morin force-velocity sprint profiling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <div className="font-medium">Enable Sprint F-V Profiling</div>
              <div className="text-sm text-muted-foreground">
                When disabled, force-velocity profiling is hidden for all organizations
              </div>
            </div>
            <Switch
              checked={sprintFvEnabled}
              onCheckedChange={handleSprintFvToggle}
              disabled={updateSprintFvMutation.isPending}
              data-testid="sprint-fv-module-toggle"
            />
          </div>

          {!sprintFvEnabled && (
            <div className="flex items-start gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Sprint F-V Profiling Disabled</p>
                <p className="mt-1">
                  All organizations are currently unable to access force-velocity profiling.
                  Organization-level settings are frozen until you re-enable this module.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Global Wellness Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Global Wellness Templates
          </CardTitle>
          <CardDescription>
            Manage system templates that appear in all organizations' wellness libraries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            Create and manage global wellness questionnaire templates that all organizations can clone and customize.
          </p>
          <Button asChild>
            <Link href="/wellness-templates">
              Manage Templates
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Derived Metrics Recalculation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Derived Metrics Recalculation
          </CardTitle>
          <CardDescription>
            Recalculate all derived metrics using the best trial values
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use this after updating derived metric formulas or fixing calculation logic.
            This will update all calculated measurements (like Approach Reach, Block Reach, Top Speed)
            using the best value from multiple trials instead of the last imported value.
          </p>
          <Button
            onClick={() => recalculateDerivedMetricsMutation.mutate()}
            disabled={recalculateDerivedMetricsMutation.isPending}
            data-testid="recalculate-derived-metrics-btn"
          >
            {recalculateDerivedMetricsMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recalculating...
              </>
            ) : (
              "Recalculate All Derived Metrics"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Push Notification Settings */}
      <AdminNotificationSettingsCard />
    </div>
  );
}