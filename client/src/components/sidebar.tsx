import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { 
  LayoutDashboard, 
  Users, 
  UsersRound, 
  PlusCircle, 
  BarChart3, 
  FileText,
  FileCheck,
  LogOut,
  Settings,
  Building2,
  UserCog,
  User
} from "lucide-react";



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
  let navigation = [...(NAVIGATION_CONFIGS[role as keyof typeof NAVIGATION_CONFIGS] || NAVIGATION_CONFIGS.coach)];
  
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
  const [location, setLocation] = useLocation();
  const { user: userData, logout, organizationContext, setOrganizationContext } = useAuth();

  // Don't render sidebar if no user data
  if (!userData) {
    return null;
  }

  // Get user's primary role from their first organization (or 'athlete' fallback)
  const { data: userOrganizations } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!userData.id,
  });

  // Get organization details when site admin is in organization context
  const { data: currentOrgData } = useQuery({
    queryKey: [`/api/organizations/${organizationContext}`],
    enabled: !!organizationContext && userData?.isSiteAdmin,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationContext}`);
      return response.json();
    }
  });

  // Use the single role from user data
  const userRole = userData?.role || 'athlete';
  const isSiteAdmin = userData?.isSiteAdmin || userData?.role === "site_admin";

  // Check if we're in an organization context (site admin viewing specific org)
  const isInOrganizationContext = !!organizationContext || location.includes('/organizations/');

  const navigation = getNavigation(userRole, isSiteAdmin, isInOrganizationContext, userData, userOrganizations as any[], organizationContext || undefined);


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

      {/* Navigation */}
      <nav className="p-4 space-y-2 flex-1">
        {/* Back to site button for site admins in organization context */}
        {isSiteAdmin && isInOrganizationContext && (
          <button
            onClick={() => {
              setOrganizationContext(null);
              setLocation('/organizations');
            }}
            className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100 border border-gray-200 mb-4"
            data-testid="button-back-to-site"
          >
            <Building2 className="h-5 w-5" />
            <span>← Back to Site</span>
          </button>
        )}

        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                  isActive 
                    ? "bg-primary text-white" 
                    : "text-gray-700 hover:bg-gray-100"
                )}
                data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-200 mt-auto">
        {userData && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <User className="h-8 w-8 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {userData.firstName} {userData.lastName}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {userRole.replace('_', ' ')}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Site admin organization profile link when in organization context */}
        {userData && userData.isSiteAdmin && isInOrganizationContext && (
          (() => {
            const orgIdMatch = location.match(/\/organizations\/([^\/]+)/);
            if (orgIdMatch) {
              const orgId = orgIdMatch[1];
              const isActive = location === `/organizations/${orgId}`;
              return (
                <Link href={`/organizations/${orgId}`}>
                  <div
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                      isActive
                        ? "bg-primary text-white" 
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                    data-testid="nav-organization-profile"
                  >
                    <Building2 className="h-5 w-5" />
                    <span>Organization Profile</span>
                  </div>
                </Link>
              );
            }
            return null;
          })()
        )}

        {userData && (userData.isSiteAdmin || userRole === "org_admin" || userRole === "coach") && userData.id && (
          <Link href="/profile">
            <div
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                location === "/profile"
                  ? "bg-primary text-white" 
                  : "text-gray-700 hover:bg-gray-100"
              )}
              data-testid="nav-profile"
            >
              <User className="h-5 w-5" />
              <span>Profile</span>
            </div>
          </Link>
        )}

        {/* Organization info */}
        {(() => {
          // For site admins in organization context
          if (userData?.isSiteAdmin && organizationContext) {
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
          if (!userData?.isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
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
        })()}

        <button
          onClick={logout}
          className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
          data-testid="nav-logout"
        >
          <LogOut className="h-5 w-5" />
          <span>Sign Out</span>
        </button>
      </div>

    </aside>
  );
}