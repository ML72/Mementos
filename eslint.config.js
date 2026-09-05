const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');

/**
 * Flat config for the root package: the Express server, its types, the Jest tests and the
 * root-level tooling configs. The React client is a separate npm package with its own
 * dependency tree and its own config — see src/client/eslint.config.js.
 */
module.exports = tseslint.config(
    {
        ignores: [
            'dist/**',
            'src/client/**', // separate package, linted by its own config
            'coverage/**'
        ]
    },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    // Server, shared types and root tooling all run on Node.
    {
        files: ['**/*.{ts,js}'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.node }
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
            'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
            'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off'
        }
    },

    // Tests additionally get the Jest globals.
    {
        files: ['test/**/*.ts'],
        languageOptions: {
            globals: { ...globals.jest }
        }
    },

    // CommonJS tooling at the root (jest.config.js, this file).
    {
        files: ['*.js'],
        languageOptions: { sourceType: 'commonjs' },
        rules: { '@typescript-eslint/no-require-imports': 'off' }
    }
);
