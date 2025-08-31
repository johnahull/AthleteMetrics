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



const getNavigation = (isSiteAdmin: boolean, primaryRole?: string, userId?: string, isInOrganizationContext?: boolean, userOrganizations?: any[], user?: any, organizationContext?: string) => {
  // Site admins get different navigation based on context (check this FIRST)
  if (isSiteAdmin) {
    // When viewing an organization, show org admin menu
    if (isInOrganizationContext) {
      const baseOrgNavigation = [
        { name: "Dashboard", href: "/", icon: LayoutDashboard },
        { name: "Teams", href: "/teams", icon: Users },
        { name: "Athletes", href: "/athletes", icon: UsersRound },
        { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
        { name: "Analytics", href: "/analytics", icon: BarChart3 },
        { name: "Publish", href: "/publish", icon: FileCheck },
        { name: "Import/Export", href: "/import-export", icon: FileText },
      ];
      
      // Add "My Organization" link if we have organization context
      if (organizationContext) {
        baseOrgNavigation.push({ 
          name: "My Organization", 
          href: `/organizations/${organizationContext}`, 
          icon: Building2 
        });
      }
      
      return baseOrgNavigation;
    }
    // Default site admin menu
    return [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Organizations", href: "/organizations", icon: Building2 },
      { name: "User Management", href: "/user-management", icon: UserCog }
    ];
  }

  // Athletes get a restricted navigation menu
  if (primaryRole === "athlete" && user?.playerId) {
    // Only use playerId for actual athletes who have one
    return [
      { name: "My Profile", href: `/athletes/${user.playerId}`, icon: UsersRound },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
    ];
  }

  // All other roles (org_admin, coach) get the full navigation
  const baseNavigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Teams", href: "/teams", icon: Users },
    { name: "Athletes", href: "/athletes", icon: UsersRound },
    { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Publish", href: "/publish", icon: FileCheck },
    { name: "Import/Export", href: "/import-export", icon: FileText },
  ];

  // Org admins get My Organization link
  if (primaryRole === "org_admin") {
    // Link to specific organization profile if available
    const orgId = userOrganizations?.[0]?.organizationId;
    const href = orgId ? `/organizations/${orgId}` : "/organizations";
    return [
      ...baseNavigation,
      { name: "My Organization", href, icon: Building2 }
    ];
  }

  // Coaches get only the base navigation
  return baseNavigation;
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

  // Use session role as primary source, fallback to organization role, then 'athlete'
  const primaryRole = userData?.role || (Array.isArray(userOrganizations) && userOrganizations.length > 0 ? userOrganizations[0]?.role : 'athlete');
  const isSiteAdmin = userData?.isSiteAdmin || userData?.role === "site_admin";

  // Check if we're in an organization context (site admin viewing specific org)
  const isInOrganizationContext = !!organizationContext || location.includes('/organizations/');

  const navigation = getNavigation(isSiteAdmin, primaryRole, userData?.id, isInOrganizationContext, userOrganizations as any[], userData, organizationContext);


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
                  {primaryRole.replace('_', ' ')}
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

        {userData && (userData.isSiteAdmin || primaryRole === "org_admin" || primaryRole === "coach") && userData.id && (
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
        {(
          // Show for non-site admins who have organizations
          (!userData?.isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0 && userOrganizations[0]?.organizationName) ||
          // Show for site admins in organization context
          (userData?.isSiteAdmin && organizationContext && currentOrgData?.name)
        ) && (
          <div className="px-3 py-2 border-t border-gray-200 mt-2">
            <div className="flex items-center space-x-2">
              <Building2 className="h-4 w-4 text-gray-500" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {userData?.isSiteAdmin && organizationContext 
                    ? currentOrgData?.name
                    : userOrganizations?.[0]?.organizationName
                  }
                </p>
              </div>
            </div>
          </div>
        )}

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