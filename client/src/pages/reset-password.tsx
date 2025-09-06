import { useLocation } from "wouter";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPassword() {
  const [location] = useLocation();
  
  // Extract token from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Invalid Reset Link</h1>
          <p className="text-gray-600 mb-6">This password reset link is invalid or missing required information.</p>
          <a href="/forgot-password" className="text-blue-600 hover:underline">
            Request a new password reset link
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <ResetPasswordForm token={token} />
    </div>
  );
}