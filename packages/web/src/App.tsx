import React, { Suspense, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { RouteWrapper } from "./components/RouteWrapper";
import { AuthProvider } from "./lib/auth";
import Layout from "./components/layout";
import Login from "./pages/login";
import NotFound from "@/pages/not-found";
import { performanceMonitor } from "./utils/performance-monitoring";
import { CommandPaletteProvider, useCommandPalette } from "./components/command-palette/command-palette-provider";
import { CommandPalette } from "./components/command-palette/command-palette";
import { KeyboardShortcutsHelp } from "./components/command-palette/keyboard-shortcuts-help";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PWAInstallPrompt } from "./components/pwa-install-prompt";

// Register all Chart.js components once at app level
import "./lib/chart-setup";

// Lazy load heavy pages to reduce initial bundle size
const Dashboard = React.lazy(() => import("./pages/dashboard"));
const Teams = React.lazy(() => import("./pages/teams"));
const Athletes = React.lazy(() => import("./pages/athletes"));
const AthleteProfile = React.lazy(() => import("./pages/athlete-profile"));

// Athlete self-view pages (Profile/Dashboard split)
const MyProfile = React.lazy(() => import("./pages/my-profile"));
const MyDashboard = React.lazy(() => import("./pages/my-dashboard"));
const MyGoals = React.lazy(() => import("./pages/my-goals"));
const MyMeasurements = React.lazy(() => import("./pages/my-measurements"));
const MyMeasurementsAdd = React.lazy(() => import("./pages/my-measurements-add"));
const MyPeerComparison = React.lazy(() => import("./pages/my-peer-comparison"));
const MyGlobalProfile = React.lazy(() => import("./pages/my-global-profile"));
const UnifiedDashboard = React.lazy(() => import("./pages/unified-dashboard"));
const DataEntry = React.lazy(() => import("./pages/data-entry"));
const Publish = React.lazy(() => import("./pages/publish"));
const ImportExport = React.lazy(() => import("./pages/import-export"));
const AdminPage = React.lazy(() => import("./pages/admin"));
const AdminMeasurementsPage = React.lazy(() => import("./pages/admin-measurements"));
const AdminWellnessTemplates = React.lazy(() => import("./pages/admin-wellness-templates"));
const MetricsManagement = React.lazy(() => import("./pages/metrics-management"));
const SportsManagement = React.lazy(() => import("./pages/sports-management"));
const Organizations = React.lazy(() => import("./pages/organizations"));
const UserManagement = React.lazy(() => import("./pages/user-management"));
const Profile = React.lazy(() => import("./pages/profile"));
const UserProfile = React.lazy(() => import("./pages/user-profile"));
const OrganizationProfile = React.lazy(() => import("./pages/organization-profile"));
const OrganizationSettings = React.lazy(() => import("./pages/organization-settings"));
const OrgAdminSettings = React.lazy(() => import("./pages/org-admin-settings"));
const AcceptInvitation = React.lazy(() => import("./pages/accept-invitation"));
const Register = React.lazy(() => import("./pages/register"));
const EnhancedLogin = React.lazy(() => import("./pages/enhanced-login"));
const ForgotPassword = React.lazy(() => import("./pages/forgot-password"));
const ResetPassword = React.lazy(() => import("./pages/reset-password"));
const VerifyEmail = React.lazy(() => import("./pages/verify-email"));
const PrivacyPolicy = React.lazy(() => import("./pages/privacy-policy"));
const TermsOfService = React.lazy(() => import("./pages/terms-of-service"));

// Lazy load analytics pages to reduce initial bundle size
const Analytics = React.lazy(() => import("./pages/analytics"));
const CoachAnalytics = React.lazy(() => import("./pages/CoachAnalytics"));
const AthleteAnalytics = React.lazy(() => import("./pages/AthleteAnalytics"));

// Lazy load welcome page
const Welcome = React.lazy(() => import("./pages/welcome"));

// Lazy load wellness pages
const WellnessTemplates = React.lazy(() => import("./pages/wellness-templates"));
const WellnessSubmit = React.lazy(() => import("./pages/wellness-submit"));
const WellnessMyRequests = React.lazy(() => import("./pages/wellness-my-requests"));
const WellnessHistory = React.lazy(() => import("./pages/wellness-history"));
const WellnessAnalytics = React.lazy(() => import("./pages/wellness-analytics"));

// Lazy load benchmark pages
const Benchmarks = React.lazy(() => import("./pages/benchmarks"));
const OrganizationBenchmarks = React.lazy(() => import("./pages/organization-benchmarks"));
const CustomBenchmarks = React.lazy(() => import("./pages/custom-benchmarks"));
const AthleteBenchmarks = React.lazy(() => import("./pages/athlete-benchmarks"));

// Lazy load report pages
const Reports = React.lazy(() => import("./pages/reports"));
const ReportView = React.lazy(() => import("./pages/report-view"));
const MultiReportView = React.lazy(() => import("./pages/multi-report-view"));
const PublicReport = React.lazy(() => import("./pages/public-report"));

// Lazy load component test pages (development only)
const TeamAthleteSelectorTest = React.lazy(() => import("./pages/component-test-team-selector"));

// Lazy load global athletes admin pages
const GlobalAthletes = React.lazy(() => import("./pages/global-athletes"));
const GlobalAthleteDetail = React.lazy(() => import("./pages/global-athlete-detail"));

// Lazy load membership request pages
const JoinOrganization = React.lazy(() => import("./pages/join-organization"));
const JoinByCode = React.lazy(() => import("./pages/join-by-code"));
const MyRequests = React.lazy(() => import("./pages/my-requests"));

function Router() {
  return (
    <Switch>
      <Route path="/accept-invitation">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <AcceptInvitation />
        </Suspense>
      </Route>
      <Route path="/register">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <Register />
        </Suspense>
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/enhanced-login">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <EnhancedLogin />
        </Suspense>
      </Route>
      <Route path="/forgot-password">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <ForgotPassword />
        </Suspense>
      </Route>
      <Route path="/reset-password">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <ResetPassword />
        </Suspense>
      </Route>
      <Route path="/verify-email">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <VerifyEmail />
        </Suspense>
      </Route>
      <Route path="/privacy">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <PrivacyPolicy />
        </Suspense>
      </Route>
      <Route path="/terms">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <TermsOfService />
        </Suspense>
      </Route>
      <Route path="/join/:code">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <JoinByCode />
        </Suspense>
      </Route>
      <Route path="/join">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <JoinOrganization />
        </Suspense>
      </Route>
      <Route path="/my-requests">
        <RouteWrapper loadingText="Loading Requests...">
          <MyRequests />
        </RouteWrapper>
      </Route>
      <Route path="/public/reports/:token">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <PublicReport />
        </Suspense>
      </Route>
      <Route path="/wellness/submit/:token">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <WellnessSubmit />
        </Suspense>
      </Route>
      {/* Athlete self-view routes (Profile/Dashboard split) */}
      <Route path="/my-profile">
        <RouteWrapper loadingText="Loading Profile...">
          <MyProfile />
        </RouteWrapper>
      </Route>
      <Route path="/my-dashboard">
        <RouteWrapper loadingText="Loading Dashboard...">
          <MyDashboard />
        </RouteWrapper>
      </Route>
      <Route path="/my-goals">
        <RouteWrapper loadingText="Loading Goals...">
          <MyGoals />
        </RouteWrapper>
      </Route>
      <Route path="/my-measurements/add">
        <RouteWrapper loadingText="Loading Add Measurement...">
          <MyMeasurementsAdd />
        </RouteWrapper>
      </Route>
      <Route path="/my-measurements">
        <RouteWrapper loadingText="Loading Measurements...">
          <MyMeasurements />
        </RouteWrapper>
      </Route>
      <Route path="/my-peer-comparison">
        <RouteWrapper loadingText="Loading Peer Comparison...">
          <MyPeerComparison />
        </RouteWrapper>
      </Route>
      <Route path="/my-global-profile">
        <RouteWrapper loadingText="Loading Global Profile...">
          <MyGlobalProfile />
        </RouteWrapper>
      </Route>
      <Route path="/unified-dashboard">
        <RouteWrapper loadingText="Loading Unified Dashboard...">
          <UnifiedDashboard />
        </RouteWrapper>
      </Route>

      {/* Coach view of athlete - more specific routes first */}
      <Route path="/athletes/:id/profile">
        <RouteWrapper loadingText="Loading Athlete Profile...">
          <AthleteProfile />
        </RouteWrapper>
      </Route>
      <Route path="/athletes/:id/dashboard">
        <RouteWrapper loadingText="Loading Athlete Dashboard...">
          <AthleteProfile />
        </RouteWrapper>
      </Route>

      {/* Legacy athlete route - redirects to dashboard view */}
      <Route path="/athletes/:id">
        <RouteWrapper>
          <AthleteProfile />
        </RouteWrapper>
      </Route>
      <Route path="/athletes">
        <RouteWrapper loadingText="Loading Athletes...">
          <Athletes />
        </RouteWrapper>
      </Route>
      <Route path="/organizations/:id/settings/admin">
        <RouteWrapper loadingText="Loading Organization Settings...">
          <OrgAdminSettings />
        </RouteWrapper>
      </Route>
      <Route path="/organizations/:id/settings">
        <RouteWrapper loadingText="Loading Organization Settings...">
          <OrganizationSettings />
        </RouteWrapper>
      </Route>
      <Route path="/organizations/:id">
        <RouteWrapper>
          <OrganizationProfile />
        </RouteWrapper>
      </Route>
      <Route path="/organizations">
        <RouteWrapper loadingText="Loading Organizations...">
          <Organizations />
        </RouteWrapper>
      </Route>
      <Route path="/users/:id">
        <RouteWrapper loadingText="Loading User...">
          <UserProfile />
        </RouteWrapper>
      </Route>
      <Route path="/user-management">
        <RouteWrapper loadingText="Loading User Management...">
          <UserManagement />
        </RouteWrapper>
      </Route>
      <Route path="/global-athletes/:id">
        <RouteWrapper loadingText="Loading Global Athlete...">
          <GlobalAthleteDetail />
        </RouteWrapper>
      </Route>
      <Route path="/global-athletes">
        <RouteWrapper loadingText="Loading Global Athletes...">
          <GlobalAthletes />
        </RouteWrapper>
      </Route>
      <Route path="/data-entry">
        <RouteWrapper loadingText="Loading Data Entry...">
          <DataEntry />
        </RouteWrapper>
      </Route>
      <Route path="/analytics">
        <RouteWrapper loadingText="Loading Analytics...">
          <Analytics />
        </RouteWrapper>
      </Route>
      <Route path="/coach-analytics">
        <RouteWrapper loadingText="Loading Coach Analytics...">
          <CoachAnalytics />
        </RouteWrapper>
      </Route>
      <Route path="/athlete-analytics">
        <RouteWrapper loadingText="Loading Athlete Analytics...">
          <AthleteAnalytics />
        </RouteWrapper>
      </Route>
      <Route path="/publish">
        <RouteWrapper loadingText="Loading Publish...">
          <Publish />
        </RouteWrapper>
      </Route>
      <Route path="/import-export">
        <RouteWrapper loadingText="Loading Import/Export...">
          <ImportExport />
        </RouteWrapper>
      </Route>
      {/* More specific /admin/* routes must come before /admin */}
      <Route path="/admin/measurements">
        <RouteWrapper loadingText="Loading Measurements...">
          <AdminMeasurementsPage />
        </RouteWrapper>
      </Route>
      <Route path="/wellness-templates">
        <RouteWrapper loadingText="Loading Wellness Templates...">
          <AdminWellnessTemplates />
        </RouteWrapper>
      </Route>
      <Route path="/admin">
        <RouteWrapper loadingText="Loading Admin...">
          <AdminPage />
        </RouteWrapper>
      </Route>
      <Route path="/metrics">
        <RouteWrapper loadingText="Loading Metrics Management...">
          <MetricsManagement />
        </RouteWrapper>
      </Route>
      <Route path="/sports">
        <RouteWrapper loadingText="Loading Sports Management...">
          <SportsManagement />
        </RouteWrapper>
      </Route>
      <Route path="/benchmarks">
        <RouteWrapper loadingText="Loading Benchmarks...">
          <Benchmarks />
        </RouteWrapper>
      </Route>
      <Route path="/organizations/:id/custom-benchmarks">
        <RouteWrapper loadingText="Loading Custom Benchmarks...">
          <CustomBenchmarks />
        </RouteWrapper>
      </Route>
      <Route path="/organizations/:id/benchmarks">
        <RouteWrapper loadingText="Loading Organization Benchmarks...">
          <OrganizationBenchmarks />
        </RouteWrapper>
      </Route>
      <Route path="/athletes/:id/benchmarks">
        <RouteWrapper loadingText="Loading Athlete Benchmarks...">
          <AthleteBenchmarks />
        </RouteWrapper>
      </Route>
      <Route path="/teams">
        <RouteWrapper loadingText="Loading Teams...">
          <Teams />
        </RouteWrapper>
      </Route>
      <Route path="/wellness-analytics">
        <RouteWrapper loadingText="Loading Wellness Analytics...">
          <WellnessAnalytics />
        </RouteWrapper>
      </Route>
      <Route path="/wellness">
        <RouteWrapper loadingText="Loading Wellness...">
          <WellnessTemplates />
        </RouteWrapper>
      </Route>
      <Route path="/wellness/my-requests">
        <RouteWrapper loadingText="Loading Requests...">
          <WellnessMyRequests />
        </RouteWrapper>
      </Route>
      <Route path="/wellness/history">
        <RouteWrapper loadingText="Loading History...">
          <WellnessHistory />
        </RouteWrapper>
      </Route>
      <Route path="/profile">
        <RouteWrapper loadingText="Loading Profile...">
          <Profile />
        </RouteWrapper>
      </Route>
      <Route path="/reports/multi">
        <RouteWrapper loadingText="Loading Reports...">
          <MultiReportView />
        </RouteWrapper>
      </Route>
      <Route path="/reports/:id">
        <RouteWrapper loadingText="Loading Report...">
          <ReportView />
        </RouteWrapper>
      </Route>
      <Route path="/reports">
        <RouteWrapper loadingText="Loading Reports...">
          <Reports />
        </RouteWrapper>
      </Route>
      {/* Component test pages (development) */}
      <Route path="/component-test/team-selector">
        <RouteWrapper loadingText="Loading Component Test...">
          <TeamAthleteSelectorTest />
        </RouteWrapper>
      </Route>
      {/* Welcome page (/) must come after /dashboard to avoid route conflicts
          The Welcome component handles authenticated user redirect to /dashboard internally */}
      <Route path="/dashboard">
        <RouteWrapper loadingText="Loading Dashboard...">
          <Dashboard />
        </RouteWrapper>
      </Route>
      <Route path="/">
        <RouteWrapper loadingText="Loading...">
          <Welcome />
        </RouteWrapper>
      </Route>
      {/* 404 Not Found - must be last (catch-all route) */}
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isHelpOpen, closeHelp } = useCommandPalette();

  return (
    <Layout>
      <Toaster />
      <ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground">Command palette unavailable</div>}>
        <CommandPalette />
      </ErrorBoundary>
      <KeyboardShortcutsHelp isOpen={isHelpOpen} onClose={closeHelp} />
      <PWAInstallPrompt />
      <Router />
    </Layout>
  );
}

function App() {
  useEffect(() => {
    // Initialize chunk loading monitoring in development
    if (process.env.NODE_ENV === 'development') {
      performanceMonitor.monitorChunkLoading();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CommandPaletteProvider>
            <AppContent />
          </CommandPaletteProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;