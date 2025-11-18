import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sparkles } from "lucide-react";

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // AI Model Configuration
  const { data: siteSettings } = useQuery<{ aiModel: string }>({
    queryKey: ["/api/site-settings"],
  });

  const [selectedModel, setSelectedModel] = useState<string>("gpt-5-nano");

  useEffect(() => {
    if (siteSettings?.aiModel) {
      setSelectedModel(siteSettings.aiModel);
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
    </div>
  );
}