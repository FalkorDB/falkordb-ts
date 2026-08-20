/**
 * Assertions for the raw execution-plan arrays returned by the client.
 *
 * Prefer expectPlanShape wherever both engines produce the same operation
 * tree. Keep expectExecutionPlan for documented engine-specific plans.
 */

import { expect } from "@jest/globals";

const INDENT = "    ";
const ENGINE_ROOT_OPERATIONS = new Set(["Results", "Commit"]);
const PROFILE_STATS = /\s*\|\s*Records produced: \d+,\s*Execution time: \d+\.\d+ ms\s*$/;

export function indentOf(line: string): number {
  return (line.length - line.trimStart().length) / INDENT.length;
}

export function operationName(line: string): string {
  return line.split("|")[0].trim();
}

function operationLine(line: string): string {
  return line.replace(PROFILE_STATS, "").trim();
}

/** Asserts the reply is a well formed execution plan. */
export function expectExecutionPlan(plan: string[], minOperations = 1): void {
  expect(Array.isArray(plan)).toBe(true);
  expect(plan.length).toBeGreaterThanOrEqual(minOperations);

  plan.forEach((line, index) => {
    expect(typeof line).toBe("string");

    // every line names an operation, optionally followed by its arguments
    expect(operationName(line)).not.toBe("");

    // indentation is what conveys nesting, so it has to be whole levels, and
    // an operation can only ever be one level deeper than the one above it
    const indent = indentOf(line);
    expect(Number.isInteger(indent)).toBe(true);
    expect(indent).toBe(index === 0 ? 0 : Math.min(indent, indentOf(plan[index - 1]) + 1));
  });
}

/**
 * Asserts operation names and nesting exactly, and arguments on expected lines
 * that include them after a `|`. Engine-only driver roots are ignored.
 */
export function expectPlanShape(plan: string[], expected: readonly string[]): void {
  expectExecutionPlan(plan);
  expect(expected.length).toBeGreaterThan(0);

  const expectedRoot = operationName(expected[0]);
  const skipRoot =
    ENGINE_ROOT_OPERATIONS.has(operationName(plan[0])) &&
    operationName(plan[0]) !== expectedRoot;
  const rootOffset = skipRoot ? 1 : 0;
  const actual = plan.slice(rootOffset);

  expect(actual).toHaveLength(expected.length);

  expected.forEach((expectedLine, index) => {
    const actualLine = actual[index];
    const expectedIndent = indentOf(expectedLine);
    const actualIndent = indentOf(actualLine) - rootOffset;

    expect(Number.isInteger(expectedIndent)).toBe(true);
    expect(actualIndent).toBe(expectedIndent);

    const expectedOperation = operationLine(expectedLine);
    const actualOperation = expectedOperation.includes("|")
      ? operationLine(actualLine)
      : operationName(actualLine);
    expect(actualOperation).toBe(expectedOperation);
  });
}

/** Asserts the reply is a well formed profile, statistics included. */
export function expectProfile(
  plan: string[],
  minOperations = 1,
  recordsProduced?: number
): void {
  expectExecutionPlan(plan, minOperations);

  const counts = plan.map((line) => {
    const records = line.match(/Records produced: (\d+)/);
    const time = line.match(/Execution time: (\d+\.\d+) ms/);

    // every operation is profiled, whichever operations they turn out to be
    expect(records).not.toBeNull();
    expect(time).not.toBeNull();

    return parseInt(records![1], 10);
  });

  if (recordsProduced !== undefined) {
    // how many rows the query yields is a property of the query, not of the
    // engine, so the client must report it whichever engine answered
    expect(Math.max(...counts)).toBe(recordsProduced);
  }
}

/** Asserts an exact profile plan while retaining all profile-stat checks. */
export function expectProfileShape(
  plan: string[],
  expected: readonly string[],
  recordsProduced?: number
): void {
  expectPlanShape(plan, expected);
  expectProfile(plan, expected.length, recordsProduced);
}
