
import React from "react";
import { Link } from "wouter";
import { User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserProfileDisplayProps {
  user: any;
  userRole: string;
  location: string;
  onLogout: () => void;
}

export function UserProfileDisplay({ 
  user, 
  userRole, 
  location, 
  onLogout 
}: UserProfileDisplayProps) {
  const canAccessProfile = user.isSiteAdmin || userRole === "org_admin" || userRole === "coach";

  return (
    <div className="p-4 border-t border-gray-200 mt-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <User className="h-8 w-8 text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-gray-500 capitalize">
              {userRole.replace('_', ' ')}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      {canAccessProfile && user.id && (
        <Link href="/profile">
          <div
            className={cn(
              "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer mt-2",
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

      <button
        onClick={onLogout}
        className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100 mt-2"
        data-testid="nav-logout"
      >
        <LogOut className="h-5 w-5" />
        <span>Sign Out</span>
      </button>
    </div>
  );
}
