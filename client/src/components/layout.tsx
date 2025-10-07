import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut } from "lucide-react";
import Sidebar from "./sidebar";
import ImpersonationBanner from "./impersonation-banner";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Public routes that don't require authentication
  const PUBLIC_ROUTES = [
    '/',
    '/login',
    '/accept-invitation',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/enhanced-login'
  ];

  const isPublicRoute = PUBLIC_ROUTES.some(route =>
    route === location || location.startsWith(route + '/')
  );

  useEffect(() => {
    if (!isLoading && !user && !isPublicRoute) {
      setLocation("/login");
    }
  }, [user, isLoading, location, setLocation, isPublicRoute]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // For public routes, render without sidebar
  if (isPublicRoute || !user) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {isSidebarOpen && <Sidebar />}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Impersonation Banner */}
        <ImpersonationBanner />
        {/* Toggle Button Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex items-center gap-2"
            data-testid="toggle-sidebar"
          >
            {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span>{isSidebarOpen ? 'Hide Menu' : 'Show Menu'}</span>
          </Button>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500">
              Athlete Performance Hub
            </div>
            {user && (
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Welcome,</span>
                  <span className="font-medium text-gray-900">{user.firstName || user.username}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
                  data-testid="logout-button"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </Button>
              </div>
            )}
          </div>
        </div>
        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}