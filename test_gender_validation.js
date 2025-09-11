#!/usr/bin/env node
/**
 * Simple gender validation tests for AthleteMetrics
 * Run with: node test_gender_validation.js
 */

import { z } from "zod";

// Import Gender enum
const Gender = {
  MALE: "Male",
  FEMALE: "Female", 
  NOT_SPECIFIED: "Not Specified",
} as const;

// Gender validation schema (same as in shared/schema.ts)
const genderSchema = z.enum(["Male", "Female", "Not Specified"]).optional();

// Test cases
const testCases = [
  // Valid cases
  { input: "Male", expected: true, description: "Valid Male gender" },
  { input: "Female", expected: true, description: "Valid Female gender" },
  { input: "Not Specified", expected: true, description: "Valid Not Specified gender" },
  { input: undefined, expected: true, description: "Undefined gender (optional)" },
  
  // Invalid cases
  { input: "male", expected: false, description: "Invalid lowercase male" },
  { input: "FEMALE", expected: false, description: "Invalid uppercase FEMALE" },
  { input: "Other", expected: false, description: "Invalid Other value" },
  { input: "", expected: false, description: "Invalid empty string" },
  { input: "Not specified", expected: false, description: "Invalid case mismatch" },
  { input: 123, expected: false, description: "Invalid number type" },
];

console.log("🧪 Running Gender Validation Tests...\n");

let passed = 0;
let failed = 0;

testCases.forEach(({ input, expected, description }) => {
  try {
    const result = genderSchema.safeParse(input);
    const isValid = result.success;
    
    if (isValid === expected) {
      console.log(`✅ PASS: ${description} - Input: ${JSON.stringify(input)}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${description} - Input: ${JSON.stringify(input)} - Expected: ${expected}, Got: ${isValid}`);
      failed++;
    }
  } catch (error) {
    console.log(`💥 ERROR: ${description} - ${error.message}`);
    failed++;
  }
});

console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

// Test Gender enum values
console.log("\n🔍 Testing Gender Enum Values:");
console.log(`Gender.MALE = "${Gender.MALE}"`);
console.log(`Gender.FEMALE = "${Gender.FEMALE}"`);
console.log(`Gender.NOT_SPECIFIED = "${Gender.NOT_SPECIFIED}"`);

if (failed === 0) {
  console.log("\n🎉 All gender validation tests passed!");
  process.exit(0);
} else {
  console.log(`\n💔 ${failed} test(s) failed!`);
  process.exit(1);
}