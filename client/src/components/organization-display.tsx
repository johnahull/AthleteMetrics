
import React from "react";
import { Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface OrganizationDisplayProps {
  organizationId?: string;
  userOrganizations?: any[];
  isSiteAdmin?: boolean;
}

export function OrganizationDisplay({ 
  organizationId, 
  userOrganizations, 
  isSiteAdmin 
}: OrganizationDisplayProps) {
  const { data: currentOrgData } = useQuery({
    queryKey: [`/api/organizations/${organizationId}`],
    enabled: !!organizationId && isSiteAdmin,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationId}`);
      return response.json();
    }
  });

  // For site admins in organization context
  if (isSiteAdmin && organizationId) {
    return (
      <div className="px-3 py-2 border-t border-gray-200 mt-2">
        <div className="flex items-center space-x-2">
          <Building2 className="h-4 w-4 text-gray-500" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">
              {currentOrgData?.name || "Loading organization..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // For regular users with organizations
  if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
    const org = userOrganizations[0];
    const orgName = org?.organizationName || org?.organization?.name || org?.name;

    if (orgName) {
      return (
        <div className="px-3 py-2 border-t border-gray-200 mt-2">
          <div className="flex items-center space-x-2">
            <Building2 className="h-4 w-4 text-gray-500" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">
                {orgName}
              </p>
            </div>
          </div>
        </div>
      );
    }
  }

  return null;
}
