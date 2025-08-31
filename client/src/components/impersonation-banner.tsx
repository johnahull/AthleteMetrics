import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { AlertTriangle, UserCheck } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function ImpersonationBanner() {
  const { impersonationStatus, stopImpersonation } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  if (!impersonationStatus?.isImpersonating || !impersonationStatus.originalUser || !impersonationStatus.targetUser) {
    return null;
  }

  const handleStopImpersonation = async () => {
    setIsLoading(true);
    try {
      const result = await stopImpersonation();
      if (result.success) {
        toast({
          title: "Stopped Impersonation",
          description: result.message || "You are now back to your original account",
        });
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to stop impersonation",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-orange-50 border-b border-orange-200 px-4 py-3 sticky top-0 z-20">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-orange-800">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Admin Mode</span>
          </div>
          <div className="flex items-center gap-2 text-orange-700">
            <UserCheck className="h-4 w-4" />
            <span className="text-sm">
              You are impersonating{" "}
              <span className="font-medium">
                {impersonationStatus.targetUser.firstName} {impersonationStatus.targetUser.lastName}
              </span>
              {" "}({impersonationStatus.targetUser.email})
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleStopImpersonation}
          disabled={isLoading}
          className="bg-white border-orange-300 text-orange-800 hover:bg-orange-100 hover:border-orange-400"
          data-testid="stop-impersonation-button"
        >
          {isLoading ? "Stopping..." : "Stop Impersonating"}
        </Button>
      </div>
    </div>
  );
}