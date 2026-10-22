import type { GraphMap } from './graph-value';

/** A row of `CALL db.indexes()`, one per indexed label or relationship type */
export interface IndexInfo {
    label: string;
    properties: string[];
    /** Index types of each property, e.g. `{ name: ['RANGE', 'FULLTEXT'] }` */
    types: Record<string, string[]>;
    /** Options of each property's index, e.g. a vector index's `dimension` */
    options: Record<string, GraphMap>;
    language: string;
    stopwords: string[];
    /** `'NODE'` or `'RELATIONSHIP'` (the server's `entitytype` column) */
    entityType: string;
    /** `'OPERATIONAL'` once built, otherwise a progress message ending in `UNDER CONSTRUCTION` */
    status: string;
    info: GraphMap;
}

/** A row of `CALL db.constraints()` */
export interface ConstraintInfo {
    /** `'UNIQUE'` or `'MANDATORY'` */
    type: string;
    label: string;
    properties: string[];
    /** `'NODE'` or `'RELATIONSHIP'` (the server's `entitytype` column) */
    entityType: string;
    /** `'UNDER CONSTRUCTION'` while existing data is validated, then `'OPERATIONAL'` or `'FAILED'` */
    status: string;
}

/** Options of a vector index, see https://docs.falkordb.com/cypher/indexing/vector-index */
export interface VectorIndexOptions {
    /** Length of the indexed vectors */
    dimension: number;
    /** Defaults to `'euclidean'` */
    similarityFunction?: 'euclidean' | 'cosine';
    /** Maximum number of outgoing edges per node in the HNSW graph (server default 16) */
    M?: number;
    /** Number of candidates considered while building the index (server default 200) */
    efConstruction?: number;
    /** Number of candidates considered while searching (server default 10) */
    efRuntime?: number;
}

export interface CallProcedureOptions {
    /** Columns to `YIELD`; all of the procedure's columns when omitted */
    yields?: string[];
    /** Run with `GRAPH.RO_QUERY` (default) instead of `GRAPH.QUERY` */
    readOnly?: boolean;
    timeout?: number;
}
