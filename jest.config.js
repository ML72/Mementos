/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  preset: "ts-jest",
  // Use the test-specific TypeScript configuration
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: "test/tsconfig.json"
    }]
  },
  // Run tests sequentially to avoid database race conditions
  maxWorkers: 1,
  // Force exit to handle MongoDB connections
  forceExit: true,
  // Include test files
  testMatch: [
    "**/test/**/*.test.ts",
    "**/test/**/*.test.js"
  ],
  // Module paths
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1"
  }
};
