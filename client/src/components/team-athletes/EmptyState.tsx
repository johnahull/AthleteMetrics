import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Search, UserPlus } from "lucide-react";

interface EmptyStateProps {
  mode: 'current' | 'available';
  searchTerm?: string;
  showOnlyAvailable?: boolean;
  onSwitchToAdd?: () => void;
}

export function EmptyState({
  mode,
  searchTerm,
  showOnlyAvailable,
  onSwitchToAdd
}: EmptyStateProps) {
  if (mode === 'current') {
    return (
      <Card className="bg-gray-50">
        <CardContent className="flex flex-col items-center justify-center py-8">
          {!searchTerm ? (
            <>
              <Users className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No athletes on this team</h3>
              <p className="text-gray-600 text-center mb-4">
                This team doesn't have any athletes yet. Switch to "Add Athletes" to add some.
              </p>
              {onSwitchToAdd && (
                <Button onClick={onSwitchToAdd} variant="outline">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Athletes
                </Button>
              )}
            </>
          ) : (
            <>
              <Search className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No athletes match your search</h3>
              <p className="text-gray-600 text-center">
                Try adjusting your search term: "{searchTerm}"
              </p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // Available athletes empty state
  return (
    <Card className="bg-gray-50">
      <CardContent className="flex flex-col items-center justify-center py-8">
        <Users className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {showOnlyAvailable ? "No available athletes found" : "No athletes found"}
        </h3>
        <p className="text-gray-600 text-center">
          {searchTerm
            ? `No athletes match "${searchTerm}"`
            : showOnlyAvailable
              ? "All athletes are already on this team"
              : "No athletes in this organization"
          }
        </p>
      </CardContent>
    </Card>
  );
}