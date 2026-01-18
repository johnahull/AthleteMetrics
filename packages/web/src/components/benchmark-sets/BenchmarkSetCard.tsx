/**
 * BenchmarkSetCard - Individual benchmark set card for the list view
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Pencil, Trash, Layers, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDeleteBenchmarkSet } from "@/lib/benchmark-sets-api";
import type { BenchmarkSet } from "@shared/schema";
import { useState } from "react";
import { useLocation } from "wouter";

interface BenchmarkSetCardProps {
  benchmarkSet: BenchmarkSet;
  organizationId: string;
  onEdit: (set: BenchmarkSet) => void;
}

export function BenchmarkSetCard({
  benchmarkSet,
  organizationId,
  onEdit,
}: BenchmarkSetCardProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteMutation = useDeleteBenchmarkSet(organizationId);

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(benchmarkSet.id);
      toast({
        title: "Benchmark Set Deleted",
        description: `"${benchmarkSet.name}" has been deleted.`,
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
    setShowDeleteDialog(false);
  };

  const handleCardClick = () => {
    setLocation(`/organizations/${organizationId}/benchmark-sets/${benchmarkSet.id}`);
  };

  return (
    <>
      <Card
        className={`cursor-pointer hover:shadow-md transition-shadow ${
          !benchmarkSet.isActive ? "opacity-60" : ""
        }`}
        data-set-id={benchmarkSet.id}
        onClick={handleCardClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">{benchmarkSet.name}</CardTitle>
              {benchmarkSet.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {benchmarkSet.description}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(benchmarkSet);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {!benchmarkSet.isActive && (
              <Badge variant="secondary">Inactive</Badge>
            )}
            {benchmarkSet.sport && (
              <Badge variant="outline">{benchmarkSet.sport}</Badge>
            )}
            {benchmarkSet.level && (
              <Badge variant="outline">{benchmarkSet.level}</Badge>
            )}
            {benchmarkSet.gender && (
              <Badge variant="outline">{benchmarkSet.gender}</Badge>
            )}
            {benchmarkSet.isTemplate && (
              <Badge variant="secondary">Template</Badge>
            )}
          </div>
          <div className="mt-3 flex items-center text-xs text-muted-foreground">
            <Calendar className="mr-1 h-3 w-3" />
            Created {new Date(benchmarkSet.createdAt).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Benchmark Set?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{benchmarkSet.name}"? This action
              cannot be undone and will remove all benchmarks from this set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
