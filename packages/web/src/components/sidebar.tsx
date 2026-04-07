import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import type { SiteSettings, Organization, UserOrganization } from "@shared/schema";
import { useMyPendingInvitations } from "@/lib/events-api";
import { useUnreadReportCount } from "@/hooks/use-my-reports";
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
  Calendar,
  Ruler
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
      { name: "Dashboard", href: "/", icon: LayoutDashboard, tourId: "dashboard" },
      { name: "Organizations", href: "/organizations", icon: Building2, tourId: "organizations" },
      { name: "User Management", href: "/user-management", icon: UserCog, tourId: "user-management" },
      { name: "Global Athletes", href: "/global-athletes", icon: Link, testId: "global-athletes-menu-item", tourId: "global-athletes" },
      { name: "Measurements", href: "/admin/measurements", icon: Activity, testId: "admin-measurements-menu-item", tourId: "admin-measurements" },
      { name: "Wellness Templates", href: "/wellness-templates", icon: ClipboardCheck, testId: "wellness-templates-menu-item", tourId: "wellness-templates" },
      { name: "Metrics", href: "/metrics", icon: Settings, testId: "metrics-menu-item", tourId: "metrics" },
      { name: "Sports", href: "/sports", icon: Trophy, testId: "sports-menu-item", tourId: "sports" },
      { name: "Benchmarks", href: "/benchmarks", icon: Target, testId: "benchmarks-menu-item", tourId: "benchmarks" },
      { name: "Site Settings", href: "/admin", icon: Settings, testId: "site-settings-menu-item", tourId: "site-settings" }
    ],
    organization_context: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard, tourId: "dashboard" },
      { name: teamLabel, href: "/teams", icon: Users, tourId: "teams" },
      { name: athletesLabel, href: "/athletes", icon: UsersRound, tourId: "athletes" },
      { name: "Data Entry", href: "/data-entry", icon: PlusCircle, tourId: "data-entry" },
      { name: "Events", href: "/events", icon: Calendar, tourId: "events" },
      { name: "Wellness", href: "/wellness", icon: Heart, tourId: "wellness" },
      { name: "Coach Analytics", href: "/coach-analytics", icon: TrendingUp, tourId: "coach-analytics" },
      { name: "Reports", href: "/reports", icon: ClipboardList, tourId: "reports" },
      { name: "Measurements", href: "/publish", icon: FileCheck, tourId: "measurements" },

      { name: "Benchmarks", href: "/organizations/__ORG_ID__/benchmarks", icon: Target, tourId: "benchmarks" }
    ]
  },
  org_admin: [
    { name: "Dashboard", href: "/", icon: LayoutDashboard, tourId: "dashboard" },
    { name: teamLabel, href: "/teams", icon: Users, tourId: "teams" },
    { name: athletesLabel, href: "/athletes", icon: UsersRound, tourId: "athletes" },
    { name: "Data Entry", href: "/data-entry", icon: PlusCircle, tourId: "data-entry" },
    { name: "Events", href: "/events", icon: Calendar, tourId: "events" },
    { name: "Wellness", href: "/wellness", icon: Heart, tourId: "wellness" },
    { name: "Coach Analytics", href: "/coach-analytics", icon: TrendingUp, tourId: "coach-analytics" },
    { name: "Reports", href: "/reports", icon: ClipboardList, tourId: "reports" },
    { name: "Measurements", href: "/publish", icon: FileCheck, tourId: "measurements" },
    { name: "Benchmarks", href: "/organizations/__ORG_ID__/benchmarks", icon: Target, tourId: "benchmarks" },
    { name: "Metrics", href: "/organizations/__ORG_ID__/metrics", icon: Ruler, tourId: "metrics" },
    { name: "Settings", href: "/organizations/__ORG_ID__/settings/admin", icon: Settings, tourId: "settings" }
  ],
  coach: [
    { name: "Dashboard", href: "/", icon: LayoutDashboard, tourId: "dashboard" },
    { name: teamLabel, href: "/teams", icon: Users, tourId: "teams" },
    { name: athletesLabel, href: "/athletes", icon: UsersRound, tourId: "athletes" },
    { name: "Data Entry", href: "/data-entry", icon: PlusCircle, tourId: "data-entry" },
    { name: "Events", href: "/events", icon: Calendar, tourId: "events" },
    { name: "Wellness", href: "/wellness", icon: Heart, tourId: "wellness" },
    { name: "Coach Analytics", href: "/coach-analytics", icon: TrendingUp, tourId: "coach-analytics" },
    { name: "Reports", href: "/reports", icon: ClipboardList, tourId: "reports" },
    { name: "Measurements", href: "/publish", icon: FileCheck, tourId: "measurements" },
    { name: "Benchmarks", href: "/organizations/__ORG_ID__/benchmarks", icon: Target, tourId: "benchmarks" }
  ],
  athlete: (invitationBadge?: number, reportBadge?: number) => [
    { name: "My Profile", href: "/my-profile", icon: UsersRound, tourId: "my-profile" },
    { name: "Dashboard", href: "/my-dashboard", icon: LayoutDashboard, tourId: "my-dashboard" },
    { name: "My Measurements", href: "/my-measurements", icon: ClipboardList, tourId: "my-measurements" },
    { name: "My Reports", href: "/my-reports", icon: FileText, badge: reportBadge, tourId: "my-reports" },
    { name: "My Events", href: "/my-events", icon: Calendar, badge: invitationBadge, tourId: "my-events" },
    { name: "Peer Comparison", href: "/my-peer-comparison", icon: Users, tourId: "peer-comparison" },
    { name: "My Goals", href: "/my-goals", icon: Target, tourId: "my-goals" },
    { name: "Join Organization", href: "/join", icon: UserPlus, tourId: "join-organization" }
  ],
  parent: [
    { name: "My Children", href: "/parent-dashboard", icon: Users, tourId: "parent-dashboard" },
    { name: "Link a Child", href: "/parent/link-child", icon: UserPlus, tourId: "parent-link-child" },
  ],
});

const getNavigation = (role: string, isSiteAdmin: boolean, isInOrganizationContext: boolean, user?: any, userOrganizations?: any[], organizationContext?: string, teamLabel = "Teams", athletesLabel = "Athletes", invitationBadge?: number, reportBadge?: number) => {
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

  // Get base navigation for role; unknown roles fall back to coach nav
  const baseConfig = NAVIGATION_CONFIGS[role as keyof typeof NAVIGATION_CONFIGS]
    || NAVIGATION_CONFIGS.coach;
  let navigation = Array.isArray(baseConfig)
    ? [...baseConfig]
    : typeof baseConfig === 'function'
    ? baseConfig(invitationBadge, reportBadge)
    : [...baseConfig.default];
  
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

  // Update metrics link with organization ID for org_admin
  if (role === "org_admin" && userOrganizations?.[0]?.organizationId) {
    const metricsIndex = navigation.findIndex(item => item.name === "Metrics");
    if (metricsIndex !== -1) {
      navigation[metricsIndex].href = `/organizations/${userOrganizations[0].organizationId}/metrics`;
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

  // Fetch pending invitations for athletes only
  const { data: pendingInvitations } = useMyPendingInvitations();

  // Fetch unread report count for athletes only
  const { data: unreadReportCount } = useUnreadReportCount();

  // Use the role from user session data
  const userRole = userData?.role || 'athlete';
  const isSiteAdmin = userData?.isSiteAdmin === true || userData?.role === "site_admin";

  // Extract organization ID from URL - check both organization profile and context switching
  const orgIdFromUrl = location.match(/\/organizations\/([^\/]+)/)?.[1];
  const isInOrganizationContext = !!orgIdFromUrl;

  // Calculate invitation badge count for athletes
  const invitationBadge = userRole === 'athlete' ? (pendingInvitations?.length || 0) : undefined;

  // Calculate report badge count for athletes
  const reportBadge = userRole === 'athlete' ? (unreadReportCount || 0) : undefined;

  let navigation = getNavigation(userRole, isSiteAdmin, isInOrganizationContext, userData, userOrganizations as any[], orgIdFromUrl, labels.teams, labels.athletes, invitationBadge, reportBadge);

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