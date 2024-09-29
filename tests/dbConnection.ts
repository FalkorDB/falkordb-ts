import { FalkorDB } from 'falkordb';

export const client = async () => {
    return await FalkorDB.connect({
        socket: {
            host: 'localhost',
            port: 6379
        }
    });
};