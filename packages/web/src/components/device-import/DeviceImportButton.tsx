/**
 * DeviceImportButton
 *
 * Trigger button that opens the DeviceImportDialog.
 * Only visible to coaches and admins; shows a tooltip when the event is frozen.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DeviceImportDialog } from './DeviceImportDialog';
import { useAuth } from '@/lib/auth';
import { Upload } from 'lucide-react';

interface DeviceImportButtonProps {
  organizationId: string;
  eventId?: string;
  eventType?: string;
  isFrozen?: boolean;
  /** Optional label override; defaults to "Import Device Data" */
  label?: string;
  /** Button variant */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  /** Optional additional class names */
  className?: string;
}

export function DeviceImportButton({
  organizationId,
  eventId,
  eventType,
  isFrozen = false,
  label = 'Import Device Data',
  variant = 'outline',
  className,
}: DeviceImportButtonProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Only coaches and admins may import
  const canImport =
    user?.isSiteAdmin ||
    user?.currentOrganization?.role === 'org_admin' ||
    user?.currentOrganization?.role === 'coach';

  if (!canImport) return null;

  const button = (
    <Button
      variant={variant}
      size="sm"
      className={className}
      disabled={isFrozen}
      onClick={() => {
        if (!isFrozen) setDialogOpen(true);
      }}
    >
      <Upload className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );

  return (
    <>
      {isFrozen ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Wrap in a span so the tooltip fires on disabled button */}
              <span className="inline-flex">{button}</span>
            </TooltipTrigger>
            <TooltipContent>Event is frozen</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}

      <DeviceImportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        organizationId={organizationId}
        eventId={eventId}
        eventType={eventType}
      />
    </>
  );
}
