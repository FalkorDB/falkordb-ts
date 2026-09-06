module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/tests"],
    transform: { "^.+\\.ts$": "ts-jest"},
    testRegex: "((\\.|/)(test|spec))\\.ts$",
    moduleFileExtensions: ["ts", "js", "json", "node"],
    testTimeout: 30000,
    // Suites share single FalkorDB instances; parallel workers race on
    // graph state and on GRAPH.COPY's fork (Redis allows one child process
    // at a time, so two concurrent copies fail with "could not fork").
    maxWorkers: 1,
    setupFiles: ["<rootDir>/tests/setup.ts"],
    setupFilesAfterEnv: ["<rootDir>/tests/dbConnection.ts"],
    coverageProvider: "v8"
  };
