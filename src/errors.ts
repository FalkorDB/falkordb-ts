/**
 * The server rejected a query because the graph's schema (its labels,
 * relationship types and property keys) no longer matches the version the
 * client sent with it. The query was not executed.
 */
export class SchemaVersionMismatchError extends Error {
    /** The graph's current schema version. */
    readonly version: number;

    constructor(version: number) {
        super('version mismatch');
        this.name = 'SchemaVersionMismatchError';
        this.version = version;
    }
}
