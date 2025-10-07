# AthleteMetrics Modularization & Monetization Plan

## Executive Summary

This document outlines the strategy for making AthleteMetrics modular to support tiered pricing and premium features. The approach uses a feature flag system with subscription tiers, allowing features to be turned on/off based on an organization's subscription level.

---

## Current Architecture Analysis

### Tech Stack
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL (Neon)
- **Authentication**: Session-based with role-based access control (RBAC)
- **Architecture**: Multi-tenant (Organizations → Teams → Athletes)

### Existing Features
- Multi-tenant organization management
- Role-based access (Site Admin, Org Admin, Coach, Athlete)
- Performance measurement tracking (10+ metrics)
- Analytics & visualization (multiple chart types)
- CSV import/export
- OCR processing for photo uploads (Tesseract.js)
- User invitations & team management
- Audit logging

---

## Subscription Tier Structure

### Free Tier
**Target**: Small clubs, individual coaches, trial users

**Included Features**:
- Up to 25 athletes per organization
- Basic athlete profiles (name, age, position, contact info)
- Manual measurement entry
- Single team management
- Basic line charts only
- Limited data export (last 30 days, 100 rows max)
- 1 organization per user
- Email support (community)

**Limitations**:
- No CSV import/export
- No OCR processing
- No advanced analytics
- No historical data beyond 30 days

---

### Premium Tier ($29-49/month per organization)
**Target**: Active coaches, small-to-medium clubs

**Everything in Free, plus**:
- Up to 100 athletes per organization
- **CSV bulk import/export** (unlimited)
- **Advanced charts**: Box plots, violin plots, scatter plots, distribution analysis
- **Performance analytics**: Percentile calculations, z-scores, trend analysis
- **Historical data**: Unlimited access to all past measurements
- **AI conversational data entry**: Natural language measurement input
  - "Add measurement: John ran 4.5 seconds in 10-yard fly on March 15th"
  - 500 AI entries per month
- Multiple teams per organization
- Full data export (all time periods)
- Priority email support (24-48hr response)

**AI Usage Limits**:
- AI Data Entry: 500 requests/month

---

### Professional Tier ($99-149/month per organization)
**Target**: Large clubs, high school programs, college teams

**Everything in Premium, plus**:
- Up to 500 athletes per organization
- **OCR photo processing**: Upload performance sheets, automatic data extraction
  - 200 OCR uploads per month
- **AI report generation**: Automated performance summaries, team insights
  - "Generate performance summary for Sarah over last 6 months"
  - "Create team progress report for this season"
  - 50 reports per month
- **Coach analytics dashboard**: Team performance tracking, comparative analytics
- **Custom date ranges**: Flexible filtering and analysis periods
- **Multi-organization access**: Users can belong to multiple organizations
- **Team insights**: Advanced team-level statistics and comparisons
- Email + chat support (12-24hr response)

**AI Usage Limits**:
- AI Data Entry: 2,000 requests/month
- AI Report Generation: 50 reports/month
- OCR Processing: 200 uploads/month

---

### Enterprise Tier (Custom pricing, $299+/month)
**Target**: Large athletic organizations, universities, professional teams

**Everything in Professional, plus**:
- Unlimited athletes
- Unlimited organizations
- **AI natural language query interface**: Text-to-SQL for ad-hoc analysis
  - "Show me all forwards who improved their 40-yard dash by 0.2s this year"
  - "Which athletes on U16 team have vertical jump below 20 inches?"
  - 1,000 queries per month
- **API access**: Programmatic data access via REST API
- **Custom integrations**: Webhooks, SSO (SAML, OAuth)
- **White-labeling**: Custom branding, logo, domain
- **Advanced security**: SOC 2 compliance, custom data retention policies
- **Dedicated support**: Phone/video support, dedicated account manager
- **Custom features**: Bespoke development for specific needs
- **SLA guarantees**: 99.9% uptime

**AI Usage Limits**:
- AI Data Entry: Unlimited
- AI Report Generation: 500 reports/month
- AI Natural Language Queries: 1,000 queries/month
- OCR Processing: Unlimited

---

## Feature Flag Architecture

### Database Schema

#### New Tables

```typescript
// shared/schema.ts additions

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  tier: text("tier").notNull(), // "free", "premium", "professional", "enterprise"
  status: text("status").notNull(), // "active", "past_due", "canceled", "trialing"
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  trialEnd: timestamp("trial_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const featureUsage = pgTable("feature_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  feature: text("feature").notNull(), // "AI_DATA_ENTRY", "AI_REPORT_GENERATION", etc.
  usageCount: integer("usage_count").default(0).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  metadata: text("metadata"), // JSON for additional tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Composite index for efficient lookups
  orgFeaturePeriodIdx: index("feature_usage_org_feature_period_idx")
    .on(table.organizationId, table.feature, table.periodStart),
}));

export const aiTokenUsage = pgTable("ai_token_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  feature: text("feature").notNull(), // Which AI feature
  model: text("model").notNull(), // "gpt-4o", "claude-sonnet-4", etc.
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 6 }), // USD
  requestId: text("request_id"), // For debugging
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Shared Feature Definitions

```typescript
// shared/feature-flags.ts

export enum SubscriptionTier {
  FREE = "free",
  PREMIUM = "premium",
  PROFESSIONAL = "professional",
  ENTERPRISE = "enterprise",
}

export enum Feature {
  // Data Management
  BULK_CSV_IMPORT = "BULK_CSV_IMPORT",
  BULK_CSV_EXPORT = "BULK_CSV_EXPORT",
  UNLIMITED_EXPORT = "UNLIMITED_EXPORT",

  // Analytics
  ADVANCED_CHARTS = "ADVANCED_CHARTS",
  COACH_ANALYTICS = "COACH_ANALYTICS",
  TEAM_INSIGHTS = "TEAM_INSIGHTS",
  CUSTOM_DATE_RANGES = "CUSTOM_DATE_RANGES",

  // AI Features
  AI_DATA_ENTRY = "AI_DATA_ENTRY",
  AI_REPORT_GENERATION = "AI_REPORT_GENERATION",
  AI_NATURAL_LANGUAGE_QUERY = "AI_NATURAL_LANGUAGE_QUERY",
  OCR_PROCESSING = "OCR_PROCESSING",

  // Advanced Features
  API_ACCESS = "API_ACCESS",
  WEBHOOKS = "WEBHOOKS",
  SSO = "SSO",
  WHITE_LABELING = "WHITE_LABELING",
  CUSTOM_BRANDING = "CUSTOM_BRANDING",

  // Scale
  MULTI_ORGANIZATION = "MULTI_ORGANIZATION",
  UNLIMITED_ATHLETES = "UNLIMITED_ATHLETES",
  UNLIMITED_TEAMS = "UNLIMITED_TEAMS",
}

export const TIER_FEATURES: Record<SubscriptionTier, Feature[]> = {
  [SubscriptionTier.FREE]: [],

  [SubscriptionTier.PREMIUM]: [
    Feature.BULK_CSV_IMPORT,
    Feature.BULK_CSV_EXPORT,
    Feature.ADVANCED_CHARTS,
    Feature.UNLIMITED_EXPORT,
    Feature.CUSTOM_DATE_RANGES,
    Feature.AI_DATA_ENTRY,
  ],

  [SubscriptionTier.PROFESSIONAL]: [
    // All Premium features
    ...TIER_FEATURES[SubscriptionTier.PREMIUM],
    // Plus Professional features
    Feature.OCR_PROCESSING,
    Feature.AI_REPORT_GENERATION,
    Feature.COACH_ANALYTICS,
    Feature.TEAM_INSIGHTS,
    Feature.MULTI_ORGANIZATION,
  ],

  [SubscriptionTier.ENTERPRISE]: [
    // All Professional features
    ...TIER_FEATURES[SubscriptionTier.PROFESSIONAL],
    // Plus Enterprise features
    Feature.AI_NATURAL_LANGUAGE_QUERY,
    Feature.API_ACCESS,
    Feature.WEBHOOKS,
    Feature.SSO,
    Feature.WHITE_LABELING,
    Feature.CUSTOM_BRANDING,
    Feature.UNLIMITED_ATHLETES,
    Feature.UNLIMITED_TEAMS,
  ],
};

export const TIER_LIMITS = {
  [SubscriptionTier.FREE]: {
    maxAthletes: 25,
    maxTeams: 1,
    maxOrganizations: 1,
    dataRetentionDays: 30,
    exportRowLimit: 100,
  },
  [SubscriptionTier.PREMIUM]: {
    maxAthletes: 100,
    maxTeams: 10,
    maxOrganizations: 1,
    dataRetentionDays: null, // unlimited
    exportRowLimit: null, // unlimited
    aiDataEntry: 500,
  },
  [SubscriptionTier.PROFESSIONAL]: {
    maxAthletes: 500,
    maxTeams: 50,
    maxOrganizations: 3,
    dataRetentionDays: null,
    exportRowLimit: null,
    aiDataEntry: 2000,
    aiReportGeneration: 50,
    ocrProcessing: 200,
  },
  [SubscriptionTier.ENTERPRISE]: {
    maxAthletes: null, // unlimited
    maxTeams: null,
    maxOrganizations: null,
    dataRetentionDays: null,
    exportRowLimit: null,
    aiDataEntry: null, // unlimited
    aiReportGeneration: 500,
    aiNaturalLanguageQuery: 1000,
    ocrProcessing: null, // unlimited
  },
};

// Helper function to check if a tier has a feature
export function tierHasFeature(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_FEATURES[tier].includes(feature);
}

// Helper to get usage limit for a feature
export function getFeatureLimit(tier: SubscriptionTier, feature: Feature): number | null {
  const limits = TIER_LIMITS[tier];

  switch (feature) {
    case Feature.AI_DATA_ENTRY:
      return limits.aiDataEntry ?? null;
    case Feature.AI_REPORT_GENERATION:
      return limits.aiReportGeneration ?? null;
    case Feature.AI_NATURAL_LANGUAGE_QUERY:
      return limits.aiNaturalLanguageQuery ?? null;
    case Feature.OCR_PROCESSING:
      return limits.ocrProcessing ?? null;
    default:
      return null; // No usage limit
  }
}
```

### Subscription Types

```typescript
// shared/subscription-types.ts

export interface Subscription {
  id: string;
  organizationId: string;
  tier: SubscriptionTier;
  status: "active" | "past_due" | "canceled" | "trialing";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureUsage {
  id: string;
  organizationId: string;
  feature: string;
  usageCount: number;
  periodStart: Date;
  periodEnd: Date;
  metadata?: string;
}

export interface FeatureCheckResult {
  hasAccess: boolean;
  reason?: string;
  upgradeRequired?: SubscriptionTier;
  usageRemaining?: number;
  usageLimit?: number;
}
```

---

## Backend Implementation

### Subscription Service

```typescript
// server/services/subscription-service.ts

import { db } from "../db";
import { subscriptions, organizations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { Feature, SubscriptionTier, tierHasFeature, getFeatureLimit } from "@shared/feature-flags";
import type { FeatureCheckResult } from "@shared/subscription-types";

export class SubscriptionService {
  /**
   * Get organization's current subscription
   */
  async getSubscription(organizationId: string) {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);

    return subscription;
  }

  /**
   * Check if organization has access to a feature
   */
  async checkFeatureAccess(
    organizationId: string,
    feature: Feature
  ): Promise<FeatureCheckResult> {
    const subscription = await this.getSubscription(organizationId);

    // If no subscription, default to FREE tier
    const tier = subscription?.tier as SubscriptionTier ?? SubscriptionTier.FREE;

    // Check if subscription is active
    if (subscription && subscription.status !== "active" && subscription.status !== "trialing") {
      return {
        hasAccess: false,
        reason: "Subscription is not active",
        upgradeRequired: SubscriptionTier.PREMIUM,
      };
    }

    // Check if tier includes feature
    if (!tierHasFeature(tier, feature)) {
      return {
        hasAccess: false,
        reason: `Feature not available in ${tier} tier`,
        upgradeRequired: this.getRequiredTierForFeature(feature),
      };
    }

    // Check usage limits for metered features
    const usageLimit = getFeatureLimit(tier, feature);
    if (usageLimit !== null) {
      const usage = await this.getFeatureUsage(organizationId, feature);

      if (usage >= usageLimit) {
        return {
          hasAccess: false,
          reason: "Usage limit reached for this billing period",
          usageRemaining: 0,
          usageLimit,
        };
      }

      return {
        hasAccess: true,
        usageRemaining: usageLimit - usage,
        usageLimit,
      };
    }

    return {
      hasAccess: true,
    };
  }

  /**
   * Track feature usage (for metered features)
   */
  async trackFeatureUsage(organizationId: string, feature: Feature, count: number = 1) {
    // Implementation depends on your usage tracking needs
    // Could use featureUsage table or Redis for real-time tracking
  }

  /**
   * Get current feature usage for the billing period
   */
  async getFeatureUsage(organizationId: string, feature: Feature): Promise<number> {
    // Query featureUsage table for current period
    // Return usage count
    return 0; // Placeholder
  }

  /**
   * Get required tier for a feature
   */
  private getRequiredTierForFeature(feature: Feature): SubscriptionTier {
    // Find the lowest tier that includes this feature
    const tiers = [
      SubscriptionTier.PREMIUM,
      SubscriptionTier.PROFESSIONAL,
      SubscriptionTier.ENTERPRISE,
    ];

    for (const tier of tiers) {
      if (tierHasFeature(tier, feature)) {
        return tier;
      }
    }

    return SubscriptionTier.PREMIUM;
  }
}

export const subscriptionService = new SubscriptionService();
```

### Feature Middleware

```typescript
// server/middleware/features.ts

import { Request, Response, NextFunction } from "express";
import { subscriptionService } from "../services/subscription-service";
import { Feature } from "@shared/feature-flags";

/**
 * Middleware to require a specific feature
 */
export function requireFeature(feature: Feature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const organizationId = req.query.organizationId as string ||
                          req.body.organizationId ||
                          req.session.user?.primaryOrganizationId;

    if (!organizationId) {
      return res.status(400).json({
        message: "Organization context required",
      });
    }

    const result = await subscriptionService.checkFeatureAccess(organizationId, feature);

    if (!result.hasAccess) {
      return res.status(402).json({
        message: result.reason || "Feature not available",
        feature,
        upgradeRequired: result.upgradeRequired,
        featureCheckResult: result,
      });
    }

    // Attach feature check result to request for usage tracking
    req.featureAccess = result;
    next();
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      featureAccess?: import("@shared/subscription-types").FeatureCheckResult;
    }
  }
}
```

### Protected Routes

```typescript
// server/routes/import-routes.ts (example)

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireFeature } from "../middleware/features";
import { Feature } from "@shared/feature-flags";

const router = Router();

// CSV import requires BULK_CSV_IMPORT feature
router.post(
  "/api/import/csv",
  requireAuth,
  requireFeature(Feature.BULK_CSV_IMPORT),
  async (req, res) => {
    // Handle CSV import
    // Track usage: await subscriptionService.trackFeatureUsage(orgId, Feature.BULK_CSV_IMPORT);
  }
);

// OCR processing requires OCR_PROCESSING feature
router.post(
  "/api/ocr/process",
  requireAuth,
  requireFeature(Feature.OCR_PROCESSING),
  async (req, res) => {
    // Handle OCR processing
    // Track usage: await subscriptionService.trackFeatureUsage(orgId, Feature.OCR_PROCESSING);
  }
);

export default router;
```

---

## Frontend Implementation

### Feature Context

```typescript
// client/src/lib/features.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./auth";
import { Feature, SubscriptionTier } from "@shared/feature-flags";
import type { FeatureCheckResult, Subscription } from "@shared/subscription-types";

interface FeaturesContextType {
  subscription: Subscription | null;
  tier: SubscriptionTier;
  hasFeature: (feature: Feature) => boolean;
  checkFeature: (feature: Feature) => FeatureCheckResult | null;
  isLoading: boolean;
  refreshSubscription: () => Promise<void>;
}

const FeaturesContext = createContext<FeaturesContextType | undefined>(undefined);

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const { user, organizationContext } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [featureAccess, setFeatureAccess] = useState<Record<string, FeatureCheckResult>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user && organizationContext) {
      fetchSubscription();
    }
  }, [user, organizationContext]);

  const fetchSubscription = async () => {
    if (!organizationContext) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/subscriptions?organizationId=${organizationContext}`,
        { credentials: "include" }
      );

      if (response.ok) {
        const data = await response.json();
        setSubscription(data.subscription);
        setFeatureAccess(data.featureAccess || {});
      }
    } catch (error) {
      console.error("Failed to fetch subscription:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const hasFeature = (feature: Feature): boolean => {
    const result = featureAccess[feature];
    return result?.hasAccess ?? false;
  };

  const checkFeature = (feature: Feature): FeatureCheckResult | null => {
    return featureAccess[feature] || null;
  };

  const tier = (subscription?.tier as SubscriptionTier) ?? SubscriptionTier.FREE;

  return (
    <FeaturesContext.Provider
      value={{
        subscription,
        tier,
        hasFeature,
        checkFeature,
        isLoading,
        refreshSubscription: fetchSubscription,
      }}
    >
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures() {
  const context = useContext(FeaturesContext);
  if (!context) {
    throw new Error("useFeatures must be used within FeaturesProvider");
  }
  return context;
}
```

### Feature Gate Component

```typescript
// client/src/components/FeatureGate.tsx

import React from "react";
import { useFeatures } from "@/lib/features";
import { Feature, SubscriptionTier } from "@shared/feature-flags";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, ArrowUpRight } from "lucide-react";
import { useLocation } from "wouter";

interface FeatureGateProps {
  feature: Feature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgradePrompt?: boolean;
}

export function FeatureGate({
  feature,
  children,
  fallback,
  showUpgradePrompt = true,
}: FeatureGateProps) {
  const { hasFeature, checkFeature } = useFeatures();
  const [, setLocation] = useLocation();

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgradePrompt) {
    return null;
  }

  const featureCheck = checkFeature(feature);

  return (
    <Card className="border-2 border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Premium Feature</CardTitle>
        </div>
        <CardDescription>
          {featureCheck?.reason || "This feature requires a subscription upgrade."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={() => setLocation("/billing")}
          className="w-full"
        >
          Upgrade to {featureCheck?.upgradeRequired || SubscriptionTier.PREMIUM}
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Hook-based feature gate for conditional rendering
 */
export function useFeatureGate(feature: Feature): boolean {
  const { hasFeature } = useFeatures();
  return hasFeature(feature);
}
```

### Usage in Components

```typescript
// client/src/pages/import-export.tsx

import { FeatureGate } from "@/components/FeatureGate";
import { Feature } from "@shared/feature-flags";

export default function ImportExport() {
  return (
    <div className="p-6">
      <h1>Import & Export</h1>

      {/* CSV Import - gated */}
      <FeatureGate feature={Feature.BULK_CSV_IMPORT}>
        <Card>
          <CardHeader>
            <CardTitle>CSV Import</CardTitle>
          </CardHeader>
          <CardContent>
            {/* CSV import UI */}
          </CardContent>
        </Card>
      </FeatureGate>

      {/* OCR Upload - gated */}
      <FeatureGate feature={Feature.OCR_PROCESSING}>
        <PhotoUpload />
      </FeatureGate>
    </div>
  );
}
```

```typescript
// client/src/components/charts/AdvancedCharts.tsx

import { useFeatureGate } from "@/components/FeatureGate";
import { Feature } from "@shared/feature-flags";

export function AdvancedAnalytics() {
  const hasAdvancedCharts = useFeatureGate(Feature.ADVANCED_CHARTS);

  return (
    <div>
      {/* Basic line chart - always available */}
      <LineChart data={data} />

      {/* Advanced charts - only if feature enabled */}
      {hasAdvancedCharts && (
        <>
          <BoxPlotChart data={data} />
          <ViolinChart data={data} />
          <ScatterPlot data={data} />
        </>
      )}
    </div>
  );
}
```

---

## AI Feature Integration

### Where AI Features Go in the UI

#### #8 - AI Conversational Data Entry

**Location 1: Measurement Entry Form** (`client/src/components/athlete-measurement-form.tsx`)

```typescript
// Add "Quick Entry" mode with AI extraction

<Tabs defaultValue="manual">
  <TabsList>
    <TabsTrigger value="manual">Manual Entry</TabsTrigger>
    <TabsTrigger value="ai">
      <FeatureGate feature={Feature.AI_DATA_ENTRY} showUpgradePrompt={false}>
        Quick Entry (AI)
      </FeatureGate>
    </TabsTrigger>
  </TabsList>

  <TabsContent value="manual">
    {/* Existing form */}
  </TabsContent>

  <TabsContent value="ai">
    <FeatureGate feature={Feature.AI_DATA_ENTRY}>
      <AIDataEntryPanel />
    </FeatureGate>
  </TabsContent>
</Tabs>
```

**Location 2: Data Entry Page** (`client/src/pages/data-entry.tsx`)

```typescript
// Add AI assistant sidebar for bulk entry

<div className="flex gap-4">
  <div className="flex-1">
    {/* Existing data entry UI */}
  </div>

  <FeatureGate feature={Feature.AI_DATA_ENTRY}>
    <div className="w-96">
      <AIDataEntryAssistant />
    </div>
  </FeatureGate>
</div>
```

#### #4 - AI Report Generation

**Location 1: Analytics Pages** (`client/src/pages/CoachAnalytics.tsx`, `client/src/pages/AthleteAnalytics.tsx`)

```typescript
// Add "Generate Report" button to toolbar

<div className="flex justify-between items-center">
  <h1>Analytics</h1>

  <FeatureGate feature={Feature.AI_REPORT_GENERATION}>
    <Button onClick={() => setShowReportDialog(true)}>
      <FileText className="mr-2" />
      Generate AI Report
    </Button>
  </FeatureGate>
</div>

<AIReportDialog
  open={showReportDialog}
  onClose={() => setShowReportDialog(false)}
/>
```

**Location 2: Athlete Profile** (`client/src/pages/athlete-profile.tsx`)

```typescript
// Add AI summary section

<FeatureGate feature={Feature.AI_REPORT_GENERATION}>
  <Card>
    <CardHeader>
      <CardTitle>AI Performance Summary</CardTitle>
    </CardHeader>
    <CardContent>
      <AIPerformanceSummary athleteId={athleteId} />
    </CardContent>
  </Card>
</FeatureGate>
```

#### #3 - AI Natural Language Query

**Location 1: New "AI Insights" Page** (`client/src/pages/ai-insights.tsx`)

```typescript
// New dedicated page for NL queries

export default function AIInsights() {
  return (
    <FeatureGate feature={Feature.AI_NATURAL_LANGUAGE_QUERY}>
      <div className="p-6 max-w-6xl mx-auto">
        <h1>AI Insights</h1>
        <AIQueryInterface />
      </div>
    </FeatureGate>
  );
}
```

**Location 2: Global Command Palette**

```typescript
// Add to navigation menu or Cmd+K palette

<CommandDialog>
  <CommandInput placeholder="Search or ask AI..." />
  <CommandList>
    <CommandGroup heading="AI Queries">
      <FeatureGate feature={Feature.AI_NATURAL_LANGUAGE_QUERY} showUpgradePrompt={false}>
        <CommandItem>Ask AI about your data...</CommandItem>
      </FeatureGate>
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

### Backend AI Routes

```typescript
// server/routes/ai-routes.ts

import { Router } from "express";
import { requireAuth, requireFeature } from "../middleware";
import { Feature } from "@shared/feature-flags";
import { subscriptionService } from "../services/subscription-service";

const router = Router();

// AI Data Entry
router.post(
  "/api/ai/data-entry",
  requireAuth,
  requireFeature(Feature.AI_DATA_ENTRY),
  async (req, res) => {
    const { text, organizationId } = req.body;

    try {
      // Call LLM API (Claude, GPT-4, etc.)
      const extracted = await extractMeasurementFromText(text);

      // Track usage
      await subscriptionService.trackFeatureUsage(
        organizationId,
        Feature.AI_DATA_ENTRY
      );

      res.json(extracted);
    } catch (error) {
      res.status(500).json({ message: "AI extraction failed" });
    }
  }
);

// AI Report Generation
router.post(
  "/api/ai/generate-report",
  requireAuth,
  requireFeature(Feature.AI_REPORT_GENERATION),
  async (req, res) => {
    const { athleteId, timeframe, metrics, organizationId } = req.body;

    try {
      // Fetch data and generate report
      const report = await generatePerformanceReport({
        athleteId,
        timeframe,
        metrics,
      });

      // Track usage
      await subscriptionService.trackFeatureUsage(
        organizationId,
        Feature.AI_REPORT_GENERATION
      );

      res.json({ report });
    } catch (error) {
      res.status(500).json({ message: "Report generation failed" });
    }
  }
);

// AI Natural Language Query
router.post(
  "/api/ai/query",
  requireAuth,
  requireFeature(Feature.AI_NATURAL_LANGUAGE_QUERY),
  async (req, res) => {
    const { query, organizationId } = req.body;

    try {
      // Convert text to SQL (with safety checks!)
      const results = await executeNaturalLanguageQuery(query, organizationId);

      // Track usage
      await subscriptionService.trackFeatureUsage(
        organizationId,
        Feature.AI_NATURAL_LANGUAGE_QUERY
      );

      res.json({ results });
    } catch (error) {
      res.status(500).json({ message: "Query failed" });
    }
  }
);

export default router;
```

---

## Migration Strategy

### Phase 1: Infrastructure (Week 1-2)
1. Add `subscriptions` and `featureUsage` tables to schema
2. Run database migration: `npm run db:push`
3. Create `SubscriptionService` and feature middleware
4. Add feature flag definitions to `shared/`

### Phase 2: Backend Gating (Week 2-3)
1. Protect existing routes with `requireFeature()` middleware
2. Add subscription management endpoints
3. Implement usage tracking for metered features
4. Test feature access control

### Phase 3: Frontend Integration (Week 3-4)
1. Create `FeaturesProvider` and `FeatureGate` components
2. Wrap premium features with `<FeatureGate>`
3. Add upgrade prompts and billing UI
4. Test feature visibility based on tier

### Phase 4: Billing Integration (Week 4-5)
1. Integrate Stripe for subscription management
2. Handle webhook events (subscription created, updated, canceled)
3. Implement trial periods and grace periods
4. Add billing portal for customers

### Phase 5: Grandfathering & Launch (Week 5-6)
1. Set all existing organizations to PREMIUM tier (grandfather them)
2. New signups default to FREE tier with trial
3. Enable upgrade flows
4. Launch pricing page

### Phase 6: AI Features (Week 6-8)
1. Implement AI data entry endpoint
2. Implement AI report generation
3. Implement AI natural language query (with safety measures)
4. Add AI feature UI components

---

## Billing Integration (Stripe)

### Webhook Handler

```typescript
// server/routes/billing-routes.ts

import Stripe from "stripe";
import { Router } from "express";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const router = Router();

router.post("/api/webhooks/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdate(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionCanceled(event.data.object);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  // Update subscription in database
  // Update tier and status
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  // Mark subscription as canceled
  // Downgrade to FREE tier at period end
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Send notification to organization admin
  // Mark subscription as past_due
}

export default router;
```

---

## Cost Control & Monitoring

### Token Budget Tracking

```typescript
// server/services/ai-budget-service.ts

export class AIBudgetService {
  /**
   * Track AI token usage and cost
   */
  async trackTokenUsage(params: {
    organizationId: string;
    feature: Feature;
    model: string;
    promptTokens: number;
    completionTokens: number;
    requestId?: string;
  }) {
    const totalTokens = params.promptTokens + params.completionTokens;
    const estimatedCost = this.calculateCost(
      params.model,
      params.promptTokens,
      params.completionTokens
    );

    await db.insert(aiTokenUsage).values({
      organizationId: params.organizationId,
      feature: params.feature,
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens,
      estimatedCost,
      requestId: params.requestId,
    });

    // Check if organization is approaching budget limits
    await this.checkBudgetAlerts(params.organizationId);
  }

  /**
   * Calculate cost based on model pricing
   */
  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = {
      "gpt-4o": { prompt: 0.000005, completion: 0.000015 }, // $5/$15 per 1M tokens
      "gpt-4o-mini": { prompt: 0.00000015, completion: 0.0000006 }, // $0.15/$0.60 per 1M
      "claude-sonnet-4": { prompt: 0.000003, completion: 0.000015 }, // $3/$15 per 1M
      "claude-haiku-4": { prompt: 0.0000008, completion: 0.000004 }, // $0.80/$4 per 1M
    };

    const rates = pricing[model] || pricing["gpt-4o-mini"];
    return (promptTokens * rates.prompt) + (completionTokens * rates.completion);
  }

  /**
   * Check if organization is approaching budget limits
   */
  private async checkBudgetAlerts(organizationId: string) {
    // Query monthly spending
    // Send alerts at 80%, 90%, 100% of budget
  }
}
```

### Rate Limiting AI Endpoints

```typescript
// server/middleware/ai-rate-limit.ts

import rateLimit from "express-rate-limit";
import { subscriptionService } from "../services/subscription-service";

export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: async (req) => {
    const orgId = req.body.organizationId || req.query.organizationId;
    const subscription = await subscriptionService.getSubscription(orgId);

    // Rate limits based on tier
    const limits = {
      free: 5,
      premium: 20,
      professional: 50,
      enterprise: 100,
    };

    return limits[subscription?.tier] || limits.free;
  },
  message: "Too many AI requests, please try again later",
});
```

---

## Security Considerations

### SQL Injection Prevention (for NL-to-SQL)

```typescript
// server/services/ai-query-service.ts

import { db } from "../db";
import { sql } from "drizzle-orm";

export class AIQueryService {
  /**
   * Execute natural language query with safety checks
   */
  async executeQuery(naturalLanguageQuery: string, organizationId: string) {
    // 1. Convert NL to SQL using LLM
    const sqlQuery = await this.convertToSQL(naturalLanguageQuery);

    // 2. Validate SQL (whitelist approach)
    if (!this.isQuerySafe(sqlQuery)) {
      throw new Error("Query contains unsafe operations");
    }

    // 3. Add organization filter to prevent cross-org access
    const sanitizedQuery = this.addOrganizationFilter(sqlQuery, organizationId);

    // 4. Execute with timeout
    const results = await this.executeWithTimeout(sanitizedQuery, 10000);

    return results;
  }

  private isQuerySafe(query: string): boolean {
    // Whitelist: only SELECT queries
    if (!query.trim().toUpperCase().startsWith("SELECT")) {
      return false;
    }

    // Blacklist: no DROP, DELETE, UPDATE, INSERT, ALTER, etc.
    const dangerousKeywords = [
      "DROP", "DELETE", "UPDATE", "INSERT", "ALTER",
      "TRUNCATE", "CREATE", "GRANT", "REVOKE"
    ];

    for (const keyword of dangerousKeywords) {
      if (query.toUpperCase().includes(keyword)) {
        return false;
      }
    }

    return true;
  }

  private addOrganizationFilter(query: string, organizationId: string): string {
    // Parse query and inject WHERE clause for organization_id
    // This is critical to prevent cross-organization data leaks
    // Implementation depends on your SQL parser
    return query;
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// server/__tests__/subscription-service.test.ts

describe("SubscriptionService", () => {
  it("should allow free tier users to access basic features", async () => {
    const result = await subscriptionService.checkFeatureAccess(
      "org-123",
      Feature.BULK_CSV_IMPORT
    );
    expect(result.hasAccess).toBe(false);
  });

  it("should allow premium tier users to access CSV import", async () => {
    // Set up premium subscription
    const result = await subscriptionService.checkFeatureAccess(
      "org-456",
      Feature.BULK_CSV_IMPORT
    );
    expect(result.hasAccess).toBe(true);
  });

  it("should enforce usage limits for metered features", async () => {
    // Use up all AI data entry credits
    const result = await subscriptionService.checkFeatureAccess(
      "org-789",
      Feature.AI_DATA_ENTRY
    );
    expect(result.hasAccess).toBe(false);
    expect(result.usageRemaining).toBe(0);
  });
});
```

### Integration Tests

```typescript
// server/__tests__/feature-middleware.test.ts

describe("Feature Middleware", () => {
  it("should return 402 for unavailable features", async () => {
    const response = await request(app)
      .post("/api/import/csv")
      .send({ organizationId: "free-org" });

    expect(response.status).toBe(402);
    expect(response.body.upgradeRequired).toBe("premium");
  });

  it("should allow access to features within tier", async () => {
    const response = await request(app)
      .post("/api/import/csv")
      .send({ organizationId: "premium-org" });

    expect(response.status).toBe(200);
  });
});
```

---

## Summary

This modularization plan provides:

1. **Flexible feature flags** - Turn features on/off per organization
2. **Tiered pricing** - Clear upgrade path from free to enterprise
3. **Usage tracking** - Metered features with limits
4. **Billing integration** - Stripe for subscription management
5. **AI feature placement** - Specific locations for AI enhancements
6. **Security** - Proper isolation and SQL injection prevention
7. **Migration path** - Grandfather existing users, onboard new ones to free tier

The system is designed to be:
- **Scalable** - Add new features and tiers easily
- **Secure** - Proper access control and data isolation
- **User-friendly** - Clear upgrade prompts and feature discovery
- **Cost-effective** - Track and control AI costs per organization

Next steps would be implementing Phase 1 (infrastructure) and gradually rolling out feature gates across the application.
