import { Link } from 'wouter';

interface FooterProps {
  className?: string;
}

export function Footer({ className = '' }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`text-center text-xs text-gray-500 py-4 ${className}`}>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Link href="/privacy" className="hover:text-gray-700 hover:underline">
          Privacy Policy
        </Link>
        <span className="text-gray-300">|</span>
        <Link href="/terms" className="hover:text-gray-700 hover:underline">
          Terms of Service
        </Link>
      </div>
      <div className="mt-2">
        &copy; {currentYear} AthleteMetrics. All rights reserved.
      </div>
    </footer>
  );
}
