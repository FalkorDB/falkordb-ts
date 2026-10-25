import { RedisArgument } from "@redis/client";
import { Client } from "./clients/client";
import { Temporal } from "@js-temporal/polyfill";
import { ConstraintType, EntityType, GraphValueTypes } from "./enums";
import { SchemaVersionMismatchError } from "./errors";
import { parseQueryStatistics } from "./query-statistics";
import { ExecutionPlan } from "./execution-plan";
import { escapeIdentifier } from "./commands";
import type {
  CallProcedureOptions,
  ConstraintInfo,
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
  IndexInfo,
  MemoryUsageOptions,
  PlanOptions,
  QueryOptions,
  QueryParam,
  QueryParams,
  QueryReply,
  VectorIndexOptions,
} from "./types";

export { ConstraintType, EntityType };
export type { GraphReply };

// The error `CREATE INDEX` fails with when a property is already indexed
const ALREADY_INDEXED = /^Attribute '.*' is already indexed$/;

// Turns create{Node,Edge}VectorIndex's options into the index's OPTIONS map
function vectorIndexOptions(
  options: VectorIndexOptions
): Record<string, string | number> {
  // Catches the positional `(label, dimension, similarityFunction, ...)` form
  // removed in v7, which plain JavaScript callers could still use
  if (options === null || typeof options !== "object") {
    throw new TypeError(
      "Vector index options must be an object, e.g. { dimension: 768, similarityFunction: 'cosine' }"
    );
  }
  if (typeof options.dimension !== "number") {
    throw new TypeError("Vector index options must include a numeric dimension");
  }
  const { similarityFunction = "euclidean", ...rest } = options;
  const result: Record<string, string | number> = { similarityFunction };
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

// The names GRAPH.CONSTRAINT accepts (`PROPERTY_NAME_PATTERN` in FalkorDB's
// src/commands/cmd_constraint.c), stricter than what Cypher can quote
const CONSTRAINT_NAME = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

function validateConstraintName(kind: "Label" | "Property", name: string): void {
  if (!CONSTRAINT_NAME.test(name)) {
    throw new TypeError(
      `${kind} name ${JSON.stringify(name)} is invalid for a constraint: ` +
        "start with a letter or _, followed by letters, digits, _ or $"
    );
  }
}

// The pattern an index is defined on, with the label quoted so that names
// such as `Product Type` work
function indexPattern(entityType: "NODE" | "EDGE", label: string): string {
  const name = escapeIdentifier(label, "label");
  return entityType === "NODE" ? `(e:${name})` : `()-[e:${name}]->()`;
}

// export type GraphConnection = SingleGraphConnection | ClusterGraphConnection;

// A read is checked against the schema version on its first attempts, then
// sent once without a version, so that a schema changing faster than it can
// be read cannot keep it retrying. Four checked attempts cover a lagging
// replica's version, the master's, and a further change on the master.
const MAX_VERSIONED_READS = 5;

// State shared while decoding one reply
interface ParseContext {
  // Name lookups that had to fetch metadata
  promises: Array<Promise<unknown>>;
  // The schema version the server checked the reply against, if any: the
  // names used to decode it must come from that same schema
  version?: number;
}

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

// Unknown value types already warned about, so each is reported only once
const warnedUnknownValueTypes = new Set<number>();

function warnUnknownValueType(valueType: number): void {
  if (warnedUnknownValueTypes.has(valueType)) return;
  warnedUnknownValueTypes.add(valueType);
  console.warn(`FalkorDB: unknown value type ${valueType} in reply, returning null`);
}

export default class Graph {
  #client: Client;
  #name: string;
  #metadata?: { generation: number; version?: number; names: GraphMetadata };
  #schema: GraphSchemaState;
  #onDelete?: (graph: Graph) => void;

  constructor(client: Client, name: string, cache?: GraphCacheOptions) {
    this.#client = client;
    this.#name = name;
    this.#schema = cache?.schema ?? { generation: 0, version: 0 };
    this.#onDelete = cache?.onDelete;
  }

  /** The graph's name (its Redis key) */
  get name(): string {
    return this.#name;
  }

  async query<T>(query: RedisArgument, options?: QueryOptions) {
    const reply = await this.#withSchemaVersion((version) =>
      this.#client.query(this.#name, query, options, true, version)
    );
    return this.#parseReply<T>(reply);
  }

  async roQuery<T>(query: RedisArgument, options?: QueryOptions) {
    // Reads may be served by any node until one of them, or the master the
    // names come from, rejects the schema version
    let primary = false;
    for (let attempt = 1; ; attempt++) {
      const version =
        attempt < MAX_VERSIONED_READS ? this.#schema.version : undefined;
      try {
        const reply = await this.#client.roQuery(this.#name, query, options, true, version, primary);
        return await this.#parseReply<T>(reply, version);
      } catch (err) {
        if (!(err instanceof SchemaVersionMismatchError)) throw err;

        // A replica can lag behind the master, even keep a graph the master
        // deleted and recreated. Read from the master instead, still checked
        // against the version, so that its reply matches its names even if
        // the schema changes meanwhile. A version reported by a replica is
        // replaced by the master's when the master rejects it in turn. Reads
        // change nothing, so running one again is safe.
        this.clearMetadataCache();
        this.#schema.version = err.version;
        primary = true;
      }
    }
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

  /**
   * Returns the query's execution plan as an operation tree, without running
   * the query. The lines the server returned are kept in `steps`.
   */
  async explain(query: string, options?: PlanOptions): Promise<ExecutionPlan> {
    return new ExecutionPlan(await this.#client.explain(this.#name, query, options));
  }

  /**
   * Runs the query and returns its execution plan as an operation tree, each
   * operation annotated with its `recordsProduced` and `executionTime`. The
   * lines the server returned are kept in `steps`.
   */
  async profile(query: string, options?: PlanOptions): Promise<ExecutionPlan> {
    return new ExecutionPlan(await this.#client.profile(this.#name, query, options));
  }

	async memoryUsage(options?: MemoryUsageOptions) {
		return this.#client.memoryUsage(this.#name, options)
	}

	async slowLog() {
		return this.#client.slowLog(
			this.#name,
		)
	}

	/** Clears the graph's slow log (`GRAPH.SLOWLOG <graph> RESET`) */
	async slowLogReset() {
		return this.#client.slowLogReset(this.#name)
	}

  /**
   * Calls a procedure, e.g. `callProcedure('db.idx.fulltext.queryNodes', ['Movie', 'Jungle'])`.
   * The arguments are sent as query parameters, so they need no escaping.
   * Runs as a read-only query unless `readOnly` is `false`.
   */
  async callProcedure<T>(
    procedure: string,
    args: QueryParam[] = [],
    options: CallProcedureOptions = {}
  ): Promise<GraphReply<T>> {
    const params: QueryParams = {};
    const placeholders = args.map((arg, i) => {
      params[`param${i}`] = arg;
      return `$param${i}`;
    });

    let query = `CALL ${procedure}(${placeholders.join(",")})`;
    if (options.yields?.length) {
      query += ` YIELD ${options.yields.join(",")}`;
    }

    const queryOptions: QueryOptions = { TIMEOUT: options.timeout };
    if (args.length) queryOptions.params = params;

    return options.readOnly === false
      ? this.query<T>(query, queryOptions)
      : this.roQuery<T>(query, queryOptions);
  }

  /** Lists the graph's indexes (`CALL db.indexes()`) */
  async listIndices(): Promise<IndexInfo[]> {
    type Row = Omit<IndexInfo, "entityType"> & { entitytype: string };
    const reply = await this.callProcedure<Row>("db.indexes");
    return (reply.data ?? []).map(({ entitytype, ...index }) => ({
      ...index,
      entityType: entitytype,
    }));
  }

  /** Lists the graph's constraints and their status (`CALL db.constraints()`) */
  async listConstraints(): Promise<ConstraintInfo[]> {
    type Row = Omit<ConstraintInfo, "entityType"> & {
      entitytype: ConstraintInfo["entityType"];
    };
    const reply = await this.callProcedure<Row>("db.constraints");
    return (reply.data ?? []).map(({ entitytype, ...constraint }) => ({
      ...constraint,
      entityType: entitytype,
    }));
  }

  /**
   * Creates a constraint (`GRAPH.CONSTRAINT CREATE`).
   *
   * A unique constraint requires a range index on each of its properties, so
   * for `ConstraintType.UNIQUE` this first creates that index on every
   * property that is not indexed yet (an existing index is reused). Mandatory
   * constraints need no index and create none.
   *
   * The constraint is enforced asynchronously: the server accepts it before
   * checking the existing data, so poll `listConstraints()` until its status
   * is `OPERATIONAL` (or `FAILED` if existing entities violate it).
   */
  async constraintCreate(
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]
  ) {
    // Checked before the supporting indexes are created, so that a name the
    // server rejects for a constraint leaves no index behind
    validateConstraintName("Label", label);
    properties.forEach((property) => validateConstraintName("Property", property));

    if (constraintType === ConstraintType.UNIQUE) {
      await this.#ensureRangeIndexes(
        entityType === EntityType.RELATIONSHIP ? "EDGE" : "NODE",
        label,
        properties
      );
    }
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

  /**
   * Creates a unique constraint on nodes, together with the range index it
   * requires on each property. Enforced asynchronously, see `constraintCreate`.
   */
  async createNodeUniqueConstraint(label: string, ...properties: string[]) {
    return this.constraintCreate(
      ConstraintType.UNIQUE,
      EntityType.NODE,
      label,
      ...properties
    );
  }

  /**
   * Creates a unique constraint on relationships, together with the range
   * index it requires on each property. Enforced asynchronously, see
   * `constraintCreate`.
   */
  async createEdgeUniqueConstraint(relation: string, ...properties: string[]) {
    return this.constraintCreate(
      ConstraintType.UNIQUE,
      EntityType.RELATIONSHIP,
      relation,
      ...properties
    );
  }

  /**
   * Creates a mandatory constraint on nodes. Enforced asynchronously, see
   * `constraintCreate`.
   */
  async createNodeMandatoryConstraint(label: string, ...properties: string[]) {
    return this.constraintCreate(
      ConstraintType.MANDATORY,
      EntityType.NODE,
      label,
      ...properties
    );
  }

  /**
   * Creates a mandatory constraint on relationships. Enforced asynchronously,
   * see `constraintCreate`.
   */
  async createEdgeMandatoryConstraint(
    relation: string,
    ...properties: string[]
  ) {
    return this.constraintCreate(
      ConstraintType.MANDATORY,
      EntityType.RELATIONSHIP,
      relation,
      ...properties
    );
  }

  /** Drops a unique constraint on nodes; its supporting range index is kept */
  async dropNodeUniqueConstraint(label: string, ...properties: string[]) {
    return this.constraintDrop(
      ConstraintType.UNIQUE,
      EntityType.NODE,
      label,
      ...properties
    );
  }

  /** Drops a unique constraint on relationships; its supporting range index is kept */
  async dropEdgeUniqueConstraint(relation: string, ...properties: string[]) {
    return this.constraintDrop(
      ConstraintType.UNIQUE,
      EntityType.RELATIONSHIP,
      relation,
      ...properties
    );
  }

  async dropNodeMandatoryConstraint(label: string, ...properties: string[]) {
    return this.constraintDrop(
      ConstraintType.MANDATORY,
      EntityType.NODE,
      label,
      ...properties
    );
  }

  async dropEdgeMandatoryConstraint(relation: string, ...properties: string[]) {
    return this.constraintDrop(
      ConstraintType.MANDATORY,
      EntityType.RELATIONSHIP,
      relation,
      ...properties
    );
  }

  // Indexes each property separately: a single CREATE INDEX over several
  // properties fails as a whole if any of them is already indexed
  async #ensureRangeIndexes(
    entityType: "NODE" | "EDGE",
    label: string,
    properties: string[]
  ) {
    for (const property of properties) {
      try {
        await this.createTypedIndex("RANGE", entityType, label, [property]);
      } catch (err) {
        if (!(err instanceof Error && ALREADY_INDEXED.test(err.message))) {
          throw err;
        }
      }
    }
  }

  async copy(destGraph: string) {
    return this.#client.copy(this.#name, destGraph);
  }

  #pendingMetadata?: {
    generation: number;
    version?: number;
    promise: Promise<GraphMetadata>;
  };

  #updateMetadata(version?: number): Promise<GraphMetadata> {
    const generation = this.#schema.generation;
    // A fetch started before the metadata was invalidated, or for another
    // schema version, is not joined
    if (
      this.#pendingMetadata?.generation !== generation ||
      this.#pendingMetadata.version !== version
    ) {
      const pending = {
        generation,
        version,
        promise: this.#setMetadata(generation, version).finally(() => {
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
  async #setMetadata(
    generation: number,
    version?: number
  ): Promise<GraphMetadata> {
    // Fetched from the master: a reply served by it (every write's) can use
    // names a lagging replica does not have yet. With a version, the master
    // rejects the fetch unless its schema is the one the reply was checked
    // against, e.g. one a replica served from a graph since recreated.
    const [labels, relationshipTypes, propertyKeys] = await Promise.all([
      this.#client.roQuery(this.#name, "CALL db.labels()", undefined, false, version, true),
      this.#client.roQuery(
        this.#name,
        "CALL db.relationshipTypes()",
        undefined,
        false,
        version,
        true
      ),
      this.#client.roQuery(
        this.#name,
        "CALL db.propertyKeys()",
        undefined,
        false,
        version,
        true
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
      this.#metadata = { generation, version, names: metadata };
    }
    return metadata;
  }

  #cleanMetadataArray(arr: Array<[string]>): Array<string> {
    return arr.map(([value]) => value);
  }

  #getMetadata<T extends keyof GraphMetadata>(
    key: T,
    id: number,
    version?: number
  ): GraphMetadata[T][number] | Promise<GraphMetadata[T][number]> {
    const metadata =
      this.#metadata?.generation === this.#schema.generation &&
      (version === undefined || this.#metadata.version === version)
        ? this.#metadata.names
        : undefined;
    return metadata?.[key][id] ?? this.#getMetadataAsync(key, id, version);
  }

  // DO NOT use directly, use #getMetadata instead
  async #getMetadataAsync<T extends keyof GraphMetadata>(
    key: T,
    id: number,
    version?: number
  ): Promise<GraphMetadata[T][number]> {
    const value = (await this.#updateMetadata(version))[key][id];
    if (value === undefined)
      throw new Error(`Cannot find value from ${key}[${id}]`);
    return value;
  }

  async #parseReply<T>(
    reply: QueryReply,
    version?: number
  ): Promise<GraphReply<T>> {
    // The raw statistic lines are replaced by their parsed form
    const stats = parseQueryStatistics(reply.metadata);
    if (!reply.data) return { stats };

    // Compact replies describe each column as [type, name]
    const headers = (reply.headers as unknown as Array<[number, string]>).map(
      ([, name]) => name
    );
    const ctx: ParseContext = { promises: [], version },
      parsed = {
        headers,
        stats,
        data: reply.data!.map((row) => {
          const data: Record<string, GraphValue> = {};
          if (Array.isArray(row)) {
            for (let i = 0; i < row.length; i++) {
              const value = row[i] as GraphRawValue;
              data[headers[i]] = this.#parseValue(value, ctx);
            }
          }

          return data as unknown as T;
        }),
      };

    if (ctx.promises.length) await Promise.all(ctx.promises);

    return parsed;
  }

  #parseValue(
    [valueType, value]: GraphRawValue,
    ctx: ParseContext
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
        return value.map((x) => this.#parseValue(x, ctx));

      case GraphValueTypes.EDGE:
        return this.#parseEdge(value, ctx);

      case GraphValueTypes.NODE:
        return this.#parseNode(value, ctx);

      case GraphValueTypes.PATH:
        return {
          nodes: value[0][1].map(([, node]) => this.#parseNode(node, ctx)),
          edges: value[1][1].map(([, edge]) => this.#parseEdge(edge, ctx)),
        };

      case GraphValueTypes.MAP: {
        const map: GraphMap = {};
        for (let i = 0; i < value.length; i++) {
          map[value[i++] as string] = this.#parseValue(
            value[i] as GraphRawValue,
            ctx
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
        // A type this client does not know yet (e.g. one added by a newer
        // server) is read as null rather than failing the whole query
        warnUnknownValueType(valueType);
        return null;
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
    ctx: ParseContext
  ): GraphEdge {
    const edge = {
      id,
      sourceId,
      destinationId,
      properties: this.#parseProperties(properties, ctx),
    } as GraphEdge;

    const relationshipType = this.#getMetadata(
      "relationshipTypes",
      relationshipTypeId,
      ctx.version
    );
    if (relationshipType instanceof Promise) {
      ctx.promises.push(
        relationshipType.then((value) => (edge.relationshipType = value))
      );
    } else {
      edge.relationshipType = relationshipType;
    }

    return edge;
  }

  #parseNode(
    [id, labelIds, properties]: GraphNodeRawValue[1],
    ctx: ParseContext
  ): GraphNode {
    const labels = new Array<string>(labelIds.length);
    for (let i = 0; i < labelIds.length; i++) {
      const value = this.#getMetadata("labels", labelIds[i], ctx.version);
      if (value instanceof Promise) {
        ctx.promises.push(value.then((value) => (labels[i] = value)));
      } else {
        labels[i] = value;
      }
    }

    return {
      id,
      labels,
      properties: this.#parseProperties(properties, ctx),
    };
  }

  #parseProperties(
    raw: GraphEntityRawProperties,
    ctx: ParseContext
  ): GraphEntityProperties {
    const parsed: GraphEntityProperties = {};
    for (const [id, type, value] of raw) {
      const parsedValue = this.#parseValue(
          [type, value] as GraphRawValue,
          ctx
        ),
        key = this.#getMetadata("propertyKeys", id, ctx.version);
      if (key instanceof Promise) {
        ctx.promises.push(key.then((key) => (parsed[key] = parsedValue)));
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
  ): Promise<GraphReply<never>> {
    const pattern = indexPattern(entityType, label);

    if (idxType === "RANGE") {
      idxType = "";
    }

    let query = `CREATE ${
      idxType ? idxType + " " : ""
    }INDEX FOR ${pattern} ON (${properties
      .map((prop) => `e.${escapeIdentifier(prop, "property name")}`)
      .join(", ")})`;

    if (options) {
      const optionsMap = Object.entries(options)
        .map(([key, value]) =>
          typeof value === "string" ? `${key}:'${value}'` : `${key}:${value}`
        )
        .join(", ");
      query += ` OPTIONS {${optionsMap}}`;
    }

    return this.query<never>(query);
  }

  async createNodeRangeIndex(
    label: string,
    ...properties: string[]
  ): Promise<GraphReply<never>> {
    return this.createTypedIndex("RANGE", "NODE", label, properties);
  }

  async createNodeFulltextIndex(
    label: string,
    ...properties: string[]
  ): Promise<GraphReply<never>> {
    return this.createTypedIndex("FULLTEXT", "NODE", label, properties);
  }

  /**
   * Creates a vector index, e.g.
   * `createNodeVectorIndex(label, { dimension: 768, similarityFunction: 'cosine' }, 'embedding')`.
   */
  async createNodeVectorIndex(
    label: string,
    options: VectorIndexOptions,
    ...properties: string[]
  ): Promise<GraphReply<never>> {
    return this.createTypedIndex(
      "VECTOR",
      "NODE",
      label,
      properties,
      vectorIndexOptions(options)
    );
  }

  async createEdgeRangeIndex(
    label: string,
    ...properties: string[]
  ): Promise<GraphReply<never>> {
    return this.createTypedIndex("RANGE", "EDGE", label, properties);
  }

  async createEdgeFulltextIndex(
    label: string,
    ...properties: string[]
  ): Promise<GraphReply<never>> {
    return this.createTypedIndex("FULLTEXT", "EDGE", label, properties);
  }

  /**
   * Creates a vector index, e.g.
   * `createEdgeVectorIndex(label, { dimension: 768, similarityFunction: 'cosine' }, 'embedding')`.
   */
  async createEdgeVectorIndex(
    label: string,
    options: VectorIndexOptions,
    ...properties: string[]
  ): Promise<GraphReply<never>> {
    return this.createTypedIndex(
      "VECTOR",
      "EDGE",
      label,
      properties,
      vectorIndexOptions(options)
    );
  }

  async dropTypedIndex(
    idxType: string,
    entityType: "NODE" | "EDGE",
    label: string,
    attribute: string
  ): Promise<GraphReply<never>> {
    const pattern = indexPattern(entityType, label);

    if (idxType === "RANGE") {
      idxType = "";
    }

    let query = `DROP ${
      idxType ? idxType + " " : ""
    }INDEX FOR ${pattern} ON (e.${escapeIdentifier(attribute, "property name")})`;

    return this.query<never>(query);
  }

  async dropNodeRangeIndex(
    label: string,
    attribute: string
  ): Promise<GraphReply<never>> {
    return this.dropTypedIndex("RANGE", "NODE", label, attribute);
  }

  async dropNodeFulltextIndex(
    label: string,
    attribute: string
  ): Promise<GraphReply<never>> {
    return this.dropTypedIndex("FULLTEXT", "NODE", label, attribute);
  }

  async dropNodeVectorIndex(
    label: string,
    attribute: string
  ): Promise<GraphReply<never>> {
    return this.dropTypedIndex("VECTOR", "NODE", label, attribute);
  }

  async dropEdgeRangeIndex(
    label: string,
    attribute: string
  ): Promise<GraphReply<never>> {
    return this.dropTypedIndex("RANGE", "EDGE", label, attribute);
  }

  async dropEdgeFulltextIndex(
    label: string,
    attribute: string
  ): Promise<GraphReply<never>> {
    return this.dropTypedIndex("FULLTEXT", "EDGE", label, attribute);
  }

  async dropEdgeVectorIndex(
    label: string,
    attribute: string
  ): Promise<GraphReply<never>> {
    return this.dropTypedIndex("VECTOR", "EDGE", label, attribute);
  }
}

export { Graph };
