/**
 * Statistics the server reports for a query, parsed from the reply's
 * `metadata` lines. A counter the server did not report is 0.
 */
export interface QueryStatistics {
  labelsAdded: number;
  labelsRemoved: number;
  nodesCreated: number;
  nodesDeleted: number;
  propertiesSet: number;
  propertiesRemoved: number;
  relationshipsCreated: number;
  relationshipsDeleted: number;
  indicesCreated: number;
  indicesDeleted: number;
  constraintsCreated: number;
  constraintsDeleted: number;
  // Whether the query's execution plan was taken from the cache
  cachedExecution: boolean;
  // Time the server spent executing the query, in milliseconds
  queryInternalExecutionTime: number;
}
