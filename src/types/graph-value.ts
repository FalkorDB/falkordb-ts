import type { Temporal } from '@js-temporal/polyfill';
import type { QueryStatistics } from './query-statistics';

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
  // An integer, with `integers: 'bigint'`
  | bigint
  | boolean
  | Array<GraphValue>
  | GraphEdge
  | GraphNode
  | GraphPath
  | GraphMap
  | {
      latitude: number;
      longitude: number;
    }
  | number[]
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime
  | Temporal.Duration;

/**
 * The reply to a graph query: the returned columns and rows, if any, and the
 * statistics the server reported for it.
 */
export type GraphReply<T> = {
  // Column names in order, present when the query returns columns
  headers?: Array<string>;
  data?: Array<T>;
  stats: QueryStatistics;
};
