/**
 * Optional live eval of AI coaching insights. NOT run in CI: it calls a paid model API.
 *
 * Generates insights for every golden case and audience (packages/api/services/__tests__/fixtures/
 * ai-insights-golden.ts) with generateCoachingInsights, runs the output checks
 * (packages/api/services/ai-insights-eval.ts) and prints a report. Exits 1 when any output fails.
 *
 * Run from the repository root:
 *   AI_EVAL_MODEL=claude-haiku-4.5 ANTHROPIC_API_KEY=... npx tsx scripts/eval-ai-insights.ts
 *
 * AI_EVAL_OUT=<dir> also saves each output as <case>.<audience>.md (e.g. to record new samples).
 * AI_EVAL_OVERRIDES_FILE=<path> evaluates a draft of the site-admin prompt wording: a JSON file with the
 * aiPromptOverrides shape (packages/shared/ai-prompt-overrides.ts), checked with the same schema the admin save uses.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_MODELS,
  generateCoachingInsights,
  isModelAvailable,
  type AIModelKey,
} from "../packages/api/services/ai-insights-service";
import { aiPromptOverridesSchema } from "../packages/shared/ai-prompt-overrides";
import { checkInsights } from "../packages/api/services/ai-insights-eval";
import { GOLDEN_CASES, goldenAudiences } from "../packages/api/services/__tests__/fixtures/ai-insights-golden";

const modelKey = process.env.AI_EVAL_MODEL;
if (!modelKey || !Object.prototype.hasOwnProperty.call(AI_MODELS, modelKey)) {
  console.error(`Set AI_EVAL_MODEL to one of: ${Object.keys(AI_MODELS).join(", ")}`);
  process.exit(2);
}
const availability = isModelAvailable(modelKey);
if (!availability.available) {
  console.error(`Set ${availability.envVar} to run the eval with ${modelKey}`);
  process.exit(2);
}
let overrides: ReturnType<typeof aiPromptOverridesSchema.parse> | undefined;
if (process.env.AI_EVAL_OVERRIDES_FILE) {
  try {
    overrides = aiPromptOverridesSchema.parse(JSON.parse(readFileSync(process.env.AI_EVAL_OVERRIDES_FILE, "utf8")));
  } catch (error) {
    console.error(`AI_EVAL_OVERRIDES_FILE is not valid prompt overrides: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  console.log(`Using prompt overrides: ${Object.keys(overrides).join(", ") || "(none)"}`);
}
const outDir = process.env.AI_EVAL_OUT;
if (outDir) mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const c of GOLDEN_CASES) {
  for (const audience of goldenAudiences(c)) {
    const data = { ...c.data, audience };
    const label = `${c.name}.${audience}`;
    try {
      const output = await generateCoachingInsights(modelKey as AIModelKey, data, overrides);
      if (outDir) writeFileSync(join(outDir, `${label}.md`), output);
      const failures = checkInsights({ output, data, athleteNames: c.rosterNames, overrides });
      if (failures.length > 0) failed++;
      console.log(`${failures.length === 0 ? "PASS" : "FAIL"} ${label}`);
      for (const f of failures) console.log(`     - ${f}`);
    } catch (error) {
      failed++;
      console.log(`ERROR ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const total = GOLDEN_CASES.reduce((n, c) => n + goldenAudiences(c).length, 0);
console.log(`\n${modelKey}: ${total - failed}/${total} outputs passed`);
process.exit(failed > 0 ? 1 : 0);
