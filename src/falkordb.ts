
import { EventEmitter } from 'events';

import { RedisFunctions, RedisScripts, createClient } from 'redis';

import Graph, { MetadataVersion } from './graph';
import commands from './commands';
import { Client } from './clients/client';
import { Single } from './clients/single';
import { Sentinel } from './clients/sentinel';
import { Cluster } from './clients/cluster';
import { NullClient } from './clients/nullClient';
import type { FalkorDBOptions, SingleGraphConnection, TypedRedisClientOptions } from './types';

export type {
    FalkorDBOptions,
    SocketOptions,
    TypedRedisClientOptions,
    TypedRedisClusterClientOptions,
} from './types';

async function clientFactory(client: SingleGraphConnection) {

    const info = await client.info("server")

    if (info.includes("redis_mode:sentinel")) {
        return new Sentinel(client)
    } else if (info.includes("redis_mode:cluster")) {
        return new Cluster(client);
    }
    return new Single(client)
}

// Upper bound on the `Graph` instances `selectGraph` keeps. Past it the least
// recently selected one is dropped; that only costs its metadata cache, which
// the next `selectGraph` for that id rebuilds.
const MAX_CACHED_GRAPHS = 1000;

export default class FalkorDB extends EventEmitter {

    #client: Client = new NullClient();
    #graphs = new Map<string, Graph>();
    // Shared by every instance for a graph id, including ones evicted from
    // #graphs that callers still hold. Weakly held, so an entry lives only as
    // long as some instance using it does.
    #metadataVersions = new Map<string, WeakRef<MetadataVersion>>();
    #metadataVersionsCleanup = new FinalizationRegistry<string>((graphId) => {
        if (!this.#metadataVersions.get(graphId)?.deref()) {
            this.#metadataVersions.delete(graphId);
        }
    });

    static async connect(options?: FalkorDBOptions) {
        const { host, port, ...rest } = options ?? {};
        const redisOption = rest as TypedRedisClientOptions;

        // Support the top-level `host`/`port` shorthand used by the other FalkorDB
        // clients by folding them into the socket options node-redis expects.
        // Explicit `socket` values win, and `url` takes precedence over both.
        if (!redisOption.url && (host !== undefined || port !== undefined)) {
            redisOption.socket = {
                ...(host !== undefined && { host }),
                ...(port !== undefined && { port }),
                ...redisOption.socket,
            } as TypedRedisClientOptions['socket'];
        }

        // If the URL is provided, and the protocol is `falkor` replaces it with `redis` for the underline redis client
        // e.g. falkor://localhost:6379 -> redis://localhost:6379
        if (redisOption.url && redisOption.url.startsWith('falkor')) {
            redisOption.url = redisOption.url.replace('falkor', 'redis');
        }

        redisOption.modules = {
            falkordb: commands
        }

        // node-redis v6 defaults to RESP3, which auto-converts module map replies
        // into nested objects: `GRAPH.MEMORY USAGE` comes back as
        // `{ total_graph_sz_mb: 0, ... }` instead of the flat
        // `['total_graph_sz_mb', 0, ...]` that the reply parsers - and the
        // `MemoryUsageReply` array type - are written against. So RESP 2 is a
        // requirement here, not a default: honouring an explicit RESP 3 would
        // hand the caller a reply shape the published types say is impossible.
        // The sentinel and cluster clients reuse this options object, so they
        // inherit the pin too.
        const requestedRESP = (redisOption as { RESP?: number }).RESP;
        if (requestedRESP !== undefined && requestedRESP !== 2) {
            throw new Error(
                `FalkorDB requires RESP 2, but RESP ${requestedRESP} was requested. ` +
                'Under RESP 3 node-redis rewrites module map replies into objects, which does ' +
                'not match the reply shapes this client parses and publishes types for.'
            );
        }
        redisOption.RESP = 2;

        // Create an empty FalkorDB instance for the redisClient on error event to work
        const falkordb = new FalkorDB();

        // Create initial redis single client
        const redisClient = createClient<{ falkordb: typeof commands }, RedisFunctions, RedisScripts, 2, {}>(redisOption)
        await redisClient
            .on('error', err => falkordb.emit('error', err)) // Forward errors
            .connect();

        // Create FalkorDB client wrapper
        const client = await clientFactory(redisClient);
        await client.init(falkordb);

        // Set the client to the FalkorDB instance after it was initialized
        falkordb.#client = client;  

        return falkordb
    }

    /**
     * Returns the `Graph` for `graphId`. Repeated calls with the same id return
     * the same instance, so its cached metadata (labels, relationship types and
     * property keys) is shared instead of being refetched by every new handle.
     * The instance is released when the graph is deleted through it, or when
     * more than `MAX_CACHED_GRAPHS` graphs have been selected since its last use.
     */
    selectGraph(graphId: string) {
        let graph = this.#graphs.get(graphId);
        if (graph) {
            // Re-insert so the Map's insertion order tracks recency of use
            this.#graphs.delete(graphId);
        } else {
            graph = new Graph(this.#client, graphId, {
                metadataVersion: this.#metadataVersion(graphId),
                onDelete: (deleted) => {
                    // An instance already evicted must not remove its replacement
                    if (this.#graphs.get(graphId) === deleted) {
                        this.#graphs.delete(graphId);
                    }
                },
            });
        }
        this.#graphs.set(graphId, graph);

        if (this.#graphs.size > MAX_CACHED_GRAPHS) {
            this.#graphs.delete(this.#graphs.keys().next().value!);
        }
        return graph;
    }

    #metadataVersion(graphId: string) {
        let version = this.#metadataVersions.get(graphId)?.deref();
        if (!version) {
            version = { value: 0 };
            this.#metadataVersions.set(graphId, new WeakRef(version));
            this.#metadataVersionsCleanup.register(version, graphId);
        }
        return version;
    }

    public get connection() {
        return this.#client.getConnection();
    }

    async list() {
        return this.#client.list()
    }

    /**
     * Lists the graphs that are currently offloaded to disk ("stubs").
     *
     * `GRAPH.STUBS` is provided by the FalkorDB Enterprise graph-offloading
     * module, so this rejects with an "unknown command" error on deployments
     * where that module is not loaded. Callers that support both editions
     * should treat such a rejection as "no offloading support".
     */
    async stubs() {
        return this.#client.stubs()
    }

    async configGet(configKey: string) {
        return this.#client.configGet(configKey)
    }

    async configSet(configKey: string, value: number | string) {
        return this.#client.configSet(configKey, value)
    }

    async info(section?: string) {
        return this.#client.info(section)
    }

    async udfLoad(name: string, script: string | Function, replace: boolean = false) {
        return this.#client.udfLoad(name, script, replace);
    }

    async udfList(lib?: string, withCode: boolean = false) {
        return this.#client.udfList(lib, withCode);
    }

    async udfFlush() {
        return this.#client.udfFlush();
    }

    async udfDelete(lib: string) {
        return this.#client.udfDelete(lib);
    }

    /**
     * Closes the client.
     */
    async close() {
        this.#graphs.clear();
        return this.#client.disconnect();
    }
}
