// Plain JS rather than TypeScript: Jest needs `ts-node` to parse a .ts config,
// and it isn't a dependency of this project — so `npm test` failed to start at
// all. Keeping the config in JS avoids pulling in ts-node just to read it.
/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  // Only *.test.ts(x) are suites. Without this, shared fixtures that live
  // alongside the tests (e.g. __tests__/fwb/helpers.ts) get collected and fail
  // with "must contain at least one test".
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};

module.exports = config;
