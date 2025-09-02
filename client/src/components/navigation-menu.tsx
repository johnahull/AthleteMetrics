
import React from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavigationMenuProps {
  navigation: NavigationItem[];
  currentLocation: string;
}

export function NavigationMenu({ navigation, currentLocation }: NavigationMenuProps) {
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
              data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
