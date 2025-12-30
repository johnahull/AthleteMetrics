import { EnhancedLoginForm } from "@/components/auth/enhanced-login-form";
import { Footer } from "@/components/footer";

export default function Login() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md mx-4">
          <div className="flex flex-col items-center mb-8">
            <img
              src="/logo-128.png"
              alt="AthleteMetrics logo"
              className="h-32 w-32 mb-4"
              width={128}
              height={128}
            />
          </div>
          <EnhancedLoginForm />
        </div>
      </div>
      <Footer />
    </div>
  );
}
