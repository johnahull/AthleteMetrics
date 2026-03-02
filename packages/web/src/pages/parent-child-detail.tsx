/**
 * Parent Child Detail Page (C9)
 *
 * Shows a parent read-only view of a linked child's:
 * - Profile (basic info)
 * - Measurements (table)
 * - Reports (list)
 *
 * Route: /parent/children/:athleteId
 */
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  AlertCircle,
  User,
  Trophy,
  Calendar,
  Activity,
  FileText,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface ChildProfile {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  sport?: string;
  sports?: string[];
  birthDate?: string;
  emails?: string[];
  isMinor?: boolean;
  coppaStatus?: string;
}

interface Measurement {
  id: string;
  metricType: string;
  value: number;
  unit?: string;
  measuredAt: string;
  verifiedAt?: string | null;
}

interface Report {
  id: string;
  name: string;
  description?: string;
  reportType?: string;
  organizationId?: string;
  createdAt: string;
  updatedAt?: string;
  isPinned?: boolean;
}

function ProfileSkeletons() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

export default function ParentChildDetail() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery<ChildProfile>({
    queryKey: [`/api/parent/children/${athleteId}/profile`],
    enabled: !!user && !!athleteId,
  });

  const { data: measurements, isLoading: measurementsLoading } = useQuery<Measurement[]>({
    queryKey: [`/api/parent/children/${athleteId}/measurements`],
    enabled: !!user && !!athleteId,
  });

  const { data: reports, isLoading: reportsLoading } = useQuery<Report[]>({
    queryKey: [`/api/parent/children/${athleteId}/reports`],
    enabled: !!user && !!athleteId,
  });

  const childName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : 'Loading...';

  if (profileError) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/parent-dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to My Children
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Unable to load this athlete's information. They may no longer be linked to your account.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back nav */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation('/parent-dashboard')}
        className="-ml-2"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to My Children
      </Button>

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <User className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          {profileLoading ? (
            <>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24 mt-1" />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">{childName}</h1>
              {(profile?.sport || (profile?.sports && profile.sports.length > 0)) && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Trophy className="h-3 w-3" />
                  {profile.sports ? profile.sports.join(', ') : profile.sport}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="flex items-center gap-1">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="measurements" className="flex items-center gap-1">
            <Activity className="h-4 w-4" />
            Measurements
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Information</CardTitle>
              <CardDescription>Read-only view of your child's profile</CardDescription>
            </CardHeader>
            <CardContent>
              {profileLoading ? (
                <ProfileSkeletons />
              ) : profile ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex gap-4">
                    <dt className="w-28 font-medium text-gray-500 shrink-0">Full Name</dt>
                    <dd className="text-gray-900">
                      {profile.firstName} {profile.lastName}
                    </dd>
                  </div>
                  {(profile.sport || (profile.sports && profile.sports.length > 0)) && (
                    <div className="flex gap-4">
                      <dt className="w-28 font-medium text-gray-500 shrink-0">Sport</dt>
                      <dd className="text-gray-900">
                        {profile.sports ? profile.sports.join(', ') : profile.sport}
                      </dd>
                    </div>
                  )}
                  {profile.birthDate && (
                    <div className="flex gap-4">
                      <dt className="w-28 font-medium text-gray-500 shrink-0">Date of Birth</dt>
                      <dd className="text-gray-900">
                        {new Date(profile.birthDate).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-gray-500">No profile information available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Measurements Tab */}
        <TabsContent value="measurements">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Measurements
              </CardTitle>
              <CardDescription>Performance measurements recorded for {childName}</CardDescription>
            </CardHeader>
            <CardContent>
              {measurementsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !measurements || measurements.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No measurements recorded yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metric</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {measurements.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.metricType}</TableCell>
                          <TableCell className="text-right">
                            {m.value}
                            {m.unit && (
                              <span className="text-gray-400 ml-1 text-xs">{m.unit}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(m.measuredAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </TableCell>
                          <TableCell>
                            {m.verifiedAt ? (
                              <span className="text-xs text-green-600 font-medium">Verified</span>
                            ) : (
                              <span className="text-xs text-gray-400">Unverified</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Reports
              </CardTitle>
              <CardDescription>Performance reports shared with you for {childName}</CardDescription>
            </CardHeader>
            <CardContent>
              {reportsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !reports || reports.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No reports available yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{report.name}</p>
                          {report.description && (
                            <p className="text-xs text-gray-500 mt-0.5">{report.description}</p>
                          )}
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3 w-3" />
                            {new Date(report.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/reports/${report.id}`, '_blank')}
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
