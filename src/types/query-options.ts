// Typed arrays (e.g. a Float32Array vector) are sent as lists
export type QueryParamTypedArray =
    | Int8Array
    | Uint8Array
    | Uint8ClampedArray
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array
    | BigInt64Array
    | BigUint64Array;

export type QueryParam =
    | null
    | string
    | number
    | bigint
    | boolean
    | QueryParams
    | Array<QueryParam>
    | QueryParamTypedArray;

export type QueryParams = {
    [key: string]: QueryParam;
};

export interface QueryOptions {
    params?: QueryParams;
    TIMEOUT?: number;
}

export type QueryOptionsBackwardCompatible = QueryOptions | number;
