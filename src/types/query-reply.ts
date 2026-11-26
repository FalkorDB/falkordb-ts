import type { GraphMetadata } from './graph-metadata';

type Headers = Array<string>;

type Data = Array<string | number | null | Data>;

type Metadata = Array<string>;

export type QueryRawReply = [
    headers: Headers,
    data: Data,
    metadata: Metadata
] | [
    metadata: Metadata
];

/**
 * The graph's schema as a reply to a query sent with `SCHEMA_HASH` carries it
 * (FalkorDB 6.2.0 and later).
 */
export interface SchemaReply {
    /** The schema's hash, as its exact decimal digits */
    hash: string;
    /**
     * The schema's names, in id order, when the hash the query was sent with
     * is not this one
     */
    names?: GraphMetadata;
}

export type QueryReply = ({
    headers: undefined;
    data: undefined;
    metadata: Metadata;
} | {
    headers: Headers;
    data: Data;
    metadata: Metadata;
}) & {
    schema?: SchemaReply;
};
