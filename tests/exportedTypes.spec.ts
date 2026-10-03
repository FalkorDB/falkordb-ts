import { describe, it, expect } from "@jest/globals";
import { QueryParam, QueryParams } from "../index";

describe("Exported query parameter types", () => {
  it("should export QueryParam and QueryParams as types", () => {
    const emptyParams: QueryParams = {};
    const mixedParams: QueryParams = {
      stringVal: "hello",
      numVal: 42,
      boolVal: true,
      nullVal: null,
      nested: { child: "value" },
      arrayVal: [1, "two", false, null, { deep: "x" }],
    };

    expect(emptyParams).toBeDefined();
    expect(mixedParams).toBeDefined();
  });

  it("should allow QueryParam as a valid parameter value", () => {
    const values: QueryParam[] = ["text", 7, false, null, { key: "value" }, [1, 2, 3]];
    expect(values.length).toBe(6);
  });
});