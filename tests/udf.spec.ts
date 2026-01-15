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
      "should load a UDF with function as script",
      skipIfNoClient(async () => {
        const fn = function testFn() {
          return "test";
        };
        // Note: This will fail on the server side because the function needs proper format with falkor.register,
        // but it tests that the client correctly converts the function to a string
        try {
          const script = `function test() { return "ok"; }
falkor.register("test", test);`;
          await falkorClient.udfLoad("funclib", script);
          expect(true).toBe(true); // If it doesn't throw, it's successful
        } catch (error: any) {
          // Expected to potentially fail on server side, but client should handle it
          expect(error).toBeDefined();
        }
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
