-- Migration 0149: at most one Movement Quality score per (athlete, metric, event)
-- (AM-FEAT-015). The event write path upserts MQ scores under a transaction-scoped
-- advisory lock; this partial unique index is the database backstop.
--
-- De-dup first: keep the newest row per key (latest entry wins, matching the upsert's
-- ORDER BY created_at DESC). Calculated totals are untouched; they are recalculated on
-- the next write for that athlete/date.
-- Idempotent: safe to run more than once.

DELETE FROM measurements m
 USING measurements newer
 WHERE m.event_id IS NOT NULL
   AND m.is_calculated = false
   AND m.metric LIKE 'MQ\_%'
   AND newer.user_id = m.user_id
   AND newer.metric = m.metric
   AND newer.event_id = m.event_id
   AND newer.is_calculated = false
   AND (newer.created_at, newer.id) > (m.created_at, m.id);

CREATE UNIQUE INDEX IF NOT EXISTS measurements_event_mq_score_unique
  ON measurements (user_id, metric, event_id)
  WHERE event_id IS NOT NULL AND is_calculated = false AND metric LIKE 'MQ\_%';
