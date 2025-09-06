import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Camera } from "lucide-react";
import { FileUpload } from "./photo-upload/file-upload";
import { UploadControls } from "./photo-upload/upload-controls";
import { ProgressIndicator } from "./photo-upload/progress-indicator";
import { OCRResults } from "./photo-upload/ocr-results";

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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      // Simulate processing stages for better UX
      setProcessingStage('preprocessing');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setProcessingStage('extracting');
      const response = await fetch('/api/import/photo', {
        method: 'POST',
        body: formData,
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
        queryClient.invalidateQueries({ queryKey: ['players'] });
        
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