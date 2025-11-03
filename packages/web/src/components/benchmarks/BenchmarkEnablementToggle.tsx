import { Switch } from "@/components/ui/switch";
import {
  useEnableBenchmarkForOrganization,
  useDisableBenchmarkForOrganization,
} from "@/lib/benchmarks-api";
import { useToast } from "@/hooks/use-toast";

interface BenchmarkEnablementToggleProps {
  organizationId: string;
  benchmarkId: string;
  benchmarkType: 'site' | 'custom';
  isEnabled: boolean;
}

export function BenchmarkEnablementToggle({
  organizationId,
  benchmarkId,
  benchmarkType,
  isEnabled,
}: BenchmarkEnablementToggleProps) {
  const { toast } = useToast();
  const enableMutation = useEnableBenchmarkForOrganization();
  const disableMutation = useDisableBenchmarkForOrganization();

  const handleToggle = async (checked: boolean) => {
    try {
      if (checked) {
        await enableMutation.mutateAsync({
          organizationId,
          benchmarkId,
          benchmarkType,
        });
        toast({
          title: "Benchmark Enabled",
          description: "Benchmark has been enabled for your organization.",
        });
      } else {
        await disableMutation.mutateAsync({
          organizationId,
          benchmarkId,
        });
        toast({
          title: "Benchmark Disabled",
          description: "Benchmark has been disabled for your organization.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update benchmark.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`enable-${benchmarkId}`}
        checked={isEnabled}
        onCheckedChange={handleToggle}
        disabled={enableMutation.isPending || disableMutation.isPending}
      />
      <label
        htmlFor={`enable-${benchmarkId}`}
        className="text-sm font-medium cursor-pointer"
      >
        {isEnabled ? "Enabled" : "Disabled"}
      </label>
    </div>
  );
}
