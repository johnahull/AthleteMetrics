import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { mutations } from "@/lib/api";
import { getInvitationStatusMessage } from "@/lib/invitation-helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { isUnder13 } from "@shared/coppa-utils";

/** Guarded age check — an incomplete date string must not throw mid-typing. */
function dobIsUnder13(birthDate: string | undefined): boolean {
  if (!birthDate) return false;
  try { return isUnder13(birthDate); } catch { return false; }
}

const invitationSchema = z.object({
  email: z.string().email("Invalid email format"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  birthDate: z.string().optional(),
  parentEmail: z.string().email("Invalid parent email format").optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  // COPPA: an under-13 athlete invitation cannot be sent without a parent email
  if (dobIsUnder13(data.birthDate)) {
    if (!data.parentEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentEmail"],
        message: "A parent or guardian email is required for athletes under 13 (COPPA).",
      });
    } else if (data.parentEmail === data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentEmail"],
        message: "Parent email must be different from the athlete's email.",
      });
    }
  }
});

type InvitationForm = z.infer<typeof invitationSchema>;

interface InvitationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  role?: "athlete" | "coach" | "org_admin";
  onSuccess?: () => void;
}

export function InvitationModal({
  open,
  onOpenChange,
  organizationId,
  role = "athlete",
  onSuccess
}: InvitationModalProps) {
  const { toast } = useToast();

  const form = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      birthDate: "",
      parentEmail: "",
    },
  });

  const watchedBirthDate = form.watch("birthDate");
  const showParentEmail = role === "athlete" && dobIsUnder13(watchedBirthDate);

  const invitationMutation = useMutation({
    mutationFn: async (data: InvitationForm) => {
      return mutations.createInvitation({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        birthDate: role === "athlete" && data.birthDate ? data.birthDate : undefined,
        parentEmail: showParentEmail && data.parentEmail ? data.parentEmail.trim().toLowerCase() : undefined,
        role,
        organizationId,
        teamIds: []
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations/athletes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      form.reset();
      onOpenChange(false);

      // Type narrowing: this modal creates single invitations
      if ('email' in data && 'emailSent' in data) {
        // Show different messages based on email delivery status
        const { title, description } = getInvitationStatusMessage(data.emailSent, data.email, 'created');

        toast({
          title,
          description,
          variant: "default"
        });
      } else {
        // Fallback for unexpected response type
        toast({
          title: "Success",
          description: data.message,
          variant: "default"
        });
      }
      onSuccess?.();
    },
    onError: (error: any) => {
      let userMessage = "Failed to send invitation. Please try again.";

      if (error.message?.toLowerCase().includes('csrf')) {
        userMessage = "Security token expired. Please refresh the page and try again.";
      } else if (error.message?.toLowerCase().includes('already') ||
          error.message?.toLowerCase().includes('exists')) {
        userMessage = "An invitation for this email already exists or user already registered.";
      } else if (error.message?.toLowerCase().includes('invalid email')) {
        userMessage = "Invalid email address. Please check and try again.";
      } else if (error.message?.toLowerCase().includes('permission') ||
                 error.message?.toLowerCase().includes('unauthorized')) {
        userMessage = "You don't have permission to send invitations.";
      }

      toast({
        title: "Error",
        description: userMessage,
        variant: "destructive"
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Invite {role === "athlete" ? "Athlete" : role === "coach" ? "Coach" : "Administrator"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => invitationMutation.mutate(data))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-invite-first-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-invite-last-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} data-testid="input-invite-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {role === "athlete" && (
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        max={new Date().toISOString().split("T")[0]}
                        {...field}
                        data-testid="input-invite-birth-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {showParentEmail && (
              <>
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-sm">
                    Federal law (COPPA) requires parental consent for athletes under 13.
                    A consent request will be sent to the parent or guardian when the
                    athlete accepts this invitation.
                  </AlertDescription>
                </Alert>
                <FormField
                  control={form.control}
                  name="parentEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Parent or Guardian Email <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="parent@example.com"
                          {...field}
                          data-testid="input-invite-parent-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={invitationMutation.isPending}
              data-testid="button-send-invitation"
            >
              {invitationMutation.isPending ? "Sending..." : "Send Invitation"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
