import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart3, 
  Building2, 
  LayoutDashboard, 
  UserCog, 
  Users, 
  UsersRound, 
  PlusCircle, 
  FileCheck, 
  FileText 
} from "lucide-react";
import { NavigationMenu } from "./navigation-menu";
import { UserProfileDisplay } from "./user-profile-display";
import { OrganizationDisplay } from "./organization-display";



// Navigation configurations for each role
const NAVIGATION_CONFIGS = {
  site_admin: {
    default: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Organizations", href: "/organizations", icon: Building2 },
      { name: "User Management", href: "/user-management", icon: UserCog }
    ],
    organization_context: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Teams", href: "/teams", icon: Users },
      { name: "Athletes", href: "/athletes", icon: UsersRound },
      { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Publish", href: "/publish", icon: FileCheck },
      { name: "Import/Export", href: "/import-export", icon: FileText }
    ]
  },
  org_admin: [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Teams", href: "/teams", icon: Users },
    { name: "Athletes", href: "/athletes", icon: UsersRound },
    { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Publish", href: "/publish", icon: FileCheck },
    { name: "Import/Export", href: "/import-export", icon: FileText },
    { name: "My Organization", href: "/organizations", icon: Building2 }
  ],
  coach: [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Teams", href: "/teams", icon: Users },
    { name: "Athletes", href: "/athletes", icon: UsersRound },
    { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Publish", href: "/publish", icon: FileCheck },
    { name: "Import/Export", href: "/import-export", icon: FileText }
  ],
  athlete: [
    { name: "Analytics", href: "/analytics", icon: BarChart3 }
  ]
};

const getNavigation = (role: string, isSiteAdmin: boolean, isInOrganizationContext: boolean, user?: any, userOrganizations?: any[], organizationContext?: string) => {
  // Site admin navigation
  if (isSiteAdmin) {
    const config = isInOrganizationContext 
      ? NAVIGATION_CONFIGS.site_admin.organization_context 
      : NAVIGATION_CONFIGS.site_admin.default;
    
    // Add organization context link if needed
    if (isInOrganizationContext && organizationContext) {
      return [
        ...config,
        { name: "My Organization", href: `/organizations/${organizationContext}`, icon: Building2 }
      ];
    }
    return config;
  }

  // Get base navigation for role
  const baseConfig = NAVIGATION_CONFIGS[role as keyof typeof NAVIGATION_CONFIGS] || NAVIGATION_CONFIGS.coach;
  let navigation = Array.isArray(baseConfig) ? [...baseConfig] : [...baseConfig.default];
  
  // Special handling for athletes with player profiles
  if (role === "athlete" && user?.playerId) {
    navigation.unshift({ name: "My Profile", href: `/athletes/${user.playerId}`, icon: UsersRound });
  }
  
  // Update org admin organization link with specific ID
  if (role === "org_admin" && userOrganizations?.[0]?.organizationId) {
    const orgIndex = navigation.findIndex(item => item.name === "My Organization");
    if (orgIndex !== -1) {
      navigation[orgIndex].href = `/organizations/${userOrganizations[0].organizationId}`;
    }
  }
  
  return navigation;
};

export default function Sidebar() {
  const [location] = useLocation();
  const { user: userData, logout } = useAuth();

  // Don't render sidebar if no user data
  if (!userData) {
    return null;
  }

  // Get user's primary role from their first organization (or 'athlete' fallback)
  const { data: userOrganizations } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!userData.id,
  });

  // Use the single role from user data
  const userRole = userData?.role || 'athlete';
  const isSiteAdmin = userData?.isSiteAdmin || userData?.role === "site_admin";

  // Extract organization ID from URL
  const organizationId = location.match(/\/organizations\/([^\/]+)/)?.[1];
  const isInOrganizationContext = !!organizationId;

  const navigation = getNavigation(userRole, isSiteAdmin, isInOrganizationContext, userData, userOrganizations as any[], organizationId);


  return (
    <aside className="w-64 bg-white shadow-sm border-r border-gray-200 h-screen flex-shrink-0 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">Performance Hub</h1>
              <span className="px-1.5 py-0.5 text-xs font-semibold bg-orange-100 text-orange-800 rounded border border-orange-200">
                BETA
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {isInOrganizationContext && isSiteAdmin ? "Organization View" : "Analytics Platform"}
            </p>
          </div>
        </div>
      </div>

      <NavigationMenu navigation={navigation} currentLocation={location} />

      <UserProfileDisplay
        user={userData}
        userRole={userRole}
        location={location}
        onLogout={logout}
      />

      <OrganizationDisplay
        organizationId={organizationId}
        userOrganizations={userOrganizations as any[]}
        isSiteAdmin={isSiteAdmin}
      />

    </aside>
  );
}