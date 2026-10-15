import { describe, it, beforeAll, beforeEach, afterAll, expect, jest } from '@jest/globals';
import FalkorDB from "../src/falkordb";
import { Client } from "../src/clients/client";
import { ReadOnly } from "../src/clients/readOnly";
import { ConstraintType, EntityType } from "../src/graph";
import { client } from "./dbConnection";

function getRandomNumber(): number {
  return Math.floor(Math.random() * 999999);
}

describe("ReadOnly Client Tests", () => {
  let inner: Record<string, jest.Mock<(...args: any[]) => Promise<any>>>;
  let readOnly: ReadOnly;

  beforeEach(() => {
    inner = {};
    const target = new Proxy(inner, {
      get: (mocks, method: string) =>
        (mocks[method] ??= jest.fn(async () => `${method} result`)),
    });
    readOnly = new ReadOnly(target as unknown as Client);
  });

  it("should send query as a read-only query", async () => {
    await expect(readOnly.query("g", "MATCH (n) RETURN n", { params: { a: 1 } }, false))
      .resolves.toBe("roQuery result");
    expect(inner.roQuery).toHaveBeenCalledWith("g", "MATCH (n) RETURN n", { params: { a: 1 } }, false);
    expect(inner.query).toBeUndefined();
  });

  it("should forward read commands", async () => {
    await expect(readOnly.roQuery("g", "RETURN 1")).resolves.toBe("roQuery result");
    await expect(readOnly.explain("g", "RETURN 1")).resolves.toBe("explain result");
    await expect(readOnly.list()).resolves.toBe("list result");
    await expect(readOnly.stubs()).resolves.toBe("stubs result");
    await expect(readOnly.configGet("TIMEOUT")).resolves.toBe("configGet result");
    await expect(readOnly.info()).resolves.toBe("info result");
    await expect(readOnly.slowLog("g")).resolves.toBe("slowLog result");
    await expect(readOnly.memoryUsage("g")).resolves.toBe("memoryUsage result");
    await expect(readOnly.udfList()).resolves.toBe("udfList result");
    await expect(readOnly.disconnect()).resolves.toBe("disconnect result");
  });

  it.each([
    ["GRAPH.CONFIG SET", (c: ReadOnly) => c.configSet("TIMEOUT", 1)],
    ["GRAPH.PROFILE", (c: ReadOnly) => c.profile("g", "RETURN 1")],
    ["GRAPH.COPY", (c: ReadOnly) => c.copy("g", "g2")],
    ["GRAPH.DELETE", (c: ReadOnly) => c.delete("g")],
    ["GRAPH.CONSTRAINT CREATE", (c: ReadOnly) =>
      c.constraintCreate("g", ConstraintType.UNIQUE, EntityType.NODE, "L", "p")],
    ["GRAPH.CONSTRAINT DROP", (c: ReadOnly) =>
      c.constraintDrop("g", ConstraintType.UNIQUE, EntityType.NODE, "L", "p")],
    ["GRAPH.UDF LOAD", (c: ReadOnly) => c.udfLoad("lib", "function f() {}")],
    ["GRAPH.UDF FLUSH", (c: ReadOnly) => c.udfFlush()],
    ["GRAPH.UDF DELETE", (c: ReadOnly) => c.udfDelete("lib")],
  ])("should reject %s without sending it", async (command, run) => {
    await expect(run(readOnly)).rejects.toThrow(
      `${command} is not allowed on a read-only connection`
    );
    expect(Object.keys(inner)).toHaveLength(0);
  });
});

describe("Read-only connection Tests", () => {
  let writeClient: FalkorDB;
  let readOnlyClient: FalkorDB;
  const graphName = `readonly_${getRandomNumber()}`;

  beforeAll(async () => {
    try {
      writeClient = await client();
      readOnlyClient = await FalkorDB.connect({
        socket: {
          host: process.env.FALKORDB_HOST || "localhost",
          port: parseInt(process.env.FALKORDB_PORT || "6379", 10),
        },
        readonly: true,
      });
      await writeClient.selectGraph(graphName).query("CREATE (:Person {name: 'Alice'})");
    } catch (error) {
      console.error("Failed to connect to FalkorDB:", error);
    }
  });

  afterAll(async () => {
    if (writeClient) {
      await writeClient.selectGraph(graphName).delete().catch(() => {});
      await writeClient.close();
    }
    if (readOnlyClient) {
      await readOnlyClient.close();
    }
  });

  function skipIfNoClient(testFn: () => void | Promise<void>) {
    return async () => {
      if (!writeClient || !readOnlyClient) {
        return;
      }
      await testFn();
    };
  }

  it("should report whether the connection is read-only", skipIfNoClient(() => {
    expect(readOnlyClient.readonly).toBe(true);
    expect(writeClient.readonly).toBe(false);
  }));

  it("should run read queries", skipIfNoClient(async () => {
    const result = await readOnlyClient
      .selectGraph(graphName)
      .query<{ name: string }>("MATCH (p:Person) RETURN p.name AS name");
    expect(result.data).toEqual([{ name: "Alice" }]);
  }));

  it("should reject write queries", skipIfNoClient(async () => {
    await expect(
      readOnlyClient.selectGraph(graphName).query("CREATE (:Person {name: 'Bob'})")
    ).rejects.toThrow();

    const result = await writeClient
      .selectGraph(graphName)
      .query("MATCH (p:Person) RETURN count(p) AS count");
    expect(result.data).toEqual([{ count: 1 }]);
  }));

  it("should reject deleting a graph", skipIfNoClient(async () => {
    await expect(readOnlyClient.selectGraph(graphName).delete()).rejects.toThrow(
      "GRAPH.DELETE is not allowed on a read-only connection"
    );
    expect(await writeClient.list()).toContain(graphName);
  }));

  it("should reject configuration changes", skipIfNoClient(async () => {
    await expect(readOnlyClient.configSet("TIMEOUT", 1000)).rejects.toThrow(
      "GRAPH.CONFIG SET is not allowed on a read-only connection"
    );
  }));
});
