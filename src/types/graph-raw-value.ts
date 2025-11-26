import { GraphValueTypes } from "../enums";
import { GraphEntityRawProperties } from "./graph-entity-raw-properties";
import { Temporal } from "@js-temporal/polyfill";
import { QueryReply } from "./query-reply";

export type GraphMapRawValue = [
  GraphValueTypes.MAP,
  Array<string | GraphRawValue>
];
export type GraphPathRawValue = [
  GraphValueTypes.PATH,
  [
    nodes: [GraphValueTypes.ARRAY, Array<GraphNodeRawValue>],
    edges: [GraphValueTypes.ARRAY, Array<GraphEdgeRawValue>]
  ]
];

export type GraphEdgeRawValue = [
  GraphValueTypes.EDGE,
  [
    id: number,
    relationshipTypeId: number,
    sourceId: number,
    destinationId: number,
    properties: GraphEntityRawProperties
  ]
];

export type GraphNodeRawValue = [
  GraphValueTypes.NODE,
  [id: number, labelIds: Array<number>, properties: GraphEntityRawProperties]
];

export type GraphRawValue =
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

export type GraphEntityProperties = Record<string, GraphValue>;

export interface GraphEdge {
  id: number;
  relationshipType: string;
  sourceId: number;
  destinationId: number;
  properties: GraphEntityProperties;
}

export interface GraphNode {
  id: number;
  labels: Array<string>;
  properties: GraphEntityProperties;
}

export interface GraphPath {
  nodes: Array<GraphNode>;
  edges: Array<GraphEdge>;
}

export type GraphMap = {
  [key: string]: GraphValue;
};

export type GraphValue =
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
