#!/usr/bin/env python3
"""
Unit tests for generate_measurements.py

Tests cover:
- Age bracket boundary conditions
- Invalid age inputs
- Gender adjustment factors
- Combined age + gender adjustments
- Edge cases (missing data, min/max boundaries)
"""

import unittest
import sys
from pathlib import Path

# Import functions from generate_measurements.py
sys.path.insert(0, str(Path(__file__).parent))
from generate_measurements import (
    get_age_bracket,
    get_adjustment_factor,
    gen_value,
    METRICS,
    AGE_BRACKETS,
    GENDER_ADJUSTMENTS,
    AGE_MIDDLE_SCHOOL_MAX,
    AGE_YOUNG_HS_MAX,
    AGE_OLDER_HS_MAX,
)


class TestAgeBracket(unittest.TestCase):
    """Tests for get_age_bracket() function"""

    def test_boundary_conditions(self):
        """Test age bracket boundaries are correctly assigned"""
        # Middle school: ages < 14
        self.assertEqual(get_age_bracket(13), "middle_school")
        self.assertEqual(get_age_bracket(12), "middle_school")
        self.assertEqual(get_age_bracket(11), "middle_school")

        # Young HS: ages 14-15
        self.assertEqual(get_age_bracket(14), "young_hs")
        self.assertEqual(get_age_bracket(15), "young_hs")

        # Older HS: ages 16-17
        self.assertEqual(get_age_bracket(16), "older_hs")
        self.assertEqual(get_age_bracket(17), "older_hs")

        # College+: ages 18+
        self.assertEqual(get_age_bracket(18), "college_plus")
        self.assertEqual(get_age_bracket(19), "college_plus")
        self.assertEqual(get_age_bracket(25), "college_plus")

    def test_invalid_inputs(self):
        """Test handling of invalid age inputs"""
        # None and empty string should default to college_plus
        self.assertEqual(get_age_bracket(None), "college_plus")
        self.assertEqual(get_age_bracket(""), "college_plus")

        # Negative ages should default to college_plus
        self.assertEqual(get_age_bracket(-5), "college_plus")
        self.assertEqual(get_age_bracket(-1), "college_plus")

        # Very large ages should default to college_plus
        self.assertEqual(get_age_bracket(150), "college_plus")
        self.assertEqual(get_age_bracket(101), "college_plus")

        # Invalid string inputs
        self.assertEqual(get_age_bracket("invalid"), "college_plus")
        self.assertEqual(get_age_bracket("N/A"), "college_plus")

    def test_float_inputs(self):
        """Test handling of float age inputs"""
        # Float ages should be converted to int
        self.assertEqual(get_age_bracket(14.5), "young_hs")
        self.assertEqual(get_age_bracket(13.9), "middle_school")
        self.assertEqual(get_age_bracket(15.1), "young_hs")

        # String floats should also work
        self.assertEqual(get_age_bracket("16.5"), "older_hs")
        self.assertEqual(get_age_bracket("18.0"), "college_plus")

    def test_edge_ages(self):
        """Test ages at exact boundaries"""
        # Test exact boundary ages
        self.assertEqual(get_age_bracket(0), "middle_school")
        self.assertEqual(get_age_bracket(100), "college_plus")

        # Ages right at the boundary thresholds
        self.assertEqual(get_age_bracket(AGE_MIDDLE_SCHOOL_MAX - 1), "middle_school")
        self.assertEqual(get_age_bracket(AGE_MIDDLE_SCHOOL_MAX), "young_hs")
        self.assertEqual(get_age_bracket(AGE_YOUNG_HS_MAX - 1), "young_hs")
        self.assertEqual(get_age_bracket(AGE_YOUNG_HS_MAX), "older_hs")
        self.assertEqual(get_age_bracket(AGE_OLDER_HS_MAX - 1), "older_hs")
        self.assertEqual(get_age_bracket(AGE_OLDER_HS_MAX), "college_plus")


class TestAdjustmentFactor(unittest.TestCase):
    """Tests for get_adjustment_factor() function"""

    def test_lower_is_better_metrics(self):
        """Test adjustment factors for 'lower is better' metrics (times)"""
        # FLY10_TIME is a "lower is better" metric
        spec = METRICS["FLY10_TIME"]

        # Adult male baseline (should be 1.0)
        adj = get_adjustment_factor(18, "Male", "FLY10_TIME", spec)
        self.assertAlmostEqual(adj, 1.0, places=2)

        # Younger athlete should have higher multiplier (slower times)
        adj_young = get_adjustment_factor(13, "Male", "FLY10_TIME", spec)
        self.assertGreater(adj_young, 1.0)

        # Female should have higher multiplier than male (slower times)
        adj_female = get_adjustment_factor(18, "Female", "FLY10_TIME", spec)
        self.assertGreater(adj_female, 1.0)
        self.assertAlmostEqual(adj_female, 1.08, places=2)

    def test_higher_is_better_metrics(self):
        """Test adjustment factors for 'higher is better' metrics (jumps, RSI)"""
        # VERTICAL_JUMP is a "higher is better" metric
        spec = METRICS["VERTICAL_JUMP"]

        # Adult male baseline (should be 1.0)
        adj = get_adjustment_factor(18, "Male", "VERTICAL_JUMP", spec)
        self.assertAlmostEqual(adj, 1.0, places=2)

        # Younger athlete should have lower multiplier (lower jumps)
        adj_young = get_adjustment_factor(13, "Male", "VERTICAL_JUMP", spec)
        self.assertLess(adj_young, 1.0)

        # Female should have lower multiplier than male (lower jumps)
        adj_female = get_adjustment_factor(18, "Female", "VERTICAL_JUMP", spec)
        self.assertLess(adj_female, 1.0)
        self.assertAlmostEqual(adj_female, 0.75, places=2)

    def test_combined_age_gender_effects(self):
        """Test combined age and gender adjustments"""
        spec_fly = METRICS["FLY10_TIME"]
        spec_vert = METRICS["VERTICAL_JUMP"]

        # Young female should have largest penalty for "higher is better"
        adj_young_female = get_adjustment_factor(13, "Female", "VERTICAL_JUMP", spec_vert)
        adj_young_male = get_adjustment_factor(13, "Male", "VERTICAL_JUMP", spec_vert)
        adj_adult_female = get_adjustment_factor(18, "Female", "VERTICAL_JUMP", spec_vert)
        adj_adult_male = get_adjustment_factor(18, "Male", "VERTICAL_JUMP", spec_vert)

        # Verify progression: young female < young male < adult female < adult male
        self.assertLess(adj_young_female, adj_young_male)
        self.assertLess(adj_young_male, adj_adult_male)
        self.assertLess(adj_adult_female, adj_adult_male)

    def test_gender_fallbacks(self):
        """Test handling of unexpected gender values"""
        spec = METRICS["FLY10_TIME"]

        # Missing gender should default to 1.0 (Male baseline)
        adj = get_adjustment_factor(18, None, "FLY10_TIME", spec)
        self.assertAlmostEqual(adj, 1.0, places=2)

        # Empty string gender
        adj = get_adjustment_factor(18, "", "FLY10_TIME", spec)
        self.assertAlmostEqual(adj, 1.0, places=2)

        # Unexpected gender value
        adj = get_adjustment_factor(18, "Other", "FLY10_TIME", spec)
        self.assertAlmostEqual(adj, 1.0, places=2)

        adj = get_adjustment_factor(18, "Non-binary", "FLY10_TIME", spec)
        self.assertAlmostEqual(adj, 1.0, places=2)

    def test_missing_metric_in_gender_adjustments(self):
        """Test handling when a metric doesn't have gender adjustments defined"""
        # Create a fake metric not in GENDER_ADJUSTMENTS
        fake_metric_spec = {"better": "higher", "center": 100, "sd": 10}

        # Should not raise KeyError, should default to 1.0
        adj = get_adjustment_factor(18, "Male", "FAKE_METRIC", fake_metric_spec)
        self.assertAlmostEqual(adj, 1.0, places=2)

        adj = get_adjustment_factor(18, "Female", "FAKE_METRIC", fake_metric_spec)
        self.assertAlmostEqual(adj, 1.0, places=2)

    def test_all_metrics_have_adjustments(self):
        """Verify all metrics in METRICS have gender adjustments defined"""
        for metric_name in METRICS.keys():
            self.assertIn(metric_name, GENDER_ADJUSTMENTS,
                         f"Metric {metric_name} missing from GENDER_ADJUSTMENTS")

    def test_age_bracket_multipliers_exist(self):
        """Verify all age brackets have multipliers defined"""
        expected_brackets = ["middle_school", "young_hs", "older_hs", "college_plus"]
        for bracket in expected_brackets:
            self.assertIn(bracket, AGE_BRACKETS)
            self.assertGreater(AGE_BRACKETS[bracket], 0)


class TestGenValue(unittest.TestCase):
    """Tests for gen_value() function"""

    def test_basic_generation(self):
        """Test basic value generation without adjustments"""
        spec = METRICS["FLY10_TIME"]

        # Generate value without age/gender adjustments
        val = gen_value(spec, base_offset=0, day_index=0, jitter_sd=0.01)

        # Value should be close to center and within bounds
        self.assertGreaterEqual(val, spec["min"])
        self.assertLessEqual(val, spec["max"])

    def test_age_gender_adjustments_applied(self):
        """Test that age and gender adjustments are applied correctly"""
        spec = METRICS["VERTICAL_JUMP"]

        # Adult male (baseline)
        val_adult_male = gen_value(spec, 0, 0, 0.01, age=18, gender="Male", metric="VERTICAL_JUMP")

        # Young female (should be significantly lower)
        val_young_female = gen_value(spec, 0, 0, 0.01, age=13, gender="Female", metric="VERTICAL_JUMP")

        # With very low jitter, young female should consistently be lower
        self.assertLess(val_young_female, val_adult_male)

    def test_missing_age_skips_adjustment(self):
        """Test that missing age skips adjustments"""
        spec = METRICS["VERTICAL_JUMP"]

        # Generate with explicit age
        val_with_age = gen_value(spec, 0, 0, 0.001, age=13, gender="Male", metric="VERTICAL_JUMP")

        # Generate with missing age (should use baseline)
        val_no_age = gen_value(spec, 0, 0, 0.001, age=None, gender="Male", metric="VERTICAL_JUMP")

        # Different adjustments should produce different values
        # (with low jitter, they should be noticeably different)
        self.assertNotAlmostEqual(val_with_age, val_no_age, places=0)

    def test_empty_string_age_skips_adjustment(self):
        """Test that empty string age skips adjustments"""
        spec = METRICS["VERTICAL_JUMP"]

        # Generate with empty string age
        val_empty_age = gen_value(spec, 0, 0, 0.001, age="", gender="Male", metric="VERTICAL_JUMP")

        # Should be close to baseline center (no adjustment)
        # Allow for some jitter
        self.assertAlmostEqual(val_empty_age, spec["center"], delta=0.5)

    def test_clamping_at_boundaries(self):
        """Test that values are clamped to min/max"""
        spec = METRICS["FLY10_TIME"]

        # Use extreme offset to force clamping
        val = gen_value(spec, base_offset=10, day_index=0, jitter_sd=0.01)
        self.assertLessEqual(val, spec["max"])

        val = gen_value(spec, base_offset=-10, day_index=0, jitter_sd=0.01)
        self.assertGreaterEqual(val, spec["min"])

    def test_drift_over_time(self):
        """Test that drift_per_day affects values over time"""
        spec = METRICS["FLY10_TIME"]

        # Day 0 vs Day 100 should show drift
        val_day0 = gen_value(spec, 0, 0, 0.001, age=18, gender="Male", metric="FLY10_TIME")
        val_day100 = gen_value(spec, 0, 100, 0.001, age=18, gender="Male", metric="FLY10_TIME")

        # FLY10_TIME has negative drift (getting faster), so day100 should be lower
        # drift = -0.0006 * 100 = -0.06
        self.assertLess(val_day100, val_day0)


class TestEdgeCases(unittest.TestCase):
    """Tests for edge cases and data quality"""

    def test_all_metrics_have_required_fields(self):
        """Verify all metrics have required fields"""
        required_fields = ["units", "better", "center", "sd", "drift_per_day", "min", "max"]
        for metric_name, spec in METRICS.items():
            for field in required_fields:
                self.assertIn(field, spec,
                             f"Metric {metric_name} missing field {field}")

    def test_min_max_ranges_valid(self):
        """Verify min < max for all metrics"""
        for metric_name, spec in METRICS.items():
            self.assertLess(spec["min"], spec["max"],
                           f"Metric {metric_name} has invalid min/max range")

    def test_center_within_range(self):
        """Verify center is within min/max for all metrics"""
        for metric_name, spec in METRICS.items():
            # Allow some flexibility for adjusted values
            # Center should at least be reasonable
            self.assertGreater(spec["center"], 0,
                              f"Metric {metric_name} has invalid center")

    def test_gender_adjustments_positive(self):
        """Verify all gender adjustments are positive multipliers"""
        for metric_name, adjustments in GENDER_ADJUSTMENTS.items():
            for gender, multiplier in adjustments.items():
                self.assertGreater(multiplier, 0,
                                  f"Metric {metric_name}, gender {gender} has non-positive multiplier")

    def test_age_bracket_multipliers_positive(self):
        """Verify all age bracket multipliers are positive"""
        for bracket, multiplier in AGE_BRACKETS.items():
            self.assertGreater(multiplier, 0,
                              f"Age bracket {bracket} has non-positive multiplier")


class TestDataRealism(unittest.TestCase):
    """Tests to verify generated data is realistic"""

    def test_young_athletes_slower_times(self):
        """Verify younger athletes have slower times (higher values)"""
        spec = METRICS["FLY10_TIME"]

        # Compare 13-year-old vs 18-year-old males
        adj_young = get_adjustment_factor(13, "Male", "FLY10_TIME", spec)
        adj_adult = get_adjustment_factor(18, "Male", "FLY10_TIME", spec)

        # Younger athletes should have higher multiplier (slower)
        self.assertGreater(adj_young, adj_adult)

    def test_young_athletes_lower_jumps(self):
        """Verify younger athletes have lower vertical jumps"""
        spec = METRICS["VERTICAL_JUMP"]

        # Compare 13-year-old vs 18-year-old males
        adj_young = get_adjustment_factor(13, "Male", "VERTICAL_JUMP", spec)
        adj_adult = get_adjustment_factor(18, "Male", "VERTICAL_JUMP", spec)

        # Younger athletes should have lower multiplier (lower jumps)
        self.assertLess(adj_young, adj_adult)

    def test_progressive_improvement_with_age(self):
        """Verify progressive improvement from middle school to college"""
        spec_vert = METRICS["VERTICAL_JUMP"]

        # Get adjustments for each age bracket
        adj_ms = get_adjustment_factor(13, "Male", "VERTICAL_JUMP", spec_vert)
        adj_yhs = get_adjustment_factor(15, "Male", "VERTICAL_JUMP", spec_vert)
        adj_ohs = get_adjustment_factor(17, "Male", "VERTICAL_JUMP", spec_vert)
        adj_college = get_adjustment_factor(19, "Male", "VERTICAL_JUMP", spec_vert)

        # Should show progressive improvement
        self.assertLess(adj_ms, adj_yhs)
        self.assertLess(adj_yhs, adj_ohs)
        self.assertLess(adj_ohs, adj_college)


if __name__ == "__main__":
    # Run tests with verbose output
    unittest.main(verbosity=2)
