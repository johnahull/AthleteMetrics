import { useState, useEffect } from "react";
import { calculatePasswordStrength, getPasswordRequirements } from "@shared/password-validation";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, X, AlertCircle } from "lucide-react";

interface PasswordStrengthMeterProps {
  password: string;
  showRequirements?: boolean;
  className?: string;
}

export function PasswordStrengthMeter({ 
  password, 
  showRequirements = true,
  className = "" 
}: PasswordStrengthMeterProps) {
  const [strength, setStrength] = useState(calculatePasswordStrength(''));

  useEffect(() => {
    setStrength(calculatePasswordStrength(password));
  }, [password]);

  const getStrengthText = () => {
    switch (strength.level) {
      case 'very-weak':
        return 'Very Weak';
      case 'weak':
        return 'Weak';
      case 'fair':
        return 'Fair';
      case 'good':
        return 'Good';
      case 'strong':
        return 'Strong';
      default:
        return '';
    }
  };

  const getProgressValue = () => {
    return (strength.score / 8) * 100;
  };

  const requirements = getPasswordRequirements();
  
  const checkRequirement = (requirement: string): boolean => {
    if (!password) return false;
    
    switch (requirement) {
      case "At least 12 characters long":
        return password.length >= 12;
      case "Contains lowercase letters (a-z)":
        return /[a-z]/.test(password);
      case "Contains uppercase letters (A-Z)":
        return /[A-Z]/.test(password);
      case "Contains numbers (0-9)":
        return /[0-9]/.test(password);
      case "Contains special characters (!@#$%^&*)":
        return /[^a-zA-Z0-9]/.test(password);
      case "Avoid common passwords and patterns":
        return !strength.feedback.some(f => 
          f.includes('common') || 
          f.includes('repeated') || 
          f.includes('sequential')
        );
      default:
        return false;
    }
  };

  if (!password) {
    return showRequirements ? (
      <div className={`space-y-2 ${className}`}>
        <div className="text-sm font-medium text-gray-700">Password Requirements:</div>
        <ul className="space-y-1">
          {requirements.map((requirement, index) => (
            <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              {requirement}
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Strength Meter */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">
            Password Strength
          </span>
          <span 
            className="text-sm font-medium"
            style={{ color: strength.color }}
          >
            {getStrengthText()}
          </span>
        </div>
        
        <div className="relative">
          <Progress 
            value={getProgressValue()} 
            className="h-2"
          />
          <div 
            className="absolute top-0 left-0 h-2 rounded-full transition-all duration-300"
            style={{ 
              width: `${getProgressValue()}%`, 
              backgroundColor: strength.color 
            }}
          />
        </div>
      </div>

      {/* Feedback */}
      {strength.feedback.length > 0 && (
        <div className="space-y-1">
          <div className="text-sm font-medium text-gray-700">Suggestions:</div>
          <ul className="space-y-1">
            {strength.feedback.map((feedback, index) => (
              <li key={index} className="flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {feedback}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Requirements Checklist */}
      {showRequirements && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Requirements:</div>
          <ul className="space-y-1">
            {requirements.map((requirement, index) => {
              const isMet = checkRequirement(requirement);
              return (
                <li key={index} className="flex items-center gap-2 text-sm">
                  {isMet ? (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                  <span className={isMet ? 'text-green-700' : 'text-gray-600'}>
                    {requirement}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}