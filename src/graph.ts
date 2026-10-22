import { RedisArgument } from "@redis/client";
import { Client } from "./clients/client";
import { Temporal } from "@js-temporal/polyfill";
import { ConstraintType, EntityType, GraphValueTypes } from "./enums";
import { SchemaVersionMismatchError } from "./errors";
import { ExecutionPlan } from "./execution-plan";
import type {
  GraphEdge,
  GraphEdgeRawValue,
  GraphEntityProperties,
  GraphEntityRawProperties,
  GraphMetadata,
  GraphMap,
  GraphNode,
  GraphNodeRawValue,
  GraphRawValue,
  GraphReply,
  GraphValue,
  MemoryUsageOptions,
  PlanOptions,
  QueryOptions,
  QueryReply,
} from "./types";

export { ConstraintType, EntityType };
export type { GraphReply };

// export type GraphConnection = SingleGraphConnection | ClusterGraphConnection;

/**
 * What the client knows about a graph's schema. Every `Graph` instance for the
 * same graph shares one, so a change seen through any of them invalidates the
 * metadata cached by all of them.
 */
export interface GraphSchemaState {
  // Bumped whenever cached metadata becomes invalid
  generation: number;
  // The server's schema version, sent with each query so the server rejects
  // it if the schema changed (e.g. the graph was deleted and recreated by
  // another client) instead of the reply being decoded with stale names
  version: number;
}

export interface GraphCacheOptions {
  schema?: GraphSchemaState;
  onDelete?: (graph: Graph) => void;
}

export default class Graph {
  #client: Client;
  #name: string;
  #metadata?: { generation: number; names: GraphMetadata };
  #schema: GraphSchemaState;
  #onDelete?: (graph: Graph) => void;

  constructor(client: Client, name: string, cache?: GraphCacheOptions) {
    this.#client = client;
    this.#name = name;
    this.#schema = cache?.schema ?? { generation: 0, version: 0 };
    this.#onDelete = cache?.onDelete;
  }

  async query<T>(query: RedisArgument, options?: QueryOptions) {
    const reply = await this.#withSchemaVersion((version) =>
      this.#client.query(this.#name, query, options, true, version)
    );
    return this.#parseReply<T>(reply);
  }

  async roQuery<T>(query: RedisArgument, options?: QueryOptions) {
    const reply = await this.#withSchemaVersion((version) =>
      this.#client.roQuery(this.#name, query, options, true, version)
    );
    return this.#parseReply<T>(reply);
  }

  async #withSchemaVersion(
    run: (version?: number) => Promise<QueryReply>
  ): Promise<QueryReply> {
    try {
      return await run(this.#schema.version);
    } catch (err) {
      if (!(err instanceof SchemaVersionMismatchError)) throw err;

      // The server rejected the query without running it, so retrying is
      // safe. Metadata fetched from here on is at least as new as
      // `err.version`, so pairing the two is sound. The retry is sent without
      // a version so that further concurrent schema changes cannot make it
      // loop; names they add get new ids and are fetched when needed.
      this.clearMetadataCache();
      this.#schema.version = err.version;
      return run();
    }
  }

  async delete() {
    const reply = await this.#client.delete(this.#name);
    // The instance is reused by `selectGraph`, and a graph recreated under the
    // same name assigns new ids, so the cached metadata must not outlive it.
    this.clearMetadataCache();
    // A recreated graph starts from an empty schema, whose version is 0
    this.#schema.version = 0;
    this.#onDelete?.(this);
    return reply;
  }

  /**
   * Drops the cached labels, relationship types and property keys, here and in
   * every other instance `selectGraph` returned for this graph, so they are
   * refetched the next time a reply needs them. A fetch already in flight does
   * not repopulate the cache. Schema changes made by other clients are detected
   * on the next query, so this is rarely needed.
   */
  clearMetadataCache() {
    this.#schema.generation++;
    this.#metadata = undefined;
  }

  /** Returns the query's execution plan, one operation per line. */
  async explain(query: string, options?: PlanOptions) {
    return this.#client.explain(this.#name, query, options);
  }

  /**
   * Runs the query and returns its execution plan, one operation per line,
   * annotated with each operation's runtime statistics.
   */
  async profile(query: string, options?: PlanOptions) {
    return this.#client.profile(this.#name, query, options);
  }

  /** Like `explain`, but parses the plan into an operation tree. */
  async explainPlan(query: string, options?: PlanOptions): Promise<ExecutionPlan> {
    return new ExecutionPlan(await this.explain(query, options));
  }

  /** Like `profile`, but parses the plan into an operation tree. */
  async profilePlan(query: string, options?: PlanOptions): Promise<ExecutionPlan> {
    return new ExecutionPlan(await this.profile(query, options));
  }

	async memoryUsage(options?: MemoryUsageOptions) {
		return this.#client.memoryUsage(this.#name, options)
	}

	async slowLog() {
		return this.#client.slowLog(
			this.#name,
		)
	}

  async constraintCreate(
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]
  ) {
    return this.#client.constraintCreate(
      this.#name,
      constraintType,
      entityType,
      label,
      ...properties
    );
  }

  async constraintDrop(
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]
  ) {
    return this.#client.constraintDrop(
      this.#name,
      constraintType,
      entityType,
      label,
      ...properties
    );
  }

  async copy(destGraph: string) {
    return this.#client.copy(this.#name, destGraph);
  }

  #pendingMetadata?: { generation: number; promise: Promise<GraphMetadata> };

  #updateMetadata(): Promise<GraphMetadata> {
    const generation = this.#schema.generation;
    // A fetch started before the metadata was invalidated is not joined
    if (this.#pendingMetadata?.generation !== generation) {
      const pending = {
        generation,
        promise: this.#setMetadata(generation).finally(() => {
          if (this.#pendingMetadata === pending) {
            this.#pendingMetadata = undefined;
          }
        }),
      };
      this.#pendingMetadata = pending;
    }
    return this.#pendingMetadata.promise;
  }

  // DO NOT use directly, use #updateMetadata instead
  async #setMetadata(generation: number): Promise<GraphMetadata> {
    const [labels, relationshipTypes, propertyKeys] = await Promise.all([
      this.#client.roQuery(this.#name, "CALL db.labels()", undefined, false),
      this.#client.roQuery(
        this.#name,
        "CALL db.relationshipTypes()",
        undefined,
        false
      ),
      this.#client.roQuery(
        this.#name,
        "CALL db.propertyKeys()",
        undefined,
        false
      ),
    ]);

    const metadata = {
      labels: this.#cleanMetadataArray(labels.data as Array<[string]>),
      relationshipTypes: this.#cleanMetadataArray(
        relationshipTypes.data as Array<[string]>
      ),
      propertyKeys: this.#cleanMetadataArray(
        propertyKeys.data as Array<[string]>
      ),
    };

    // The caller's reply predates any reset, so it still gets these names,
    // but they are only cached if the graph was not deleted meanwhile
    if (generation === this.#schema.generation) {
      this.#metadata = { generation, names: metadata };
    }
    return metadata;
  }

  #cleanMetadataArray(arr: Array<[string]>): Array<string> {
    return arr.map(([value]) => value);
  }

  #getMetadata<T extends keyof GraphMetadata>(
    key: T,
    id: number
  ): GraphMetadata[T][number] | Promise<GraphMetadata[T][number]> {
    const metadata =
      this.#metadata?.generation === this.#schema.generation
        ? this.#metadata.names
        : undefined;
    return metadata?.[key][id] ?? this.#getMetadataAsync(key, id);
  }

  // DO NOT use directly, use #getMetadata instead
  async #getMetadataAsync<T extends keyof GraphMetadata>(
    key: T,
    id: number
  ): Promise<GraphMetadata[T][number]> {
    const value = (await this.#updateMetadata())[key][id];
    if (value === undefined)
      throw new Error(`Cannot find value from ${key}[${id}]`);
    return value;
  }

  async #parseReply<T>(reply: QueryReply): Promise<GraphReply<T>> {
    if (!reply.data) return reply;

    const promises: Array<Promise<unknown>> = [],
      parsed = {
        metadata: reply.metadata,
        data: reply.data!.map((row) => {
          const data: Record<string, GraphValue> = {};
          if (Array.isArray(row)) {
            for (let i = 0; i < row.length; i++) {
              const value = row[i] as GraphRawValue;
              data[reply.headers[i][1]] = this.#parseValue(value, promises);
            }
          }

          return data as unknown as T;
        }),
      };

    if (promises.length) await Promise.all(promises);

    return parsed;
  }

  #parseValue(
    [valueType, value]: GraphRawValue,
    promises: Array<Promise<unknown>>
  ): GraphValue {
    switch (valueType) {
      case GraphValueTypes.NULL:
        return null;

      case GraphValueTypes.STRING:
      case GraphValueTypes.INTEGER:
        return value;

      case GraphValueTypes.BOOLEAN:
        return value === "true";

      case GraphValueTypes.DOUBLE:
        return parseFloat(value);

      case GraphValueTypes.ARRAY:
        return value.map((x) => this.#parseValue(x, promises));

      case GraphValueTypes.EDGE:
        return this.#parseEdge(value, promises);

      case GraphValueTypes.NODE:
        return this.#parseNode(value, promises);

      case GraphValueTypes.PATH:
        return {
          nodes: value[0][1].map(([, node]) => this.#parseNode(node, promises)),
          edges: value[1][1].map(([, edge]) => this.#parseEdge(edge, promises)),
        };

      case GraphValueTypes.MAP: {
        const map: GraphMap = {};
        for (let i = 0; i < value.length; i++) {
          map[value[i++] as string] = this.#parseValue(
            value[i] as GraphRawValue,
            promises
          );
        }

        return map;
      }

      case GraphValueTypes.POINT:
        return {
          latitude: parseFloat(value[0]),
          longitude: parseFloat(value[1]),
        };

      case GraphValueTypes.VECTORF32:
        return value.map((x) => Number(x));

      case GraphValueTypes.DATETIME:
        return Temporal.Instant.fromEpochMilliseconds(value * 1000)
          .toZonedDateTimeISO("UTC")
          .toPlainDateTime();
      case GraphValueTypes.DATE:
        return Temporal.Instant.fromEpochMilliseconds(value * 1000)
          .toZonedDateTimeISO("UTC")
          .toPlainDate();
      case GraphValueTypes.TIME:
        return Temporal.Instant.fromEpochMilliseconds(value * 1000)
          .toZonedDateTimeISO("UTC")
          .toPlainTime();
      case GraphValueTypes.DURATION:
        const time = Temporal.Instant.fromEpochMilliseconds(value * 1000);
        const epoch = Temporal.Instant.fromEpochMilliseconds(0);

        return epoch
          .toZonedDateTimeISO("UTC")
          .until(time.toZonedDateTimeISO("UTC"), {
            largestUnit: "years",
          });
      default:
        throw new Error(`unknown scalar type: ${valueType}`);
    }
  }

  #parseEdge(
    [
      id,
      relationshipTypeId,
      sourceId,
      destinationId,
      properties,
    ]: GraphEdgeRawValue[1],
    promises: Array<Promise<unknown>>
  ): GraphEdge {
    const edge = {
      id,
      sourceId,
      destinationId,
      properties: this.#parseProperties(properties, promises),
    } as GraphEdge;

    const relationshipType = this.#getMetadata(
      "relationshipTypes",
      relationshipTypeId
    );
    if (relationshipType instanceof Promise) {
      promises.push(
        relationshipType.then((value) => (edge.relationshipType = value))
      );
    } else {
      edge.relationshipType = relationshipType;
    }

    return edge;
  }

  #parseNode(
    [id, labelIds, properties]: GraphNodeRawValue[1],
    promises: Array<Promise<unknown>>
  ): GraphNode {
    const labels = new Array<string>(labelIds.length);
    for (let i = 0; i < labelIds.length; i++) {
      const value = this.#getMetadata("labels", labelIds[i]);
      if (value instanceof Promise) {
        promises.push(value.then((value) => (labels[i] = value)));
      } else {
        labels[i] = value;
      }
    }

    return {
      id,
      labels,
      properties: this.#parseProperties(properties, promises),
    };
  }

  #parseProperties(
    raw: GraphEntityRawProperties,
    promises: Array<Promise<unknown>>
  ): GraphEntityProperties {
    const parsed: GraphEntityProperties = {};
    for (const [id, type, value] of raw) {
      const parsedValue = this.#parseValue(
          [type, value] as GraphRawValue,
          promises
        ),
        key = this.#getMetadata("propertyKeys", id);
      if (key instanceof Promise) {
        promises.push(key.then((key) => (parsed[key] = parsedValue)));
      } else {
        parsed[key] = parsedValue;
      }
    }

    return parsed;
  }

  async createTypedIndex(
    idxType: string,
    entityType: "NODE" | "EDGE",
    label: string,
    properties: string[],
    options?: Record<string, string | number | boolean>
  ): Promise<QueryReply> {
    const pattern =
      entityType === "NODE" ? `(e:${label})` : `()-[e:${label}]->()`;

    if (idxType === "RANGE") {
      idxType = "";
    }

    let query = `CREATE ${
      idxType ? idxType + " " : ""
    }INDEX FOR ${pattern} ON (${properties
      .map((prop) => `e.${prop}`)
      .join(", ")})`;

    if (options) {
      const optionsMap = Object.entries(options)
        .map(([key, value]) =>
          typeof value === "string" ? `${key}:'${value}'` : `${key}:${value}`
        )
        .join(", ");
      query += ` OPTIONS {${optionsMap}}`;
    }

    return this.#client.query(this.#name, query);
  }

  async createNodeRangeIndex(
    label: string,
    ...properties: string[]
  ): Promise<QueryReply> {
    return this.createTypedIndex("RANGE", "NODE", label, properties);
  }

  async createNodeFulltextIndex(
    label: string,
    ...properties: string[]
  ): Promise<QueryReply> {
    return this.createTypedIndex("FULLTEXT", "NODE", label, properties);
  }

  async createNodeVectorIndex(
    label: string,
    dim: number = 0,
    similarityFunction: string = "euclidean",
    ...properties: string[]
  ): Promise<QueryReply> {
    const options = {
      dimension: dim,
      similarityFunction: similarityFunction,
    };

    return await this.createTypedIndex(
      "VECTOR",
      "NODE",
      label,
      properties,
      options
    );
  }

  async createEdgeRangeIndex(
    label: string,
    ...properties: string[]
  ): Promise<QueryReply> {
    return this.createTypedIndex("RANGE", "EDGE", label, properties);
  }

  async createEdgeFulltextIndex(
    label: string,
    ...properties: string[]
  ): Promise<QueryReply> {
    return this.createTypedIndex("FULLTEXT", "EDGE", label, properties);
  }

  async createEdgeVectorIndex(
    label: string,
    dim: number = 0,
    similarityFunction: string = "euclidean",
    ...properties: string[]
  ): Promise<QueryReply> {
    const options = {
      dimension: dim,
      similarityFunction: similarityFunction,
    };

    return await this.createTypedIndex(
      "VECTOR",
      "EDGE",
      label,
      properties,
      options
    );
  }

  async dropTypedIndex(
    idxType: string,
    entityType: "NODE" | "EDGE",
    label: string,
    attribute: string
  ): Promise<QueryReply> {
    const pattern =
      entityType === "NODE" ? `(e:${label})` : `()-[e:${label}]->()`;

    if (idxType === "RANGE") {
      idxType = "";
    }

    let query = `DROP ${
      idxType ? idxType + " " : ""
    }INDEX FOR ${pattern} ON (e.${attribute})`;

    return this.#client.query(this.#name, query);
  }

  async dropNodeRangeIndex(
    label: string,
    attribute: string
  ): Promise<QueryReply> {
    return this.dropTypedIndex("RANGE", "NODE", label, attribute);
  }

  async dropNodeFulltextIndex(
    label: string,
    attribute: string
  ): Promise<QueryReply> {
    return this.dropTypedIndex("FULLTEXT", "NODE", label, attribute);
  }

  async dropNodeVectorIndex(
    label: string,
    attribute: string
  ): Promise<QueryReply> {
    return this.dropTypedIndex("VECTOR", "NODE", label, attribute);
  }

  async dropEdgeRangeIndex(
    label: string,
    attribute: string
  ): Promise<QueryReply> {
    return this.dropTypedIndex("RANGE", "EDGE", label, attribute);
  }

  async dropEdgeFulltextIndex(
    label: string,
    attribute: string
  ): Promise<QueryReply> {
    return this.dropTypedIndex("FULLTEXT", "EDGE", label, attribute);
  }

  async dropEdgeVectorIndex(
    label: string,
    attribute: string
  ): Promise<QueryReply> {
    return this.dropTypedIndex("VECTOR", "EDGE", label, attribute);
  }
}

export { Graph };
