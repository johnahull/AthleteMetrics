import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/footer';

// Update this date whenever the privacy policy content changes
const LAST_UPDATED = '2024-12-13';

export default function PrivacyPolicy() {
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
              <CardTitle className="text-2xl">Privacy Policy</CardTitle>
              <p className="text-sm text-muted-foreground">
                Last updated: {LAST_UPDATED}
              </p>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none space-y-6">
              <section>
                <h2 className="text-lg font-semibold mb-3">1. Introduction</h2>
                <p className="text-gray-600">
                  AthleteMetrics ("we," "our," or "us") is committed to protecting your privacy.
                  This Privacy Policy explains how we collect, use, disclose, and safeguard your
                  information when you use our athletic performance tracking platform.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">2. Information We Collect</h2>
                <h3 className="text-md font-medium mb-2">Personal Information</h3>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li>Name, email address, and contact information</li>
                  <li>Date of birth and age</li>
                  <li>School and graduation year</li>
                  <li>Team and organization associations</li>
                </ul>

                <h3 className="text-md font-medium mb-2 mt-4">Athletic Performance Data</h3>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li>Physical measurements (height, weight)</li>
                  <li>Performance metrics (speed tests, vertical jump, agility tests)</li>
                  <li>Training notes and progress data</li>
                  <li>Wellness check-in responses</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">3. How We Use Your Information</h2>
                <p className="text-gray-600 mb-2">We use the information we collect to:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li>Provide and maintain our athletic performance tracking services</li>
                  <li>Generate performance analytics and reports</li>
                  <li>Enable coaches and administrators to track athlete progress</li>
                  <li>Provide peer comparison features (with anonymized data)</li>
                  <li>Communicate with you about your account and our services</li>
                  <li>Improve and optimize our platform</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">4. Information Sharing</h2>
                <p className="text-gray-600 mb-2">We may share your information with:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li>Coaches and administrators within your organization</li>
                  <li>Service providers who assist in operating our platform</li>
                  <li>Legal authorities when required by law</li>
                </ul>
                <p className="text-gray-600 mt-2">
                  <strong>We do not sell your personal information to third parties.</strong>
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">5. Data Security</h2>
                <p className="text-gray-600">
                  We implement appropriate technical and organizational measures to protect your
                  personal information against unauthorized access, alteration, disclosure, or
                  destruction. However, no method of transmission over the Internet is 100% secure.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">6. Your Rights</h2>
                <p className="text-gray-600 mb-2">You have the right to:</p>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li>Access your personal information</li>
                  <li>Correct inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Opt out of certain data processing activities</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">7. Children's Privacy</h2>
                <p className="text-gray-600">
                  Our platform may be used by minors with parental or guardian consent.
                  If you are under 18, you confirm that you have obtained parental or guardian
                  consent to use our services. Parents and guardians may contact us to review,
                  update, or delete their child's information.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">8. Data Retention</h2>
                <p className="text-gray-600">
                  We retain your personal information for as long as your account is active or
                  as needed to provide you services. You may request deletion of your account
                  and associated data at any time.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">9. Changes to This Policy</h2>
                <p className="text-gray-600">
                  We may update this Privacy Policy from time to time. We will notify you of
                  any changes by posting the new Privacy Policy on this page and updating the
                  "Last updated" date.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">10. Contact Us</h2>
                <p className="text-gray-600">
                  If you have questions about this Privacy Policy or our data practices,
                  please contact your organization administrator or reach out to us through
                  the platform.
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
