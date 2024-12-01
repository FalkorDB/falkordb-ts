import { RedisModules, RedisFunctions, RedisScripts } from '@falkordb/client/lib/commands';
import RedisClient, { RedisClientOptions, RedisClientType } from '@falkordb/client/lib/client';
import RedisCluster, { RedisClusterOptions, RedisClusterType } from '@falkordb/client/lib/cluster';
import { RedisSocketCommonOptions } from '@falkordb/client/lib/client/socket';
import { RedisServerDockerConfig, spawnRedisServer, spawnRedisCluster } from './dockers';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface TestUtilsConfig {
    dockerImageName: string;
    dockerImageVersionArgument: string;
    defaultDockerVersion?: string;
}

interface CommonTestOptions {
    minimumDockerVersion?: Array<number>;
}

interface ClientTestOptions<
    M extends RedisModules,
    F extends RedisFunctions,
    S extends RedisScripts
> extends CommonTestOptions {
    serverArguments: Array<string>;
    clientOptions?: Partial<Omit<RedisClientOptions<M, F, S>, 'socket'> & { socket: RedisSocketCommonOptions }>;
    disableClientSetup?: boolean;
}

interface ClusterTestOptions<
    M extends RedisModules,
    F extends RedisFunctions,
    S extends RedisScripts
> extends CommonTestOptions {
    serverArguments: Array<string>;
    clusterConfiguration?: Partial<RedisClusterOptions<M, F, S>>;
    numberOfMasters?: number;
    numberOfReplicas?: number;
}

interface Version {
    string: string;
    numbers: Array<number>;
}

export default class TestUtils {
    static #parseVersionNumber(version: string): Array<number> {
        if (version === 'latest' || version === 'edge') return [Infinity];

        const dashIndex = version.indexOf('-');
        return (dashIndex === -1 ? version : version.substring(0, dashIndex))
            .split('.')
            /**
             * Validates and converts a Redis version string to an array of numbers.
             * @param {string} version - The Redis version string to be processed.
             * @returns {number[]} An array of numbers representing the version components.
             * @throws {TypeError} If the input version string contains non-numeric characters.
             */            .map(x => {
                const value = Number(x);
                if (Number.isNaN(value)) {
                    throw new TypeError(`${version} is not a valid redis version`);
                }

                return value;
            });
    }

    static #getVersion(argumentName: string, defaultVersion = 'latest'): Version {
        return yargs(hideBin(process.argv))
            .option(argumentName, {
                type: 'string',
                default: defaultVersion
            })
            /**
             * Coerces the given version string into an object with string and parsed number representation.
             * @param {string} version - The version string to be coerced.
             * @returns {Object} An object containing the original version string and its parsed numeric representation.
             * @returns {string} returns.string - The original version string.
             * @returns {number[]} returns.numbers - An array of numbers parsed from the version string.
             */
            .coerce(argumentName, (version: string) => {
                return {
                    string: version,
                    numbers: TestUtils.#parseVersionNumber(version)
                };
            })
            .demandOption(argumentName)
            .parseSync()[argumentName];
    }

    readonly #VERSION_NUMBERS: Array<number>;
    readonly #DOCKER_IMAGE: RedisServerDockerConfig;

    constructor(config: TestUtilsConfig) {
        const { string, numbers } = TestUtils.#getVersion(config.dockerImageVersionArgument, config.defaultDockerVersion);
        this.#VERSION_NUMBERS = numbers;
        this.#DOCKER_IMAGE = {
            image: config.dockerImageName,
            version: string
        };
    }

    isVersionGreaterThan(minimumVersion: Array<number> | undefined): boolean {
        if (minimumVersion === undefined) return true;

        const lastIndex = Math.min(this.#VERSION_NUMBERS.length, minimumVersion.length) - 1;
        for (let i = 0; i < lastIndex; i++) {
            if (this.#VERSION_NUMBERS[i] > minimumVersion[i]) {
                return true;
            } else if (minimumVersion[i] > this.#VERSION_NUMBERS[i]) {
                return false;
            }
        }

        return this.#VERSION_NUMBERS[lastIndex] >= minimumVersion[lastIndex];
    }

    isVersionGreaterThanHook(minimumVersion: Array<number> | undefined): void {
        const isVersionGreaterThan = this.isVersionGreaterThan.bind(this);
        /**
         * Skips the test if the current version is not greater than the minimum required version.
         * This function is used as a setup step before running a test.
         * @param {void} No parameters
         * @returns {void} This function doesn't return a value, but may skip the test
         * @throws {Error} Implicitly throws an error if the test is skipped
         */
        before(function () {
            if (!isVersionGreaterThan(minimumVersion)) {
                return this.skip();
            }
        });
    }

    testWithClient<
        M extends RedisModules,
        F extends RedisFunctions,
        S extends RedisScripts
    >(
        title: string,
        fn: (client: RedisClientType<M, F, S>) => unknown,
        options: ClientTestOptions<M, F, S>
    ): void {
        let dockerPromise: ReturnType<typeof spawnRedisServer>;
        if (this.isVersionGreaterThan(options.minimumDockerVersion)) {
            const dockerImage = this.#DOCKER_IMAGE;
            /**
             * Sets up a Redis server in a Docker container before running tests.
             * This method is intended to be used as a setup function in a test framework.
             * It increases the timeout to 30 seconds to allow for server startup.
             * @param {function} function - The function to be executed before tests.
             * @returns {Promise} A promise that resolves when the Redis server is ready.
             */
            before(function () {
                this.timeout(30000);

                dockerPromise = spawnRedisServer(dockerImage, options.serverArguments);
                return dockerPromise;
            });
        }

        /**
         * Executes a test case with Redis client setup and cleanup.
         * @param {string} title - The title of the test case.
         * @param {Function} fn - The test function to be executed.
         * @returns {Promise<void>} A promise that resolves when the test is complete.
         * @throws {Error} If an error occurs during test execution.
         */
        it(title, async function() {
            if (!dockerPromise) return this.skip();

            const client = RedisClient.create({
                ...options?.clientOptions,
                socket: {
                    ...options?.clientOptions?.socket,
                    port: (await dockerPromise).port
                }
            });

            if (options.disableClientSetup) {
                return fn(client);
            }

            await client.connect();

            try {
                await client.flushAll();
                await fn(client);
            } finally {
                if (client.isOpen) {
                    await client.flushAll();
                    await client.disconnect();
                }
            }
        });
    }

    static async #clusterFlushAll<
        M extends RedisModules,
        F extends RedisFunctions,
        S extends RedisScripts
    >(cluster: RedisClusterType<M, F, S>): Promise<unknown> {
        return Promise.all(
            /**
             * Flushes all data from the Redis databases of master nodes in the cluster.
             * @param {Array} cluster.masters - An array of master nodes in the cluster.
             * @returns {Promise<void[]>} A promise that resolves when all flush operations are complete.
             */
            cluster.masters.map(async ({ client }) => {
                if (client) {
                    await (await client).flushAll();
                }
            })
        );
    }

    testWithCluster<
        M extends RedisModules,
        F extends RedisFunctions,
        S extends RedisScripts
    >(
        title: string,
        fn: (cluster: RedisClusterType<M, F, S>) => unknown,
        options: ClusterTestOptions<M, F, S>
    ): void {
        let dockersPromise: ReturnType<typeof spawnRedisCluster>;
        if (this.isVersionGreaterThan(options.minimumDockerVersion)) {
            const dockerImage = this.#DOCKER_IMAGE;
            /**
             * Sets up a Redis cluster for testing purposes before running tests.
             * @param {Object} options - Configuration options for the Redis cluster.
             * @param {number} [options.numberOfMasters] - The number of master nodes in the cluster.
             * @param {number} [options.numberOfReplicas] - The number of replica nodes for each master.
             * @param {Array<string>} [options.serverArguments] - Additional arguments to pass to the Redis server.
             * @returns {Promise<Object>} A promise that resolves with the Docker container information.
             */
            before(function () {
                this.timeout(30000);

                dockersPromise = spawnRedisCluster({
                    ...dockerImage,
                    numberOfMasters: options?.numberOfMasters,
                    numberOfReplicas: options?.numberOfReplicas 
                }, options.serverArguments);
                return dockersPromise;
            });
        }

        /**
         * Executes a test case for a Redis cluster operation.
         * @param {string} title - The title of the test case.
         * @param {function} fn - The async function containing the test logic.
         * @returns {void} This method doesn't return a value.
         * @throws {Error} May throw an error if the cluster operations fail.
         */
        it(title, async function () {
            if (!dockersPromise) return this.skip();

            const dockers = await dockersPromise,
                cluster = RedisCluster.create({
                    rootNodes: dockers.map(({ port }) => ({
                        socket: {
                            port
                        }
                    })),
                    minimizeConnections: true,
                    ...options.clusterConfiguration
                });

            await cluster.connect();

            try {
                await TestUtils.#clusterFlushAll(cluster);
                await fn(cluster);
            } finally {
                await TestUtils.#clusterFlushAll(cluster);
                await cluster.disconnect();
            }
        });
    }
}
