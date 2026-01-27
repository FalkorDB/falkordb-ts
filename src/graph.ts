import { RedisArgument } from "@redis/client";
import { QueryOptions } from "./commands";
import { QueryReply } from "./commands/QUERY";
import { ConstraintType, EntityType } from "./commands/CONSTRAINT_CREATE";
import { Client } from "./clients/client";
import { Temporal } from "@js-temporal/polyfill";
import { MemoryUsageOptions } from "./commands/MEMORY_USAGE";

export { ConstraintType, EntityType };

interface GraphMetadata {
  labels: Array<string>;
  relationshipTypes: Array<string>;
  propertyKeys: Array<string>;
}

// https://github.com/FalkorDB/FalkorDB/blob/master/src/resultset/formatters/resultset_formatter.h#L20
enum GraphValueTypes {
  UNKNOWN = 0,
  NULL = 1,
  STRING = 2,
  INTEGER = 3,
  BOOLEAN = 4,
  DOUBLE = 5,
  ARRAY = 6,
  EDGE = 7,
  NODE = 8,
  PATH = 9,
  MAP = 10,
  POINT = 11,
  VECTORF32 = 12,
  DATETIME = 13,
  DATE = 14,
  TIME = 15,
  DURATION = 16,
}

type GraphEntityRawProperties = Array<[id: number, ...value: GraphRawValue]>;

type GraphEdgeRawValue = [
  GraphValueTypes.EDGE,
  [
    id: number,
    relationshipTypeId: number,
    sourceId: number,
    destinationId: number,
    properties: GraphEntityRawProperties
  ]
];

type GraphNodeRawValue = [
  GraphValueTypes.NODE,
  [id: number, labelIds: Array<number>, properties: GraphEntityRawProperties]
];

type GraphPathRawValue = [
  GraphValueTypes.PATH,
  [
    nodes: [GraphValueTypes.ARRAY, Array<GraphNodeRawValue>],
    edges: [GraphValueTypes.ARRAY, Array<GraphEdgeRawValue>]
  ]
];

type GraphMapRawValue = [GraphValueTypes.MAP, Array<string | GraphRawValue>];

type GraphRawValue =
  | [GraphValueTypes.NULL, null]
  | [GraphValueTypes.STRING, string]
  | [GraphValueTypes.INTEGER, number]
  | [GraphValueTypes.BOOLEAN, string]
  | [GraphValueTypes.DOUBLE, string]
  | [GraphValueTypes.ARRAY, Array<GraphRawValue>]
  | GraphEdgeRawValue
  | GraphNodeRawValue
  | GraphPathRawValue
  | GraphMapRawValue
  | [GraphValueTypes.POINT, [latitude: string, longitude: string]]
  | [GraphValueTypes.VECTORF32, number[]]
  | [GraphValueTypes.DATETIME, number]
  | [GraphValueTypes.DATE, number]
  | [GraphValueTypes.TIME, number]
  | [GraphValueTypes.DURATION, number];
type GraphEntityProperties = Record<string, GraphValue>;

interface GraphEdge {
  id: number;
  relationshipType: string;
  sourceId: number;
  destinationId: number;
  properties: GraphEntityProperties;
}

interface GraphNode {
  id: number;
  labels: Array<string>;
  properties: GraphEntityProperties;
}

interface GraphPath {
  nodes: Array<GraphNode>;
  edges: Array<GraphEdge>;
}

type GraphMap = {
  [key: string]: GraphValue;
};

type GraphValue =
  | null
  | string
  | number
  | boolean
  | Array<GraphValue>
  | GraphEdge
  | GraphNode
  | GraphPath
  | GraphMap
  | {
      latitude: string;
      longitude: string;
    }
  | number[]
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime
  | Temporal.Duration;

export type GraphReply<T> = Omit<QueryReply, "headers" | "data"> & {
  data?: Array<T>;
};

// export type GraphConnection = SingleGraphConnection | ClusterGraphConnection;

export default class Graph {
  #client: Client;
  #name: string;
  #metadata?: GraphMetadata;

  constructor(client: Client, name: string) {
    this.#client = client;
    this.#name = name;
  }

  async query<T>(query: RedisArgument, options?: QueryOptions) {
    const reply = await this.#client.query(this.#name, query, options);
    return this.#parseReply<T>(reply);
  }

  async roQuery<T>(query: RedisArgument, options?: QueryOptions) {
    const reply = await this.#client.roQuery(this.#name, query, options);
    return this.#parseReply<T>(reply);
  }

  async delete() {
    return this.#client.delete(this.#name);
  }

  async explain(query: string) {
    return this.#client.explain(this.#name, query);
  }

  async profile(query: string) {
    return this.#client.profile(this.#name, query);
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

  #setMetadataPromise?: Promise<GraphMetadata>;

  #updateMetadata(): Promise<GraphMetadata> {
    this.#setMetadataPromise ??= this.#setMetadata().finally(
      () => (this.#setMetadataPromise = undefined)
    );
    return this.#setMetadataPromise;
  }

  // DO NOT use directly, use #updateMetadata instead
  async #setMetadata(): Promise<GraphMetadata> {
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

    this.#metadata = {
      labels: this.#cleanMetadataArray(labels.data as Array<[string]>),
      relationshipTypes: this.#cleanMetadataArray(
        relationshipTypes.data as Array<[string]>
      ),
      propertyKeys: this.#cleanMetadataArray(
        propertyKeys.data as Array<[string]>
      ),
    };

    return this.#metadata;
  }

  #cleanMetadataArray(arr: Array<[string]>): Array<string> {
    return arr.map(([value]) => value);
  }

  #getMetadata<T extends keyof GraphMetadata>(
    key: T,
    id: number
  ): GraphMetadata[T][number] | Promise<GraphMetadata[T][number]> {
    return this.#metadata?.[key][id] ?? this.#getMetadataAsync(key, id);
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
