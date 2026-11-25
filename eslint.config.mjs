import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['cdk.out/**', 'node_modules/**', 'lambda/**', '**/*.js', '**/*.d.ts'],
  },
  eslint.configs.recommended,
  {
    files: ['lib/**/*.ts', 'bin/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      // TypeScript types are not JavaScript globals. eslint:recommended's
      // no-undef reports them as undefined.
      'no-undef': 'off',
      // Flags backslashes that JavaScript discards, such as "\\(" inside a
      // single-quoted string. That is what turned a find grouping into a
      // bash syntax error after deploy. Silencing this rule by deleting the
      // backslash is the bug; test/buildspec-shell.test.ts checks the shell
      // that CDK actually emits.
      'no-useless-escape': 'error',
    },
  },
);
