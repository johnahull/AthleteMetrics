import React, { Suspense, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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

// Lazy load analytics pages to reduce initial bundle size
const Analytics = React.lazy(() => import("./pages/analytics"));
const CoachAnalytics = React.lazy(() => import("./pages/CoachAnalytics"));
const AthleteAnalytics = React.lazy(() => import("./pages/AthleteAnalytics"));

function Router() {
  return (
    <Switch>
      <Route path="/accept-invitation" component={AcceptInvitation} />
      <Route path="/register" component={AcceptInvitation} />
      <Route path="/login" component={Login} />
      <Route path="/enhanced-login" component={EnhancedLogin} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/athletes/:id">
        <Suspense fallback={<LoadingSpinner />}>
          <AthleteProfile />
        </Suspense>
      </Route>
      <Route path="/athletes">
        <Suspense fallback={<LoadingSpinner text="Loading Athletes..." />}>
          <Athletes />
        </Suspense>
      </Route>
      <Route path="/organizations/:id">
        <Suspense fallback={<LoadingSpinner />}>
          <OrganizationProfile />
        </Suspense>
      </Route>
      <Route path="/organizations">
        <Suspense fallback={<LoadingSpinner text="Loading Organizations..." />}>
          <Organizations />
        </Suspense>
      </Route>
      <Route path="/users/:id">
        <Suspense fallback={<LoadingSpinner text="Loading User..." />}>
          <UserProfile />
        </Suspense>
      </Route>
      <Route path="/user-management">
        <Suspense fallback={<LoadingSpinner text="Loading User Management..." />}>
          <UserManagement />
        </Suspense>
      </Route>
      <Route path="/data-entry">
        <Suspense fallback={<LoadingSpinner text="Loading Data Entry..." />}>
          <DataEntry />
        </Suspense>
      </Route>
      <Route path="/analytics">
        <Suspense fallback={<LoadingSpinner text="Loading Analytics..." />}>
          <Analytics />
        </Suspense>
      </Route>
      <Route path="/coach-analytics">
        <Suspense fallback={<LoadingSpinner text="Loading Coach Analytics..." />}>
          <CoachAnalytics />
        </Suspense>
      </Route>
      <Route path="/athlete-analytics">
        <Suspense fallback={<LoadingSpinner text="Loading Athlete Analytics..." />}>
          <AthleteAnalytics />
        </Suspense>
      </Route>
      <Route path="/publish">
        <Suspense fallback={<LoadingSpinner text="Loading Publish..." />}>
          <Publish />
        </Suspense>
      </Route>
      <Route path="/import-export">
        <Suspense fallback={<LoadingSpinner text="Loading Import/Export..." />}>
          <ImportExport />
        </Suspense>
      </Route>
      <Route path="/admin">
        <Suspense fallback={<LoadingSpinner text="Loading Admin..." />}>
          <AdminPage />
        </Suspense>
      </Route>
      <Route path="/teams">
        <Suspense fallback={<LoadingSpinner text="Loading Teams..." />}>
          <Teams />
        </Suspense>
      </Route>
      <Route path="/profile">
        <Suspense fallback={<LoadingSpinner text="Loading Profile..." />}>
          <Profile />
        </Suspense>
      </Route>
      <Route path="/">
        <Suspense fallback={<LoadingSpinner text="Loading Dashboard..." />}>
          <Dashboard />
        </Suspense>
      </Route>
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

export default App;