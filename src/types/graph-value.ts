import type { Temporal } from '@js-temporal/polyfill';
import type { QueryReply } from './query-reply';
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

export type GraphReply<T> = Omit<QueryReply, "headers" | "data" | "metadata"> & {
  // Column names in order, present when the query returns columns
  headers?: Array<string>;
  data?: Array<T>;
  /**
   * The statistic lines exactly as the server sent them, e.g.
   * `"Nodes created: 1"`. See `stats` for the parsed values.
   */
  metadata: Array<string>;
  stats: QueryStatistics;
};
