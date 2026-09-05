import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Flat config for the client package (React + TypeScript, built by Vite).
 * The Express server is a separate npm package with its own config — see ../../eslint.config.js.
 */
export default tseslint.config(
    { ignores: ['dist/**', 'coverage/**'] },

    { settings: { react: { version: 'detect' } } },

    js.configs.recommended,
    ...tseslint.configs.recommended,
    react.configs.flat.recommended,
    react.configs.flat['jsx-runtime'], // React 19's automatic JSX transform: no `import React` needed
    reactHooks.configs.flat.recommended,

    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.browser },
            parserOptions: { ecmaFeatures: { jsx: true } }
        },
        rules: {
            // This codebase leans on `any` deliberately (`dispatch: any`, `err: any`, and
            // `noImplicitAny: false` in tsconfig), so flagging it would bury real findings.
            '@typescript-eslint/no-explicit-any': 'off',
            // A leading underscore marks a binding that is intentionally unused.
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }],
            // Apostrophes and quotes in JSX copy render fine; escaping them only hurts
            // readability of the prose in these pages.
            'react/no-unescaped-entities': 'off',
            'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
            'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off'
        }
    },

    // Tooling configs run in Node, not the browser.
    {
        files: ['vite.config.ts', 'eslint.config.js'],
        languageOptions: { globals: { ...globals.node } }
    }
);
