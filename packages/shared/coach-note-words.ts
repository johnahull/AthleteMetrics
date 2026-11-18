/**
 * Words that signal private detail (injury, body, medical, recruiting) in text built from "What I saw".
 * Editor warning only, kept tight on purpose: ordinary words such as "growth" or "weights" cause warning fatigue.
 */
const SENSITIVE_RE =
  /(?:^|[^\w-])(injur(?:y|ies|ed)|pain(?:ful)?|hurt|sore(?:ness)?|rolled|sprain(?:ed)?|strain(?:ed)?|surgery|weight|fat|puberty|concussion|ACL|tweak(?:ed)?|doctor|PT|scholarship|D1|scout(?:s|ing)?)(?![\w-])/gi;

/** Sensitive words in the text as written, each once, in order of appearance. */
export function findSensitiveWords(text: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const m of text.matchAll(SENSITIVE_RE)) {
    const key = m[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(m[1]);
  }
  return found;
}
