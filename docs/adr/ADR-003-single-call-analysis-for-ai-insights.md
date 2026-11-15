# ADR-003: Single call with an analysis block for AI insights

**Date**: 2026-11-15
**Status**: Accepted

Applies to `generateCoachingInsights` in `packages/api/services/ai-insights-service.ts`. Operator and developer guide: `docs/AI_INSIGHTS.md`.

## Context

Individual-report insights now weigh many inputs: metrics, benchmarks, history, coach notes (restriction, maturation, test-day flags, goals) and an org style example. Output that just narrates the numbers was shallow. The model does better when it first works through a checklist (validity, benchmark and history, connections between metrics, one primary limiter, filters, goal gaps, emphasis, unknowns), but that reasoning must never reach an athlete, a parent or the public PDF. Constraints: three providers (Google, OpenAI, Anthropic) behind one `AIProvider` interface, a 60 second request timeout, `max_tokens` 4096, per-call cost, and coach notes about minors that must not be repeated in saved output.

## Decision

Make **one model call per generation**. The user message asks the model to write an `<analysis>` block first, following a fixed checklist (`ANALYSIS_INSTRUCTION`), then the headed summary. Code removes the analysis afterwards (`stripAnalysisBlock`): it drops the tags and their contents, cuts at the first known heading of the audience, drops unknown sections, and throws if no heading is left, so raw analysis cannot be returned. A second guard, `leaksCoachNotes`, rejects output that repeats the restriction wording or a 12-character run of what the coach saw. A truncated response (any provider) is an error rather than a partial result.

Rejected: two passes and provider-native thinking as the only mechanism (below).

## Alternatives

- **Two calls (analyze, then write)**: about twice the cost and latency, two chances to hit the 60 second timeout, and the first call's text, which can paraphrase the coach notes, would have to be fed back into the second call, creating a new place for note text to travel and be mangled. A failure between the calls needs its own retry and error handling.
- **Provider thinking only**: not portable. The three providers expose reasoning differently (or not at all for some selectable models), thinking tokens count against `max_tokens` on some, and the checklist could not be controlled in a model-independent way.
- **No reasoning step**: simplest, but lost the checklist-driven choices (one limiter, filters, goal gaps) that the golden outputs show.

## Consequences

### Positive
- One request, one timeout, one cost; works the same for every provider and model.
- The reasoning checklist is versioned in code and covered by prompt snapshot tests.
- Stripping is deterministic and tested on malformed tag shapes; a failure is a generic error, never leaked text.

### Negative
- The analysis consumes part of the 4096 output tokens; long notes or a long style example raise the chance of truncation, which fails the whole generation (no partial output is kept).
- Safety depends on post-processing: the leak guard catches repeats, not paraphrase, and coach-audience insights are visible to athlete share viewers and the public-link PDF.
- A model that skips or garbles the analysis tags still works only if the headings are right; otherwise the user sees the generic error.

### Neutral
- The analysis is discarded and not stored, so a bad summary cannot be audited from it.
- `scripts/eval-ai-insights.ts` (live, paid) is the way to compare models on this format.

## Follow-ups

- Derived ratios and wellness/MQI in the prompt (the checklist already has a ratios step that has little data today).
- Per-athlete persistent notes (coach notes now live on one report row).
- Code-computed goal feasibility, so the model does not reason about rates and timelines.
- Role gating of report `PUT` and `DELETE` (these use organization membership only).
- The public organization directory exposing `joinCode` and `aiPromptContext`.
