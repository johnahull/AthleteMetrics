/**
 * Unit tests: measurements.mediaUrl (AM-FEAT-015 Phase 2)
 * Generic nullable media link: https-only, public host, max 2048 chars.
 * Empty string / null clears.
 */
import { describe, it, expect } from "vitest";
import { measurements, insertMeasurementSchema, mediaUrlSchema, MEDIA_URL_MAX_LENGTH } from "../schema";
import { isSafePublicUrl } from "../url-safety";

const base = {
  userId: "user-1",
  date: "2026-01-15",
  metric: "VERTICAL_JUMP",
  value: 30,
};

describe("measurements table - mediaUrl column", () => {
  it("exposes a nullable media_url text column", () => {
    expect(measurements.mediaUrl).toBeDefined();
    expect(measurements.mediaUrl.name).toBe("media_url");
    expect(measurements.mediaUrl.notNull).toBe(false);
  });
});

describe("insertMeasurementSchema - mediaUrl", () => {
  it("accepts an https public URL", () => {
    const r = insertMeasurementSchema.safeParse({ ...base, mediaUrl: "https://example.com/clip/abc?t=1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mediaUrl).toBe("https://example.com/clip/abc?t=1");
  });

  it("is optional", () => {
    const r = insertMeasurementSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("accepts null (clear)", () => {
    const r = insertMeasurementSchema.safeParse({ ...base, mediaUrl: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mediaUrl).toBeNull();
  });

  it("normalizes empty string to null (clear)", () => {
    const r = insertMeasurementSchema.safeParse({ ...base, mediaUrl: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mediaUrl).toBeNull();
  });

  it.each([
    ["http scheme", "http://example.com/clip"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>1</script>"],
    ["ftp scheme", "ftp://example.com/x"],
    ["not a url", "not a url"],
    ["localhost", "https://localhost/clip"],
    ["loopback IP", "https://127.0.0.1/clip"],
    ["10.x private", "https://10.0.0.5/clip"],
    ["192.168 private", "https://192.168.1.10/clip"],
    ["172.16 private", "https://172.16.0.1/clip"],
    ["link-local metadata", "https://169.254.169.254/latest"],
    ["IPv6 loopback", "https://[::1]/clip"],
    [".internal host", "https://metadata.aws.internal/x"],
  ])("rejects %s", (_label, url) => {
    const r = insertMeasurementSchema.safeParse({ ...base, mediaUrl: url });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["mediaUrl"]);
  });

  it("accepts a URL of exactly the max length", () => {
    const prefix = "https://example.com/";
    const url = prefix + "a".repeat(MEDIA_URL_MAX_LENGTH - prefix.length);
    expect(url.length).toBe(MEDIA_URL_MAX_LENGTH);
    expect(insertMeasurementSchema.safeParse({ ...base, mediaUrl: url }).success).toBe(true);
  });

  it("rejects a URL over 2048 chars", () => {
    const prefix = "https://example.com/";
    const url = prefix + "a".repeat(MEDIA_URL_MAX_LENGTH - prefix.length + 1);
    expect(MEDIA_URL_MAX_LENGTH).toBe(2048);
    const r = insertMeasurementSchema.safeParse({ ...base, mediaUrl: url });
    expect(r.success).toBe(false);
  });

  it("partial (update) schema accepts mediaUrl and null/empty clears", () => {
    const upd = insertMeasurementSchema.partial();
    expect(upd.safeParse({ mediaUrl: "https://example.com/v" }).success).toBe(true);
    const cleared = upd.safeParse({ mediaUrl: "" });
    expect(cleared.success).toBe(true);
    if (cleared.success) expect(cleared.data.mediaUrl).toBeNull();
    expect(upd.safeParse({ mediaUrl: null }).success).toBe(true);
    expect(upd.safeParse({ mediaUrl: "http://example.com/v" }).success).toBe(false);
  });
});

describe("mediaUrlSchema hardening", () => {
  it.each([
    ["embedded newline", "https://example.com/a\nb"],
    ["embedded tab", "https://example.com/a\tb"],
    ["embedded space", "https://example.com/a b"],
    ["NUL byte", "https://example.com/a\u0000b"],
    ["DEL char", "https://example.com/a\u007fb"],
  ])("rejects %s", (_label, url) => {
    const r = mediaUrlSchema.safeParse(url);
    expect(r.success).toBe(false);
  });

  it.each([
    ["username@host (looks like youtube)", "https://youtube.com@evil.com/x"],
    ["user:pass@host", "https://user:pass@example.com/x"],
    ["password only", "https://:secret@example.com/x"],
  ])("rejects credentials in the URL: %s", (_label, url) => {
    const r = mediaUrlSchema.safeParse(url);
    expect(r.success).toBe(false);
  });

  it.each([
    ["uppercase host", "https://Clips.EXAMPLE.com/Video", "https://clips.example.com/Video"],
    ["backslash path", "https://example.com\\clip", "https://example.com/clip"],
    ["quotes and angle brackets", 'https://example.com/a"<b>', "https://example.com/a%22%3Cb%3E"],
    ["no path", "https://example.com", "https://example.com/"],
    ["surrounding whitespace", "  https://example.com/v  ", "https://example.com/v"],
  ])("stores the canonical WHATWG form (%s)", (_label, input, canonical) => {
    const r = mediaUrlSchema.safeParse(input);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(canonical);
  });

  it("rejects a URL whose canonical form exceeds the max length", () => {
    // Each '"' (1 char) canonicalizes to '%22' (3 chars)
    const prefix = "https://example.com/";
    const raw = prefix + '"'.repeat(MEDIA_URL_MAX_LENGTH - prefix.length);
    expect(raw.length).toBe(MEDIA_URL_MAX_LENGTH);
    expect(mediaUrlSchema.safeParse(raw).success).toBe(false);
  });
});

describe("isSafePublicUrl hardening", () => {
  it.each([
    ["trailing-dot localhost", "https://localhost./clip"],
    ["trailing-dot .internal", "https://metadata.aws.internal./x"],
    ["trailing-dot .local", "https://printer.local./x"],
    ["*.localhost", "https://app.localhost/clip"],
    ["trailing-dot *.localhost", "https://app.localhost./clip"],
  ])("rejects %s", (_label, url) => {
    expect(isSafePublicUrl(url)).toBe(false);
  });

  it("still accepts a normal public host", () => {
    expect(isSafePublicUrl("https://clips.example.com/a")).toBe(true);
  });
});
