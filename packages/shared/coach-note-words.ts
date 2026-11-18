/**
 * Words that signal private detail (injury, body, medical, recruiting) in text built from "What I saw".
 * Editor warning only, kept tight on purpose: ordinary phrases such as "weight room", "rolled through the finish"
 * or "it hurt his time" must not warn. Lookaheads carry the context for the ambiguous words.
 */
const SENSITIVE_RE = new RegExp(
  `(?:^|[^\\w-])(${[
    'injur(?:y|ies|ed)',
    'pain(?:s|ful)?',
    'hurt(?:s|ing)?(?!\\s+(?:his|her|their|the|its)\\s+(?:time|times|score|result|results|speed|start|numbers))',
    'sore(?:ness)?',
    'rolled(?=\\s+(?:(?:his|her|their|an|the|a)\\s+)?(?:ankle|foot|knee))',
    'sprain(?:s|ed)?',
    'strain(?:s|ed)?',
    'torn',
    'tear(?=\\s+(?:in|of)\\b)',
    'surger(?:y|ies)',
    'weight(?!\\s+(?:room|training|lifting))',
    '\\d+\\s*(?:lbs?|pounds)',
    'fat',
    'puberty',
    'concuss(?:ion|ions|ed)',
    'ACL',
    'tweak(?:s|ed)?',
    'doctors?',
    'PT',
    'physio(?:therapy|therapist)?',
    'rehab',
    'medication|meds',
    'scholarships?',
    'D[123]',
    'scout(?:s|ed|ing)?',
    'recruit\\w*',
    'offers?(?=\\s+from\\b)',
  ].join('|')})(?![\\w-])`,
  'gi',
);

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
