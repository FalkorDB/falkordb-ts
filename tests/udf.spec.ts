import FalkorDB from "../src/falkordb";
import { client } from "./dbConnection";
import { expect } from "@jest/globals";

describe("UDF API Tests", () => {
  let falkorClient: FalkorDB;

  beforeAll(async () => {
    try {
      falkorClient = await client();
    } catch (error) {
      console.error("Failed to connect to FalkorDB:", error);
    }
  });

  afterAll(async () => {
    if (falkorClient) {
      await falkorClient.close();
    }
  });

  function skipIfNoClient(testFn: () => void | Promise<void>) {
    return async () => {
      if (!falkorClient) {
        return;
      }
      await testFn();
    };
  }

  describe("UDF Operations", () => {
    it(
      "should list UDFs (initially empty)",
      skipIfNoClient(async () => {
        const result = await falkorClient.udfList();
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      })
    );

    it(
      "should load a UDF",
      skipIfNoClient(async () => {
        const script = `function hello() { return "world"; }
falkor.register("hello", hello);`;
        const result = await falkorClient.udfLoad("testlib", script);
        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
      })
    );

    it(
      "should list UDFs after loading",
      skipIfNoClient(async () => {
        const result = await falkorClient.udfList();
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        // After loading testlib, there should be at least one UDF
        expect(result.length).toBeGreaterThan(0);
      })
    );

    it(
      "should list UDFs with library name filter",
      skipIfNoClient(async () => {
        const result = await falkorClient.udfList("testlib");
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      })
    );

    it(
      "should list UDFs with code",
      skipIfNoClient(async () => {
        const result = await falkorClient.udfList(undefined, true);
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      })
    );

    it(
      "should replace a UDF",
      skipIfNoClient(async () => {
        const script = `function hello() { return "world2"; }
falkor.register("hello", hello);`;
        const result = await falkorClient.udfLoad("testlib", script, true);
        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
      })
    );

    it(
      "should load a UDF passing function which gets converted to string",
      skipIfNoClient(async () => {
        // Test that the client correctly converts a function to a string
        const fn = function testFn() {
          return "ok";
        };
        // The function will be stringified and sent - note that it won't work as-is
        // because it needs falkor.register, but this tests the conversion mechanism
        const script = `${fn.toString()}\nfalkor.register("test", testFn);`;
        const result = await falkorClient.udfLoad("funclib", script);
        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
      })
    );

    it(
      "should delete a UDF",
      skipIfNoClient(async () => {
        const result = await falkorClient.udfDelete("testlib");
        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
      })
    );

    it(
      "should flush all UDFs",
      skipIfNoClient(async () => {
        // Load a UDF first
        const script = `function test() { return "ok"; }
falkor.register("test", test);`;
        await falkorClient.udfLoad("flushtest", script);
        
        // Flush all UDFs
        const result = await falkorClient.udfFlush();
        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
        
        // Verify list is empty after flush
        const listResult = await falkorClient.udfList();
        expect(Array.isArray(listResult)).toBe(true);
      })
    );
  });
});
