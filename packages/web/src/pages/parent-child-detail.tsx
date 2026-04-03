/**
 * Parent Child Detail Page (C9)
 *
 * Shows a parent read-only view of a linked child's:
 * - Profile (basic info)
 * - Measurements (table)
 * - Reports (list)
 * - Data Rights (COPPA)
 *
 * Route: /parent/children/:athleteId
 */
import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  AlertCircle,
  User,
  Trophy,
  Calendar,
  Activity,
  FileText,
  ClipboardList,
  Download,
  Trash2,
  ShieldOff,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiRequest } from '@/lib/queryClient';

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
  const { user, logout } = useAuth();
  const [exportSuccess, setExportSuccess] = useState(false);
  const [deletionSuccess, setDeletionSuccess] = useState(false);

  // Data rights mutations
  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/coppa/data-export/request', { athleteUserId: athleteId });
      return res.json();
    },
    onSuccess: () => setExportSuccess(true),
  });

  const deletionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/coppa/data-deletion/request', { athleteUserId: athleteId });
      return res.json();
    },
    onSuccess: () => setDeletionSuccess(true),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/coppa/consent/revoke', { athleteUserId: athleteId });
      return res.json();
    },
    onSuccess: () => {
      logout();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/parent/children/${athleteId}/unlink`);
      return res.json();
    },
    onSuccess: () => {
      setLocation('/parent-dashboard');
    },
  });

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

  // Under-13 children have COPPA consent records; 13-17 children do not
  const isCoppaChild = profile?.coppaStatus && ['consented', 'pending_consent', 'consent_revoked'].includes(profile.coppaStatus);

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
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          {profileLoading ? (
            <>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24 mt-1" />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-foreground">{childName}</h1>
              {(profile?.sport || (profile?.sports && profile.sports.length > 0)) && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
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
        <TabsList className="grid w-full grid-cols-4">
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
          <TabsTrigger value="data-rights" className="flex items-center gap-1">
            <ShieldOff className="h-4 w-4" />
            Data Rights
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
                    <dt className="w-28 font-medium text-muted-foreground shrink-0">Full Name</dt>
                    <dd className="text-foreground">
                      {profile.firstName} {profile.lastName}
                    </dd>
                  </div>
                  {(profile.sport || (profile.sports && profile.sports.length > 0)) && (
                    <div className="flex gap-4">
                      <dt className="w-28 font-medium text-muted-foreground shrink-0">Sport</dt>
                      <dd className="text-foreground">
                        {profile.sports ? profile.sports.join(', ') : profile.sport}
                      </dd>
                    </div>
                  )}
                  {profile.birthDate && (
                    <div className="flex gap-4">
                      <dt className="w-28 font-medium text-muted-foreground shrink-0">Date of Birth</dt>
                      <dd className="text-foreground">
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
                <p className="text-sm text-muted-foreground">No profile information available.</p>
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
                  <Activity className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No measurements recorded yet.</p>
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
                              <span className="text-muted-foreground/70 ml-1 text-xs">{m.unit}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
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
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Verified</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/70">Unverified</span>
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
                  <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No reports available yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{report.name}</p>
                          {report.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{report.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
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

        {/* Data Rights Tab */}
        <TabsContent value="data-rights">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Parental Rights</CardTitle>
              <CardDescription>
                {isCoppaChild
                  ? 'Under COPPA, you have the right to review, export, and request deletion of your child\'s data, or revoke consent at any time.'
                  : 'As a parent or guardian, you can review, export, and request deletion of your child\'s data, or unlink your account at any time.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Export */}
              {exportSuccess ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Export request submitted. You will receive an email with a download link when your child's data is ready.
                  </AlertDescription>
                </Alert>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={exportMutation.isPending}
                  onClick={() => exportMutation.mutate()}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {exportMutation.isPending ? 'Requesting...' : "Download My Child's Data"}
                </Button>
              )}
              {exportMutation.isError && (
                <p className="text-sm text-destructive">Failed to request export. Please try again.</p>
              )}

              {/* Deletion */}
              {deletionSuccess ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Deletion request submitted and is pending administrator review. You will be notified when it is processed.
                  </AlertDescription>
                </Alert>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-destructive hover:text-destructive/80 hover:bg-destructive/5"
                      disabled={deletionMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {deletionMutation.isPending ? 'Requesting...' : 'Request Data Deletion'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Request Data Deletion</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will submit a request to delete all of {childName}'s data from the platform. This action requires administrator approval and cannot be undone once processed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90"
                        onClick={() => deletionMutation.mutate()}
                      >
                        Submit Deletion Request
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {deletionMutation.isError && (
                <p className="text-sm text-destructive">Failed to request deletion. Please try again.</p>
              )}

              {/* Revoke Consent (COPPA under-13) or Unlink (13-17) */}
              {isCoppaChild ? (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-destructive hover:text-destructive/80 hover:bg-destructive/5"
                        disabled={revokeMutation.isPending}
                      >
                        <ShieldOff className="mr-2 h-4 w-4" />
                        {revokeMutation.isPending ? 'Revoking...' : 'Revoke Consent'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke Parental Consent</AlertDialogTitle>
                        <AlertDialogDescription>
                          Revoking consent will immediately restrict {childName}'s account. They will no longer be able to log in until consent is re-granted. You will be logged out after revoking.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90"
                          onClick={() => revokeMutation.mutate()}
                        >
                          Revoke Consent
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {revokeMutation.isError && (
                    <p className="text-sm text-destructive">Failed to revoke consent. Please try again.</p>
                  )}
                </>
              ) : (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-muted-foreground hover:text-foreground"
                        disabled={unlinkMutation.isPending}
                      >
                        <ShieldOff className="mr-2 h-4 w-4" />
                        {unlinkMutation.isPending ? 'Unlinking...' : 'Unlink My Account'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Unlink from {childName}</AlertDialogTitle>
                        <AlertDialogDescription>
                          Unlinking will remove your ability to monitor {childName}'s account and data. Their account will remain active and unaffected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => unlinkMutation.mutate()}>
                          Unlink
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {unlinkMutation.isError && (
                    <p className="text-sm text-destructive">Failed to unlink. Please try again.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
