// Copy for the AI "Explain this error" panel, shared by the pipeline runs,
// transformation runs, and SQL editor surfaces. Namespaced under `explainUi`.
export default {
  en: {
    explainUi: {
      button: 'Explain',
      title: 'What went wrong',
      likelyCause: 'Likely cause',
      suggestedFix: 'What to try',
      suggestedSnippet: 'Suggested fix',
      close: 'Close',
      disclaimer: 'AI-generated from this failure’s context — double-check before acting on it.',
      notConfigured: 'AI assistance is coming soon — it is not enabled on this workspace yet.',
      rateLimited: 'Too many AI requests right now. Give it a minute and try again.',
      failed: 'Could not explain this error',
    },
  },
  cs: {
    explainUi: {
      button: 'Vysvětlit',
      title: 'Co se pokazilo',
      likelyCause: 'Pravděpodobná příčina',
      suggestedFix: 'Co zkusit',
      suggestedSnippet: 'Navrhovaná oprava',
      close: 'Zavřít',
      disclaimer: 'Vygenerováno AI z kontextu této chyby — před použitím si to ověřte.',
      notConfigured: 'AI asistence se chystá — na tomto workspace zatím není zapnutá.',
      rateLimited: 'Příliš mnoho AI požadavků. Chvíli počkejte a zkuste to znovu.',
      failed: 'Chybu se nepodařilo vysvětlit',
    },
  },
}
