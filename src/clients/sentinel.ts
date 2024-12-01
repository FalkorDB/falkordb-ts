import * as tls from 'tls';
import { Single, SingleGraphConnection } from "./single";
import FalkorDB, { TypedRedisClientOptions } from "../falkordb";
import { createClient, RedisFunctions, RedisScripts } from "@redis/client";
import commands from '../commands';


function extractDetails(masters: Array<Array<string>>) {
    const allDetails: Record<string, string>[] = [];
    for (const master of masters) {
        const details: Record<string, string> = {};
        for (let i = 0; i < master.length; i += 2) {
            details[master[i]] = master[i + 1];
        }
        allDetails.push(details);
    }
    return allDetails;
}

export class Sentinel extends Single {

    private sentinelClient: SingleGraphConnection;

    init(falkordb: FalkorDB): Promise<void> {
        const redisOption = (this.client.options ?? {}) as TypedRedisClientOptions;
		return this.tryConnectSentinelServer(this.client, redisOption, falkordb);
	}

    /**
     * Connect to the server using the details from sentinel server
     * Register error event to reconnect on error from the sentinel server
     */
    private async tryConnectSentinelServer(client: SingleGraphConnection, redisOption: TypedRedisClientOptions, falkordb: FalkorDB) {

        // TODO support multi sentinels
        const masters = await client.falkordb.sentinelMasters();
        const details = extractDetails(masters);

        if (details.length > 1) {
            throw new Error('Multiple masters are not supported');
        }
    
        // Connect to the server with the details from sentinel
        const socketOptions: tls.ConnectionOptions = {
            ...redisOption.socket,
            host: details[0]['ip'] as string,
            port: parseInt(details[0]['port'])
        };
        const serverOptions: TypedRedisClientOptions = {
            ...redisOption,
            socket: socketOptions
        };
        const realClient = createClient<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>(serverOptions)

        // Save sentinel client to quite on quit()
        this.sentinelClient = client;

        // Set original client as sentinel and server client as client
        this.client = realClient;

        await realClient
            .on('error', async err => {

                console.debug('Error on server connection', err)

                // Disconnect the client to avoid further errors and retries
                realClient.disconnect();

                // If error occurs on previous server connection, no need to reconnect
                if (this.client !== realClient) {
                    return;
                }

                try {
                    await this.tryConnectSentinelServer(client, redisOption, falkordb)
                    console.debug('Connected to server')
                } catch (e) {
                    console.debug('Error on server reconnect', e)

                    // Forward errors if reconnection fails
                    falkordb.emit('error', err)
                }
            })
            .connect();
    }

    async quit() {
        await super.quit();
        if (this.sentinelClient) {
            const reply = this.sentinelClient.quit();
            return reply.then(() => {})
        }
    }
}

