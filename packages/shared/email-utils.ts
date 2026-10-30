/** Emails the system invents for imported athletes; they are not deliverable. */
const PLACEHOLDER_SUFFIXES = ['@temp.local', '@ocr-import.local'];

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  const e = email.toLowerCase();
  return PLACEHOLDER_SUFFIXES.some((s) => e.endsWith(s)) || e.includes('@placeholder.');
}
