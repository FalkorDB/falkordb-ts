import type { Temporal } from '@js-temporal/polyfill';
import type { QueryReply } from './query-reply';

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
