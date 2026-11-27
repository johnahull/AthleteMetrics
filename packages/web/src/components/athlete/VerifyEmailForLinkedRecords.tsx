import { useMutation } from '@tanstack/react-query';
import { MailCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

/**
 * Sends a verification email to the signed-in account's own address. Opening that link while signed in
 * restores records linked from other organizations.
 */
export function VerifyEmailForLinkedRecords() {
  const { toast } = useToast();
  const send = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/enhanced-auth/request-email-verification', {})).json(),
    onSuccess: () => toast({
      title: 'Verification email sent',
      description: 'Open the link in that email while signed in to this account.',
    }),
    onError: () => toast({ title: 'Could not send the verification email', variant: 'destructive' }),
  });

  return (
    <div className="rounded-md border p-4 text-left space-y-3">
      <p className="text-sm text-muted-foreground">
        Records from your other organizations are linked only after you verify your email while signed in.
      </p>
      <Button onClick={() => send.mutate()} disabled={send.isPending || send.isSuccess} className="w-full sm:w-auto h-auto min-h-10 whitespace-normal">
        {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" />}
        {send.isSuccess ? 'Email sent' : 'Verify your email to restore linked records'}
      </Button>
    </div>
  );
}
