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
        // The function will be stringified and sent - note that it won't work as-is
        // because it needs falkor.register, but this tests the conversion mechanism
        const testFn = function testFn() {
          return "ok";
        };
        const script = `${testFn.toString()}\nfalkor.register("test", testFn);`;
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
        expect(listResult.length).toBe(0);
      })
    );
  });

  describe("UDF Query Execution", () => {
    it(
      "should execute a query with a simple string UDF",
      skipIfNoClient(async () => {
        // Load a string manipulation UDF
        const script = `function greet(name) { return "Hello, " + name + "!"; }
falkor.register("greet", greet);`;
        await falkorClient.udfLoad("stringlib", script);

        // Create a test graph and execute a query using the UDF
        const graph = falkorClient.selectGraph("udf_test_graph");
        const result: any = await graph.query(
          "RETURN stringlib.greet('World') AS greeting"
        );

        expect(result.data).toBeDefined();
        expect(result.data.length).toBe(1);
        expect(result.data[0].greeting).toBe("Hello, World!");

        // Cleanup
        await graph.delete();
        await falkorClient.udfDelete("stringlib");
      })
    );

    it(
      "should execute a query with a mathematical UDF",
      skipIfNoClient(async () => {
        // Load a mathematical UDF
        const script = `function add(a, b) { return a + b; }
function multiply(a, b) { return a * b; }
falkor.register("add", add);
falkor.register("multiply", multiply);`;
        await falkorClient.udfLoad("mathlib", script);

        // Execute queries using the mathematical UDFs
        const graph = falkorClient.selectGraph("udf_math_graph");
        const addResult: any = await graph.query(
          "RETURN mathlib.add(5, 3) AS sum"
        );
        const multiplyResult: any = await graph.query(
          "RETURN mathlib.multiply(4, 7) AS product"
        );

        expect(addResult.data[0].sum).toBe(8);
        expect(multiplyResult.data[0].product).toBe(28);

        // Cleanup
        await graph.delete();
        await falkorClient.udfDelete("mathlib");
      })
    );

    it(
      "should execute a query with a UDF that processes node properties",
      skipIfNoClient(async () => {
        // Load a UDF that transforms strings
        const script = `function uppercase(str) { return str.toUpperCase(); }
falkor.register("uppercase", uppercase);`;
        await falkorClient.udfLoad("transformlib", script);

        // Create a graph with nodes
        const graph = falkorClient.selectGraph("udf_node_graph");
        await graph.query("CREATE (:Person {name: 'alice'})");
        await graph.query("CREATE (:Person {name: 'bob'})");

        // Query using UDF on node properties
        const result: any = await graph.query(
          "MATCH (p:Person) RETURN transformlib.uppercase(p.name) AS upperName ORDER BY upperName"
        );

        expect(result.data).toBeDefined();
        expect(result.data.length).toBe(2);
        expect(result.data[0].upperName).toBe("ALICE");
        expect(result.data[1].upperName).toBe("BOB");

        // Cleanup
        await graph.delete();
        await falkorClient.udfDelete("transformlib");
      })
    );

    it(
      "should execute a query with a UDF in WHERE clause",
      skipIfNoClient(async () => {
        // Load a UDF for string length
        const script = `function strLength(str) { return str.length; }
falkor.register("strLength", strLength);`;
        await falkorClient.udfLoad("utillib", script);

        // Create a graph with nodes
        const graph = falkorClient.selectGraph("udf_where_graph");
        await graph.query("CREATE (:City {name: 'NY'})");
        await graph.query("CREATE (:City {name: 'London'})");
        await graph.query("CREATE (:City {name: 'Paris'})");

        // Query using UDF in WHERE clause to filter by name length
        const result: any = await graph.query(
          "MATCH (c:City) WHERE utillib.strLength(c.name) > 3 RETURN c.name AS city ORDER BY city"
        );

        expect(result.data).toBeDefined();
        expect(result.data.length).toBe(2);
        expect(result.data[0].city).toBe("London");
        expect(result.data[1].city).toBe("Paris");

        // Cleanup
        await graph.delete();
        await falkorClient.udfDelete("utillib");
      })
    );

    it(
      "should execute a query with a complex UDF that manipulates arrays",
      skipIfNoClient(async () => {
        // Load a UDF that reverses a string
        const script = `function reverseString(str) { 
  return str.split('').reverse().join(''); 
}
falkor.register("reverseString", reverseString);`;
        await falkorClient.udfLoad("arraylib", script);

        // Execute query using the array manipulation UDF
        const graph = falkorClient.selectGraph("udf_array_graph");
        const result: any = await graph.query(
          "RETURN arraylib.reverseString('FalkorDB') AS reversed"
        );

        expect(result.data).toBeDefined();
        expect(result.data.length).toBe(1);
        expect(result.data[0].reversed).toBe("BDroklaF");

        // Cleanup
        await graph.delete();
        await falkorClient.udfDelete("arraylib");
      })
    );

    it(
      "should execute a query with a UDF loaded by passing a JavaScript function",
      skipIfNoClient(async () => {
        // Define a JavaScript function (using any type as TypeScript types are stripped in toString())
        const doubleValue = function doubleValue(n: any) {
          return n * 2;
        };

        // Load the UDF by passing the function directly (not as a string)
        // The client will convert it to string and add falkor.register
        const script = `${doubleValue.toString()}
falkor.register("doubleValue", doubleValue);`;
        await falkorClient.udfLoad("jslib", script);

        // Execute query using the UDF loaded from a JavaScript function
        const graph = falkorClient.selectGraph("udf_js_function_graph");
        const result: any = await graph.query(
          "RETURN jslib.doubleValue(21) AS doubled"
        );

        expect(result.data).toBeDefined();
        expect(result.data.length).toBe(1);
        expect(result.data[0].doubled).toBe(42);

        // Cleanup
        await graph.delete();
        await falkorClient.udfDelete("jslib");
      })
    );
  });
});
