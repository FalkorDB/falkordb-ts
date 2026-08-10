/**
 * Engine-agnostic assertions for execution plans.
 *
 * Which operations a query compiles into is the engine's business and it
 * changes between engine versions. The client's job is to issue GRAPH.EXPLAIN /
 * GRAPH.PROFILE and hand back the reply intact, so that is what these helpers
 * check: a plan came back, and every line of it is well formed.
 */

import { expect } from "@jest/globals";

const INDENT = "    ";

export function indentOf(line: string): number {
  return (line.length - line.trimStart().length) / INDENT.length;
}

export function operationName(line: string): string {
  return line.split("|")[0].trim();
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
