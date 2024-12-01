import FalkorDB from '../src/falkordb';

/**
 * Establishes a connection to FalkorDB.
 * @returns {Promise<FalkorDB>} A Promise that resolves to a FalkorDB client instance.
 * @throws {Error} If the connection to FalkorDB fails.
 */
export const client = async () => {
    try {
        return await FalkorDB.connect({
            socket: {
                host: process.env.FALKORDB_HOST || 'localhost',
                port: parseInt(process.env.FALKORDB_PORT || '6379', 10)
            },
        });
    } catch (error) {
        console.error('Failed to connect to FalkorDB:', error);
        throw error;
    }
};