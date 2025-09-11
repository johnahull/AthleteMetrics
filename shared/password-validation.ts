import { z } from "zod";

export const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[a-z]/, "Must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[0-9]/, "Must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Must contain at least one special character")
  .refine(password => {
    // Check against common passwords
    const commonPasswords = [
      'password123', 'admin123', '12345678', 'qwerty123',
      'password1', 'welcome123', 'letmein123', 'changeme123'
    ];
    return !commonPasswords.includes(password.toLowerCase());
  }, "Password is too common");

export interface PasswordStrength {
  score: number; // 0-8
  level: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
  feedback: string[];
  color: string;
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const feedback: string[] = [];

  // Length scoring
  if (password.length >= 16) score += 3;
  else if (password.length >= 12) score += 2;
  else if (password.length >= 8) score += 1;
  else feedback.push("Use at least 12 characters");

  // Character type scoring
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push("Add lowercase letters");

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push("Add uppercase letters");

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push("Add numbers");

  if (/[^a-zA-Z0-9]/.test(password)) score += 2;
  else feedback.push("Add special characters (!@#$%^&*)");

  // Pattern analysis
  if (!/(.)\1{2,}/.test(password)) score += 1;
  else feedback.push("Avoid repeating characters");

  // Sequential patterns
  if (!/012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(password)) {
    score += 1;
  } else {
    feedback.push("Avoid sequential characters");
  }

  // Dictionary words
  const commonWords = ['password', 'admin', 'user', 'login', 'welcome', 'athlete', 'coach', 'team'];
  if (!commonWords.some(word => password.toLowerCase().includes(word))) {
    score += 1;
  } else {
    feedback.push("Avoid common words");
  }

  const finalScore = Math.min(score, 8);
  
  let level: PasswordStrength['level'];
  let color: string;
  
  if (finalScore <= 2) {
    level = 'very-weak';
    color = '#ef4444'; // red-500
  } else if (finalScore <= 4) {
    level = 'weak';
    color = '#f97316'; // orange-500
  } else if (finalScore <= 5) {
    level = 'fair';
    color = '#eab308'; // yellow-500
  } else if (finalScore <= 6) {
    level = 'good';
    color = '#22c55e'; // green-500
  } else {
    level = 'strong';
    color = '#059669'; // emerald-600
  }

  return { 
    score: finalScore, 
    level,
    feedback: feedback.slice(0, 3), // Limit feedback to 3 items
    color
  };
}

export function getPasswordRequirements(): string[] {
  return [
    "At least 12 characters long",
    "Contains lowercase letters (a-z)",
    "Contains uppercase letters (A-Z)",
    "Contains numbers (0-9)",
    "Contains special characters (!@#$%^&*)",
    "Avoid common passwords and patterns"
  ];
}

export function validatePasswordMatch(password: string, confirmPassword: string): string | null {
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }
  return null;
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm password is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type ChangePasswordData = z.infer<typeof changePasswordSchema>;