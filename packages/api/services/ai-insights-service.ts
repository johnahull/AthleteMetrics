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

      // Create timeout with AbortController (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

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
    // Configure with 30 second timeout
    this.client = new OpenAI({
      apiKey,
      timeout: 30000,
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
      // Log the actual error for debugging
      console.error(`OpenAI API Error for model ${this.modelName}:`, {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        type: error?.type,
        error: error?.error,
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
    // Configure with 30 second timeout
    this.client = new Anthropic({
      apiKey,
      timeout: 30000,
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

      const textContent = message.content.find((block) => block.type === "text");

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
}

/**
 * Generate coaching insights for a performance report
 */
export async function generateCoachingInsights(
  modelKey: AIModelKey,
  reportData: ReportData
): Promise<string> {
  try {
    const provider = createProvider(modelKey);
    const prompt = buildPrompt(reportData);
    const insights = await provider.generateInsights(prompt);

    return insights;
  } catch (error) {
    console.error("Error generating coaching insights:", error);
    throw new Error(
      `Failed to generate coaching insights: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Sanitize user-generated content before including in AI prompts
 * Prevents potential prompt injection attacks by escaping markdown and special characters
 */
function sanitizeForPrompt(input: string): string {
  if (!input) return '';
  return input
    .replace(/[#*_`\[\]<>]/g, '') // Remove markdown special characters
    .replace(/\n+/g, ' ') // Convert newlines to spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 500); // Limit length of individual fields
}

/**
 * Build the prompt for the AI model based on report data
 */
function buildPrompt(reportData: ReportData): string {
  const { reportType } = reportData;

  // Sanitize user-provided content to prevent prompt injection
  const reportName = sanitizeForPrompt(reportData.reportName);
  const organizationName = sanitizeForPrompt(reportData.organizationName);

  let prompt = `You are an expert athletic performance coach. Analyze the following ${reportType} performance report and provide actionable coaching insights.\n\n`;

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

      prompt += `- ${metric.label}: Average ${avgValue} ${metric.unit} ${trendDirection} (${metric.lowerIsBetter ? "lower is better" : "higher is better"})\n`;
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

  // Instructions
  prompt += `## Instructions\n`;
  prompt += `You are writing for sports coaches and athletes, NOT strength & conditioning experts. Use simple, everyday language.\n\n`;
  prompt += `Provide coaching insights in markdown format with these sections:\n\n`;
  prompt += `1. **Summary**: 2-3 sentences giving the big picture of this report\n`;
  prompt += `2. **What's Going Well**: Top strengths to celebrate\n`;
  prompt += `3. **What to Work On**: Key areas needing attention\n`;
  prompt += `4. **Next Steps**: 2-3 simple, actionable things to do in training\n\n`;
  prompt += `Keep it short (150-250 words total). Be encouraging but honest. Use bullet points and **bold** for emphasis. Avoid technical jargon.\n`;

  return prompt;
}
