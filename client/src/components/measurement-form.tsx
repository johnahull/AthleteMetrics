import { useState } from "react";
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
import { insertMeasurementSchema, insertPlayerSchema, type InsertMeasurement, type InsertPlayer } from "@shared/schema";
import { Search, Save } from "lucide-react";

export default function MeasurementForm() {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: players } = useQuery({
    queryKey: ["/api/players"],
  });

  const { data: teams } = useQuery({
    queryKey: ["/api/teams"],
  });

  const form = useForm<InsertMeasurement>({
    resolver: zodResolver(insertMeasurementSchema),
    defaultValues: {
      playerId: "",
      date: new Date().toISOString().split('T')[0],
      metric: "",
      value: 0,
      flyInDistance: undefined,
      notes: "",
    },
  });

  const quickAddForm = useForm<InsertPlayer>({
    resolver: zodResolver(insertPlayerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      birthYear: new Date().getFullYear() - 15,
      teamIds: [],
      school: "",
    },
  });

  const createMeasurementMutation = useMutation({
    mutationFn: async (data: InsertMeasurement) => {
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
        playerId: "",
        date: new Date().toISOString().split('T')[0],
        metric: "",
        value: 0,
        flyInDistance: undefined,
        notes: "",
      });
      setSelectedPlayer(null);
      setSearchTerm("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add measurement",
        variant: "destructive",
      });
    },
  });

  const createPlayerMutation = useMutation({
    mutationFn: async (data: InsertPlayer) => {
      const response = await apiRequest("POST", "/api/players", data);
      return response.json();
    },
    onSuccess: (newPlayer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setSelectedPlayer(newPlayer);
      form.setValue("playerId", newPlayer.id);
      setShowQuickAdd(false);
      quickAddForm.reset();
      toast({
        title: "Success",
        description: "Player created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create player",
        variant: "destructive",
      });
    },
  });

  const filteredPlayers = (players || []).filter(player =>
    player.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.teams?.some(team => team.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const metric = form.watch("metric");
  const units = metric === "VERTICAL_JUMP" ? "in" : metric === "RSI" ? "" : "s";

  const onSubmit = (data: InsertMeasurement) => {
    if (!selectedPlayer) {
      toast({
        title: "Error",
        description: "Please select a player",
        variant: "destructive",
      });
      return;
    }

    createMeasurementMutation.mutate({
      ...data,
      playerId: selectedPlayer.id,
    });
  };

  const onQuickAddSubmit = (data: InsertPlayer) => {
    createPlayerMutation.mutate(data);
  };

  const clearForm = () => {
    form.reset({
      playerId: "",
      date: new Date().toISOString().split('T')[0],
      metric: "",
      value: 0,
      flyInDistance: undefined,
      notes: "",
    });
    setSelectedPlayer(null);
    setSearchTerm("");
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Player Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Player <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                placeholder="Search and select player..."
                value={selectedPlayer ? selectedPlayer.fullName : searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (selectedPlayer && e.target.value !== selectedPlayer.fullName) {
                    setSelectedPlayer(null);
                    form.setValue("playerId", "");
                  }
                }}
                className="pl-10"
                data-testid="input-search-player"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              
              {searchTerm && !selectedPlayer && filteredPlayers.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredPlayers.slice(0, 10).map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                      onClick={() => {
                        setSelectedPlayer(player);
                        setSearchTerm("");
                        form.setValue("playerId", player.id);
                      }}
                      data-testid={`option-player-${player.id}`}
                    >
                      <div>
                        <p className="font-medium">{player.fullName}</p>
                        <p className="text-sm text-gray-500">{player.teams.map(t => t.name).join(', ')} • {player.birthYear}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">Start typing to search by name or team</p>
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

        {/* Quick Add Player */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center space-x-2 mb-4">
            <Checkbox 
              id="quick-add-player" 
              checked={showQuickAdd}
              onCheckedChange={setShowQuickAdd}
              data-testid="checkbox-quick-add-player"
            />
            <label htmlFor="quick-add-player" className="text-sm font-medium text-gray-700">
              Add new player
            </label>
          </div>

          {showQuickAdd && (
            <Card className="bg-gray-50">
              <CardContent className="p-4">
                <Form {...quickAddForm}>
                  <form onSubmit={quickAddForm.handleSubmit(onQuickAddSubmit)} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField
                      control={quickAddForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              disabled={createPlayerMutation.isPending}
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
                              disabled={createPlayerMutation.isPending}
                              data-testid="input-quick-add-lastname"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="birthYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Birth Year</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              type="number"
                              min="2000"
                              max="2015"
                              disabled={createPlayerMutation.isPending}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              data-testid="input-quick-add-birthyear"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="teamId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team</FormLabel>
                          <Select 
                            value={field.value} 
                            onValueChange={field.onChange}
                            disabled={createPlayerMutation.isPending}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-quick-add-team">
                                <SelectValue placeholder="Select team..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {teams?.map((team) => (
                                <SelectItem key={team.id} value={team.id}>
                                  {team.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="md:col-span-4 flex justify-end">
                      <Button 
                        type="submit"
                        disabled={createPlayerMutation.isPending}
                        data-testid="button-quick-add-player"
                      >
                        {createPlayerMutation.isPending ? "Adding..." : "Add Player"}
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
            disabled={createMeasurementMutation.isPending || !selectedPlayer}
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
