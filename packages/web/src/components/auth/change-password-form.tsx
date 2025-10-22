import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, Shield } from "lucide-react";
import { PasswordStrengthMeter } from "./password-strength-meter";

interface ChangePasswordFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ChangePasswordForm({ onSuccess, onCancel }: ChangePasswordFormProps) {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateForm = (): string => {
    if (!formData.currentPassword) return 'Current password is required';
    if (!formData.newPassword) return 'New password is required';
    if (formData.newPassword.length < 12) return 'New password must be at least 12 characters long';
    if (formData.newPassword !== formData.confirmPassword) return 'New passwords do not match';
    if (formData.currentPassword === formData.newPassword) return 'New password must be different from current password';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formError = validateForm();
    if (formError) {
      setError(formError);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        }),
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess?.();
        }, 2000);
      } else {
        setError(result.message || 'Failed to change password');
      }
    } catch (error) {
      console.error('Password change error:', error);
      setError('Failed to change password. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (error) setError(null);
  };

  const togglePasswordVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  if (success) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3 mx-auto">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Password Changed Successfully</CardTitle>
          <CardDescription>
            Your password has been updated successfully
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="text-center text-sm text-gray-600">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-green-600" />
              <span>Your account is now more secure</span>
            </div>
            <p className="text-xs">
              Make sure to use your new password when signing in next time
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Change Password</CardTitle>
        <CardDescription>
          Update your password to keep your account secure
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="currentPassword"
                type={showPasswords.current ? 'text' : 'password'}
                value={formData.currentPassword}
                onChange={handleInputChange('currentPassword')}
                className="pl-10 pr-10"
                placeholder="Enter your current password"
                disabled={isLoading}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                onClick={() => togglePasswordVisibility('current')}
                disabled={isLoading}
              >
                {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="newPassword"
                type={showPasswords.new ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={handleInputChange('newPassword')}
                className="pl-10 pr-10"
                placeholder="Enter your new password"
                disabled={isLoading}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                onClick={() => togglePasswordVisibility('new')}
                disabled={isLoading}
              >
                {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <PasswordStrengthMeter 
            password={formData.newPassword} 
            showRequirements={true}
            className="mb-4"
          />

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="confirmPassword"
                type={showPasswords.confirm ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleInputChange('confirmPassword')}
                className={`pl-10 pr-10 ${formData.newPassword && formData.confirmPassword && formData.newPassword !== formData.confirmPassword ? 'border-red-500' : ''}`}
                placeholder="Confirm your new password"
                disabled={isLoading}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                onClick={() => togglePasswordVisibility('confirm')}
                disabled={isLoading}
              >
                {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {formData.newPassword && formData.confirmPassword && formData.newPassword !== formData.confirmPassword && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Passwords do not match
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={isLoading || !formData.currentPassword || !formData.newPassword || !formData.confirmPassword || formData.newPassword !== formData.confirmPassword}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Changing...
                </>
              ) : (
                'Change Password'
              )}
            </Button>

            {onCancel && (
              <Button 
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>

        <div className="mt-4 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
          <div className="flex items-start gap-2">
            <Shield className="h-3 w-3 mt-0.5 text-gray-400" />
            <div>
              <p className="font-medium mb-1">Password Security Tips:</p>
              <ul className="space-y-0.5">
                <li>• Use a unique password you don't use elsewhere</li>
                <li>• Include a mix of letters, numbers, and symbols</li>
                <li>• Avoid personal information like names or dates</li>
                <li>• Consider using a password manager</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}