module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: ".",
  testPathIgnorePatterns: ["/node_modules/", "/build/", "/dist/", "/docs/"],
  transformIgnorePatterns: ["node_modules/(?!uuid/)"],
  moduleFileExtensions: ['js', 'ts', 'tsx',],
  testRegex: "test/unit/.+\\.spec\\.ts$",
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^src/(.*)$": "<rootDir>/src/$1"
  },
};
