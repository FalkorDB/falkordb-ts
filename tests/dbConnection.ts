import FalkorDB from '../src/falkordb';

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