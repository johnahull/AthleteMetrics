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

// Component to handle organization profile link for org admins  
function OrganizationProfileLink({ user, location, userOrganizations }: { user: any, location: string, userOrganizations?: any[] }) {
  // Check if user has org_admin role in any organization
  const hasOrgAdminRole = userOrganizations?.some(org => org.role === "org_admin");
  
  const { data: organizations } = useQuery({
    queryKey: ["/api/organizations-with-users"],
    enabled: !!user?.id && hasOrgAdminRole,
  });

  if (!organizations || !Array.isArray(organizations) || organizations.length === 0) {
    return null;
  }

  const orgId = organizations[0]?.id;
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
        <span>My Organization</span>
      </div>
    </Link>
  );
}

const getNavigation = (isSiteAdmin: boolean, primaryRole?: string, userId?: string, isInOrganizationContext?: boolean, userOrganizations?: any[]) => {
  // Site admins get different navigation based on context (check this FIRST)
  if (isSiteAdmin) {
    // When viewing an organization, show org admin menu
    if (isInOrganizationContext) {
      return [
        { name: "Dashboard", href: "/", icon: LayoutDashboard },
        { name: "Teams", href: "/teams", icon: Users },
        { name: "Athletes", href: "/athletes", icon: UsersRound },
        { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
        { name: "Analytics", href: "/analytics", icon: BarChart3 },
        { name: "Publish", href: "/publish", icon: FileCheck },
        { name: "Import/Export", href: "/import-export", icon: FileText },
      ];
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
  if (primaryRole === "athlete") {
    return [
      { name: "My Profile", href: `/athletes/${userId}`, icon: UsersRound },
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
  const [location] = useLocation();
  const { user, logout, organizationContext, setOrganizationContext } = useAuth();
  
  // Get user's primary role from their first organization (or 'athlete' fallback)
  const { data: userOrganizations } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
  });
  
  const primaryRole = Array.isArray(userOrganizations) && userOrganizations.length > 0 ? userOrganizations[0]?.role : 'athlete';
  const isSiteAdmin = user?.isSiteAdmin || false;
  
  // Check if we're in an organization context (site admin viewing specific org)
  const isInOrganizationContext = isSiteAdmin && !!organizationContext;
  
  const navigation = getNavigation(isSiteAdmin, primaryRole, user?.id, isInOrganizationContext, userOrganizations as any[]);
  
  // Debug logging
  console.log('Sidebar Debug:', {
    isSiteAdmin,
    primaryRole, 
    isInOrganizationContext,
    organizationContext,
    userIsSiteAdmin: user?.isSiteAdmin,
    navigation: navigation.map(n => n.name)
  });

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
            <p className="text-sm text-gray-500">Analytics Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2 flex-1">
        {/* Back to site button for site admins in organization context */}
        {isSiteAdmin && organizationContext && (
          <button
            onClick={() => setOrganizationContext(null)}
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
      <div className="p-4 border-t border-gray-200">
        <div className="space-y-2">
          {/* Profile Link for admins and coaches - but not for legacy admin */}
          
          {/* Site admin organization profile link when in organization context */}
          {user && user.isSiteAdmin && isInOrganizationContext && (
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
          
          {user && (user.isSiteAdmin || primaryRole === "org_admin" || primaryRole === "coach") && user.id && (
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
          
          {/* User Info & Logout */}
          <div className="text-sm text-gray-600 px-3 py-2">
            <p className="font-medium">{user?.username}</p>
            <p className="text-xs">{user?.isSiteAdmin ? 'Site Admin' : primaryRole?.replace('_', ' ').replace(/\b\w/g, (l: any) => l.toUpperCase())}</p>
            {Array.isArray(userOrganizations) && userOrganizations.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {userOrganizations.length === 1 
                  ? userOrganizations[0]?.organization?.name 
                  : `${userOrganizations[0]?.organization?.name} (+${userOrganizations.length - 1} more)`}
              </p>
            )}
          </div>
          
          <button
            onClick={logout}
            className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
            data-testid="nav-logout"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

    </aside>
  );
}
