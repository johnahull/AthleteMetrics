import React from "react";
import { Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth";

interface OrganizationDisplayProps {
  organizationId?: string;
  userOrganizations?: any[];
  isSiteAdmin: boolean;
}

export function OrganizationDisplay({ organizationId, userOrganizations, isSiteAdmin }: OrganizationDisplayProps) {
  const [, setLocation] = useLocation();
  const { setOrganizationContext } = useAuth();

  // Get organization data if ID provided
  const { data: currentOrganization } = useQuery({
    queryKey: [`/api/organizations/${organizationId}`],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationId}`);
      if (!response.ok) return null;
      return response.json();
    }
  });

  // Show organization context for site admins when viewing an organization
  if (organizationId && currentOrganization && isSiteAdmin) {
    return (
      <div className="p-4 border-t border-gray-200 bg-blue-50">
        <div className="text-sm">
          <p className="font-medium text-blue-900">Organization Context</p>
          <p className="text-blue-700">{currentOrganization.name}</p>
          <button
            onClick={() => {
              setOrganizationContext(null);
              setLocation('/organizations');
            }}
            className="text-xs text-blue-600 hover:text-blue-800 mt-1"
          >
            ← Back to Site View
          </button>
        </div>
      </div>
    );
  }

  // Show user's organizations for non-site admins
  if (!isSiteAdmin && userOrganizations && userOrganizations.length > 0) {
    return (
      <div className="p-4 border-t border-gray-200">
        <div className="text-sm">
          <p className="font-medium text-gray-900">My Organizations</p>
          <div className="mt-2 space-y-1">
            {userOrganizations.map((userOrg) => (
              <button
                key={userOrg.organizationId}
                onClick={() => setLocation(`/organizations/${userOrg.organizationId}`)}
                className="block text-left text-blue-600 hover:text-blue-800 text-xs"
              >
                {userOrg.organization.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}