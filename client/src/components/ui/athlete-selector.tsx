import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, X, User } from 'lucide-react';
import { useAthleteSelector, type Athlete } from '@/hooks/useAthleteSelector';

interface AthleteSelectorProps {
  athletes: Athlete[];
  selectedAthlete?: Athlete | null;
  onSelect: (athlete: Athlete | null) => void;
  placeholder?: string;
  disabled?: boolean;
  showTeamInfo?: boolean;
  maxInitialItems?: number;
  className?: string;
  searchPlaceholder?: string;
  'data-testid'?: string;
}

export function AthleteSelector({
  athletes,
  selectedAthlete,
  onSelect,
  placeholder = "Select athlete...",
  disabled = false,
  showTeamInfo = true,
  maxInitialItems = 12,
  className,
  searchPlaceholder = "Search athletes...",
  'data-testid': testId
}: AthleteSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use shared athlete selector hook
  const {
    searchTerm,
    setSearchTerm,
    filteredAthletes
  } = useAthleteSelector({
    athletes,
    maxSelection: 1,
    initialSelection: selectedAthlete ? [selectedAthlete.id] : [],
    searchEnabled: true
  });

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        setSearchTerm('');
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev < filteredAthletes.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev > 0 ? prev - 1 : filteredAthletes.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredAthletes.length) {
          handleSelect(filteredAthletes[focusedIndex]);
        }
        break;
    }
  };

  // Handle athlete selection
  const handleSelect = (athlete: any) => {
    // Find the original athlete object to pass back
    const originalAthlete = athletes.find(a => a.id === athlete.id);
    if (originalAthlete) {
      onSelect(originalAthlete);
    }
    setIsOpen(false);
    setSearchTerm('');
    setFocusedIndex(-1);
  };

  // Handle clear selection
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setSearchTerm('');
    setFocusedIndex(-1);
  };

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && dropdownRef.current) {
      const focusedElement = dropdownRef.current.children[focusedIndex] as HTMLElement;
      if (focusedElement) {
        focusedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [focusedIndex]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const displayValue = selectedAthlete
    ? (selectedAthlete.fullName || selectedAthlete.name || 'Unknown')
    : '';

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger Button/Input */}
      <div
        className={cn(
          "relative flex items-center min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-muted-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
          !disabled && "cursor-pointer hover:bg-accent/50"
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        data-testid={testId}
      >
        {isOpen ? (
          <div className="flex items-center w-full">
            <Search className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
            <Input
              ref={inputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
              disabled={disabled}
              data-testid={`${testId}-search-input`}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center w-full">
              <User className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
              <span className={cn(
                "truncate",
                !displayValue && "text-muted-foreground"
              )}>
                {displayValue || placeholder}
              </span>
            </div>
            <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
              {selectedAthlete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleClear}
                  disabled={disabled}
                  data-testid={`${testId}-clear-button`}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform",
                isOpen && "transform rotate-180"
              )} />
            </div>
          </>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
          data-testid={`${testId}-dropdown`}
        >
          {filteredAthletes.length === 0 ? (
            <div className="px-4 py-3 text-center text-muted-foreground text-sm">
              {searchTerm.trim() ? (
                <>No athletes found matching "<span className="font-medium">{searchTerm}</span>"</>
              ) : (
                "No athletes available"
              )}
            </div>
          ) : (
            <>
              {filteredAthletes.map((athlete, index) => {
                // Get team information
                let teamInfo = undefined;
                if (showTeamInfo) {
                  if (athlete.teamName && athlete.teamName !== '' && athlete.teamName.trim() !== '') {
                    teamInfo = athlete.teamName;
                  } else if ('teams' in athlete && athlete.teams && Array.isArray(athlete.teams) && athlete.teams.length > 0) {
                    teamInfo = athlete.teams.map((t: any) => t.name).join(', ');
                  } else {
                    teamInfo = 'No team';
                  }
                }

                return (
                  <button
                    key={athlete.id}
                    type="button"
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-accent/50 flex items-center justify-between transition-colors",
                      focusedIndex === index && "bg-accent",
                      selectedAthlete?.id === athlete.id && "bg-primary/10 text-primary"
                    )}
                    onClick={() => handleSelect(athlete)}
                    data-testid={`${testId}-option-${athlete.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{athlete.name}</p>
                      {showTeamInfo && teamInfo && (
                        <p className="text-sm text-muted-foreground truncate">
                          {teamInfo}
                          {'birthYear' in athlete && athlete.birthYear && ` • ${athlete.birthYear}`}
                        </p>
                      )}
                    </div>
                    {selectedAthlete?.id === athlete.id && (
                      <div className="flex-shrink-0 ml-2">
                        <div className="w-2 h-2 bg-primary rounded-full" />
                      </div>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AthleteSelector;