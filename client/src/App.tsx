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

// Lazy load heavy pages to reduce initial bundle size
const Dashboard = React.lazy(() => import("./pages/dashboard"));
const Teams = React.lazy(() => import("./pages/teams"));
const Athletes = React.lazy(() => import("./pages/athletes"));
const AthleteProfile = React.lazy(() => import("./pages/athlete-profile"));
const DataEntry = React.lazy(() => import("./pages/data-entry"));
const Publish = React.lazy(() => import("./pages/publish"));
const ImportExport = React.lazy(() => import("./pages/import-export"));
const AdminPage = React.lazy(() => import("./pages/admin"));
const Organizations = React.lazy(() => import("./pages/organizations"));
const UserManagement = React.lazy(() => import("./pages/user-management"));
const Profile = React.lazy(() => import("./pages/profile"));
const UserProfile = React.lazy(() => import("./pages/user-profile"));
const OrganizationProfile = React.lazy(() => import("./pages/organization-profile"));
const AcceptInvitation = React.lazy(() => import("./pages/accept-invitation"));
const EnhancedLogin = React.lazy(() => import("./pages/enhanced-login"));
const ForgotPassword = React.lazy(() => import("./pages/forgot-password"));
const ResetPassword = React.lazy(() => import("./pages/reset-password"));
const VerifyEmail = React.lazy(() => import("./pages/verify-email"));

// Lazy load analytics pages to reduce initial bundle size
const Analytics = React.lazy(() => import("./pages/analytics"));
const CoachAnalytics = React.lazy(() => import("./pages/CoachAnalytics"));
const AthleteAnalytics = React.lazy(() => import("./pages/AthleteAnalytics"));

// Lazy load welcome page
const Welcome = React.lazy(() => import("./pages/welcome"));

function Router() {
  return (
    <Switch>
      <Route path="/accept-invitation" component={AcceptInvitation} />
      <Route path="/register" component={AcceptInvitation} />
      <Route path="/login" component={Login} />
      <Route path="/enhanced-login" component={EnhancedLogin} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
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
      <Route path="/admin">
        <RouteWrapper loadingText="Loading Admin...">
          <AdminPage />
        </RouteWrapper>
      </Route>
      <Route path="/teams">
        <RouteWrapper loadingText="Loading Teams...">
          <Teams />
        </RouteWrapper>
      </Route>
      <Route path="/profile">
        <RouteWrapper loadingText="Loading Profile...">
          <Profile />
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
          <Layout>
            <Toaster />
            <Router />
          </Layout>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;// Test: Verifying auto-review workflow fix
