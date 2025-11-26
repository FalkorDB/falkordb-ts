import TestUtils from './test-utils/lib';
import Graph from './graph';

export default new TestUtils({
    dockerImageName: 'falkordb/falkordb',
    dockerImageVersionArgument: 'falkordb-version'
});

export const GLOBAL = {
    SERVERS: {
        OPEN: {
            serverArguments: ['--loadmodule /usr/lib/redis/modules/falkordb.so'],
            clientOptions: {
                modules: {
                    graph: Graph
                }
            }
        }
    }
};
