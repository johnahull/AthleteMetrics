/**
 * SiteBenchmarkSetForm - Create/Edit dialog for site-level benchmark sets
 * Site-level sets (organizationId = NULL) are managed by site admins only.
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateSiteBenchmarkSet,
  useUpdateSiteBenchmarkSet,
} from "@/lib/benchmark-sets-api";
import {
  insertBenchmarkSetSchema,
  type InsertBenchmarkSet,
  type BenchmarkSet,
} from "@shared/schema";
import { useSports } from "@/lib/sports-api";
import { Loader2 } from "lucide-react";

interface SiteBenchmarkSetFormProps {
  open: boolean;
  onClose: () => void;
  benchmarkSet: BenchmarkSet | null;
}

export function SiteBenchmarkSetForm({
  open,
  onClose,
  benchmarkSet,
}: SiteBenchmarkSetFormProps) {
  const { toast } = useToast();
  const isEditing = !!benchmarkSet;

  // Fetch available sports
  const { data: sports = [] } = useSports();

  const createMutation = useCreateSiteBenchmarkSet();
  const updateMutation = useUpdateSiteBenchmarkSet(benchmarkSet?.id ?? '');

  const form = useForm<InsertBenchmarkSet>({
    resolver: zodResolver(insertBenchmarkSetSchema),
    defaultValues: {
      name: "",
      description: "",
      sport: "",
      level: "",
      gender: undefined,
      isTemplate: true, // Site sets are templates by default
    },
  });

  // Reset form when benchmarkSet changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: benchmarkSet?.name ?? "",
        description: benchmarkSet?.description ?? "",
        sport: benchmarkSet?.sport ?? "",
        level: benchmarkSet?.level ?? "",
        gender: (benchmarkSet?.gender as 'Male' | 'Female' | 'Not Specified' | undefined) ?? undefined,
        isTemplate: benchmarkSet?.isTemplate ?? true,
      });
    }
  }, [benchmarkSet, open, form]);

  const handleSubmit = async (data: InsertBenchmarkSet) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          name: data.name,
          description: data.description,
          sport: data.sport || null,
          level: data.level || null,
          gender: data.gender || null,
        });
        toast({
          title: "Benchmark Set Updated",
          description: `"${data.name}" has been updated successfully.`,
        });
      } else {
        await createMutation.mutateAsync(data);
        toast({
          title: "Benchmark Set Created",
          description: `"${data.name}" has been created successfully.`,
        });
      }
      form.reset();
      onClose();
    } catch (error) {
      toast({
        title: isEditing ? "Update Failed" : "Creation Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Site Benchmark Set" : "Create Site Benchmark Set"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the site-level benchmark set details below."
              : "Create a site-level benchmark set template. This set can only contain site benchmarks (not organization-specific custom benchmarks)."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., NCAA D1 Women's Soccer"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A descriptive name for this benchmark set
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the purpose and criteria for this benchmark set..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sport Filter */}
            <FormField
              control={form.control}
              name="sport"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sport (Optional)</FormLabel>
                  <Select
                    value={field.value || "__none__"}
                    onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="All sports" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">All sports</SelectItem>
                      {sports.map((sport) => (
                        <SelectItem key={sport.code} value={sport.code}>
                          {sport.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Filter this set for a specific sport
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Level Filter */}
            <FormField
              control={form.control}
              name="level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Level (Optional)</FormLabel>
                  <Select
                    value={field.value || "__none__"}
                    onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="All levels" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">All levels</SelectItem>
                      <SelectItem value="Youth">Youth</SelectItem>
                      <SelectItem value="High School">High School</SelectItem>
                      <SelectItem value="College">College</SelectItem>
                      <SelectItem value="Professional">Professional</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Filter this set for a specific competition level
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Gender Filter */}
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender (Optional)</FormLabel>
                  <Select
                    value={field.value || "__none__"}
                    onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="All genders" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">All genders</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Not Specified">Not Specified</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Filter this set for a specific gender
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
