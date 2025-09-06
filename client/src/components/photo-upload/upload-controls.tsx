import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";

interface UploadControlsProps {
  onUpload: () => void;
  onClear: () => void;
  hasFile: boolean;
  isUploading: boolean;
  canUpload: boolean;
}

export function UploadControls({
  onUpload,
  onClear,
  hasFile,
  isUploading,
  canUpload
}: UploadControlsProps) {
  return (
    <div className="flex gap-2">
      <Button
        onClick={onUpload}
        disabled={!canUpload || isUploading}
        className="flex-1"
      >
        {isUploading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
            Processing OCR...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            Extract & Import Data
          </>
        )}
      </Button>
      
      <Button 
        variant="outline" 
        onClick={onClear}
        disabled={isUploading}
      >
        <X className="h-4 w-4 mr-2" />
        Clear
      </Button>
    </div>
  );
}