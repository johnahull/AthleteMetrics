import React, { Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./lib/auth";
import Layout from "./components/layout";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import Teams from "./pages/teams";
import Athletes from "./pages/athletes";
import AthleteProfile from "./pages/athlete-profile";
import DataEntry from "./pages/data-entry";
import Publish from "./pages/publish";
import ImportExport from "./pages/import-export";
import AdminPage from "./pages/admin";
import Organizations from "./pages/organizations";
import UserManagement from "./pages/user-management";
import Profile from "./pages/profile";
import UserProfile from "./pages/user-profile";
import OrganizationProfile from "./pages/organization-profile";
import AcceptInvitation from "./pages/accept-invitation";
import EnhancedLogin from "./pages/enhanced-login";
import ForgotPassword from "./pages/forgot-password";
import ResetPassword from "./pages/reset-password";
import NotFound from "@/pages/not-found";

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