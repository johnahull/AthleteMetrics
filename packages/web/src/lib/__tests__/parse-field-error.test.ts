/**
 * Unit tests for the shared `parseFieldError` helper.
 *
 * PR #397's code review (5 separate passes) repeatedly flagged that this
 * function was copy-pasted verbatim into both measurement-form.tsx and
 * athlete-measurement-form.tsx, and the duplication was never resolved
 * before merge. This extracts it to a single shared module so both forms
 * import the same implementation.
 */

import { describe, it, expect } from "vitest";
import { parseFieldError } from "@/lib/parse-field-error";

describe("parseFieldError", () => {
  it("parses a structured PairedInputValidationError body", () => {
    const error = new Error(
      '400: {"message":"Reps must be at least 1","field":"auxiliaryValue"}',
    );

    expect(parseFieldError(error)).toEqual({
      message: "Reps must be at least 1",
      field: "auxiliaryValue",
    });
  });

  it("returns null for a plain non-JSON error message", () => {
    const error = new Error("500: Internal Server Error");
    expect(parseFieldError(error)).toBeNull();
  });

  it("returns null for JSON that lacks the expected message/field shape", () => {
    const error = new Error('400: {"error":"Bad Request"}');
    expect(parseFieldError(error)).toBeNull();
  });

  it("returns null when the error has no message", () => {
    const error = new Error();
    expect(parseFieldError(error)).toBeNull();
  });

  it("strips the numeric status prefix before parsing", () => {
    const error = new Error('422: {"message":"Value is required","field":"primaryValue"}');
    expect(parseFieldError(error)).toEqual({
      message: "Value is required",
      field: "primaryValue",
    });
  });
});
