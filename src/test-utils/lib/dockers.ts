import { createConnection } from 'net';
import { once } from 'events';
import RedisClient from '@redis/client/dist/lib/client';
import { promiseTimeout } from '@redis/client/dist/lib/utils';
import { ClusterSlotsReply } from '@redis/client/dist/lib/commands/CLUSTER_SLOTS';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
const execAsync = promisify(exec);

interface ErrorWithCode extends Error {
    code: string;
}

/**
 * Checks if a specified port is available for use.
 * @param {number} port - The port number to check for availability.
 * @returns {Promise<boolean>} A promise that resolves to true if the port is available, false otherwise.
 * @throws {Error} May throw an error if there's an issue other than ECONNREFUSED.
 */
async function isPortAvailable(port: number): Promise<boolean> {
    try {
        const socket = createConnection({ port });
        await once(socket, 'connect');
        socket.end();
    } catch (err) {
        if (err instanceof Error && (err as ErrorWithCode).code === 'ECONNREFUSED') {
            return true;
        }
    }

    return false;
}

const portIterator = (async function*(): AsyncIterableIterator<number> {
    for (let i = 6379; i < 65535; i++) {
        if (await isPortAvailable(i)) {
            yield i;
        }
    }

    throw new Error('All ports are in use');
})();

export interface RedisServerDockerConfig {
    image: string;
    version: string;
}

export interface RedisServerDocker {
    port: number;
    dockerId: string;
}

// ".." cause it'll be in `./dist`
const DOCKER_FODLER_PATH = path.join(__dirname, '../docker');

/**
 * Spawns a Redis server in a Docker container with specified configurations.
 * @param {RedisServerDockerConfig} options - Configuration options for the Redis server.
 * @param {string} options.image - The base Docker image to use for the Redis server.
 * @param {string} options.version - The version of the Redis image to use.
 * @param {Array<string>} serverArguments - Additional arguments to pass to the Redis server.
 * @returns {Promise<RedisServerDocker>} A promise that resolves to an object containing the port and Docker ID of the spawned Redis server.
 * @throws {Error} If there's an error running the Docker container.
 */
async function spawnRedisServerDocker({ image, version }: RedisServerDockerConfig, serverArguments: Array<string>): Promise<RedisServerDocker> {
    const port = (await portIterator.next()).value,
        { stdout, stderr } = await execAsync(
            'docker run -d --network host $(' +
                `docker build ${DOCKER_FODLER_PATH} -q ` +
                `--build-arg IMAGE=${image}:${version} ` +
                `--build-arg REDIS_ARGUMENTS="--save '' --port ${port.toString()} ${serverArguments.join(' ')}"` +
            ')'
        );

    if (!stdout) {
        throw new Error(`docker run error - ${stderr}`);
    }

    while (await isPortAvailable(port)) {
        await promiseTimeout(50);
    }

    return {
        port,
        dockerId: stdout.trim()
    };
}

const RUNNING_SERVERS = new Map<Array<string>, ReturnType<typeof spawnRedisServerDocker>>();

/**
 * Spawns or retrieves a Redis server using Docker configuration.
 * @param {RedisServerDockerConfig} dockerConfig - Configuration for the Redis Docker container.
 * @param {Array<string>} serverArguments - Array of arguments to pass to the Redis server.
 * @returns {Promise<RedisServerDocker>} A promise that resolves to a RedisServerDocker instance.
 */
export function spawnRedisServer(dockerConfig: RedisServerDockerConfig, serverArguments: Array<string>): Promise<RedisServerDocker> {
    const runningServer = RUNNING_SERVERS.get(serverArguments);
    if (runningServer) {
        return runningServer;
    }

    const dockerPromise = spawnRedisServerDocker(dockerConfig, serverArguments);
    RUNNING_SERVERS.set(serverArguments, dockerPromise);
    return dockerPromise;
}

/**
 * Removes a Docker container forcefully using its ID.
 * @param {string} dockerId - The ID of the Docker container to remove.
 * @returns {Promise<void>} A promise that resolves when the container is successfully removed.
 * @throws {Error} If there's an error during the removal process, with the stderr output.
 */
async function dockerRemove(dockerId: string): Promise<void> {
    const { stderr } = await execAsync(`docker rm -f ${dockerId}`);
    if (stderr) {
        throw new Error(`docker rm error - ${stderr}`);
    }
}

/**
 * Performs cleanup operations after test execution by removing all running Docker containers.
 * @returns {Promise<void[]>} A promise that resolves when all Docker containers have been removed.
 */
after(() => {
    return Promise.all(
        [...RUNNING_SERVERS.values()].map(async dockerPromise =>
            await dockerRemove((await dockerPromise).dockerId)
        )
    );
});

export interface RedisClusterDockersConfig extends RedisServerDockerConfig {
    numberOfMasters?: number;
    numberOfReplicas?: number;
}

/**
 * Spawns Redis cluster node Docker containers based on the provided configuration.
 * This function creates a master node and optional replica nodes, configures them,
 * and sets up the cluster slots.
 * @param {RedisClusterDockersConfig} dockersConfig - Configuration for the Docker containers
 * @param {Array<string>} serverArguments - Additional arguments for the Redis server
 * @param {number} fromSlot - Starting slot number for the cluster range
 * @param {number} toSlot - Ending slot number for the cluster range
 * @returns {Promise<Array<RedisClusterNode>>} An array of Redis cluster nodes, including the master and replicas
 */async function spawnRedisClusterNodeDockers(
    dockersConfig: RedisClusterDockersConfig,
    serverArguments: Array<string>,
    fromSlot: number,
    toSlot: number
) {
    const range: Array<number> = [];
    for (let i = fromSlot; i < toSlot; i++) {
        range.push(i);
    }

    const master = await spawnRedisClusterNodeDocker(
        dockersConfig,
        serverArguments
    );

    await master.client.clusterAddSlots(range);

    if (!dockersConfig.numberOfReplicas) return [master];
    
    const replicasPromises: Array<ReturnType<typeof spawnRedisClusterNodeDocker>> = [];
    for (let i = 0; i < (dockersConfig.numberOfReplicas ?? 0); i++) {
        replicasPromises.push(
            spawnRedisClusterNodeDocker(dockersConfig, [
                ...serverArguments,
                '--cluster-enabled',
                'yes',
                '--cluster-node-timeout',
                '5000'
            ]).then(async replica => {
                await replica.client.clusterMeet('127.0.0.1', master.docker.port);

                while ((await replica.client.clusterSlots()).length === 0) {
                    await promiseTimeout(50);
                }

                await replica.client.clusterReplicate(
                    await master.client.clusterMyId()
                );

                return replica;
            })
        );
    }

    return [
        master,
        ...await Promise.all(replicasPromises)
    ];
}

/**
 * Spawns a Redis Cluster node in a Docker container and establishes a connection to it.
 * @param {RedisClusterDockersConfig} dockersConfig - Configuration for the Docker container.
 * @param {Array<string>} serverArguments - Additional arguments to pass to the Redis server.
 * @returns {Promise<Object>} An object containing the Docker instance and the connected Redis client.
 */
async function spawnRedisClusterNodeDocker(
    dockersConfig: RedisClusterDockersConfig,
    serverArguments: Array<string>
) {
    const docker = await spawnRedisServerDocker(dockersConfig, [
            ...serverArguments,
            '--cluster-enabled',
            'yes',
            '--cluster-node-timeout',
            '5000'
        ]),
        client = RedisClient.create({
            socket: {
                port: docker.port
            }
        });

    await client.connect();

    return {
        docker,
        client
    };
}

const SLOTS = 16384;

/**
 * Spawns Redis cluster Docker containers based on the provided configuration.
 * @param {RedisClusterDockersConfig} dockersConfig - Configuration for Redis cluster Docker containers.
 * @param {Array<string>} serverArguments - Additional arguments to be passed to the Redis server.
 * @returns {Promise<Array<RedisServerDocker>>} A promise that resolves to an array of RedisServerDocker instances representing the spawned Docker containers.
 */
async function spawnRedisClusterDockers(
    dockersConfig: RedisClusterDockersConfig,
    serverArguments: Array<string>
): Promise<Array<RedisServerDocker>> {
    const numberOfMasters = dockersConfig.numberOfMasters ?? 2,
        slotsPerNode = Math.floor(SLOTS / numberOfMasters),
        spawnPromises: Array<ReturnType<typeof spawnRedisClusterNodeDockers>> = [];
    for (let i = 0; i < numberOfMasters; i++) {
        const fromSlot = i * slotsPerNode,
            toSlot = i === numberOfMasters - 1 ? SLOTS : fromSlot + slotsPerNode;
        spawnPromises.push(
            spawnRedisClusterNodeDockers(
                dockersConfig,
                serverArguments,
                fromSlot,
                toSlot
            )
        );
    }

    const nodes = (await Promise.all(spawnPromises)).flat(),
        meetPromises: Array<Promise<unknown>> = [];
    for (let i = 1; i < nodes.length; i++) {
        meetPromises.push(
            nodes[i].client.clusterMeet('127.0.0.1', nodes[0].docker.port)
        );
    }

    await Promise.all(meetPromises);

    await Promise.all(
        nodes.map(async ({ client }) => {
            while (totalNodes(await client.clusterSlots()) !== nodes.length) {
                await promiseTimeout(50);
            }
        
            return client.disconnect();
        })
    );

    return nodes.map(({ docker }) => docker);
}

/**
 * Calculates the total number of nodes in a cluster based on the provided slots information.
 * @param {ClusterSlotsReply} slots - An array containing information about cluster slots and their replicas.
 * @returns {number} The total number of nodes in the cluster, including both primary and replica nodes.
 */
function totalNodes(slots: ClusterSlotsReply) {
    let total = slots.length;
    for (const slot of slots) {
        total += slot.replicas.length;
    }

    return total;
}

const RUNNING_CLUSTERS = new Map<Array<string>, ReturnType<typeof spawnRedisClusterDockers>>();

/**
 * Spawns a Redis cluster using Docker containers
 * @param {RedisClusterDockersConfig} dockersConfig - Configuration for the Redis cluster Docker containers
 * @param {Array<string>} serverArguments - Array of arguments to be passed to the Redis server
 * @returns {Promise<Array<RedisServerDocker>>} A promise that resolves to an array of RedisServerDocker instances representing the spawned cluster
 */
export function spawnRedisCluster(dockersConfig: RedisClusterDockersConfig, serverArguments: Array<string>): Promise<Array<RedisServerDocker>> {
    const runningCluster = RUNNING_CLUSTERS.get(serverArguments);
    if (runningCluster) {
        return runningCluster;
    }

    const dockersPromise = spawnRedisClusterDockers(dockersConfig, serverArguments);
    RUNNING_CLUSTERS.set(serverArguments, dockersPromise);
    return dockersPromise;
}

/**
 * Cleans up all running Docker clusters after the test suite completes.
 * This method is registered as an 'after' hook, ensuring it runs after all tests.
 * It iterates through all running clusters, removes each Docker container,
 * and waits for all removal operations to complete.
 * @returns {Promise<void[][]>} A promise that resolves when all Docker containers have been removed.
 */
after(() => {
    return Promise.all(
        [...RUNNING_CLUSTERS.values()].map(async dockersPromise => {
            return Promise.all(
                (await dockersPromise).map(({ dockerId }) => dockerRemove(dockerId))
            );
        })
    );
});
