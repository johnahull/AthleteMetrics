/**
 * Fails when a selectable AI model is past, or within 30 days of, its announced retirement date.
 *
 * The dates live in packages/shared/ai-models.ts (`retireAfter`). Run weekly by
 * .github/workflows/ai-model-lifecycle.yml. Set AI_MODEL_LIFECYCLE_NOW=YYYY-MM-DD to test.
 */
import { findModelsNearRetirement } from "../packages/shared/ai-models";

const WARN_WITHIN_DAYS = 30;

const now = process.env.AI_MODEL_LIFECYCLE_NOW ? new Date(process.env.AI_MODEL_LIFECYCLE_NOW) : new Date();
const flagged = findModelsNearRetirement(now, WARN_WITHIN_DAYS);

if (flagged.length === 0) {
  console.log(`✅ No selectable AI models retire within ${WARN_WITHIN_DAYS} days`);
  process.exit(0);
}

console.error(`❌ AI models retiring within ${WARN_WITHIN_DAYS} days (or already past):`);
for (const model of flagged) {
  console.error(`   - ${model.key} (${model.apiModelId}) retires ${model.retireAfter}`);
}
console.error("Replace or remove them in packages/shared/ai-models.ts.");
process.exit(1);
