import assert from "assert";
import { transformArguments } from "./MEMORY_USAGE";
import testUtils, { GLOBAL } from "../test-utils";

describe("MEMORY USAGE", () => {
  it("transformArguments", () => {
    assert.deepEqual(transformArguments("graph"), [
      "GRAPH.MEMORY",
      "USAGE",
      "graph",
    ]);
  });

  testUtils.testWithClient(
    "client.graph.memoryUsage",
    async client => {
      const result = await client.graph.memoryUsage("graph");
       
      assert.equal(result, null)      
    },
    GLOBAL.SERVERS.OPEN
  );
});
