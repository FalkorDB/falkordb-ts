import * as CONFIG_GET from './CONFIG_GET';
import * as CONFIG_SET from './CONFIG_SET';
import * as DELETE from './DELETE';
import * as EXPLAIN from './EXPLAIN';
import * as INFO from './INFO';
import * as LIST from './LIST';
import * as PROFILE from './PROFILE';
import * as QUERY from './QUERY';
import * as RO_QUERY from './RO_QUERY';
import * as SLOWLOG from './SLOWLOG';
import * as STUBS from './STUBS';
import * as CONSTRAINT_CREATE from './CONSTRAINT_CREATE';
import * as CONSTRAINT_DROP from './CONSTRAINT_DROP';
import * as COPY from './COPY';
import * as SENTINEL_MASTER from './SENTINEL_MASTER';
import * as SENTINEL_MASTERS from './SENTINEL_MASTERS';
import * as MEMORY_USAGE from './MEMORY_USAGE';
import * as UDF_LOAD from './UDF_LOAD';
import * as UDF_LIST from './UDF_LIST';
import * as UDF_FLUSH from './UDF_FLUSH';
import * as UDF_DELETE from './UDF_DELETE';
import * as SLOWLOG_RESET from './SLOWLOG_RESET';

import { types } from 'node:util';
import { isPlainObject } from 'lodash';
import { RedisArgument } from '@redis/client';
import type { QueryOptionsBackwardCompatible, QueryParam, QueryParams } from '../types';

export default {
    CONFIG_GET,
    configGet: CONFIG_GET,
    CONFIG_SET,
    configSet: CONFIG_SET,
    DELETE,
    delete: DELETE,
    EXPLAIN,
    explain: EXPLAIN,
    INFO,
    info: INFO,
    LIST,
    list: LIST,
    PROFILE,
    profile: PROFILE,
    QUERY,
    query: QUERY,
    RO_QUERY,
    roQuery: RO_QUERY,
    SLOWLOG,
    slowLog: SLOWLOG,
    STUBS,
    stubs: STUBS,
    CONSTRAINT_CREATE,
    constraintCreate: CONSTRAINT_CREATE,
    CONSTRAINT_DROP,
    constraintDrop: CONSTRAINT_DROP,
    COPY,
    copy: COPY,
    SENTINEL_MASTER,
    sentinelMaster: SENTINEL_MASTER,
    SENTINEL_MASTERS,
    sentinelMasters: SENTINEL_MASTERS,
    MEMORY_USAGE,
    memoryUsage: MEMORY_USAGE,
    UDF_LOAD,
    udfLoad: UDF_LOAD,
    UDF_LIST,
    udfList: UDF_LIST,
    UDF_FLUSH,
    udfFlush: UDF_FLUSH,
    UDF_DELETE,
    udfDelete: UDF_DELETE,
    SLOWLOG_RESET,
    slowLogReset: SLOWLOG_RESET,
};

export type { QueryOptions, QueryOptionsBackwardCompatible, QueryParam, QueryParams } from '../types';

export function pushQueryArguments(
    args: Array<RedisArgument>,
    graph: RedisArgument,
    query: RedisArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean,
    version?: number
): Array<RedisArgument> {
    args.push(graph);

    if (typeof options === 'number') {
        args.push(query);
        pushTimeout(args, options);
    } else {
        args.push(withParamsHeader(query, options?.params));

        if (options?.TIMEOUT !== undefined) {
            pushTimeout(args, options.TIMEOUT);
        }
    }

    if (version !== undefined) {
        args.push('version', version.toString());
    }

    if (compact) {
        args.push('--compact');
    }

    return args;
}

/**
 * Prefixes the query with a `CYPHER` header carrying the params. Without
 * params the query is returned unchanged.
 */
export function withParamsHeader<T extends RedisArgument>(query: T, params?: QueryParams): T | string {
    return params ? `CYPHER ${queryParamsToString(params)} ${query}` : query;
}

function pushTimeout(args: Array<RedisArgument>, timeout: number): void {
    args.push('TIMEOUT', timeout.toString());
}

function queryParamsToString(params: QueryParams): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
        parts.push(`${escapeIdentifier(key, 'parameter name')}=${queryParamToString(value)}`);
    }
    return parts.join(' ');
}

// Wraps a parameter name or map key in backticks so that names which are not
// bare identifiers (e.g. `@type`, hyphenated UUIDs) are accepted by the parser.
// FalkorDB does not support escaped backticks inside identifiers, so names
// containing one are rejected, as are empty names
function escapeIdentifier(name: string, kind: string): string {
    if (name === '') {
        throw new TypeError(`Cypher ${kind} cannot be empty`);
    }
    if (name.includes('`')) {
        throw new TypeError(
            `Cypher ${kind} cannot contain a backtick: ${JSON.stringify(name)} ` +
            '(FalkorDB does not support escaped backticks in identifiers)'
        );
    }
    return `\`${name}\``;
}

// Names the type of a non-plain object for error messages, e.g. `Date` or a class name
function objectTypeName(value: object): string {
    const proto = Object.getPrototypeOf(value);
    const name = Object.hasOwn(proto, 'constructor') ? proto.constructor?.name : undefined;
    return name || 'object with a custom prototype';
}

function queryParamToString(param: QueryParam): string {
    if (param === null) {
        return 'null';
    }

    switch (typeof param) {
        case 'string':
            return `"${param.replace(/["\\]/g, '\\$&')}"`;

        case 'number':
            if (!Number.isFinite(param)) {
                throw new TypeError(`Unsupported param value ${param}: only finite numbers are supported`);
            }
            return param.toString();

        case 'bigint':
        case 'boolean':
            return param.toString();

        case 'object':
            break;

        default:
            throw new TypeError(`Unsupported param type ${typeof param}`);
    }

    if (Array.isArray(param)) {
        return `[${param.map(queryParamToString).join(',')}]`;
    }

    // The checks below also recognise values from another realm (e.g. a `vm`
    // context), where `instanceof` and prototype identity do not hold
    if (types.isTypedArray(param)) {
        // Typed arrays (e.g. Float32Array vectors) are sent as lists
        return `[${Array.from(param as ArrayLike<number | bigint>, queryParamToString).join(',')}]`;
    }

    // Only plain objects are sent as maps: any other object (a class instance,
    // Date, Map, ...) would lose its meaning when reduced to its own properties
    if (!isPlainObject(param)) {
        throw new TypeError(
            `Unsupported param type ${objectTypeName(param)}: ` +
            'convert it to a plain object or another supported value first'
        );
    }

    const body: string[] = [];
    for (const [key, value] of Object.entries(param)) {
        body.push(`${escapeIdentifier(key, 'map key')}:${queryParamToString(value)}`);
    }
    return `{${body.join(',')}}`;
}

// Export UDF types for external use
export type { UdfListReply, UdfLibraryEntry } from '../types';
