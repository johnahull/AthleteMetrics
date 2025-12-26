import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import type { SiteSettings, Organization, UserOrganization } from "@shared/schema";
import {
  BarChart3,
  Building2,
  LayoutDashboard,
  UserCog,
  Users,
  UsersRound,
  PlusCircle,
  FileCheck,
  FileText,
  TrendingUp,
  Settings,
  Target,
  ClipboardList,
  Activity,
  Heart,
  ClipboardCheck,
  Trophy,
  Link,
  UserPlus,
  Calendar
} from "lucide-react";
import { NavigationMenu } from "./navigation-menu";
import { UserProfileDisplay } from "./user-profile-display";
import { OrganizationDisplay } from "./organization-display";
import { OrgSwitcher } from "./athlete/OrgSwitcher";
import { useContextualLabels } from "@/hooks/useContextualLabels";



// Navigation configurations for each role
// Function to generate navigation config with contextual labels
const getNavigationConfigs = (teamLabel: string, athletesLabel: string) => ({
  site_admin: {
    default: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Organizations", href: "/organizations", icon: Building2 },
      { name: "User Management", href: "/user-management", icon: UserCog },
      { name: "Global Athletes", href: "/global-athletes", icon: Link, testId: "global-athletes-menu-item" },
      { name: "Measurements", href: "/admin/measurements", icon: Activity, testId: "admin-measurements-menu-item" },
      { name: "Wellness Templates", href: "/wellness-templates", icon: ClipboardCheck, testId: "wellness-templates-menu-item" },
      { name: "Metrics", href: "/metrics", icon: Settings, testId: "metrics-menu-item" },
      { name: "Sports", href: "/sports", icon: Trophy, testId: "sports-menu-item" },
      { name: "Benchmarks", href: "/benchmarks", icon: Target, testId: "benchmarks-menu-item" },
      { name: "Site Settings", href: "/admin", icon: Settings, testId: "site-settings-menu-item" }
    ],
    organization_context: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: teamLabel, href: "/teams", icon: Users },
      { name: athletesLabel, href: "/athletes", icon: UsersRound },
      { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
      { name: "Events", href: "/events", icon: Calendar },
      { name: "Wellness", href: "/wellness", icon: Heart },
      { name: "Coach Analytics", href: "/coach-analytics", icon: TrendingUp },
      { name: "Reports", href: "/reports", icon: ClipboardList },
      { name: "Measurements", href: "/publish", icon: FileCheck },
      { name: "Import/Export", href: "/import-export", icon: FileText },
      { name: "Benchmarks", href: "/organizations/__ORG_ID__/benchmarks", icon: Target }
    ]
  },
  org_admin: [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: teamLabel, href: "/teams", icon: Users },
    { name: athletesLabel, href: "/athletes", icon: UsersRound },
    { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
    { name: "Events", href: "/events", icon: Calendar },
    { name: "Wellness", href: "/wellness", icon: Heart },
    { name: "Coach Analytics", href: "/coach-analytics", icon: TrendingUp },
    { name: "Reports", href: "/reports", icon: ClipboardList },
    { name: "Measurements", href: "/publish", icon: FileCheck },
    { name: "Import/Export", href: "/import-export", icon: FileText },
    { name: "Benchmarks", href: "/organizations/__ORG_ID__/benchmarks", icon: Target },
    { name: "Settings", href: "/organizations/__ORG_ID__/settings/admin", icon: Settings }
  ],
  coach: [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: teamLabel, href: "/teams", icon: Users },
    { name: athletesLabel, href: "/athletes", icon: UsersRound },
    { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
    { name: "Events", href: "/events", icon: Calendar },
    { name: "Wellness", href: "/wellness", icon: Heart },
    { name: "Coach Analytics", href: "/coach-analytics", icon: TrendingUp },
    { name: "Reports", href: "/reports", icon: ClipboardList },
    { name: "Measurements", href: "/publish", icon: FileCheck },
    { name: "Import/Export", href: "/import-export", icon: FileText },
    { name: "Benchmarks", href: "/organizations/__ORG_ID__/benchmarks", icon: Target }
  ],
  athlete: [
    { name: "My Profile", href: "/my-profile", icon: UsersRound },
    { name: "Dashboard", href: "/my-dashboard", icon: LayoutDashboard },
    { name: "My Measurements", href: "/my-measurements", icon: ClipboardList },
    { name: "My Events", href: "/my-events", icon: Calendar },
    { name: "Peer Comparison", href: "/my-peer-comparison", icon: Users },
    { name: "My Goals", href: "/my-goals", icon: Target },
    { name: "Join Organization", href: "/join", icon: UserPlus }
  ]
});

const getNavigation = (role: string, isSiteAdmin: boolean, isInOrganizationContext: boolean, user?: any, userOrganizations?: any[], organizationContext?: string, teamLabel = "Teams", athletesLabel = "Athletes") => {
  // Get navigation configs with contextual labels
  const NAVIGATION_CONFIGS = getNavigationConfigs(teamLabel, athletesLabel);

  // Site admin navigation
  if (isSiteAdmin) {
    const config = isInOrganizationContext
      ? NAVIGATION_CONFIGS.site_admin.organization_context
      : NAVIGATION_CONFIGS.site_admin.default;
    
    // Add organization context link if needed
    if (isInOrganizationContext && organizationContext) {
      return [
        ...config,
        { name: "Settings", href: `/organizations/${organizationContext}`, icon: Settings }
      ];
    }
    return config;
  }

  // Get base navigation for role
  const baseConfig = NAVIGATION_CONFIGS[role as keyof typeof NAVIGATION_CONFIGS] || NAVIGATION_CONFIGS.coach;
  let navigation = Array.isArray(baseConfig) ? [...baseConfig] : [...baseConfig.default];
  
  // Athletes now use the static /my-profile and /my-dashboard routes
  // No special handling needed - routes are already in the NAVIGATION_CONFIGS
  
  // Update org admin organization link with specific ID
  if (role === "org_admin" && userOrganizations?.[0]?.organizationId) {
    const orgId = userOrganizations[0].organizationId;
    const settingsIndex = navigation.findIndex(item => item.name === "Settings");
    if (settingsIndex !== -1) {
      navigation[settingsIndex].href = `/organizations/${orgId}/settings/admin`;
    }
  }

  // Update benchmarks link with organization ID for both org_admin and coach
  if ((role === "org_admin" || role === "coach") && userOrganizations?.[0]?.organizationId) {
    const benchmarksIndex = navigation.findIndex(item => item.name === "Benchmarks");
    if (benchmarksIndex !== -1) {
      navigation[benchmarksIndex].href = `/organizations/${userOrganizations[0].organizationId}/benchmarks`;
    }
  }

  // Update site admin organization context benchmarks link with organization ID
  if (isSiteAdmin && isInOrganizationContext && organizationContext) {
    const benchmarksIndex = navigation.findIndex(item => item.name === "Benchmarks");
    if (benchmarksIndex !== -1) {
      navigation[benchmarksIndex].href = `/organizations/${organizationContext}/benchmarks`;
    }
  }

  return navigation;
};

export default function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [location] = useLocation();
  const { user: userData, logout } = useAuth();
  const labels = useContextualLabels(); // Get contextual labels

  // Don't render sidebar if no user data
  if (!userData) {
    return null;
  }

  // Get user's organizations for context
  const { data: userOrganizations } = useQuery<UserOrganization[]>({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!userData.id && !userData.isSiteAdmin,
  });

  // Fetch site settings to check wellness module status
  // Use public endpoint for non-site-admins, full endpoint for site admins
  const siteSettingsEndpoint = userData?.isSiteAdmin
    ? "/api/site-settings"
    : "/api/site-settings/public";
  const { data: siteSettings } = useQuery<SiteSettings>({
    queryKey: [siteSettingsEndpoint],
    enabled: !!userData.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch organization to check org-level wellness status
  const organizationId = userOrganizations?.[0]?.organizationId;
  const { data: organization } = useQuery<Organization>({
    queryKey: [`/api/organizations/${organizationId}`],
    enabled: !!organizationId && !userData.isSiteAdmin,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Use the role from user session data
  const userRole = userData?.role || 'athlete';
  const isSiteAdmin = userData?.isSiteAdmin === true || userData?.role === "site_admin";

  // Extract organization ID from URL - check both organization profile and context switching
  const orgIdFromUrl = location.match(/\/organizations\/([^\/]+)/)?.[1];
  const isInOrganizationContext = !!orgIdFromUrl;

  let navigation = getNavigation(userRole, isSiteAdmin, isInOrganizationContext, userData, userOrganizations as any[], orgIdFromUrl, labels.teams, labels.athletes);

  // Filter out Wellness link if wellness module is disabled
  const wellnessModuleEnabled = siteSettings?.wellnessModuleEnabled ?? true;
  const orgWellnessEnabled = organization?.wellnessEnabled ?? true;
  const isWellnessEnabled = wellnessModuleEnabled && orgWellnessEnabled;

  if (!isWellnessEnabled) {
    navigation = navigation.filter(item => item.name !== "Wellness");
  }

  // Filter out Events link if events module is disabled for organization
  const eventsEnabled = organization?.eventsEnabled ?? false;
  if (!eventsEnabled) {
    navigation = navigation.filter(item =>
      item.name !== "Events" && item.name !== "My Events"
    );
  }

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
              <h1 className="text-lg font-semibold text-gray-900">AthleteMetrics</h1>
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

      <NavigationMenu navigation={navigation} currentLocation={location} onNavigate={onNavigate} />

      {/* Organization Switcher for Athletes */}
      {userRole === 'athlete' && (
        <div className="px-4 py-3 border-t border-gray-200">
          <OrgSwitcher />
        </div>
      )}

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