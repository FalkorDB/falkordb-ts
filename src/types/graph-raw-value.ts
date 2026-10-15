import type { GraphValueTypes } from '../enums';

export type GraphEntityRawProperties = Array<[id: number, ...value: GraphRawValue]>;

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

export type GraphPathRawValue = [
  GraphValueTypes.PATH,
  [
    nodes: [GraphValueTypes.ARRAY, Array<GraphNodeRawValue>],
    edges: [GraphValueTypes.ARRAY, Array<GraphEdgeRawValue>]
  ]
];

export type GraphMapRawValue = [GraphValueTypes.MAP, Array<string | GraphRawValue>];

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
