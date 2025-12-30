import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/footer';

// Update this date whenever the terms of service content changes
const LAST_UPDATED = '2024-12-13';

export default function TermsOfService() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="flex-1 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Terms of Service</CardTitle>
              <p className="text-sm text-muted-foreground">
                Last updated: {LAST_UPDATED}
              </p>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none space-y-6">
              <section>
                <h2 className="text-lg font-semibold mb-3">1. Acceptance of Terms</h2>
                <p className="text-gray-600">
                  By accessing or using AthleteMetrics ("the Service"), you agree to be bound by
                  these Terms of Service ("Terms"). If you do not agree to these Terms, please do
                  not use the Service. We reserve the right to modify these Terms at any time, and
                  your continued use of the Service constitutes acceptance of any changes.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">2. Description of Service</h2>
                <p className="text-gray-600">
                  AthleteMetrics is an athletic performance tracking platform designed to help
                  athletes, coaches, and organizations monitor and analyze athletic metrics,
                  training data, and performance trends. The Service includes data entry, analytics,
                  reporting, and team management features.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">3. User Accounts and Responsibilities</h2>
                <h3 className="text-md font-medium mb-2">Account Registration</h3>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li>You must provide accurate and complete information when creating an account</li>
                  <li>You are responsible for maintaining the confidentiality of your password</li>
                  <li>You must be at least 13 years old, or have parental/guardian consent</li>
                  <li>One account per person - shared accounts are prohibited</li>
                </ul>

                <h3 className="text-md font-medium mb-2 mt-4">Account Security</h3>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li>You are solely responsible for all activities under your account</li>
                  <li>Notify us immediately of any unauthorized access or security breach</li>
                  <li>We reserve the right to suspend accounts for suspicious activity</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">4. Acceptable Use Policy</h2>
                <p className="text-gray-600 mb-2">You agree NOT to:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li>Use the Service for any illegal or unauthorized purpose</li>
                  <li>Upload false, inaccurate, or misleading data</li>
                  <li>Attempt to gain unauthorized access to other accounts or systems</li>
                  <li>Interfere with or disrupt the Service or servers</li>
                  <li>Use automated scripts or bots to access the Service</li>
                  <li>Harass, abuse, or harm other users</li>
                  <li>Violate any applicable laws or regulations</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">5. Data Ownership and Usage</h2>
                <h3 className="text-md font-medium mb-2">Your Data</h3>
                <p className="text-gray-600">
                  You retain ownership of all data you input into the Service (performance metrics,
                  personal information, etc.). By using the Service, you grant us a license to use,
                  store, and process this data solely for the purpose of providing the Service to you
                  and your organization.
                </p>

                <h3 className="text-md font-medium mb-2 mt-4">Anonymized Data</h3>
                <p className="text-gray-600">
                  We may aggregate and anonymize user data for analytics, benchmarking, and service
                  improvement purposes. This anonymized data contains no personally identifiable
                  information and cannot be linked back to individual users.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">6. Intellectual Property</h2>
                <p className="text-gray-600 mb-2">
                  The Service, including its design, code, graphics, and content, is protected by
                  copyright, trademark, and other intellectual property laws. You agree:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li>All rights, title, and interest in the Service belong to AthleteMetrics</li>
                  <li>You may not copy, modify, or reverse engineer any part of the Service</li>
                  <li>Our trademarks and logos may not be used without written permission</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">7. Disclaimers and Limitations of Liability</h2>
                <h3 className="text-md font-medium mb-2">Not Medical Advice</h3>
                <p className="text-gray-600">
                  <strong>AthleteMetrics is NOT a medical device and does NOT provide medical advice.</strong>
                  {' '}Performance data and analytics are for informational and training purposes only.
                  Always consult qualified medical professionals before making health or training decisions.
                </p>

                <h3 className="text-md font-medium mb-2 mt-4">No Warranty</h3>
                <p className="text-gray-600">
                  The Service is provided "as is" without warranties of any kind, express or implied.
                  We do not guarantee the Service will be uninterrupted, error-free, or secure.
                </p>

                <h3 className="text-md font-medium mb-2 mt-4">Limitation of Liability</h3>
                <p className="text-gray-600">
                  To the maximum extent permitted by law, AthleteMetrics shall not be liable for any
                  indirect, incidental, consequential, or punitive damages arising from your use of
                  the Service, including but not limited to loss of data, injuries, or business losses.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">8. Termination</h2>
                <p className="text-gray-600">
                  We reserve the right to suspend or terminate your account at any time for violation
                  of these Terms or for any other reason. You may also delete your account at any time
                  through your Account Settings. Upon termination, your access to the Service will end,
                  and we may delete your data in accordance with our Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">9. Minors and Parental Consent</h2>
                <p className="text-gray-600">
                  If you are under 18 years of age, you represent and warrant that you have obtained
                  parental or legal guardian consent to use the Service. Parents and guardians are
                  responsible for monitoring their child's use of the Service and may request access
                  to or deletion of their child's data at any time by contacting your organization
                  administrator.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">10. Governing Law and Dispute Resolution</h2>
                <p className="text-gray-600 mb-2">
                  These Terms are governed by the laws of the jurisdiction in which AthleteMetrics
                  operates, without regard to conflict of law principles. Any disputes arising from
                  these Terms or the Service shall be resolved through:
                </p>
                <ol className="list-decimal pl-6 text-gray-600 space-y-1">
                  <li>Good faith negotiation between the parties</li>
                  <li>Mediation, if negotiation fails</li>
                  <li>Binding arbitration as a final resort</li>
                </ol>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">11. Changes to Terms</h2>
                <p className="text-gray-600">
                  We may update these Terms from time to time. We will notify users of material changes
                  by posting the updated Terms with a new "Last updated" date. Your continued use of
                  the Service after changes constitutes acceptance of the updated Terms.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">12. Contact Information</h2>
                <p className="text-gray-600">
                  If you have questions about these Terms of Service, please contact your organization
                  administrator or reach out to us through the platform.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">13. Severability</h2>
                <p className="text-gray-600">
                  If any provision of these Terms is found to be unenforceable or invalid, that provision
                  will be limited or eliminated to the minimum extent necessary, and the remaining
                  provisions will remain in full force and effect.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">14. Entire Agreement</h2>
                <p className="text-gray-600">
                  These Terms, together with our Privacy Policy, constitute the entire agreement between
                  you and AthleteMetrics regarding the Service and supersede all prior agreements and
                  understandings.
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}
