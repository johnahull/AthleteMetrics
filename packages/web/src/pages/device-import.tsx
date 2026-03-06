/**
 * Standalone Device Import Page
 * Allows coaches to import device data (e.g., Dashr CSV) without linking to a specific event.
 */

import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import type { UserOrganization } from "@shared/schema";
import { DeviceImportDialog } from "@/components/device-import";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function DeviceImportPage() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: userOrganizations } = useQuery<UserOrganization[]>({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id,
  });

  const organizationId = userOrganizations?.[0]?.organizationId;

  if (!organizationId) {
    return (
      <div className="container mx-auto py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              No Organization
            </CardTitle>
            <CardDescription>
              You need to be a member of an organization to import device data.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Import Device Data</CardTitle>
          <CardDescription>
            Upload timing gate data (Dashr CSV) to automatically create athlete measurements.
            Data can be imported independently or linked to a specific event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
            <Upload className="h-4 w-4 mr-2" />
            Upload Device File
          </Button>

          <DeviceImportDialog
            organizationId={organizationId}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
        </CardContent>
      </Card>
    </div>
  );
}
