import type { QueryStatistics } from "./types";

type CounterKey = Exclude<keyof QueryStatistics, "cachedExecution">;

// Statistic lines as the server words them (`ResultSet_EmitCompactStats` in
// FalkorDB's src/resultset/formatters/resultset_replycompact.c)
const COUNTERS: Record<string, CounterKey> = {
  "Labels added": "labelsAdded",
  "Labels removed": "labelsRemoved",
  "Nodes created": "nodesCreated",
  "Nodes deleted": "nodesDeleted",
  "Properties set": "propertiesSet",
  "Properties removed": "propertiesRemoved",
  "Relationships created": "relationshipsCreated",
  "Relationships deleted": "relationshipsDeleted",
  "Indices created": "indicesCreated",
  "Indices deleted": "indicesDeleted",
  "Constraints created": "constraintsCreated",
  "Constraints deleted": "constraintsDeleted",
  // e.g. "Query internal execution time: 0.123456 milliseconds"
  "Query internal execution time": "queryInternalExecutionTime",
};

/**
 * Parses the statistic lines of a query reply's metadata, e.g.
 * `"Nodes created: 1"`. Unknown or malformed lines are ignored.
 */
export function parseQueryStatistics(
  metadata: ReadonlyArray<string> = []
): QueryStatistics {
  const stats: QueryStatistics = {
    labelsAdded: 0,
    labelsRemoved: 0,
    nodesCreated: 0,
    nodesDeleted: 0,
    propertiesSet: 0,
    propertiesRemoved: 0,
    relationshipsCreated: 0,
    relationshipsDeleted: 0,
    indicesCreated: 0,
    indicesDeleted: 0,
    constraintsCreated: 0,
    constraintsDeleted: 0,
    cachedExecution: false,
    queryInternalExecutionTime: 0,
  };

  for (const line of metadata) {
    if (typeof line !== "string") continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const name = line.slice(0, separator).trim(),
      // parseFloat ignores a trailing unit such as " milliseconds"
      value = parseFloat(line.slice(separator + 1));
    if (!Number.isFinite(value)) continue;

    if (name === "Cached execution") {
      stats.cachedExecution = value !== 0;
    } else if (Object.hasOwn(COUNTERS, name)) {
      stats[COUNTERS[name]] = value;
    }
  }

  return stats;
}
