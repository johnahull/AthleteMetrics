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
import Players from "./pages/players";
import PlayerProfile from "./pages/player-profile";
import DataEntry from "./pages/data-entry";
import Analytics from "./pages/analytics";
import Publish from "./pages/publish";
import ImportExport from "./pages/import-export";
import AdminPage from "./pages/admin";
import Organizations from "./pages/organizations";
import UserManagement from "./pages/user-management";
import Profile from "./pages/profile";
import UserProfile from "./pages/user-profile";
import OrganizationProfile from "./pages/organization-profile";
import AcceptInvitation from "./pages/accept-invitation";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/test-route" component={() => (
        <div style={{padding: '20px', fontSize: '24px', color: 'green'}}>
          🎯 TEST ROUTE WORKS! URL: {window.location.href}
        </div>
      )} />
      <Route path="/accept-invitation" component={AcceptInvitation} />
      <Route path="/login" component={Login} />
      <Route path="/athletes/:id" component={PlayerProfile} />
      <Route path="/athletes" component={Players} />
      <Route path="/organizations/:id" component={OrganizationProfile} />
      <Route path="/organizations" component={Organizations} />
      <Route path="/users/:id" component={UserProfile} />
      <Route path="/user-management" component={UserManagement} />
      <Route path="/data-entry" component={DataEntry} />
      <Route path="/analytics" component={Analytics} />
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