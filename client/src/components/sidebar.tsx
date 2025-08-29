import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Users, 
  UsersRound, 
  PlusCircle, 
  BarChart3, 
  FileText,
  FileCheck,
  LogOut,
  Settings,
  Building2,
  UserCog,
  User
} from "lucide-react";

const getNavigation = (userRole: string, userId?: string) => {
  // Athletes get a restricted navigation menu
  if (userRole === "athlete") {
    return [
      { name: "My Profile", href: `/athletes/${userId}`, icon: UsersRound },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
    ];
  }

  // All other roles get the full navigation
  const baseNavigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Teams", href: "/teams", icon: Users },
    { name: "Athletes", href: "/athletes", icon: UsersRound },
    { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Publish", href: "/publish", icon: FileCheck },
    { name: "Import/Export", href: "/import-export", icon: FileText },
  ];

  // Add admin items based on role
  if (userRole === "site_admin") {
    baseNavigation.push(
      { name: "Organizations", href: "/organizations", icon: Building2 },
      { name: "User Management", href: "/user-management", icon: UserCog }
    );
  } else if (userRole === "org_admin") {
    baseNavigation.push(
      { name: "User Management", href: "/user-management", icon: UserCog }
    );
  }

  return baseNavigation;
};

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  
  // Get user role - fallback to 'athlete' if not defined
  const userRole = user?.role || 'athlete';
  const navigation = getNavigation(userRole, user?.id);

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
              <h1 className="text-lg font-semibold text-gray-900">Performance Hub</h1>
              <span className="px-1.5 py-0.5 text-xs font-semibold bg-orange-100 text-orange-800 rounded border border-orange-200">
                BETA
              </span>
            </div>
            <p className="text-sm text-gray-500">Analytics Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2 flex-1">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                  isActive 
                    ? "bg-primary text-white" 
                    : "text-gray-700 hover:bg-gray-100"
                )}
                data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-200">
        <div className="space-y-2">
          {/* Profile Link for admins and coaches */}
          {user && (user.role === "site_admin" || user.role === "org_admin" || user.role === "coach") && (
            <Link href="/profile">
              <div
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                  location === "/profile"
                    ? "bg-primary text-white" 
                    : "text-gray-700 hover:bg-gray-100"
                )}
                data-testid="nav-profile"
              >
                <User className="h-5 w-5" />
                <span>Profile</span>
              </div>
            </Link>
          )}
          
          {/* User Info & Logout */}
          <div className="text-sm text-gray-600 px-3 py-2">
            <p className="font-medium">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs">{user?.role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
          </div>
          
          <button
            onClick={logout}
            className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
            data-testid="nav-logout"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

    </aside>
  );
}
