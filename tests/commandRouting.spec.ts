import { describe, it, expect } from '@jest/globals';
import { BasicCommandParser } from '@redis/client/dist/lib/client/parser';
import { ConstraintType, EntityType } from '../src/enums';
import * as QUERY from '../src/commands/QUERY';
import * as RO_QUERY from '../src/commands/RO_QUERY';
import * as MEMORY_USAGE from '../src/commands/MEMORY_USAGE';
import * as COPY from '../src/commands/COPY';
import * as CONSTRAINT_CREATE from '../src/commands/CONSTRAINT_CREATE';
import * as CONSTRAINT_DROP from '../src/commands/CONSTRAINT_DROP';

// A cluster client routes a command by its first key. Without one it picks a
// random node, which may serve another shard and redirect the command.
describe('Commands on a graph route by the graph key', () => {
    const cases: Array<[string, (parser: BasicCommandParser) => void, Array<string>]> = [
        [
            'GRAPH.QUERY',
            parser => QUERY.parseCommand(parser, 'g', 'RETURN 1', { TIMEOUT: 5 }, true, 7),
            QUERY.transformArguments('g', 'RETURN 1', { TIMEOUT: 5 }, true, 7) as Array<string>,
        ],
        [
            'GRAPH.RO_QUERY',
            parser => RO_QUERY.parseCommand(parser, 'g', 'RETURN 1', { TIMEOUT: 5 }, true, 7),
            RO_QUERY.transformArguments('g', 'RETURN 1', { TIMEOUT: 5 }, true, 7) as Array<string>,
        ],
        [
            'GRAPH.MEMORY USAGE',
            parser => MEMORY_USAGE.parseCommand(parser, 'g', { SAMPLES: 10 }),
            MEMORY_USAGE.transformArguments('g', { SAMPLES: 10 }),
        ],
        [
            'GRAPH.COPY',
            parser => COPY.parseCommand(parser, 'g', 'g-copy'),
            COPY.transformArguments('g', 'g-copy'),
        ],
        [
            'GRAPH.CONSTRAINT CREATE',
            parser => CONSTRAINT_CREATE.parseCommand(parser, 'g', ConstraintType.UNIQUE, EntityType.NODE, 'L', 'a', 'b'),
            CONSTRAINT_CREATE.transformArguments('g', ConstraintType.UNIQUE, EntityType.NODE, 'L', 'a', 'b'),
        ],
        [
            'GRAPH.CONSTRAINT DROP',
            parser => CONSTRAINT_DROP.parseCommand(parser, 'g', ConstraintType.MANDATORY, EntityType.RELATIONSHIP, 'R', 'a'),
            CONSTRAINT_DROP.transformArguments('g', ConstraintType.MANDATORY, EntityType.RELATIONSHIP, 'R', 'a'),
        ],
    ];

    it.each(cases)('%s', (_name, parse, expectedArgs) => {
        const parser = new BasicCommandParser();
        parse(parser);
        expect(parser.firstKey).toBe('g');
        // The command sent is unchanged
        expect(parser.redisArgs).toEqual(expectedArgs);
    });
});
