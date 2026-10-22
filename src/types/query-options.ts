export type QueryParam = null | string | number | boolean | QueryParams | Array<QueryParam>;

export type QueryParams = {
    [key: string]: QueryParam;
};

export interface QueryOptions {
    params?: QueryParams;
    TIMEOUT?: number;
}

export type QueryOptionsBackwardCompatible = QueryOptions | number;

/** Options for `GRAPH.EXPLAIN` and `GRAPH.PROFILE` */
export interface PlanOptions {
    params?: QueryParams;
}
