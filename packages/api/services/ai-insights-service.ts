/**
 * AI Coaching Insights Service
 *
 * Generates AI-powered coaching insights for performance reports using multiple AI providers.
 * Supports 7 AI models across 3 providers (OpenAI, Google, Anthropic) with budget and premium tiers.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// AI Model Configurations
export const AI_MODELS = {
  // Budget Tier (5 models)
  "gpt-5-nano": {
    provider: "openai" as const,
    model: "gpt-5-nano",
    tier: "budget" as const,
    costPer1M: { input: 0.05, output: 0.40 },
    description: "OpenAI GPT-5 Nano - Cheapest & Fast",
  },
  "gemini-2.0-flash-lite": {
    provider: "google" as const,
    model: "gemini-2.0-flash-lite",
    tier: "budget" as const,
    costPer1M: { input: 0.075, output: 0.30 },
    description: "Google Gemini 2.0 Flash-Lite - Ultra Fast",
  },
  "gemini-2.5-flash-lite": {
    provider: "google" as const,
    model: "gemini-2.5-flash-lite",
    tier: "budget" as const,
    costPer1M: { input: 0.10, output: 0.40 },
    description: "Google Gemini 2.5 Flash-Lite - Fast & Efficient",
  },
  "claude-haiku-3": {
    provider: "anthropic" as const,
    model: "claude-3-haiku-20240307",
    tier: "budget" as const,
    costPer1M: { input: 0.25, output: 1.25 },
    description: "Anthropic Claude Haiku 3 - Excellent Reasoning",
  },
  "claude-haiku-4.5": {
    provider: "anthropic" as const,
    model: "claude-haiku-4.5-20251015",
    tier: "budget" as const,
    costPer1M: { input: 0.80, output: 4.00 },
    description: "Anthropic Claude Haiku 4.5 - Cost-Effective Claude 4",
  },
  // Premium Tier (2 models)
  "gemini-2.5-pro": {
    provider: "google" as const,
    model: "gemini-2.5-pro",
    tier: "premium" as const,
    costPer1M: { input: 1.25, output: 10.00 },
    description: "Google Gemini 2.5 Pro - High Performance",
  },
  "claude-sonnet-4.5": {
    provider: "anthropic" as const,
    model: "claude-sonnet-4.5-20250514",
    tier: "premium" as const,
    costPer1M: { input: 3.00, output: 15.00 },
    description: "Anthropic Claude Sonnet 4.5 - Best Quality",
  },
} as const;

export type AIModelKey = keyof typeof AI_MODELS;

// Configuration constants
/** Default timeout for AI API calls in milliseconds (30 seconds). Can be overridden via AI_REQUEST_TIMEOUT_MS env var */
export const AI_REQUEST_TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '30000', 10);

/**
 * Get the environment variable name for a given AI provider's API key.
 * Returns the env var name, not the actual key value.
 */
export function getProviderApiKeyEnvVar(provider: string): string {
  const apiKeyEnvVars: Record<string, string> = {
    'openai': 'OPENAI_API_KEY',
    'google': 'GOOGLE_AI_API_KEY',
    'anthropic': 'ANTHROPIC_API_KEY'
  };
  return apiKeyEnvVars[provider] || '';
}

/**
 * Check if a specific AI model's provider has its API key configured.
 * Returns an object indicating availability and relevant details.
 *
 * Security: Never returns actual API key values, only boolean availability.
 */
export function isModelAvailable(modelKey: string): { available: boolean; provider: string; envVar: string } {
  const config = AI_MODELS[modelKey as AIModelKey];
  if (!config) {
    return { available: false, provider: '', envVar: '' };
  }

  const envVar = getProviderApiKeyEnvVar(config.provider);
  const available = !!process.env[envVar];

  return { available, provider: config.provider, envVar };
}

/**
 * Validate AI provider configuration at startup.
 * Checks which providers have API keys configured and logs status.
 *
 * Security: Only checks key presence, never logs actual key values.
 * Non-blocking: Logs warnings but doesn't stop app startup (AI is optional).
 */
export function validateAIProviderConfiguration(): {
  available: string[];
  unavailable: string[];
} {
  const providers = {
    openai: !!process.env.OPENAI_API_KEY,
    google: !!process.env.GOOGLE_AI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };

  const available: string[] = [];
  const unavailable: string[] = [];

  for (const [provider, hasKey] of Object.entries(providers)) {
    if (hasKey) {
      available.push(provider);
    } else {
      unavailable.push(provider);
    }
  }

  // Log status for administrator awareness
  if (available.length > 0) {
    console.log(`AI providers configured: ${available.join(', ')}`);
  }

  if (unavailable.length > 0) {
    console.warn(`AI providers not configured (missing API keys): ${unavailable.join(', ')}`);
  }

  if (available.length === 0) {
    console.warn('No AI providers configured. AI coaching insights feature will be disabled.');
  }

  return { available, unavailable };
}

// Provider interfaces
interface AIProvider {
  generateInsights(prompt: string): Promise<string>;
}

// Google AI Provider
class GoogleProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor(modelName: string) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.error(`AI Service Error: Missing API key for provider: google, model: ${modelName}`);
      throw new Error("AI service configuration error. Please contact your administrator.");
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async generateInsights(prompt: string): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({ model: this.modelName });

      // Create timeout with AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

      try {
        const result = await model.generateContent(
          {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              topP: 0.95,
              topK: 40,
              maxOutputTokens: 2048,
            },
          },
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        const response = result.response;
        const text = response.text();

        if (!text) {
          throw new Error("Google AI returned empty response");
        }

        return text;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: any) {
      // Handle specific Google AI errors
      if (error?.status === 429 || error?.message?.includes("429")) {
        throw new Error("AI service rate limited. Please try again in a few minutes.");
      }
      if (error?.status === 401 || error?.status === 403 || error?.message?.includes("API key")) {
        throw new Error("AI service authentication failed. Contact administrator.");
      }
      if (error?.name === "AbortError" || error?.message?.includes("aborted") || error?.message?.includes("timeout")) {
        throw new Error("AI service request timed out. Please try again.");
      }
      if (error?.message?.includes("empty response")) {
        throw error;
      }
      throw new Error("AI service temporarily unavailable. Please try again later.");
    }
  }
}

// OpenAI Provider
class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private modelName: string;

  constructor(modelName: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error(`AI Service Error: Missing API key for provider: openai, model: ${modelName}`);
      throw new Error("AI service configuration error. Please contact your administrator.");
    }
    // Configure with timeout
    this.client = new OpenAI({
      apiKey,
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
    this.modelName = modelName;
  }

  async generateInsights(prompt: string): Promise<string> {
    try {
      // GPT-5 models use different parameters than older models
      const isGpt5Model = this.modelName.startsWith('gpt-5');

      const requestParams: any = {
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: "You are an expert athletic performance coach analyzing athlete data to provide actionable coaching insights.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      };

      if (isGpt5Model) {
        // GPT-5 models use reasoning_effort and verbosity instead of temperature
        requestParams.reasoning_effort = "low";
        requestParams.max_completion_tokens = 2048;
      } else {
        // Older models use traditional parameters
        requestParams.temperature = 0.7;
        requestParams.max_tokens = 2048;
      }

      const completion = await this.client.chat.completions.create(requestParams);

      const text = completion.choices[0]?.message?.content;

      if (!text) {
        throw new Error("OpenAI returned empty response");
      }

      return text;
    } catch (error: any) {
      // Log the actual error for debugging (limited to safe fields)
      console.error(`OpenAI API Error for model ${this.modelName}:`, {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        type: error?.type,
      });

      // Handle specific OpenAI errors
      if (error?.status === 429 || error?.code === "rate_limit_exceeded") {
        throw new Error("AI service rate limited. Please try again in a few minutes.");
      }
      if (error?.status === 401 || error?.code === "invalid_api_key") {
        throw new Error("AI service authentication failed. Contact administrator.");
      }
      if (error?.status === 404 || error?.code === "model_not_found") {
        throw new Error("AI model configuration error. Contact administrator.");
      }
      if (error?.code === "ETIMEDOUT" || error?.code === "ECONNABORTED" || error?.message?.includes("timeout")) {
        throw new Error("AI service request timed out. Please try again.");
      }
      if (error?.message?.includes("empty response")) {
        throw error;
      }
      throw new Error("AI service temporarily unavailable. Please try again later.");
    }
  }
}

// Anthropic Provider
class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private modelName: string;

  constructor(modelName: string) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error(`AI Service Error: Missing API key for provider: anthropic, model: ${modelName}`);
      throw new Error("AI service configuration error. Please contact your administrator.");
    }
    // Configure with timeout
    this.client = new Anthropic({
      apiKey,
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
    this.modelName = modelName;
  }

  async generateInsights(prompt: string): Promise<string> {
    try {
      const message = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 2048,
        temperature: 0.7,
        system: "You are an expert athletic performance coach analyzing athlete data to provide actionable coaching insights.",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const textContent = message.content.find((block: { type: string }) => block.type === "text");

      if (!textContent || textContent.type !== "text") {
        throw new Error("Anthropic returned no text content");
      }

      return textContent.text;
    } catch (error: any) {
      // Handle specific Anthropic errors
      if (error?.status === 429 || error?.error?.type === "rate_limit_error") {
        throw new Error("AI service rate limited. Please try again in a few minutes.");
      }
      if (error?.status === 401 || error?.error?.type === "authentication_error") {
        throw new Error("AI service authentication failed. Contact administrator.");
      }
      if (error?.code === "ETIMEDOUT" || error?.code === "ECONNABORTED" || error?.message?.includes("timeout")) {
        throw new Error("AI service request timed out. Please try again.");
      }
      if (error?.message?.includes("no text content")) {
        throw error;
      }
      throw new Error("AI service temporarily unavailable. Please try again later.");
    }
  }
}

// Provider Factory
function createProvider(modelKey: AIModelKey): AIProvider {
  const config = AI_MODELS[modelKey];
  const providerType = config.provider;

  if (providerType === "google") {
    return new GoogleProvider(config.model);
  } else if (providerType === "openai") {
    return new OpenAIProvider(config.model);
  } else if (providerType === "anthropic") {
    return new AnthropicProvider(config.model);
  } else {
    // This should never happen due to our type definitions
    const _exhaustiveCheck: never = providerType;
    throw new Error(`Unknown provider: ${providerType}`);
  }
}

// Report Data Interface
export interface ReportData {
  reportType: "team" | "individual";
  reportName: string;
  organizationName: string;
  organizationContext?: string;

  // Team report specific
  teamName?: string;
  teamSport?: string; // Sport from team.sport
  athleteCount?: number;

  // Individual report specific
  athleteName?: string;
  athletePosition?: string;
  athleteAge?: number;
  athleteGender?: string;
  athleteSport?: string; // Sport from athlete.sports[0]

  // Common report data
  timeframe: string;
  metrics: Array<{
    code: string;
    label: string;
    values: number[];
    unit: string;
    lowerIsBetter: boolean;
    percentile?: number;
    teamAverage?: number;
  }>;

  // Statistical summaries
  improvements?: Array<{
    metric: string;
    improvement: string;
  }>;
  concerns?: Array<{
    metric: string;
    concern: string;
  }>;
  benchmarkComparisons?: Array<{
    metric: string;
    performance: string;
  }>;

  // Audience for tailored language
  audience?: 'coach' | 'athlete' | 'parent';
}

/**
 * Generate coaching insights for a performance report
 */
export async function generateCoachingInsights(
  modelKey: AIModelKey,
  reportData: ReportData
): Promise<string> {
  try {
    // Defensive validation: ensure model key exists in AI_MODELS
    if (!(modelKey in AI_MODELS)) {
      throw new Error(`Invalid AI model: ${modelKey}`);
    }

    const provider = createProvider(modelKey);
    const prompt = buildPrompt(reportData);
    const insights = await provider.generateInsights(prompt);

    return insights;
  } catch (error) {
    console.error("Error generating coaching insights:", error);
    // Return sanitized error message to prevent information leakage
    // Provider-specific user-friendly messages are already thrown by provider classes
    if (error instanceof Error && (
      error.message.includes("rate limit") ||
      error.message.includes("temporarily unavailable") ||
      error.message.includes("Contact administrator") ||
      error.message.includes("timed out")
    )) {
      // These are already user-friendly messages from providers
      throw error;
    }
    // Generic fallback for unexpected errors
    throw new Error("AI service encountered an error. Please try again or contact support.");
  }
}

/**
 * Sanitize user-generated content before including in AI prompts
 * Prevents potential prompt injection attacks by escaping markdown and special characters
 */
export function sanitizeForPrompt(input: string, maxLength = 500): string {
  if (!input) return '';
  return input
    .replace(/[#*_`\[\]<>]/g, '') // Remove markdown special characters
    .replace(/\n+/g, ' ') // Convert newlines to spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, maxLength); // Limit length of individual fields
}

/**
 * Build the prompt for the AI model based on report data
 */
export function buildPrompt(reportData: ReportData): string {
  const { reportType } = reportData;

  // Sanitize user-provided content to prevent prompt injection
  const reportName = sanitizeForPrompt(reportData.reportName);
  const organizationName = sanitizeForPrompt(reportData.organizationName);

  let prompt = '';

  prompt += `You are an expert athletic performance coach. Analyze the following ${reportType} performance report and provide actionable coaching insights.\n\n`;

  // Append organization context after role definition
  if (reportData.organizationContext) {
    const sanitizedContext = sanitizeForPrompt(reportData.organizationContext, 2000);
    if (sanitizedContext) {
      prompt += `## Organization Context\n${sanitizedContext}\n\nWhen generating insights, incorporate this context to make recommendations specific to this organization's training philosophy and methodology.\n\n`;
    }
  }

  // Report context
  prompt += `## Report Context\n`;
  prompt += `- Organization: ${organizationName}\n`;
  prompt += `- Report: ${reportName}\n`;
  prompt += `- Type: ${reportType === "team" ? "Team Performance" : "Individual Athlete"}\n`;
  prompt += `- Timeframe: ${reportData.timeframe}\n`;

  // Team-specific context
  if (reportType === "team" && reportData.teamName) {
    prompt += `- Team: ${sanitizeForPrompt(reportData.teamName)}\n`;
    if (reportData.teamSport) prompt += `- Sport: ${sanitizeForPrompt(reportData.teamSport)}\n`;
    prompt += `- Athletes: ${reportData.athleteCount || "N/A"}\n`;
  }

  // Individual-specific context
  if (reportType === "individual" && reportData.athleteName) {
    prompt += `- Athlete: ${sanitizeForPrompt(reportData.athleteName)}\n`;
    if (reportData.athleteSport) prompt += `- Sport: ${sanitizeForPrompt(reportData.athleteSport)}\n`;
    if (reportData.athletePosition) prompt += `- Position: ${sanitizeForPrompt(reportData.athletePosition)}\n`;
    if (reportData.athleteAge) prompt += `- Age: ${reportData.athleteAge}\n`;
    if (reportData.athleteGender) prompt += `- Gender: ${sanitizeForPrompt(reportData.athleteGender)}\n`;
  }

  prompt += `\n`;

  // Performance metrics
  if (reportData.metrics.length > 0) {
    prompt += `## Performance Metrics\n`;
    reportData.metrics.forEach((metric) => {
      const avgValue = metric.values.length > 0
        ? (metric.values.reduce((a, b) => a + b, 0) / metric.values.length).toFixed(2)
        : "N/A";
      const trend = metric.values.length >= 2
        ? metric.values[metric.values.length - 1] - metric.values[0]
        : 0;
      const trendDirection = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";

      let metricLine = `- ${metric.label}: ${avgValue} ${metric.unit} ${trendDirection} (${metric.lowerIsBetter ? "lower is better" : "higher is better"})`;

      // Add team average comparison for individual reports
      if (metric.teamAverage !== undefined && metric.percentile !== undefined) {
        const teamAvg = metric.teamAverage.toFixed(2);
        const athleteValue = parseFloat(avgValue);
        const diff = athleteValue - metric.teamAverage;
        const diffStr = diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
        const comparison = metric.lowerIsBetter
          ? (diff < 0 ? "better than" : diff > 0 ? "worse than" : "equal to")
          : (diff > 0 ? "better than" : diff < 0 ? "worse than" : "equal to");
        metricLine += `\n  - Team Average: ${teamAvg} ${metric.unit} (athlete is ${diffStr}, ${comparison} team avg)`;
        metricLine += `\n  - Percentile: ${metric.percentile.toFixed(1)}th (compared to all athletes in organization)`;
      }

      prompt += metricLine + `\n`;
    });
    prompt += `\n`;
  }

  // Improvements
  if (reportData.improvements && reportData.improvements.length > 0) {
    prompt += `## Improvements Observed\n`;
    reportData.improvements.forEach((item) => {
      prompt += `- ${item.metric}: ${item.improvement}\n`;
    });
    prompt += `\n`;
  }

  // Concerns
  if (reportData.concerns && reportData.concerns.length > 0) {
    prompt += `## Areas of Concern\n`;
    reportData.concerns.forEach((item) => {
      prompt += `- ${item.metric}: ${item.concern}\n`;
    });
    prompt += `\n`;
  }

  // Benchmark comparisons
  if (reportData.benchmarkComparisons && reportData.benchmarkComparisons.length > 0) {
    prompt += `## Benchmark Performance\n`;
    reportData.benchmarkComparisons.forEach((item) => {
      prompt += `- ${item.metric}: ${item.performance}\n`;
    });
    prompt += `\n`;
  }

  // Instructions — tailored by audience
  const audience = reportData.audience || 'coach';

  prompt += `## Instructions\n`;

  if (audience === 'parent') {
    prompt += `You are writing for PARENTS of youth athletes, NOT coaches or trainers.\n\n`;
    prompt += `Write in clear, non-technical language that a parent with no sports science background can understand. Focus on:\n\n`;
    prompt += `1. **What the numbers mean** for their child's development\n`;
    prompt += `2. **What's Going Well** — celebrate specific achievements with context\n`;
    prompt += `3. **What to Work On** — frame as growth opportunities, not deficiencies\n\n`;
    prompt += `TONE: Encouraging, professional, data-backed. Like a doctor explaining test results — clear, honest, but not alarming.\n\n`;
    prompt += `AVOID: Jargon (percentile ranks are OK, but explain what they mean), negative framing, comparisons that might discourage.\n\n`;
    if (reportData.athleteName) {
      const firstName = sanitizeForPrompt(reportData.athleteName).split(' ')[0];
      if (firstName) {
        prompt += `Use the athlete's first name (${firstName}) throughout.\n\n`;
      }
    }
    prompt += `Keep it to 200-300 words.\n`;
  } else if (audience === 'athlete') {
    prompt += `You are writing directly TO the athlete. Use "you" language.\n\n`;
    prompt += `Provide insights in markdown format with these sections:\n\n`;
    prompt += `1. **Summary**: 2-3 sentences — where you stand and what jumped out from the data\n`;
    prompt += `2. **What's Going Well**: Lead with wins — celebrate specific strengths the data proves\n`;
    prompt += `3. **What to Work On**: Frame as challenges to attack, not weaknesses. Athletes want to know what to chase\n\n`;
    prompt += `TONE: Direct, confident, and energizing — like a coach who believes in you giving you your game plan. Speak to them as a competitor. Acknowledge effort where the data shows improvement. Be honest but never deflating.\n\n`;
    prompt += `AVOID: Clinical or passive language, hedging ("you might want to consider..."), generic praise ("great job!"), talking down to them. Athletes respect realness — show them the data backs up what you're saying.\n\n`;
    if (reportData.athleteName) {
      const firstName = sanitizeForPrompt(reportData.athleteName).split(' ')[0];
      if (firstName) {
        prompt += `Use the athlete's first name (${firstName}) to keep it personal.\n\n`;
      }
    }
    // Note: athlete audience intentionally omits a "Next Steps" section — "What to Work On"
    // already implies action (it tells the athlete what to chase). Adding a separate next-steps
    // block would be redundant and dilute the direct, competitor-facing tone.
    prompt += `Keep it to 150-200 words. Use bullet points and **bold** for emphasis.\n`;
  } else {
    // Default: coach audience
    prompt += `You are writing for sports coaches and athletes, NOT strength & conditioning experts. Use simple, everyday language.\n\n`;
    prompt += `Provide coaching insights in markdown format with these sections:\n\n`;
    prompt += `1. **Summary**: 2-3 sentences giving the big picture of this report based on the numbers\n`;
    prompt += `2. **What's Going Well**: Top strengths shown by the data (metrics meeting or exceeding benchmarks)\n`;
    prompt += `3. **What to Work On**: Key areas needing attention based on metrics and benchmarks\n`;
    prompt += `4. **Next Steps**: 2-3 specific, actionable training recommendations to improve the metrics\n\n`;
    prompt += `Keep it short (150-250 words total). Be direct and objective. Use bullet points and **bold** for emphasis. Avoid technical jargon.\n`;
  }

  prompt += `\nIMPORTANT CONSTRAINTS:\n`;
  prompt += `- Base ALL observations strictly on the provided metrics and benchmark data\n`;
  prompt += `- Do NOT comment on effort, attitude, coachability, consistency, or other unmeasured qualities\n`;
  prompt += `- Do NOT make assumptions about behaviors, habits, or character traits\n`;
  prompt += `- Focus only on what the numbers show and specific training actions to improve them\n`;
  prompt += `- When data is limited, acknowledge it rather than filling gaps with assumptions\n`;

  return prompt;
}
