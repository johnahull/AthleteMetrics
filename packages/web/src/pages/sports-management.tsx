import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Plus, Edit, Trash2, Power, PowerOff, Users, Shield, Trophy } from "lucide-react";
import {
  useAllSports,
  useSport,
  useSportUsage,
  useCreateSport,
  useUpdateSport,
  useDeleteSport,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
} from "@/lib/sports-api";
import type { SiteSport, SitePosition, InsertSiteSport, InsertSitePosition } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSiteSportSchema, insertSitePositionSchema } from "@shared/schema";
import { z } from "zod";

// Form schemas
const sportFormSchema = z.object({
  code: z.string()
    .min(1, "Code is required")
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Must be uppercase letters, numbers, and underscores"),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
});

const positionFormSchema = z.object({
  code: z.string().min(1, "Code is required").max(20),
  name: z.string().min(1, "Name is required").max(100),
  shortName: z.string().max(10).optional(),
  description: z.string().optional(),
});

type SportFormData = z.infer<typeof sportFormSchema>;
type PositionFormData = z.infer<typeof positionFormSchema>;

export default function SportsManagementPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  // State - ALL hooks must be called unconditionally at the top (React Rules of Hooks)
  const [selectedSport, setSelectedSport] = useState<SiteSport | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<SitePosition | null>(null);
  const [sportFormOpen, setSportFormOpen] = useState(false);
  const [positionFormOpen, setPositionFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<'sport' | 'position'>('sport');
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [expandedSport, setExpandedSport] = useState<string | undefined>(undefined);
  const [editingSport, setEditingSport] = useState<SiteSport | null>(null);
  const [editingPosition, setEditingPosition] = useState<SitePosition | null>(null);
  const [positionSportCode, setPositionSportCode] = useState<string>("");

  // Queries and mutations - must be called before any conditional returns
  const { data: sports, isLoading } = useAllSports();
  const createSportMutation = useCreateSport();
  const updateSportMutation = useUpdateSport();
  const deleteSportMutation = useDeleteSport();
  const createPositionMutation = useCreatePosition();
  const updatePositionMutation = useUpdatePosition();
  const deletePositionMutation = useDeletePosition();

  // Fetch selected sport with positions when expanded
  const { data: sportDetails } = useSport(expandedSport || "");
  const { data: sportUsage } = useSportUsage(selectedSport?.code || "");

  // Sport form
  const sportForm = useForm<SportFormData>({
    resolver: zodResolver(sportFormSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      icon: "",
      color: "",
    },
  });

  // Position form
  const positionForm = useForm<PositionFormData>({
    resolver: zodResolver(positionFormSchema),
    defaultValues: {
      code: "",
      name: "",
      shortName: "",
      description: "",
    },
  });

  // Authorization check - AFTER all hooks have been called
  if (!user?.isSiteAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Only site administrators can manage sports.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handlers
  const handleSportSubmit = async (data: SportFormData) => {
    try {
      if (editingSport) {
        await updateSportMutation.mutateAsync({
          code: editingSport.code,
          data: {
            name: data.name,
            description: data.description || undefined,
            icon: data.icon || undefined,
            color: data.color || undefined,
          },
        });
        toast({
          title: "Sport updated",
          description: `${data.name} has been updated successfully.`,
        });
      } else {
        // Explicitly map fields to InsertSiteSport to avoid unsafe type assertion
        const sportData: InsertSiteSport = {
          code: data.code,
          name: data.name,
          description: data.description || undefined,
          icon: data.icon || undefined,
          color: data.color || undefined,
          isActive: true, // New sports are always active by default
        };
        await createSportMutation.mutateAsync(sportData);
        toast({
          title: "Sport created",
          description: `${data.name} has been created successfully.`,
        });
      }
      setSportFormOpen(false);
      setEditingSport(null);
      sportForm.reset();
    } catch (error) {
      toast({
        title: editingSport ? "Update failed" : "Create failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handlePositionSubmit = async (data: PositionFormData) => {
    try {
      if (editingPosition) {
        await updatePositionMutation.mutateAsync({
          id: editingPosition.id,
          data: {
            name: data.name,
            shortName: data.shortName || undefined,
            description: data.description || undefined,
          },
        });
        toast({
          title: "Position updated",
          description: `${data.name} has been updated successfully.`,
        });
      } else {
        // Explicitly map fields to avoid unsafe type assertion
        const positionData: Omit<InsertSitePosition, 'sportId'> = {
          code: data.code,
          name: data.name,
          shortName: data.shortName || undefined,
          description: data.description || undefined,
          isActive: true, // New positions are always active by default
        };
        await createPositionMutation.mutateAsync({
          sportCode: positionSportCode,
          data: positionData,
        });
        toast({
          title: "Position created",
          description: `${data.name} has been created successfully.`,
        });
      }
      setPositionFormOpen(false);
      setEditingPosition(null);
      positionForm.reset();
    } catch (error) {
      toast({
        title: editingPosition ? "Update failed" : "Create failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    try {
      if (deleteType === 'sport' && selectedSport) {
        await deleteSportMutation.mutateAsync(selectedSport.code);
        toast({
          title: "Sport deleted",
          description: `${selectedSport.name} has been deleted successfully.`,
        });
      } else if (deleteType === 'position' && selectedPosition) {
        await deletePositionMutation.mutateAsync(selectedPosition.id);
        toast({
          title: "Position deleted",
          description: `${selectedPosition.name} has been deleted successfully.`,
        });
      }
      setDeleteDialogOpen(false);
      setSelectedSport(null);
      setSelectedPosition(null);
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedSport) return;

    try {
      await updateSportMutation.mutateAsync({
        code: selectedSport.code,
        data: { isActive: !selectedSport.isActive },
      });
      toast({
        title: selectedSport.isActive ? "Sport disabled" : "Sport enabled",
        description: `${selectedSport.name} has been ${selectedSport.isActive ? 'disabled' : 'enabled'}.`,
      });
      setToggleDialogOpen(false);
      setSelectedSport(null);
    } catch (error) {
      toast({
        title: "Toggle failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const openEditSport = (sport: SiteSport) => {
    setEditingSport(sport);
    sportForm.reset({
      code: sport.code,
      name: sport.name,
      description: sport.description || "",
      icon: sport.icon || "",
      color: sport.color || "",
    });
    setSportFormOpen(true);
  };

  const openEditPosition = (position: SitePosition) => {
    setEditingPosition(position);
    positionForm.reset({
      code: position.code,
      name: position.name,
      shortName: position.shortName || "",
      description: position.description || "",
    });
    setPositionFormOpen(true);
  };

  const openAddPosition = (sportCode: string) => {
    setPositionSportCode(sportCode);
    setEditingPosition(null);
    positionForm.reset({
      code: "",
      name: "",
      shortName: "",
      description: "",
    });
    setPositionFormOpen(true);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-8 w-8" />
            Sports Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage sports and positions available across the platform
          </p>
        </div>
        <Button
          data-testid="add-sport-button"
          onClick={() => {
            setEditingSport(null);
            sportForm.reset({
              code: "",
              name: "",
              description: "",
              icon: "",
              color: "",
            });
            setSportFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Sport
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Site Sports</CardTitle>
          <CardDescription>
            Click on a sport to expand and manage its positions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading sports...</div>
          ) : !sports || sports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No sports found. Create your first sport to get started.
            </div>
          ) : (
            <Accordion
              type="single"
              collapsible
              value={expandedSport}
              onValueChange={setExpandedSport}
            >
              {sports.map((sport) => (
                <AccordionItem key={sport.code} value={sport.code} data-testid={`sport-row-${sport.code}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-4">
                        <span className="font-medium">{sport.name}</span>
                        <span className="text-sm text-muted-foreground font-mono">
                          {sport.code}
                        </span>
                        <div className="flex gap-2">
                          {sport.isSystemDefault && (
                            <Badge variant="outline">
                              <Shield className="h-3 w-3 mr-1" />
                              System
                            </Badge>
                          )}
                          {sport.isActive ? (
                            <Badge>Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4 space-y-4">
                      {/* Sport Description */}
                      {sport.description && (
                        <p className="text-sm text-muted-foreground">{sport.description}</p>
                      )}

                      {/* Sport Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`edit-sport-${sport.code}`}
                          onClick={() => openEditSport(sport)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Sport
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`toggle-sport-${sport.code}`}
                          onClick={() => {
                            setSelectedSport(sport);
                            setToggleDialogOpen(true);
                          }}
                        >
                          {sport.isActive ? (
                            <>
                              <PowerOff className="h-4 w-4 mr-2" />
                              Disable
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-2" />
                              Enable
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`delete-sport-${sport.code}`}
                          disabled={sport.isSystemDefault}
                          onClick={() => {
                            setSelectedSport(sport);
                            setDeleteType('sport');
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>

                      {/* Positions Section */}
                      <div className="border rounded-lg p-4">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="font-medium flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Positions
                          </h4>
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`add-position-${sport.code}`}
                            onClick={() => openAddPosition(sport.code)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Position
                          </Button>
                        </div>

                        {expandedSport === sport.code && sportDetails?.positions ? (
                          sportDetails.positions.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                              No positions defined for this sport.
                            </div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Code</TableHead>
                                  <TableHead>Name</TableHead>
                                  <TableHead>Short</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sportDetails.positions.map((position) => (
                                  <TableRow key={position.id} data-testid={`position-row-${position.code}`}>
                                    <TableCell className="font-mono">{position.code}</TableCell>
                                    <TableCell>{position.name}</TableCell>
                                    <TableCell>{position.shortName || '-'}</TableCell>
                                    <TableCell>
                                      <div className="flex gap-2">
                                        {position.isSystemDefault && (
                                          <Badge variant="outline">System</Badge>
                                        )}
                                        {position.isActive ? (
                                          <Badge>Active</Badge>
                                        ) : (
                                          <Badge variant="secondary">Inactive</Badge>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          data-testid={`edit-position-${position.code}`}
                                          onClick={() => openEditPosition(position)}
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          data-testid={`delete-position-${position.code}`}
                                          disabled={position.isSystemDefault}
                                          onClick={() => {
                                            setSelectedPosition(position);
                                            setDeleteType('position');
                                            setDeleteDialogOpen(true);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )
                        ) : (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            Loading positions...
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Sport Form Dialog */}
      <Dialog open={sportFormOpen} onOpenChange={(open) => {
        if (!open) {
          sportForm.reset();
          setEditingSport(null);
        }
        setSportFormOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSport ? 'Edit Sport' : 'Add New Sport'}</DialogTitle>
            <DialogDescription>
              {editingSport
                ? 'Update the sport details. Code cannot be changed.'
                : 'Create a new sport that will be available across the platform.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={sportForm.handleSubmit(handleSportSubmit)}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  data-testid="sport-code-input"
                  placeholder="BASKETBALL"
                  disabled={!!editingSport}
                  {...sportForm.register("code")}
                />
                {sportForm.formState.errors.code && (
                  <p className="text-sm text-destructive">{sportForm.formState.errors.code.message}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Unique identifier (uppercase letters, numbers, underscores)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  data-testid="sport-name-input"
                  placeholder="Basketball"
                  {...sportForm.register("name")}
                />
                {sportForm.formState.errors.name && (
                  <p className="text-sm text-destructive">{sportForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  data-testid="sport-description-input"
                  placeholder="Optional description..."
                  {...sportForm.register("description")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSportFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="save-sport-button"
                disabled={createSportMutation.isPending || updateSportMutation.isPending}
              >
                {editingSport ? 'Update Sport' : 'Create Sport'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Position Form Dialog */}
      <Dialog open={positionFormOpen} onOpenChange={(open) => {
        if (!open) {
          positionForm.reset();
          setEditingPosition(null);
          setPositionSportCode("");
        }
        setPositionFormOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPosition ? 'Edit Position' : 'Add New Position'}</DialogTitle>
            <DialogDescription>
              {editingPosition
                ? 'Update the position details. Code cannot be changed.'
                : 'Create a new position for this sport.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={positionForm.handleSubmit(handlePositionSubmit)}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="posCode">Code *</Label>
                <Input
                  id="posCode"
                  data-testid="position-code-input"
                  placeholder="PG"
                  disabled={!!editingPosition}
                  {...positionForm.register("code")}
                />
                {positionForm.formState.errors.code && (
                  <p className="text-sm text-destructive">{positionForm.formState.errors.code.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="posName">Name *</Label>
                <Input
                  id="posName"
                  data-testid="position-name-input"
                  placeholder="Point Guard"
                  {...positionForm.register("name")}
                />
                {positionForm.formState.errors.name && (
                  <p className="text-sm text-destructive">{positionForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortName">Short Name</Label>
                <Input
                  id="shortName"
                  data-testid="position-shortname-input"
                  placeholder="PG"
                  {...positionForm.register("shortName")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="posDescription">Description</Label>
                <Textarea
                  id="posDescription"
                  data-testid="position-description-input"
                  placeholder="Optional description..."
                  {...positionForm.register("description")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPositionFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="save-position-button"
                disabled={createPositionMutation.isPending || updatePositionMutation.isPending}
              >
                {editingPosition ? 'Update Position' : 'Create Position'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteType === 'sport' ? 'Sport' : 'Position'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteType === 'sport' ? (
                <>
                  Are you sure you want to delete <strong>{selectedSport?.name}</strong>?
                  <br /><br />
                  This will also delete all positions associated with this sport.
                  {sportUsage && (sportUsage.athleteCount > 0 || sportUsage.teamCount > 0) && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                      <strong>Warning:</strong> This sport is currently in use by{' '}
                      {sportUsage.athleteCount} athlete(s) and {sportUsage.teamCount} team(s).
                    </div>
                  )}
                </>
              ) : (
                <>
                  Are you sure you want to delete the position <strong>{selectedPosition?.name}</strong>?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              data-testid="confirm-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toggle Status Dialog */}
      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedSport?.isActive ? 'Disable Sport' : 'Enable Sport'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedSport?.isActive ? (
                <>
                  Disabling <strong>{selectedSport?.name}</strong> will hide it from new athlete
                  and team assignments. Existing assignments will remain unchanged.
                </>
              ) : (
                <>
                  Enabling <strong>{selectedSport?.name}</strong> will make it available for
                  new athlete and team assignments.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleStatus}
              data-testid="confirm-toggle"
            >
              {selectedSport?.isActive ? 'Disable' : 'Enable'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
