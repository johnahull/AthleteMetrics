import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import Sidebar from "./sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (!isLoading && !user && location !== "/login") {
      setLocation("/login");
    }
  }, [user, isLoading, location, setLocation]);

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

  if (!user && location !== "/login") {
    return null;
  }

  if (location === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {isSidebarOpen && <Sidebar />}
      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'lg:ml-0' : 'ml-0'}`}>
        {/* Toggle Button */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="mb-2"
            data-testid="toggle-sidebar"
          >
            {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="ml-2">{isSidebarOpen ? 'Hide Menu' : 'Show Menu'}</span>
          </Button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
