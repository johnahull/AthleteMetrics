/**
 * Optional live eval of AI coaching insights. NOT run in CI: it calls a paid model API.
 *
 * Generates insights for every golden case and audience (packages/api/services/__tests__/fixtures/
 * ai-insights-golden.ts) with generateCoachingInsights, runs the output checks
 * (packages/api/services/ai-insights-eval.ts) and prints a report. Exits 1 when any output fails.
 *
 *   AI_EVAL_MODEL=claude-haiku-4.5 ANTHROPIC_API_KEY=... npx tsx scripts/eval-ai-insights.ts
 *
 * AI_EVAL_OUT=<dir> also saves each output as <case>.<audience>.md (e.g. to record new samples).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_MODELS,
  buildPrompt,
  generateCoachingInsights,
  isModelAvailable,
  type AIModelKey,
} from "../packages/api/services/ai-insights-service";
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
const outDir = process.env.AI_EVAL_OUT;
if (outDir) mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const c of GOLDEN_CASES) {
  for (const audience of goldenAudiences(c)) {
    const data = { ...c.data, audience };
    const label = `${c.name}.${audience}`;
    try {
      const output = await generateCoachingInsights(modelKey as AIModelKey, data);
      if (outDir) writeFileSync(join(outDir, `${label}.md`), output);
      const failures = checkInsights({
        output,
        prompt: buildPrompt(data),
        reportType: data.reportType,
        audience,
        athleteNames: c.rosterNames,
      });
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
