// Only rules-of-hooks: a hook after an early return blanks the page at runtime and tsc cannot see it.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['.claude/**', '**/dist/**', 'coverage/**'] },
  { files: ['packages/web/src/**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser }, linterOptions: { reportUnusedDisableDirectives: 'off' }, plugins: { 'react-hooks': reactHooks }, rules: { 'react-hooks/rules-of-hooks': 'error' } },
];
