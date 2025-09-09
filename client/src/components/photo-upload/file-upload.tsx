import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileImage, Upload } from "lucide-react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  preview: string | null;
  isUploading: boolean;
  allowedTypes: string[];
  maxSizeMB: number;
}

export function FileUpload({ 
  onFileSelect, 
  selectedFile, 
  preview, 
  isUploading,
  allowedTypes,
  maxSizeMB 
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  const formatAllowedTypes = () => {
    return allowedTypes
      .map(type => type.replace('image/', '').replace('application/', '').toUpperCase())
      .join(', ');
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        isUploading 
          ? 'border-gray-200 cursor-not-allowed' 
          : 'border-gray-300 cursor-pointer hover:border-gray-400'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleClick}
    >
      {preview ? (
        <div className="space-y-4">
          <img 
            src={preview} 
            alt="Preview" 
            className="max-h-48 mx-auto rounded-lg shadow-md"
          />
          <p className="text-sm text-gray-600">{selectedFile?.name}</p>
          <p className="text-xs text-gray-500">
            {selectedFile && (selectedFile.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className={`rounded-full p-3 ${
              isUploading ? 'bg-gray-50' : 'bg-blue-50'
            }`}>
              <FileImage className={`h-8 w-8 ${
                isUploading ? 'text-gray-400' : 'text-blue-500'
              }`} />
            </div>
          </div>
          <div>
            <p className={`text-lg font-medium ${
              isUploading ? 'text-gray-400' : 'text-gray-900'
            }`}>
              {selectedFile 
                ? selectedFile.name 
                : isUploading 
                  ? "Processing..." 
                  : "Drop photo here or click to browse"
              }
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Supports {formatAllowedTypes()} files up to {maxSizeMB}MB
            </p>
            {selectedFile && !preview && (
              <p className="text-xs text-gray-500 mt-1">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            )}
          </div>
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept={allowedTypes.join(',')}
        onChange={handleFileChange}
        className="hidden"
        disabled={isUploading}
      />
    </div>
  );
}