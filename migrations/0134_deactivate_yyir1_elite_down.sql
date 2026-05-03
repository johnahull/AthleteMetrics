-- Down migration for 0134: re-activate 'd1-soc-yyir1-elite'
--
-- Reverses the deactivation. Note: this restores the row to is_active=true
-- with level='D1', which reintroduces the level-filter pollution issue that
-- 0134 deactivated the row to avoid. Operators rolling this back should
-- understand that level='D1' filters will once again include the Elite/Pro
-- row (≥1700 m) in D1 comparisons.

UPDATE site_benchmarks
   SET is_active = true,
       updated_at = NOW()
 WHERE id = 'd1-soc-yyir1-elite'
   AND is_active = false;
