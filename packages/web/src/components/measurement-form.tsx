import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertMeasurementSchema, insertAthleteSchema, Gender, type InsertMeasurement, type InsertAthlete, type Team } from "@shared/schema";
import { Save } from "lucide-react";
import { useMeasurementForm, type Athlete, type ActiveTeam } from "@/hooks/use-measurement-form";
import { AthleteSelector } from "@/components/ui/athlete-selector";

// Type guards for safer runtime checking
function hasTeamsProperty(athlete: any): athlete is Athlete & { teams: Array<{ id: string; name: string }> } {
  return athlete && Array.isArray(athlete.teams);
}

function hasBirthYearProperty(athlete: any): athlete is Athlete & { birthYear: number } {
  return athlete && typeof athlete.birthYear === 'number';
}

export default function MeasurementForm() {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: athletes } = useQuery({
    queryKey: ["/api/athletes"],
  });

  const { data: teams } = useQuery({
    queryKey: ["/api/teams"],
  });

  const form = useForm<InsertMeasurement>({
    resolver: zodResolver(insertMeasurementSchema),
    defaultValues: {
      userId: "",
      date: new Date().toISOString().split('T')[0],
      metric: "FLY10_TIME",
      value: 0,
      flyInDistance: undefined,
      notes: "",
      teamId: "",
      season: "",
    },
  });

  const quickAddForm = useForm<InsertAthlete>({
    resolver: zodResolver(insertAthleteSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      birthDate: "",
      teamIds: [],
      school: "",
      gender: undefined,
    },
  });

  // Use consolidated state management hook
  const {
    selectedAthlete,
    activeTeams,
    showTeamOverride,
    isLoadingTeams,
    setSelectedAthlete,
    setShowTeamOverride,
    fetchActiveTeams,
    resetTeamState,
    cleanup
  } = useMeasurementForm(form);

  const createMeasurementMutation = useMutation({
    mutationFn: async (data: InsertMeasurement) => {
      // Backend will set submittedBy automatically based on session
      const response = await apiRequest("POST", "/api/measurements", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      toast({
        title: "Success",
        description: "Measurement added successfully",
      });
      form.reset({
        userId: "",
        date: new Date().toISOString().split('T')[0],
        metric: "FLY10_TIME",
        value: 0,
        flyInDistance: undefined,
        notes: "",
        teamId: "",
        season: "",
      });
      setSelectedAthlete(null);
      resetTeamState();
    },
    onError: (error) => {
      console.error("Measurement creation error:", error);
      toast({
        title: "Error",
        description: `Failed to add measurement: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const createAthleteMutation = useMutation({
    mutationFn: async (data: InsertAthlete) => {
      const response = await apiRequest("POST", "/api/athletes", data);
      return response.json();
    },
    onSuccess: (newAthlete) => {
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      setSelectedAthlete(newAthlete);
      form.setValue("userId", newAthlete.id);
      setShowQuickAdd(false);
      quickAddForm.reset();
      toast({
        title: "Success",
        description: "Athlete created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create athlete",
        variant: "destructive",
      });
    },
  });

  // Prepare athletes array for AthleteSelector component with proper fullName
  const athletesForSelector = Array.isArray(athletes) ? (athletes as Athlete[]).map(athlete => ({
    ...athlete,
    fullName: athlete.fullName || 'Unknown'
  })) : [];

  const metric = form.watch("metric");
  const date = form.watch("date");
  const units = metric === "VERTICAL_JUMP" ? "in" : metric === "RSI" ? "" : metric === "TOP_SPEED" ? "mph" : "s";

  // Watch for date changes and refetch active teams
  useEffect(() => {
    if (selectedAthlete && date) {
      fetchActiveTeams(selectedAthlete.id, date);
    }
  }, [date, selectedAthlete, fetchActiveTeams]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const onSubmit = (data: InsertMeasurement) => {
    if (!selectedAthlete) {
      toast({
        title: "Error",
        description: "Please select an athlete",
        variant: "destructive",
      });
      return;
    }

    // Ensure userId is set to the selected athlete
    const measurementData = {
      ...data,
      userId: selectedAthlete.id,
    };

    console.log("Submitting measurement data:", measurementData);
    createMeasurementMutation.mutate(measurementData);
  };

  const onQuickAddSubmit = (data: InsertAthlete) => {
    createAthleteMutation.mutate(data);
  };

  const clearForm = () => {
    form.reset({
      userId: "",
      date: new Date().toISOString().split('T')[0],
      metric: "FLY10_TIME",
      value: 0,
      flyInDistance: undefined,
      notes: "",
      teamId: "",
      season: "",
    });
    setSelectedAthlete(null);
    resetTeamState();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Athlete Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Athlete <span className="text-red-500">*</span>
            </label>
            <AthleteSelector
              athletes={athletesForSelector}
              selectedAthlete={selectedAthlete}
              onSelect={(athlete) => {
                // Convert AthleteSelector.Athlete to the expected hook interface
                const hookAthlete = athlete ? {
                  id: athlete.id,
                  fullName: athlete.fullName,
                  birthYear: athlete.birthYear || 0, // Provide default value for required field
                  teams: athlete.teams
                } : null;

                setSelectedAthlete(hookAthlete);
                form.setValue("userId", athlete?.id || "");
                if (athlete) {
                  // Fetch active teams for the selected athlete
                  const currentDate = form.getValues("date");
                  if (currentDate) {
                    fetchActiveTeams(athlete.id, currentDate);
                  }
                } else {
                  resetTeamState();
                }
              }}
              placeholder="Select athlete..."
              searchPlaceholder="Search athletes by name or team..."
              showTeamInfo={true}
              disabled={createMeasurementMutation.isPending}
              data-testid="input-search-athlete"
            />
            <p className="text-xs text-gray-500 mt-1">Click to browse or type to search athletes</p>
          </div>

          {/* Date */}
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Test Date <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input 
                    {...field}
                    type="date"
                    disabled={createMeasurementMutation.isPending}
                    data-testid="input-measurement-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Metric Type */}
          <FormField
            control={form.control}
            name="metric"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Metric <span className="text-red-500">*</span>
                </FormLabel>
                <Select 
                  value={field.value} 
                  onValueChange={field.onChange}
                  disabled={createMeasurementMutation.isPending}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-measurement-metric">
                      <SelectValue placeholder="Select metric..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="FLY10_TIME">10-Yard Fly Time</SelectItem>
                    <SelectItem value="VERTICAL_JUMP">Vertical Jump</SelectItem>
                    <SelectItem value="AGILITY_505">5-0-5 Agility Test</SelectItem>
                    <SelectItem value="AGILITY_5105">5-10-5 Agility Test</SelectItem>
                    <SelectItem value="T_TEST">T-Test</SelectItem>
                    <SelectItem value="DASH_40YD">40-Yard Dash</SelectItem>
                    <SelectItem value="RSI">Reactive Strength Index</SelectItem>
                    <SelectItem value="TOP_SPEED">Top Speed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Value */}
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Value <span className="text-red-500">*</span>
                </FormLabel>
                <div className="flex">
                  <FormControl>
                    <Input 
                      {...field}
                      type="number"
                      step="0.01"
                      placeholder="Enter value"
                      disabled={createMeasurementMutation.isPending}
                      className={units ? "rounded-r-none" : ""}
                      data-testid="input-measurement-value"
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      value={field.value || ''}
                    />
                  </FormControl>
                  {units && (
                    <div className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-600 text-sm">
                      {units}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">Units auto-selected based on metric</p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Fly-In Distance (only for FLY10_TIME) */}
          {metric === "FLY10_TIME" && (
            <FormField
              control={form.control}
              name="flyInDistance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fly-In Distance (Optional)</FormLabel>
                  <div className="flex">
                    <FormControl>
                      <Input 
                        {...field}
                        type="number"
                        step="0.1"
                        placeholder="Enter distance"
                        disabled={createMeasurementMutation.isPending}
                        className="rounded-r-none"
                        data-testid="input-fly-in-distance"
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <div className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-600 text-sm">
                      yd
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Distance from start of acceleration to timing gate</p>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea 
                  {...field}
                  value={field.value || ""}
                  placeholder="Optional notes about this measurement..."
                  disabled={createMeasurementMutation.isPending}
                  rows={3}
                  data-testid="textarea-measurement-notes"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Team Context */}
        {selectedAthlete && activeTeams.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Team Context</h3>
            
            {activeTeams.length === 1 && activeTeams[0] ? (
              <div className="space-y-2">
                <p className="text-sm text-blue-800">
                  Auto-assigned to: <span className="font-medium">{activeTeams[0].teamName}</span>
                  {activeTeams[0].season && <span> • {activeTeams[0].season}</span>}
                </p>
                <button
                  type="button"
                  onClick={() => setShowTeamOverride(!showTeamOverride)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  {showTeamOverride ? 'Use auto-assignment' : 'Override team selection'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-blue-800">
                  Athlete is on {activeTeams.length} teams - please select team context:
                </p>
                <FormField
                  control={form.control}
                  name="teamId"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        const selectedTeam = activeTeams?.find(t => t?.teamId === value);
                        if (selectedTeam) {
                          form.setValue("season", selectedTeam.season || "");
                        }
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select team..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeTeams.map((team) => (
                            <SelectItem key={team.teamId} value={team.teamId}>
                              {team.teamName} {team.season && `• ${team.season}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {showTeamOverride && activeTeams.length === 1 && activeTeams[0] && (
              <div className="mt-3 space-y-2">
                <FormField
                  control={form.control}
                  name="teamId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Team Override</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        const selectedTeam = activeTeams?.find(t => t?.teamId === value);
                        if (selectedTeam) {
                          form.setValue("season", selectedTeam.season || "");
                        }
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select team..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeTeams.map((team) => (
                            <SelectItem key={team.teamId} value={team.teamId}>
                              {team.teamName} {team.season && `• ${team.season}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>
        )}

        {selectedAthlete && activeTeams.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              This athlete is not currently on any active teams. The measurement will be recorded without team context.
            </p>
          </div>
        )}

        {/* Quick Add Athlete */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center space-x-2 mb-4">
            <Checkbox 
              id="quick-add-athlete" 
              checked={showQuickAdd}
              onCheckedChange={(checked) => setShowQuickAdd(checked === true)}
              data-testid="checkbox-quick-add-athlete"
            />
            <label htmlFor="quick-add-athlete" className="text-sm font-medium text-gray-700">
              Add new athlete
            </label>
          </div>

          {showQuickAdd && (
            <Card className="bg-gray-50">
              <CardContent className="p-4">
                <Form {...quickAddForm}>
                  <form onSubmit={quickAddForm.handleSubmit(onQuickAddSubmit)} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <FormField
                      control={quickAddForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              disabled={createAthleteMutation.isPending}
                              data-testid="input-quick-add-firstname"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              disabled={createAthleteMutation.isPending}
                              data-testid="input-quick-add-lastname"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="birthDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Birth Date</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              type="date"
                              disabled={createAthleteMutation.isPending}
                              data-testid="input-quick-add-birthday"
                              max={new Date().toISOString().split('T')[0]} // Prevent future dates
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="teamIds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team</FormLabel>
                          <Select 
                            value={Array.isArray(field.value) ? field.value[0] || "" : field.value || ""} 
                            onValueChange={(value) => field.onChange([value])}
                            disabled={createAthleteMutation.isPending}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-quick-add-team">
                                <SelectValue placeholder="Select team..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.isArray(teams) ? teams.filter((team: Team) => team.isArchived !== true).map((team: Team) => (
                                <SelectItem key={team.id} value={team.id}>
                                  {team.name}
                                </SelectItem>
                              )) : null}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select 
                            value={field.value || ""} 
                            onValueChange={field.onChange}
                            disabled={createAthleteMutation.isPending}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-quick-add-gender" aria-label="Select athlete gender">
                                <SelectValue placeholder="Select gender..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={Gender.MALE}>{Gender.MALE}</SelectItem>
                              <SelectItem value={Gender.FEMALE}>{Gender.FEMALE}</SelectItem>
                              <SelectItem value={Gender.NOT_SPECIFIED}>{Gender.NOT_SPECIFIED}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="md:col-span-5 flex justify-end">
                      <Button 
                        type="submit"
                        disabled={createAthleteMutation.isPending}
                        data-testid="button-quick-add-athlete"
                      >
                        {createAthleteMutation.isPending ? "Adding..." : "Add Athlete"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-3">
          <Button 
            type="button" 
            variant="outline"
            onClick={clearForm}
            disabled={createMeasurementMutation.isPending}
            data-testid="button-clear-form"
          >
            Clear Form
          </Button>
          <Button 
            type="submit" 
            disabled={createMeasurementMutation.isPending || !selectedAthlete}
            data-testid="button-save-measurement"
          >
            <Save className="h-4 w-4 mr-2" />
            {createMeasurementMutation.isPending ? "Saving..." : "Save Measurement"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
