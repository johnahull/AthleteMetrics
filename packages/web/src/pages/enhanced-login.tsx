import { EnhancedLoginForm } from "@/components/auth/enhanced-login-form";
import { Footer } from "@/components/footer";

export default function EnhancedLogin() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <EnhancedLoginForm />
      </div>
      <Footer />
    </div>
  );
}