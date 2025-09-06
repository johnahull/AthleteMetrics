import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Camera, Upload, FileImage, AlertCircle, CheckCircle, X, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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

export function PhotoUpload({ onSuccess }: PhotoUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [showExtractedText, setShowExtractedText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiRequest('/api/import/photo', {
        method: 'POST',
        body: formData,
      });
      
      return response as OCRResult;
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please select a JPG, PNG, WebP, or PDF file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 10MB",
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
    setShowExtractedText(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      const fakeEvent = { target: { files: [file] } } as any;
      handleFileSelect(fakeEvent);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
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
          {/* File Upload Area */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? (
              <div className="space-y-4">
                <img 
                  src={preview} 
                  alt="Preview" 
                  className="max-h-48 mx-auto rounded-lg shadow-md"
                />
                <p className="text-sm text-gray-600">{selectedFile?.name}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="rounded-full bg-blue-50 p-3">
                    <FileImage className="h-8 w-8 text-blue-500" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-medium">
                    {selectedFile ? selectedFile.name : "Drop photo here or click to browse"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Supports JPG, PNG, WebP, and PDF files up to 10MB
                  </p>
                </div>
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Upload Controls */}
          <div className="flex gap-2">
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploadMutation.isPending}
              className="flex-1"
            >
              {uploadMutation.isPending ? (
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
              onClick={handleClear}
              disabled={uploadMutation.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>

          {/* Processing Progress */}
          {uploadMutation.isPending && (
            <div className="space-y-2">
              <Progress value={undefined} className="w-full" />
              <p className="text-sm text-center text-gray-600">
                Extracting text from image and processing measurement data...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OCR Results */}
      {ocrResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {ocrResult.results.successful > 0 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              OCR Results
            </CardTitle>
            <CardDescription>
              OCR Confidence: {Math.round(ocrResult.results.ocrConfidence)}% | 
              Extracted: {ocrResult.results.totalExtracted} items | 
              Imported: {ocrResult.results.successful} measurements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {ocrResult.results.successful}
                </div>
                <div className="text-sm text-green-600">Successfully Imported</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {ocrResult.results.failed}
                </div>
                <div className="text-sm text-red-600">Failed to Import</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {Math.round(ocrResult.results.ocrConfidence)}%
                </div>
                <div className="text-sm text-blue-600">OCR Confidence</div>
              </div>
            </div>

            {/* Extracted Text Viewer */}
            <Dialog open={showExtractedText} onOpenChange={setShowExtractedText}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Eye className="h-4 w-4 mr-2" />
                  View Extracted Text
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-96">
                <DialogHeader>
                  <DialogTitle>Extracted Text from OCR</DialogTitle>
                  <DialogDescription>
                    Raw text extracted from the image with {Math.round(ocrResult.results.ocrConfidence)}% confidence
                  </DialogDescription>
                </DialogHeader>
                <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-auto">
                  <pre className="text-sm whitespace-pre-wrap">
                    {ocrResult.results.extractedText}
                  </pre>
                </div>
              </DialogContent>
            </Dialog>

            {/* Successfully Imported Measurements */}
            {ocrResult.results.processedData.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Successfully Imported Measurements
                </h4>
                <div className="space-y-2">
                  {ocrResult.results.processedData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div>
                        <div className="font-medium">{item.athlete}</div>
                        <div className="text-sm text-gray-600">
                          {item.measurement.metric}: {item.measurement.value} | 
                          Date: {item.measurement.date}
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {Math.round(item.confidence)}% confidence
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {ocrResult.results.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Import Errors
                </h4>
                <div className="space-y-2">
                  {ocrResult.results.errors.map((error, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Row {error.row}</AlertTitle>
                      <AlertDescription className="mt-2">
                        <div>{error.error}</div>
                        {error.data?.rawText && (
                          <div className="text-xs mt-1 font-mono bg-red-100 p-1 rounded">
                            Raw: {error.data.rawText}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {ocrResult.results.warnings.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  Warnings
                </h4>
                <div className="space-y-1">
                  {ocrResult.results.warnings.map((warning, index) => (
                    <Alert key={index} className="border-yellow-200 bg-yellow-50">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-800">
                        {warning}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}