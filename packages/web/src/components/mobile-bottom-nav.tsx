import { Home, Users, UsersRound, Plus, User } from 'lucide-react';
import { Link, useLocation, useRoute } from 'wouter';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  activePatterns: string[]; // URL patterns that should show this as active
}

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    icon: Home,
    label: 'Dashboard',
    activePatterns: ['/dashboard', '/'],
  },
  {
    href: '/athletes',
    icon: Users,
    label: 'Athletes',
    activePatterns: ['/athletes'],
  },
  {
    href: '/teams',
    icon: UsersRound,
    label: 'Teams',
    activePatterns: ['/teams'],
  },
  {
    href: '/profile',
    icon: User,
    label: 'Profile',
    activePatterns: ['/profile'],
  },
];

export function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Only show on mobile
  if (!isMobile) {
    return null;
  }

  const isActive = (patterns: string[]) => {
    return patterns.some(pattern => {
      if (pattern === '/') {
        return location === '/';
      }
      return location.startsWith(pattern);
    });
  };

  return (
    <>
      <nav
        data-testid="mobile-bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border lg:hidden"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.activePatterns);

            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] min-h-[48px] rounded-lg transition-colors ${
                    active
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{item.label}</span>
                </a>
              </Link>
            );
          })}

          {/* Quick Add Button (Center) */}
          <button
            onClick={() => setShowQuickAdd(true)}
            className="flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] min-h-[48px] rounded-lg transition-colors text-primary-foreground bg-primary hover:bg-primary/90"
            aria-label="Quick add measurement"
            data-testid="quick-add-button"
          >
            <Plus className="h-6 w-6" />
            <span className="text-xs font-medium">Add</span>
          </button>

          {navItems.slice(2).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.activePatterns);

            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] min-h-[48px] rounded-lg transition-colors ${
                    active
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{item.label}</span>
                </a>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Quick Add Measurement Dialog */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent data-testid="measurement-modal" className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick Add Measurement</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Navigate to data entry to add measurements.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowQuickAdd(false);
                  setLocation('/data-entry');
                }}
                className="flex-1"
              >
                Go to Data Entry
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowQuickAdd(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
