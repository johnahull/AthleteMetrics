/**
 * Recording sheet controls of the event data-entry page: download a blank sheet (CSV / Excel / printable PDF)
 * and upload a filled one. Reading and planning the file is up to the page.
 */
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, FileSpreadsheet, Upload } from "lucide-react";

interface RecordingSheetActionsProps {
  /** Why both download and upload are off (e.g. a frozen event) */
  disabledReason?: string;
  /** Why only upload is off (e.g. unsaved edits) */
  uploadBlockedReason?: string;
  onDownload: (format: "csv" | "xlsx" | "pdf") => void;
  onUpload: (file: File) => void;
}

const REASON_ID = "recording-sheet-reason";

export function RecordingSheetActions({ disabledReason, uploadBlockedReason, onDownload, onUpload }: RecordingSheetActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const reason = disabledReason ?? uploadBlockedReason;
  const uploadDisabled = !!reason;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!!disabledReason}
              aria-describedby={disabledReason ? REASON_ID : undefined}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" aria-hidden="true" />
              Download sheet
              <ChevronDown className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onDownload("csv")}>CSV (.csv)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDownload("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDownload("pdf")}>Printable PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          disabled={uploadDisabled}
          aria-describedby={reason ? REASON_ID : undefined}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
          Upload filled sheet
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          aria-label="Recording sheet file"
          disabled={uploadDisabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // the same file can be chosen again
            if (file) onUpload(file);
          }}
        />
      </div>
      {reason && (
        <p id={REASON_ID} className="text-xs text-muted-foreground max-w-xs">
          {reason}
        </p>
      )}
    </div>
  );
}
