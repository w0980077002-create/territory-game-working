import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
// The window refactor is linted independently of unrelated legacy code.
export default tseslint.config({
 files: ['src/ui/{App,DarkPanels,SagaUI}.tsx'],
 languageOptions: {parser: tseslint.parser, parserOptions: {ecmaFeatures: {jsx: true}}},
 plugins: {'@typescript-eslint':tseslint.plugin,'react-hooks':hooks},
 rules: {
  'react-hooks/rules-of-hooks':'error',
  'react-hooks/exhaustive-deps':'warn',
  '@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],
  'no-constant-condition':'error','no-duplicate-case':'error','no-unreachable':'error',
 }
});
