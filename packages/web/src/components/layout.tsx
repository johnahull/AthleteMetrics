import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut } from "lucide-react";
import Sidebar from "./sidebar";
import ImpersonationBanner from "./impersonation-banner";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MeasurementForm from "./measurement-form";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { OfflineStatusIndicator } from "./offline-status-indicator";
import { backgroundSync } from "@/lib/background-sync";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

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

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    user,
    onMeasurement: () => setShowMeasurementModal(true),
    onHelp: () => setShowHelpDialog(true),
    onEscape: () => {
      setShowMeasurementModal(false);
      setShowHelpDialog(false);
    },
  });

  // Start background sync service when user is logged in
  useEffect(() => {
    if (user && !isPublicRoute) {
      backgroundSync.start();
      return () => {
        backgroundSync.stop();
      };
    }
  }, [user, isPublicRoute]);

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
      {/* Desktop Sidebar - Hidden on mobile */}
      {!isMobile && isSidebarOpen && <Sidebar />}

      {/* Mobile Sidebar Drawer */}
      {isMobile && (
        <Drawer open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <DrawerContent data-testid="mobile-drawer">
            <DrawerHeader>
              <DrawerTitle>Menu</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-4 overflow-y-auto">
              <Sidebar onNavigate={() => setIsMobileMenuOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Impersonation Banner */}
        <ImpersonationBanner />

        {/* Toggle Button Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={() => isMobile ? setIsMobileMenuOpen(!isMobileMenuOpen) : setIsSidebarOpen(!isSidebarOpen)}
            className="flex items-center gap-2"
            data-testid="mobile-menu-button"
            aria-label="Toggle menu"
          >
            {(isMobile ? isMobileMenuOpen : isSidebarOpen) ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="hidden sm:inline">{(isMobile ? isMobileMenuOpen : isSidebarOpen) ? 'Hide Menu' : 'Show Menu'}</span>
          </Button>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Offline Status Indicator */}
            <OfflineStatusIndicator />

            <div className="text-sm text-gray-500 hidden sm:block">
              AthleteMetrics
            </div>
            {user && (
              <div className="flex items-center gap-2 sm:gap-3 text-sm">
                <div className="hidden sm:flex items-center gap-2">
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
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Main Content - Add padding bottom on mobile for bottom nav */}
        <div className={`flex-1 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Measurement Modal - Triggered by Ctrl+M / Cmd+M */}
      <Dialog open={showMeasurementModal} onOpenChange={setShowMeasurementModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quick Add Measurement</DialogTitle>
          </DialogHeader>
          <MeasurementForm />
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Help Dialog - Triggered by ? */}
      <KeyboardShortcutsDialog
        open={showHelpDialog}
        onOpenChange={setShowHelpDialog}
      />
    </div>
  );
}