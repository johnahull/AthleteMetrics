-- Down Migration 0180: remove template revisions and the event link.
--
-- Refuses to run while any history exists that cannot be rebuilt: a revision above 1 (a template was edited) or an
-- event that recorded the revision it applied. Revision 1 of a template is a copy of eval_battery_templates.metrics,
-- so it is dropped without loss. The seeded Foundation and Performance templates are left in place.

DO $$
DECLARE
  v_edited INTEGER := 0;
  v_linked INTEGER := 0;
BEGIN
  IF to_regclass('eval_battery_template_revisions') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_edited FROM eval_battery_template_revisions WHERE revision > 1;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'eval_template_revision_id') THEN
      SELECT COUNT(*) INTO v_linked FROM events WHERE eval_template_revision_id IS NOT NULL;
    END IF;
  END IF;

  IF v_edited > 0 OR v_linked > 0 THEN
    RAISE EXCEPTION 'Migration 0180 (down) refused: % revisions above 1 and % events linked to a revision still exist. Remove them first if removal is intended.', v_edited, v_linked;
  END IF;
END $$;

ALTER TABLE events DROP COLUMN IF EXISTS eval_template_revision_id;
ALTER TABLE eval_battery_templates DROP COLUMN IF EXISTS current_revision_id;
DROP INDEX IF EXISTS eval_battery_templates_preset_key_uniq;
ALTER TABLE eval_battery_templates DROP COLUMN IF EXISTS preset_key;
DROP TABLE IF EXISTS eval_battery_template_revisions;
DROP FUNCTION IF EXISTS eval_battery_template_revisions_immutable();

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0180_eval_battery_template_revisions';
  END IF;
  RAISE NOTICE 'Migration 0180 (down): Removed eval_battery_template_revisions, current_revision_id, preset_key and events.eval_template_revision_id.';
END $$;
