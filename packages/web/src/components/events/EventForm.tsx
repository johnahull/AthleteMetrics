/**
 * EventForm - Multi-step wizard for creating/editing events
 * Steps: Basic Info → Registration Settings → Metrics → Results
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Calendar, Users, Settings, Check, ArrowLeft, ArrowRight } from "lucide-react";
import { MetricsSelector, type SelectedMetric } from "./MetricsSelector";
import type { InsertEvent, EventVisibility, RegistrationMode, ResultsVisibility } from "@shared/schema";

// Form validation schema
const eventFormSchema = z.object({
  // Step 1: Basic Info
  name: z.string().min(1, "Event name is required").max(200),
  eventType: z.enum(["combine", "camp", "testing_day", "tryout", "custom"]).optional(),
  location: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  description: z.string().optional(),

  // Step 2: Registration Settings
  visibility: z.enum(["org_private", "public", "invite_only"]).default("org_private"),
  registrationMode: z.enum(["open", "request_approval", "invitation_only"]).default("open"),
  maxRegistrations: z.number().int().positive().optional().nullable(),
  registrationOpensAt: z.string().optional(),
  registrationClosesAt: z.string().optional(),

  // Step 3: Metrics - handled separately

  // Step 4: Results Visibility
  resultsVisibility: z.enum(["immediate", "after_event", "manual"]).default("after_event"),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

// Extended form data that includes selected metrics
export interface EventFormData extends EventFormValues {
  selectedMetrics: SelectedMetric[];
}

interface EventFormProps {
  initialData?: Partial<InsertEvent>;
  onSubmit: (data: EventFormData, isDraft: boolean) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  organizationId?: string;
  /** Mode: "create" for new events, "edit" for editing existing events */
  mode?: "create" | "edit";
}

const eventTypes = [
  { value: "combine", label: "Combine" },
  { value: "camp", label: "Camp" },
  { value: "testing_day", label: "Testing Day" },
  { value: "tryout", label: "Tryout" },
  { value: "custom", label: "Custom Event" },
];

const steps = [
  { id: 1, title: "Basic Info", icon: Calendar },
  { id: 2, title: "Registration", icon: Users },
  { id: 3, title: "Metrics", icon: Settings },
  { id: 4, title: "Results", icon: Check },
];

export function EventForm({ initialData, onSubmit, onCancel, isSubmitting, organizationId, mode = "create" }: EventFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedMetrics, setSelectedMetrics] = useState<SelectedMetric[]>([]);

  const isEditMode = mode === "edit";

  // Build default values with proper type handling
  const getDefaultEventType = (): EventFormValues["eventType"] => {
    const validTypes = ["combine", "camp", "testing_day", "tryout", "custom"] as const;
    if (initialData?.eventType && validTypes.includes(initialData.eventType as typeof validTypes[number])) {
      return initialData.eventType as typeof validTypes[number];
    }
    return "custom";
  };

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      name: initialData?.name || "",
      eventType: getDefaultEventType(),
      location: initialData?.location || "",
      startDate: initialData?.startDate ? new Date(initialData.startDate).toISOString().split("T")[0] : "",
      endDate: initialData?.endDate ? new Date(initialData.endDate).toISOString().split("T")[0] : "",
      description: initialData?.description || "",
      visibility: (initialData?.visibility as EventVisibility) || "org_private",
      registrationMode: (initialData?.registrationMode as RegistrationMode) || "open",
      maxRegistrations: initialData?.maxRegistrations || null,
      resultsVisibility: (initialData?.resultsVisibility as ResultsVisibility) || "after_event",
    },
  });

  const progress = (currentStep / steps.length) * 100;

  const nextStep = async () => {
    // Validate current step fields
    let isValid = true;
    if (currentStep === 1) {
      isValid = await form.trigger(["name", "startDate", "endDate"]);
    }
    if (isValid && currentStep < steps.length) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = (isDraft: boolean) => {
    form.handleSubmit((data) => {
      // Combine form data with selected metrics
      const formData: EventFormData = {
        ...data,
        selectedMetrics,
      };
      onSubmit(formData, isDraft);
    })();
  };

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="space-y-4">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between">
          {steps.map((step) => {
            const StepIcon = step.icon;
            const isActive = currentStep === step.id;
            const isComplete = currentStep > step.id;
            return (
              <div
                key={step.id}
                className={`flex items-center gap-2 ${
                  isActive ? "text-primary" : isComplete ? "text-green-600" : "text-muted-foreground"
                }`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isComplete
                      ? "bg-green-100 text-green-600"
                      : "bg-muted"
                  }`}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                </div>
                <span className="hidden sm:inline text-sm font-medium">{step.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Form {...form}>
        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Enter the basic details for your event</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Spring Combine 2025" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="eventType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {eventTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
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
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Main Gymnasium" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>Leave blank for single-day events</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what this event is about..."
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 2: Registration Settings */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Registration Settings</CardTitle>
              <CardDescription>Configure how athletes can register for this event</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="visibility"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visibility</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-2"
                      >
                        <div className="flex items-start space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="org_private" id="org_private" />
                          <div className="space-y-1">
                            <Label htmlFor="org_private" className="font-medium">
                              Organization Only
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Only members of your organization can see and register
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="public" id="public" />
                          <div className="space-y-1">
                            <Label htmlFor="public" className="font-medium">
                              Public
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Anyone with the code or link can register
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="invite_only" id="invite_only" />
                          <div className="space-y-1">
                            <Label htmlFor="invite_only" className="font-medium">
                              Invite Only
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Only athletes you invite can register
                            </p>
                          </div>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="registrationMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration Mode</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-2"
                      >
                        <div className="flex items-start space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="open" id="open" />
                          <div className="space-y-1">
                            <Label htmlFor="open" className="font-medium">
                              Open Registration
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Athletes are registered immediately
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="request_approval" id="request_approval" />
                          <div className="space-y-1">
                            <Label htmlFor="request_approval" className="font-medium">
                              Approval Required
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Admin must approve each registration
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="invitation_only" id="invitation_only" />
                          <div className="space-y-1">
                            <Label htmlFor="invitation_only" className="font-medium">
                              Invitation Only
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Only accept via invitation links
                            </p>
                          </div>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxRegistrations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maximum Capacity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Leave blank for unlimited"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormDescription>
                      Athletes beyond this limit will be waitlisted
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 3: Metrics Selection */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Event Metrics</CardTitle>
              <CardDescription>
                Select which tests will be conducted at this event. You can also configure metrics after creating the event.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsSelector
                selectedMetrics={selectedMetrics}
                onMetricsChange={setSelectedMetrics}
                organizationId={organizationId}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 4: Results Visibility */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Results Visibility</CardTitle>
              <CardDescription>
                Control when athletes can see their results and rankings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="resultsVisibility"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-2"
                      >
                        <div className="flex items-start space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="immediate" id="immediate" />
                          <div className="space-y-1">
                            <Label htmlFor="immediate" className="font-medium">
                              Immediate
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Athletes see results as they're recorded. Best for open testing days.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="after_event" id="after_event" />
                          <div className="space-y-1">
                            <Label htmlFor="after_event" className="font-medium">
                              After Event
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Results visible when event is marked complete. Best for combines.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="manual" id="manual" />
                          <div className="space-y-1">
                            <Label htmlFor="manual" className="font-medium">
                              Manual Publish
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              You control exactly when results go live. Best for tryouts.
                            </p>
                          </div>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                <p>
                  <strong>Note:</strong> Athletes can always see their own results immediately.
                  This setting controls visibility of peer comparisons and overall event rankings.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </Form>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <div>
          {currentStep > 1 ? (
            <Button variant="outline" onClick={prevStep}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {currentStep === steps.length ? (
            <>
              {!isEditMode && (
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(true)}
                  disabled={isSubmitting}
                >
                  Save as Draft
                </Button>
              )}
              <Button onClick={() => handleSubmit(false)} disabled={isSubmitting}>
                {isSubmitting
                  ? isEditMode ? "Saving..." : "Creating..."
                  : isEditMode ? "Save Changes" : "Publish Event"}
              </Button>
            </>
          ) : (
            <Button onClick={nextStep}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventForm;
