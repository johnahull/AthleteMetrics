/**
 * ContactInfoCard Component
 *
 * Displays the athlete's contact information:
 * - Email addresses (clickable mailto links)
 * - Phone numbers (clickable tel links)
 * - School (if provided)
 *
 * Used on the Profile page to show contact details.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Phone, Building2 } from 'lucide-react';

interface ContactInfoCardProps {
  /** Email addresses */
  emails?: string[];
  /** Phone numbers */
  phones?: string[];
  /** School name */
  school?: string | null;
  /** Optional className for styling */
  className?: string;
}

export function ContactInfoCard({
  emails = [],
  phones = [],
  school,
  className,
}: ContactInfoCardProps) {
  // Don't render if no contact info
  const hasEmails = emails && emails.length > 0;
  const hasPhones = phones && phones.length > 0;
  const hasSchool = !!school;

  if (!hasEmails && !hasPhones && !hasSchool) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Contact Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* School */}
          {hasSchool && (
            <div>
              <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                <Building2 className="h-4 w-4 mr-2 text-gray-400" />
                School
              </h4>
              <p className="text-gray-900">{school}</p>
            </div>
          )}

          {/* Email Addresses */}
          {hasEmails && (
            <div>
              <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                <Mail className="h-4 w-4 mr-2 text-gray-400" />
                Email {emails.length > 1 ? 'Addresses' : 'Address'}
              </h4>
              <div className="space-y-2">
                {emails.map((email, index) => (
                  <div key={email} className="flex items-center">
                    <a
                      href={`mailto:${email}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                      rel="noopener noreferrer"
                      data-testid={`link-email-${index}`}
                    >
                      {email}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phone Numbers */}
          {hasPhones && (
            <div>
              <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                <Phone className="h-4 w-4 mr-2 text-gray-400" />
                Phone {phones.length > 1 ? 'Numbers' : 'Number'}
              </h4>
              <div className="space-y-2">
                {phones.map((phone, index) => (
                  <div key={phone} className="flex items-center">
                    <a
                      href={`tel:${phone}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                      rel="noopener noreferrer"
                      data-testid={`link-phone-${index}`}
                    >
                      {phone}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ContactInfoCard;
