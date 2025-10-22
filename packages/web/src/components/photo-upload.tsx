import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Camera, ChevronDown, ChevronUp } from "lucide-react";
import { FileUpload } from "./photo-upload/file-upload";
import { UploadControls } from "./photo-upload/upload-controls";
import { ProgressIndicator } from "./photo-upload/progress-indicator";
import { OCRResults } from "./photo-upload/ocr-results";
import { useAuth } from "@/lib/auth";
import type {
  MeasurementImportMode,
  MEASUREMENT_MODE_DESCRIPTIONS
} from "@shared/import-types";
import {
  MEASUREMENT_MODE_DESCRIPTIONS as MEASUREMENT_MODES
} from "@shared/import-types";

interface PhotoUploadProps {
  onSuccess?: () => void;
}

interface OCRResult {
  success: boolean;
  message: string;
  results: {
    totalExtracted: number;
    successful: number;
    failed: number;
    ocrConfidence: number;
    extractedText: string;
    processedData: Array<{
      measurement: any;
      athlete: string;
      rawText: string;
      confidence: number;
    }>;
    errors: Array<{
      row: number;
      error: string;
      data: any;
    }>;
    warnings: string[];
  };
}

const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function PhotoUpload({ onSuccess }: PhotoUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [processingStage, setProcessingStage] = useState<'preprocessing' | 'extracting' | 'parsing' | 'validating' | 'saving'>('preprocessing');

  // Import mode options
  const [measurementMode, setMeasurementMode] = useState<MeasurementImportMode>('create_athletes');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { toast } = useToast();
  const { userOrganizations } = useAuth();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      // Add import options
      const options = {
        measurementMode,
        organizationId: userOrganizations?.[0]?.organizationId
      };
      formData.append('options', JSON.stringify(options));

      // Simulate processing stages for better UX
      setProcessingStage('preprocessing');
      await new Promise(resolve => setTimeout(resolve, 500));

      setProcessingStage('extracting');
      const response = await fetch('/api/import/photo', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();

      setProcessingStage('parsing');
      await new Promise(resolve => setTimeout(resolve, 300));

      setProcessingStage('validating');
      await new Promise(resolve => setTimeout(resolve, 200));

      setProcessingStage('saving');
      await new Promise(resolve => setTimeout(resolve, 200));

      return result;
    },
    onSuccess: (data) => {
      console.log('OCR Upload successful:', data);
      setOcrResult(data);
      
      if (data.results.successful > 0) {
        toast({
          title: "Photo Import Successful!",
          description: `Successfully imported ${data.results.successful} measurements with ${Math.round(data.results.ocrConfidence)}% OCR confidence`,
        });
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['measurements'] });
        queryClient.invalidateQueries({ queryKey: ['athletes'] });
        
        onSuccess?.();
      } else {
        toast({
          title: "Photo Processed",
          description: `OCR extracted ${data.results.totalExtracted} items, but no measurements could be imported. Check the results below.`,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error('Photo upload failed:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to process photo",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: `Please select a ${ALLOWED_FILE_TYPES.map(t => t.split('/')[1].toUpperCase()).join(', ')} file`,
        variant: "destructive",
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({
        title: "File Too Large",
        description: `Please select a file smaller than ${MAX_FILE_SIZE_MB}MB`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setOcrResult(null); // Clear previous results
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;
    uploadMutation.mutate(selectedFile);
  };

  const handleClear = () => {
    setSelectedFile(null);
    setPreview(null);
    setOcrResult(null);
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Photo Import (OCR)
          </CardTitle>
          <CardDescription>
            Upload photos of measurement results to automatically extract and import data using OCR (Optical Character Recognition)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
            preview={preview}
            isUploading={uploadMutation.isPending}
            allowedTypes={ALLOWED_FILE_TYPES}
            maxSizeMB={MAX_FILE_SIZE_MB}
          />

          {/* Import Options */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Quick Options</label>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                Advanced {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            {/* Quick Toggles */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={measurementMode === 'create_athletes'}
                  onChange={(e) => setMeasurementMode(e.target.checked ? 'create_athletes' : 'match_only')}
                  className="rounded border-gray-300"
                />
                <span>Create athletes if not found</span>
              </label>
              <p className="text-xs text-muted-foreground">Note: OCR currently doesn't extract team information. Athletes will be created without team assignments.</p>
            </div>

            {/* Advanced Options */}
            {showAdvanced && (
              <div className="space-y-3 pt-3 border-t">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Measurement Import Mode</label>
                  <Select value={measurementMode} onValueChange={(value) => setMeasurementMode(value as MeasurementImportMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MEASUREMENT_MODES).map(([key, { label, description }]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex flex-col">
                            <span>{label}</span>
                            <span className="text-xs text-muted-foreground">{description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <UploadControls
            onUpload={handleUpload}
            onClear={handleClear}
            hasFile={!!selectedFile}
            isUploading={uploadMutation.isPending}
            canUpload={!!selectedFile && !uploadMutation.isPending}
          />

          <ProgressIndicator
            isVisible={uploadMutation.isPending}
            stage={processingStage}
          />
        </CardContent>
      </Card>

      {ocrResult && <OCRResults result={ocrResult} />}
    </div>
  );
}