import { describe, expect, it } from "@jest/globals";
import {
  expectExecutionPlan,
  expectPlanShape,
  expectProfile,
} from "./planHelpers";

const UNION_PLAN = [
  "Distinct",
  "    Join",
  "        Project",
  "            Conditional Traverse | (t)->(r:Rider)",
  "                Filter",
  "                    Node By Label Scan | (t:Team)",
  "        Project",
  "            Conditional Traverse | (t)->(r:Rider)",
  "                Filter",
  "                    Node By Label Scan | (t:Team)",
];

const UNION_SHAPE = [
  "Distinct",
  "    Join",
  "        Project",
  "            Conditional Traverse",
  "                Filter",
  "                    Node By Label Scan | (t:Team)",
  "        Project",
  "            Conditional Traverse",
  "                Filter",
  "                    Node By Label Scan | (t:Team)",
];

describe("plan helpers", () => {
  it("requires a nested plan rather than arbitrary operation strings", () => {
    expect(() => expectExecutionPlan(UNION_PLAN, 10)).not.toThrow();
    expect(() =>
      expectExecutionPlan(UNION_PLAN.map((line) => line.trim()), 10)
    ).toThrow();
    expect(() =>
      expectExecutionPlan(Array(7).fill("Operation"), 7)
    ).toThrow();
  });

  it("rejects a truncated exact UNION plan", () => {
    expect(() => expectPlanShape(UNION_PLAN, UNION_SHAPE)).not.toThrow();
    expect(() => expectPlanShape(UNION_PLAN.slice(0, 7), UNION_SHAPE)).toThrow();
  });

  it("checks records produced on the root profile operation", () => {
    const childHasFourRecords = [
      "Results | Records produced: 0, Execution time: 0.001000 ms",
      "    Project | Records produced: 4, Execution time: 0.001000 ms",
    ];
    const rootHasFourRecords = [
      "Results | Records produced: 4, Execution time: 0.001000 ms",
      "    Project | Records produced: 0, Execution time: 0.001000 ms",
    ];

    expect(() => expectProfile(childHasFourRecords, 2, 4)).toThrow();
    expect(() => expectProfile(rootHasFourRecords, 2, 4)).not.toThrow();
  });
});
