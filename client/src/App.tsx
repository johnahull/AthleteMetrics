import React, { Suspense, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
      <Route path="/athletes/:id" component={AthleteProfile} />
      <Route path="/athletes" component={Athletes} />
      <Route path="/organizations/:id" component={OrganizationProfile} />
      <Route path="/organizations" component={Organizations} />
      <Route path="/users/:id" component={UserProfile} />
      <Route path="/user-management" component={UserManagement} />
      <Route path="/data-entry" component={DataEntry} />
      <Route path="/analytics">
        <Suspense fallback={<div className="flex items-center justify-center min-h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div><span className="ml-2">Loading Analytics...</span></div>}>
          <Analytics />
        </Suspense>
      </Route>
      <Route path="/coach-analytics">
        <Suspense fallback={<div className="flex items-center justify-center min-h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div><span className="ml-2">Loading Coach Analytics...</span></div>}>
          <CoachAnalytics />
        </Suspense>
      </Route>
      <Route path="/athlete-analytics">
        <Suspense fallback={<div className="flex items-center justify-center min-h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div><span className="ml-2">Loading Athlete Analytics...</span></div>}>
          <AthleteAnalytics />
        </Suspense>
      </Route>
      <Route path="/publish" component={Publish} />
      <Route path="/import-export" component={ImportExport} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/teams" component={Teams} />
      <Route path="/profile" component={Profile} />
      <Route path="/" component={Dashboard} />
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