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
import { Sparkles, Heart, AlertTriangle, FileText, Bell, Calculator, Loader2 } from "lucide-react";
import { AdminNotificationSettingsCard } from "@/components/notifications/admin-notification-settings-card";

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Site Settings - hooks must be called unconditionally (React Rules of Hooks)
  const { data: siteSettings } = useQuery<{ aiModel: string; wellnessModuleEnabled: boolean }>({
    queryKey: ["/api/site-settings"],
    enabled: !!user?.isSiteAdmin, // Only fetch if user is site admin
  });

  const [selectedModel, setSelectedModel] = useState<string>("gpt-5-nano");
  const [wellnessEnabled, setWellnessEnabled] = useState<boolean>(true);

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

  // AI Model pricing data
  const aiModels = [
    { value: "gpt-5-nano", label: "GPT-5 Nano", tier: "Budget", inputPrice: 0.05, outputPrice: 0.40 },
    { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", tier: "Budget", inputPrice: 0.075, outputPrice: 0.30 },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "Budget", inputPrice: 0.10, outputPrice: 0.40 },
    { value: "claude-haiku-3", label: "Claude Haiku 3", tier: "Budget", inputPrice: 0.25, outputPrice: 1.25 },
    { value: "claude-haiku-4.5", label: "Claude Haiku 4.5", tier: "Budget", inputPrice: 0.80, outputPrice: 4.00 },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "Premium", inputPrice: 1.25, outputPrice: 10.00 },
    { value: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", tier: "Premium", inputPrice: 3.00, outputPrice: 15.00 },
  ];

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
              disabled={updateAiModelMutation.isPending}
            >
              <SelectTrigger data-testid="ai-model-select">
                <SelectValue placeholder="Select AI model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Budget Tier</SelectLabel>
                  {aiModels.filter(m => m.tier === "Budget").map(model => (
                    <SelectItem key={model.value} value={model.value}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{model.label}</span>
                        <Badge variant="secondary" className="ml-auto">
                          ${model.inputPrice}/${model.outputPrice} per 1M
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Premium Tier</SelectLabel>
                  {aiModels.filter(m => m.tier === "Premium").map(model => (
                    <SelectItem key={model.value} value={model.value}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{model.label}</span>
                        <Badge variant="secondary" className="ml-auto">
                          ${model.inputPrice}/${model.outputPrice} per 1M
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

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