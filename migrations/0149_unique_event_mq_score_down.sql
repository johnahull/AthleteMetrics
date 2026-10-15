-- Migration 0149 DOWN: drop the one-MQ-score-per-event backstop index.
-- Rows removed by the up migration's de-dup are not restored.
DROP INDEX IF EXISTS measurements_event_mq_score_unique;
