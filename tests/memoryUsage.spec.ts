import { client } from "./dbConnection";
import FalkorDB from "../src/falkordb";
import Graph from "../src/graph";

describe("MemoryUsage Tests", () => {
  let clientInstance: FalkorDB;
  let graph: Graph;

  beforeAll(async () => {
    try {
      clientInstance = await client();
    } catch (error) {
      console.error("Failed to initialize database connection:", error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await clientInstance.close();
    } catch (error) {
      console.error("Failed to close database connection:", error);
      throw error;
    }
  });

  beforeEach(async () => {
    graph = clientInstance.selectGraph("memoryUsage");
  });

  afterEach(async () => {
    await graph.delete();
  });

  it("Validate data returned from MemoryUsage", async () => {
    await graph.query("UNWIND range(1, 10) AS x CREATE (n:n)-[e:e]->(m:m)");
    const memoryProps = [
      "total_graph_sz_mb",
      "label_matrices_sz_mb",
      "relation_matrices_sz_mb",
      "amortized_node_block_sz_mb",
      "amortized_node_attributes_by_label_sz_mb",
      "amortized_unlabeled_nodes_attributes_sz_mb",
      "amortized_edge_block_sz_mb",
      "amortized_edge_attributes_by_type_sz_mb",
      "indices_sz_mb",
    ];

    const memoryList = await graph.memoryUsage();

    // Extract property names from even indices
    const returnedProps: string[] = [];
    for (let i = 0; i < memoryList.length; i += 2) {
      returnedProps.push(memoryList[i] as string);
    }

    // Check that all expected properties are present
    memoryProps.forEach((prop) => {
      expect(returnedProps).toContain(prop);
    });

    // Validate the structure: even indices are strings, odd indices are numbers or arrays
    for (let i = 0; i < memoryList.length; i++) {
      if (i % 2 === 0) {
        // Even index should be a string
        expect(typeof memoryList[i]).toBe("string");
      } else {
        // Odd index should be a number or array
        const value = memoryList[i];
        expect(typeof value === "number" || Array.isArray(value)).toBeTruthy();
      }
    }

    // Ensure the list has even length (key-value pairs)
    expect(memoryList.length % 2).toBe(0);
  });
});
