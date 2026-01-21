
import React from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  testId?: string; // Optional custom test ID
  badge?: number; // Optional badge count
  tourId?: string; // Optional tour step ID for onboarding
}

interface NavigationMenuProps {
  navigation: NavigationItem[];
  currentLocation: string;
  onNavigate?: () => void;
}

export function NavigationMenu({ navigation, currentLocation, onNavigate }: NavigationMenuProps) {
  return (
    <nav className="p-4 space-y-2 flex-1">
      {navigation.map((item) => {
        const isActive = currentLocation === item.href;
        return (
          <Link key={item.name} href={item.href}>
            <div
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                isActive
                  ? "bg-primary text-white"
                  : "text-gray-700 hover:bg-gray-100"
              )}
              data-testid={item.testId || `nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
              data-tour={item.tourId}
              onClick={onNavigate}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
