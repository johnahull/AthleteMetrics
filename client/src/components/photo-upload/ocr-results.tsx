import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";

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

interface OCRResultsProps {
  result: OCRResult;
}

export function OCRResults({ result }: OCRResultsProps) {
  const [showExtractedText, setShowExtractedText] = useState(false);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceBadgeVariant = (confidence: number) => {
    if (confidence >= 80) return 'default';
    if (confidence >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {result.results.successful > 0 ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <AlertCircle className="h-5 w-5 text-yellow-500" />
          )}
          OCR Results
        </CardTitle>
        <CardDescription>
          <span className={getConfidenceColor(result.results.ocrConfidence)}>
            OCR Confidence: {Math.round(result.results.ocrConfidence)}%
          </span>
          {' | '}
          Extracted: {result.results.totalExtracted} items
          {' | '}
          Imported: {result.results.successful} measurements
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {result.results.successful}
            </div>
            <div className="text-sm text-green-600">Successfully Imported</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {result.results.failed}
            </div>
            <div className="text-sm text-red-600">Failed to Import</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className={`text-2xl font-bold ${getConfidenceColor(result.results.ocrConfidence)}`}>
              {Math.round(result.results.ocrConfidence)}%
            </div>
            <div className={`text-sm ${getConfidenceColor(result.results.ocrConfidence)}`}>
              OCR Confidence
            </div>
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
                Raw text extracted from the image with{' '}
                <span className={getConfidenceColor(result.results.ocrConfidence)}>
                  {Math.round(result.results.ocrConfidence)}% confidence
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {result.results.extractedText || 'No text extracted'}
              </pre>
            </div>
          </DialogContent>
        </Dialog>

        {/* Successfully Imported Measurements */}
        {result.results.processedData.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Successfully Imported Measurements
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {result.results.processedData.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{item.athlete}</div>
                    <div className="text-sm text-gray-600">
                      {item.measurement.metric}: {item.measurement.value}
                      {item.measurement.date && ` | Date: ${item.measurement.date}`}
                    </div>
                    {item.rawText && (
                      <div className="text-xs text-gray-500 mt-1 font-mono">
                        Source: "{item.rawText}"
                      </div>
                    )}
                  </div>
                  <Badge variant={getConfidenceBadgeVariant(item.confidence)}>
                    {Math.round(item.confidence)}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {result.results.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Import Errors ({result.results.errors.length})
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {result.results.errors.map((error, index) => (
                <Alert key={index} variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error #{error.row || index + 1}</AlertTitle>
                  <AlertDescription className="mt-2">
                    <div className="mb-2">{error.error}</div>
                    {error.data?.rawText && (
                      <div className="text-xs font-mono bg-red-100 p-2 rounded border">
                        Raw text: "{error.data.rawText}"
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {result.results.warnings.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              Warnings ({result.results.warnings.length})
            </h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {result.results.warnings.map((warning, index) => (
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

        {/* No Results Message */}
        {result.results.totalExtracted === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Data Extracted</AlertTitle>
            <AlertDescription>
              No measurement data could be extracted from this image. This could be due to:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Image is too blurry or unclear</li>
                <li>Text is too small or poorly formatted</li>
                <li>Image doesn't contain recognizable measurement data</li>
                <li>Lighting conditions are poor</li>
              </ul>
              <div className="mt-2 font-medium">
                Try uploading a clearer, higher-resolution image.
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}