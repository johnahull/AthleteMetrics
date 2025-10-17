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

const invitationSchema = z.object({
  email: z.string().email("Invalid email format"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
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
    },
  });

  const invitationMutation = useMutation({
    mutationFn: async (data: InvitationForm) => {
      const response = await fetch(`/api/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          role,
          organizationId,
          teamIds: []
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to send invitation";
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch (parseError) {
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        return response.json();
      } else {
        throw new Error("Server returned non-JSON response");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations/athletes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      form.reset();
      onOpenChange(false);
      toast({
        title: "Success",
        description: "Invitation sent successfully"
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      let userMessage = "Failed to send invitation. Please try again.";

      if (error.message?.toLowerCase().includes('already') ||
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
