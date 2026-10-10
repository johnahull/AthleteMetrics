/**
 * Unit tests for the eval report API helpers (AM-FEAT-019 P5)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { apiErrorMessage, downloadEvalReportPdf } from "../use-eval-report";

describe("apiErrorMessage", () => {
  it("shows the server's message from an apiRequest error", () => {
    expect(apiErrorMessage(new Error('400: {"error":"Use one single-leg CMJ per athlete, not both"}'), "x")).toBe(
      "Use one single-leg CMJ per athlete, not both"
    );
    expect(apiErrorMessage(new Error('500: {"message":"Failed to save eval report"}'), "x")).toBe("Failed to save eval report");
  });

  it("uses a generic message for an HTML page or an oversized body", () => {
    expect(apiErrorMessage(new Error("502: <html><body>Bad gateway</body></html>"), "Something failed")).toBe("Something failed");
    expect(apiErrorMessage(new Error("500: " + "x".repeat(400)), "Something failed")).toBe("Something failed");
  });

  it("falls back for unknown errors and keeps plain text bodies", () => {
    expect(apiErrorMessage("boom", "fallback")).toBe("fallback");
    expect(apiErrorMessage(new Error("404: Not found"), "fallback")).toBe("Not found");
  });
});

describe("downloadEvalReportPdf", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (init: { ok: boolean; disposition?: string; json?: unknown }) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: init.ok,
        blob: async () => new Blob(["%PDF"]),
        json: async () => init.json,
        headers: new Headers(init.disposition ? { "content-disposition": init.disposition } : {}),
      }))
    );

  it("takes the filename from content-disposition", async () => {
    respond({ ok: true, disposition: 'attachment; filename="Jane_Eval.pdf"' });
    expect((await downloadEvalReportPdf("r1")).filename).toBe("Jane_Eval.pdf");
  });

  it("falls back to a generic filename", async () => {
    respond({ ok: true });
    expect((await downloadEvalReportPdf("r1")).filename).toBe("Eval_Report.pdf");
  });

  it("survives a malformed encoded filename", async () => {
    respond({ ok: true, disposition: "attachment; filename*=UTF-8''100%ZZ.pdf" });
    const { filename } = await downloadEvalReportPdf("r1");
    expect(filename).toBe("100%ZZ.pdf");
  });

  it("throws the server's message when the download is refused", async () => {
    respond({ ok: false, json: { message: "Not authorized" } });
    await expect(downloadEvalReportPdf("r1")).rejects.toThrow("Not authorized");
  });
});
