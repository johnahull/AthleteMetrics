/**
 * ExercisePicker
 *
 * Searchable, filterable exercise picker.
 * Used inside dialogs to add exercises to workout days.
 * Only shows active (isActive=true) exercises.
 * Filters by name text and category.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";
import type { Exercise } from "./ExerciseCard";

interface ExercisePickerProps {
  exercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
  excludeIds?: string[];
}

const EXERCISE_TYPE_COLORS: Record<string, string> = {
  weighted: "bg-blue-100 text-blue-800 border-blue-200",
  bodyweight: "bg-purple-100 text-purple-800 border-purple-200",
  speed: "bg-orange-100 text-orange-800 border-orange-200",
  plyometric: "bg-red-100 text-red-800 border-red-200",
  timed: "bg-green-100 text-green-800 border-green-200",
};

export function ExercisePicker({ exercises, onSelect, excludeIds = [] }: ExercisePickerProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const activeExercises = exercises.filter((e) => e.isActive && !excludeIds.includes(e.id));

  const categories = Array.from(
    new Set(activeExercises.map((e) => e.category).filter(Boolean) as string[])
  ).sort();

  const filtered = activeExercises.filter((exercise) => {
    const matchesSearch = exercise.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || exercise.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="exercise-picker-search"
          />
        </div>
        {categories.length > 0 && (
          <select
            className="border rounded-md px-3 text-sm bg-background"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            data-testid="exercise-picker-category-filter"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No exercises found
          </p>
        ) : (
          filtered.map((exercise) => {
            const typeColor = EXERCISE_TYPE_COLORS[exercise.exerciseType] ?? "bg-gray-100 text-gray-700 border-gray-200";
            return (
              <div
                key={exercise.id}
                className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer group"
                data-testid={`exercise-picker-item-${exercise.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{exercise.name}</span>
                  <Badge variant="outline" className={`text-xs capitalize shrink-0 ${typeColor}`}>
                    {exercise.exerciseType}
                  </Badge>
                  {exercise.category && (
                    <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">
                      {exercise.category}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelect(exercise)}
                  className="shrink-0 opacity-0 group-hover:opacity-100"
                  data-testid={`exercise-picker-select-${exercise.id}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} exercise{filtered.length !== 1 ? "s" : ""} available
      </p>
    </div>
  );
}
