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
  LogOut 
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Teams", href: "/teams", icon: Users },
  { name: "Players", href: "/players", icon: UsersRound },
  { name: "Data Entry", href: "/data-entry", icon: PlusCircle },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Import/Export", href: "/import-export", icon: FileText },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-white shadow-sm border-r border-gray-200 h-screen flex-shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Performance Hub</h1>
            <p className="text-sm text-gray-500">Analytics Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2">
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

      {/* User Profile */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">
              {user?.username?.charAt(0)?.toUpperCase() || "A"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{user?.username || "Admin User"}</p>
            <p className="text-xs text-gray-500">Administrator</p>
          </div>
          <button 
            onClick={logout}
            className="text-gray-400 hover:text-gray-600"
            data-testid="logout-button"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
