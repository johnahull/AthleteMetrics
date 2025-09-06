import { Progress } from "@/components/ui/progress";

interface ProgressIndicatorProps {
  isVisible: boolean;
  stage: 'preprocessing' | 'extracting' | 'parsing' | 'validating' | 'saving';
}

const STAGE_MESSAGES = {
  preprocessing: 'Preprocessing image for better OCR accuracy...',
  extracting: 'Extracting text from image using OCR...',
  parsing: 'Parsing measurement data from extracted text...',
  validating: 'Validating measurements and athlete information...',
  saving: 'Saving measurements to database...'
};

const STAGE_PROGRESS = {
  preprocessing: 20,
  extracting: 50,
  parsing: 70,
  validating: 85,
  saving: 95
};

export function ProgressIndicator({ isVisible, stage }: ProgressIndicatorProps) {
  if (!isVisible) return null;

  return (
    <div className="space-y-2">
      <Progress 
        value={STAGE_PROGRESS[stage]} 
        className="w-full" 
      />
      <div className="flex items-center justify-between text-sm">
        <p className="text-gray-600">
          {STAGE_MESSAGES[stage]}
        </p>
        <span className="text-gray-500 font-medium">
          {STAGE_PROGRESS[stage]}%
        </span>
      </div>
    </div>
  );
}