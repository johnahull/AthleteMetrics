import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPassword() {
  const handleBack = () => {
    window.location.href = '/enhanced-login';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <ForgotPasswordForm onBack={handleBack} />
    </div>
  );
}