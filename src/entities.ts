/**
 * Helpers for the nodes, edges and paths in query results, which are plain
 * objects. They match the string forms and equality of the Python client's
 * `Node`, `Edge` and `Path` classes.
 */
import type { GraphEdge, GraphNode, GraphPath, GraphValue } from "./types";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// A label, relationship type or property key, quoted when it is not a plain
// identifier so that the result stays valid Cypher
function nameToString(name: string): string {
  return IDENTIFIER.test(name) ? name : `\`${name}\``;
}

function valueToString(value: GraphValue): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    return `"${value.replace(/["\\]/g, "\\$&")}"`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(valueToString).join(",")}]`;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value).map(
      ([key, item]) => `${nameToString(key)}:${valueToString(item as GraphValue)}`
    );
    return `{${entries.join(",")}}`;
  }
  // Numbers, booleans and dates and times (Temporal values)
  return String(value);
}

// Properties sorted by key, e.g. `{age:30,name:"Alice"}`, or "" when there are none
function propertiesToString(properties: GraphNode["properties"]): string {
  const keys = Object.keys(properties).sort();
  if (keys.length === 0) return "";
  const entries = keys.map((key) => `${nameToString(key)}:${valueToString(properties[key])}`);
  return `{${entries.join(",")}}`;
}

/** The node as a Cypher pattern, e.g. `(:Person{name:"Alice"})` */
export function nodeToString(node: GraphNode): string {
  const labels = node.labels.map((label) => `:${nameToString(label)}`).join("");
  return `(${labels}${propertiesToString(node.properties)})`;
}

/** The edge as a Cypher pattern, e.g. `()-[:KNOWS{since:2020}]->()` */
export function edgeToString(edge: GraphEdge): string {
  const type = edge.relationshipType ? `:${nameToString(edge.relationshipType)}` : "";
  return `()-[${type}${propertiesToString(edge.properties)}]->()`;
}

/**
 * The path as node and edge ids, each edge pointing the way it runs,
 * e.g. `<(0)-[0]->(1)<-[1]-(2)>`
 */
export function pathToString(path: GraphPath): string {
  let result = "<";
  path.edges.forEach((edge, i) => {
    const node = path.nodes[i];
    result += `(${node.id})`;
    result += edge.sourceId === node.id ? `-[${edge.id}]->` : `<-[${edge.id}]-`;
  });
  return `${result}(${path.nodes[path.edges.length]?.id})>`;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => valuesEqual(item, b[i]))
    );
  }
  // Dates and times (Temporal values) keep their fields in internal slots
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) {
    return a.constructor === b.constructor && String(a) === String(b);
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    )
  );
}

/** Whether two nodes have the same id, the same labels in order and equal properties */
export function nodesEqual(a: GraphNode, b: GraphNode): boolean {
  return (
    a.id === b.id &&
    valuesEqual(a.labels, b.labels) &&
    valuesEqual(a.properties, b.properties)
  );
}

/**
 * Whether two edges are the same edge: equal ids, or else the same endpoints,
 * relationship type and properties
 */
export function edgesEqual(a: GraphEdge, b: GraphEdge): boolean {
  if (a.id === b.id) return true;
  return (
    a.sourceId === b.sourceId &&
    a.destinationId === b.destinationId &&
    a.relationshipType === b.relationshipType &&
    valuesEqual(a.properties, b.properties)
  );
}

/** Whether two paths have equal nodes and edges, in order */
export function pathsEqual(a: GraphPath, b: GraphPath): boolean {
  return (
    a.nodes.length === b.nodes.length &&
    a.edges.length === b.edges.length &&
    a.nodes.every((node, i) => nodesEqual(node, b.nodes[i])) &&
    a.edges.every((edge, i) => edgesEqual(edge, b.edges[i]))
  );
}
