/**
 * ProgramMetaForm
 *
 * Form fields for training program metadata:
 * name, description, sport (dropdown from site sports), durationWeeks (number).
 * Used at the top of the program builder page.
 * Integrates with React Hook Form via Controller pattern.
 */

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSports } from "@/lib/sports-api";

const programMetaSchema = z.object({
  name: z.string().min(1, "Program name is required").max(200),
  description: z.string().optional(),
  sport: z.string().max(100).optional(),
  durationWeeks: z.coerce.number().int().min(1, "Must be at least 1 week").max(52),
});

export type ProgramMetaValues = z.infer<typeof programMetaSchema>;

interface ProgramMetaFormProps {
  defaultValues?: Partial<ProgramMetaValues>;
  onSubmit: (values: ProgramMetaValues) => Promise<void>;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function ProgramMetaForm({
  defaultValues,
  onSubmit,
  isSubmitting = false,
  submitLabel = "Save Program",
}: ProgramMetaFormProps) {
  const { data: sports = [] } = useSports();
  const form = useForm<ProgramMetaValues>({
    resolver: zodResolver(programMetaSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      sport: defaultValues?.sport ?? "",
      durationWeeks: defaultValues?.durationWeeks ?? 4,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Program Name *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Off-Season Speed Phase"
                  {...field}
                  data-testid="program-name-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Program goals, focus areas, athlete level..."
                  rows={3}
                  {...field}
                  data-testid="program-description-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="sport"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sport</FormLabel>
                <Select
                  value={field.value || "__none__"}
                  onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                >
                  <FormControl>
                    <SelectTrigger data-testid="program-sport-input">
                      <SelectValue placeholder="Select a sport" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">No sport</SelectItem>
                    {sports.map((sport) => (
                      <SelectItem key={sport.code} value={sport.code}>
                        {sport.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="durationWeeks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Duration (weeks) *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={52}
                    {...field}
                    data-testid="program-duration-weeks-input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          data-testid="program-meta-form-submit"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
