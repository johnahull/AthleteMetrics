import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/queryClient";

export interface EligibleSession {
  date: string;
  eventId: string | null;
  eventName: string | null;
  availableSplits: string[];
  hasWeight: boolean;
  profileExists: boolean;
  measurementIds: string[];
}

export interface SprintFvProfile {
  id: string;
  userId: string;
  submittedBy: string;
  organizationId: string | null;
  teamId: string | null;
  teamNameSnapshot: string | null;
  date: string;
  bodyMassKg: string;
  distanceUnit: string;
  splitTimesJson: Record<string, number>;
  sourceMeasurementIds: string[];
  weightMeasurementId: string | null;
  eventId: string | null;
  vmax: string | null;
  tau: string | null;
  f0Rel: string | null;
  v0: string | null;
  pmaxRel: string | null;
  fvSlope: string | null;
  rfPeak: string | null;
  drf: string | null;
  fitR2: string | null;
  fitResiduals: Array<{
    distance: number;
    observedTime: number;
    predictedTime: number;
    residual: number;
  }> | null;
  analysisJson: {
    classification: {
      classification: 'force-deficit' | 'velocity-deficit' | 'well-balanced';
      imbalancePercent: number;
      dominantQuality: 'force' | 'velocity' | 'balanced';
      trainingRecommendations: string[];
      explanation: string;
    };
    optimalGap: {
      optimalF0: number;
      optimalV0: number;
      optimalSlope: number;
      f0Gap: number;
      v0Gap: number;
      f0GapPercent: number;
      v0GapPercent: number;
      estimatedTimeImprovement: number;
      recommendation: string;
    };
    accelerationProfile: {
      tau: number;
      timeTo90Pct: number;
      timeTo95Pct: number;
      accelerationPhaseM: number;
      tauRating: 'explosive' | 'fast' | 'average' | 'slow';
      trainingInsights: string[];
    };
    powerProfile: {
      pmaxRel: number;
      velocityAtPmax: number;
      rfPeak: number;
      rfPeakRating: 'excellent' | 'good' | 'average' | 'poor';
      drf: number;
      drfRating: 'excellent' | 'good' | 'average' | 'poor';
      trainingInsights: string[];
    };
    deltas?: {
      f0Delta: { absolute: number; percent: number; direction: string };
      v0Delta: { absolute: number; percent: number; direction: string };
      pmaxDelta: { absolute: number; percent: number; direction: string };
      slopeDelta: { absolute: number; percent: number; direction: string };
      rfPeakDelta: { absolute: number; percent: number; direction: string };
      drfDelta: { absolute: number; percent: number; direction: string };
      overallTrend: string;
      alerts: string[];
      daysBetweenSessions: number;
    };
  } | null;
  notes: string | null;
  createdAt: string;
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return data.message || fallback;
  } catch {
    return fallback;
  }
}

export interface EligibleAthleteSummary {
  userId: string;
  eligibleSessionCount: number;
  latestDate: string;
}

// ─── Fetch Functions ────────────────────────────────────────────────────────

async function fetchEligibleSummary(orgId: string): Promise<EligibleAthleteSummary[]> {
  const response = await fetch(`/api/sprint-fv-profiles/eligible-summary/${encodeURIComponent(orgId)}`);
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to fetch eligible summary'));
  const data = await response.json();
  return data.athletes;
}

async function fetchEligibleSessions(userId: string): Promise<EligibleSession[]> {
  const response = await fetch(`/api/sprint-fv-profiles/eligible/${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to fetch eligible sessions'));
  const data = await response.json();
  return data.sessions;
}

async function fetchAthleteProfiles(userId: string): Promise<{ profiles: SprintFvProfile[]; total: number }> {
  const response = await fetch(`/api/sprint-fv-profiles/athlete/${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to fetch profiles'));
  return response.json();
}

async function fetchOrgProfiles(orgId: string): Promise<{ profiles: SprintFvProfile[]; total: number }> {
  const response = await fetch(`/api/sprint-fv-profiles/organization/${encodeURIComponent(orgId)}`);
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to fetch profiles'));
  return response.json();
}

async function fetchProfile(id: string): Promise<SprintFvProfile> {
  const response = await fetch(`/api/sprint-fv-profiles/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to fetch profile'));
  return response.json();
}

async function generateProfile(data: {
  userId: string;
  date: string;
  eventId?: string;
  bodyMassLbsOverride?: number;
  notes?: string;
}): Promise<SprintFvProfile> {
  const response = await fetch('/api/sprint-fv-profiles/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to generate profile'));
  return response.json();
}

async function deleteProfile(id: string): Promise<void> {
  const response = await fetch(`/api/sprint-fv-profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to delete profile'));
}

// ─── React Query Hooks ──────────────────────────────────────────────────────

export function useEligibleSummary(orgId: string | undefined | null) {
  return useQuery({
    queryKey: ['sprint-fv', 'eligible-summary', orgId],
    queryFn: () => fetchEligibleSummary(orgId!),
    enabled: !!orgId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

export function useEligibleSessions(userId: string | undefined) {
  return useQuery({
    queryKey: ['sprint-fv', 'eligible', userId],
    queryFn: () => fetchEligibleSessions(userId!),
    enabled: !!userId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

export function useSprintFvProfiles(userId: string | undefined) {
  return useQuery({
    queryKey: ['sprint-fv', 'profiles', userId],
    queryFn: () => fetchAthleteProfiles(userId!),
    enabled: !!userId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

export function useOrgSprintFvProfiles(orgId: string | undefined) {
  return useQuery({
    queryKey: ['sprint-fv', 'org-profiles', orgId],
    queryFn: () => fetchOrgProfiles(orgId!),
    enabled: !!orgId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

export function useSprintFvProfile(id: string | undefined) {
  return useQuery({
    queryKey: ['sprint-fv', 'profile', id],
    queryFn: () => fetchProfile(id!),
    enabled: !!id,
    staleTime: STALE_TIME.DEFAULT,
  });
}

export function useGenerateSprintFvProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: generateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-fv'] });
    },
  });
}

export function useDeleteSprintFvProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-fv'] });
    },
  });
}
