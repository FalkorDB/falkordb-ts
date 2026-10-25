# Migrating from v6 to v7

Version 7 cleans up parts of the API that returned raw server text, accepted ambiguous arguments or silently
sent the wrong data. Most applications need only small, mechanical changes. This guide lists every breaking
change, why it was made, and what to change.

| # | Change | You are affected if you... |
|---|---|---|
| 1 | [Query replies: `metadata` replaced by `stats`](#1-query-replies-metadata-replaced-by-stats) | read `result.metadata` |
| 2 | [`explain` and `profile` return an `ExecutionPlan`](#2-explain-and-profile-return-an-executionplan) | call `graph.explain` or `graph.profile` |
| 3 | [Vector indexes take an options object](#3-vector-indexes-take-an-options-object) | call `createNodeVectorIndex` or `createEdgeVectorIndex` |
| 4 | [Unique constraints create their range index](#4-unique-constraints-create-their-range-index) | call `constraintCreate` with `ConstraintType.UNIQUE` |
| 5 | [Stricter query parameters](#5-stricter-query-parameters) | pass objects, `NaN`/`Infinity` or unusual names as `params` |
| 6 | [Point coordinates are typed as numbers](#6-point-coordinates-are-typed-as-numbers) | read `latitude`/`longitude` of a point as a `string` |
| 7 | [Unknown value types are returned as `null`](#7-unknown-value-types-are-returned-as-null) | rely on queries failing with `unknown scalar type` |
| 8 | [Index helpers quote label and property names](#8-index-helpers-quote-label-and-property-names) | pass names wrapped in `` ` `` to the index helpers |
| 9 | [`copy` returns the new `Graph`](#9-copy-returns-the-new-graph) | use the value `graph.copy` resolves to |

## 1. Query replies: `metadata` replaced by `stats`

`graph.query`, `graph.roQuery` and the index helpers (`createNodeRangeIndex`, `dropNodeVectorIndex`, ...) now
resolve to `{ headers?, data?, stats }`. The raw `metadata` lines are gone; every statistic is available as a
typed field of `stats`, and `headers` lists the returned column names in order.

**Why:** the statistics used to arrive as server-worded strings such as `"Nodes created: 1"`, so every
application had to find and parse them itself, and broke if a line was missing or worded differently. They are
now numbers (and a `boolean` for cached execution) with a fixed set of fields, defaulting to `0`.

```typescript
// v6
const result = await graph.query("CREATE (:Person {name: 'Alice'})")
const line = result.metadata.find(l => l.startsWith('Nodes created:'))
const nodesCreated = line ? parseInt(line.split(':')[1], 10) : 0

// v7
const { stats } = await graph.query("CREATE (:Person {name: 'Alice'})")
const nodesCreated = stats.nodesCreated
```

| v6 `metadata` line | v7 field |
|---|---|
| `Labels added: N` | `stats.labelsAdded` |
| `Labels removed: N` | `stats.labelsRemoved` |
| `Nodes created: N` | `stats.nodesCreated` |
| `Nodes deleted: N` | `stats.nodesDeleted` |
| `Properties set: N` | `stats.propertiesSet` |
| `Properties removed: N` | `stats.propertiesRemoved` |
| `Relationships created: N` | `stats.relationshipsCreated` |
| `Relationships deleted: N` | `stats.relationshipsDeleted` |
| `Indices created: N` | `stats.indicesCreated` |
| `Indices deleted: N` | `stats.indicesDeleted` |
| `Constraints created: N` | `stats.constraintsCreated` |
| `Constraints deleted: N` | `stats.constraintsDeleted` |
| `Cached execution: 0/1` | `stats.cachedExecution` (`boolean`) |
| `Query internal execution time: X milliseconds` | `stats.queryInternalExecutionTime` (milliseconds) |

The index helpers used to return the raw command reply; they now return the same `{ stats }` shape, so
`(await graph.createNodeRangeIndex('Person', 'name')).stats.indicesCreated` is `1`.

## 2. `explain` and `profile` return an `ExecutionPlan`

`graph.explain(query, options?)` and `graph.profile(query, options?)` now resolve to an `ExecutionPlan`
instead of an array of indented text lines. Both also accept `{ params }` now, so parameterized queries can be
explained and profiled.

**Why:** the plan is a tree, but it came back as text whose structure was only in its indentation, and
profile timings had to be extracted with regular expressions. The `ExecutionPlan` gives you the tree with
profile figures already parsed into numbers. The original lines are still available.

```typescript
// v6
const lines: string[] = await graph.profile('MATCH (p:Person) RETURN p')
console.log(lines.join('\n'))

// v7
const plan = await graph.profile('MATCH (p:Person) WHERE p.age > $age RETURN p', { params: { age: 30 } })
console.log(plan.steps.join('\n'))       // the same lines as before
plan.root.recordsProduced                // number
for (const op of plan) {
  console.log(op.name, op.args, op.recordsProduced, op.executionTime)
}
plan.collectOperations('Filter')         // every Filter operation
```

If you only need the old output, replace `await graph.explain(q)` with `(await graph.explain(q)).steps`.

## 3. Vector indexes take an options object

`createNodeVectorIndex` and `createEdgeVectorIndex` take the index options as an object, and `dimension` is
required. The positional `(label, dim, similarityFunction, ...properties)` form is removed; called from plain
JavaScript it rejects with a `TypeError`, as do options without a numeric `dimension`.

**Why:** in the old form the dimension and similarity function had to be passed before the property names, so
their defaults could never be used, a forgotten dimension silently became `0`, and there was no room for the
other index settings. The options object is self-describing and supports `M`, `efConstruction` and
`efRuntime`.

```typescript
// v6
await graph.createNodeVectorIndex('Document', 768, 'cosine', 'embedding')

// v7
await graph.createNodeVectorIndex('Document', { dimension: 768, similarityFunction: 'cosine' }, 'embedding')
await graph.createEdgeVectorIndex('SIMILAR', { dimension: 128, M: 32, efConstruction: 200 }, 'vector')
```

`similarityFunction` defaults to `'euclidean'`.

## 4. Unique constraints create their range index

`graph.constraintCreate(ConstraintType.UNIQUE, ...)` now first creates the range index that a unique
constraint requires, on each property that is not indexed yet. Mandatory constraints are unchanged.

**Why:** a unique constraint cannot work without that index, so creating one used to fail until you had run a
separate `CREATE INDEX`. Now every way of creating a unique constraint behaves the same.

```typescript
// v6
await graph.query('CREATE INDEX FOR (p:Person) ON (p.email)')
await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'email')

// v7
await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'email')
// or: await graph.createNodeUniqueConstraint('Person', 'email')
```

Keeping your own `CREATE INDEX` is harmless: an existing index is reused. Dropping the constraint keeps the
index, as before. Constraints are still enforced in the background; use `graph.listConstraints()` to wait for
the status `OPERATIONAL`.

In a constraint, the server accepts only labels and properties that start with a letter or `_`, followed by
letters, digits, `_` or `$`. `constraintCreate` now checks this before creating any index and throws a `TypeError`, where
v6 sent the command and the server rejected it.

## 5. Stricter query parameters

**Why:** several kinds of parameter values used to reach the database as something other than what you passed,
without any error, or produced a query the server could not parse. Each case now either works or fails
immediately with a clear message.

- **Only plain objects are sent as maps.** An object literal or `Object.create(null)` works as before. Any other
  object, such as a class instance, `Date`, `Map`, `Set` or `RegExp`, throws
  `TypeError: Unsupported param type Date: convert it to a plain object or another supported value first`.
  In v6 a `Date`, `Map` or `Set` was silently sent as `{}`, and a class instance lost its computed and inherited
  properties. These checks also hold for values created in another realm, such as a `vm` context.

- **`NaN` and `Infinity` throw** a `TypeError` instead of producing a query the server rejects.
- **`undefined` still throws**, as in v6, now as a `TypeError` naming it. Omit the key or pass `null` instead.
- **Parameter names and map keys are quoted**, so names such as `my-key` or `@type` now work
  (reference them in the query as `` $`my-key` ``). An empty name, or one that contains the `` ` `` character, throws a
  `TypeError`, because the server cannot represent it. If you compare the generated `CYPHER ...` header text in your own
  tests, expect the names to be quoted.

For example, a class instance with a `Date` field is converted to a plain object first:

```typescript
// v6: sent {name: "Alice", createdAt: {}}
await graph.query('CREATE (:User $props)', { params: { props: user } })

// v7
await graph.query('CREATE (:User $props)', {
  params: { props: { ...user, createdAt: user.createdAt.toISOString() } },
})
```

New in v7: `bigint` values are supported, and typed arrays such as a `Float32Array` vector are sent as lists.

## 6. Point coordinates are typed as numbers

The parsed point type is now `{ latitude: number; longitude: number }`.

**Why:** the values were always numbers at runtime; only the declared type was wrong. Code such as
`parseFloat(point.latitude)` no longer compiles; use `point.latitude` directly.

## 7. Unknown value types are returned as `null`

A value of a type this client does not know, for example one introduced by a newer server, is now returned as
`null`, with one `console.warn` per type, instead of failing the whole query with `unknown scalar type`.

**Why:** a single unknown value made every row of the reply unreadable. Upgrading the server should not
break existing queries that happen to return a new kind of value.

## 8. Index helpers quote label and property names

`createNodeRangeIndex`, `createNodeFulltextIndex`, `createNodeVectorIndex`, their edge and `drop...`
counterparts, `createTypedIndex` and `dropTypedIndex` now quote the label and property names they put into the
query.

**Why:** names such as `Product Type` or `sku-id` produced a query the server could not parse.

```typescript
// v6: worked only with the name already quoted
await graph.createNodeRangeIndex('`Product Type`', '`sku-id`')

// v7
await graph.createNodeRangeIndex('Product Type', 'sku-id')
```

A name containing the `` ` `` character, such as one you quoted yourself, now throws a `TypeError`.

## 9. `copy` returns the new `Graph`

`graph.copy(name)` now resolves to the `Graph` for the copy instead of the server's `'OK'`. For a graph from
`db.selectGraph`, that is the instance `db.selectGraph(name)` returns; a `Graph` constructed directly returns a
new instance.

**Why:** the reply carried no information, so every caller had to select the new graph themselves before using
it.

```typescript
// v6
await graph.copy('backup')
const backup = db.selectGraph('backup')

// v7
const backup = await graph.copy('backup')
```

Code that compares the result with `'OK'`, or sends it on as a value (for example from an API route, where
`JSON.stringify` turns a `Graph` into `{}`), needs updating; a failed copy still rejects.

## New in v7

These additions need no changes to existing code:

- `graph.name`
- `graph.callProcedure(name, args?, { yields?, readOnly?, timeout? })`
- `graph.listIndices()` and `graph.listConstraints()`, with typed results
- `createNodeUniqueConstraint`, `createEdgeUniqueConstraint`, `createNodeMandatoryConstraint`,
  `createEdgeMandatoryConstraint` and the matching `drop...` helpers
- `graph.slowLogReset()`
- `headers` on query replies
- `nodeToString`, `edgeToString`, `pathToString` and `nodesEqual`, `edgesEqual`, `pathsEqual` for the nodes,
  edges and paths in query results
- `integers: 'bigint'` in `FalkorDB.connect` options, to read integers beyond `Number.MAX_SAFE_INTEGER` exactly
