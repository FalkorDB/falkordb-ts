import { FalkorDB } from 'falkordb';

export const client = async () => {
    try{
        return await FalkorDB.connect({
            socket: {
                host: 'localhost',
                port: 6379
            }
        });
    } catch (error){
        console.log('Failed to connect to FalkorDB:', error);
        throw error;
    }
};