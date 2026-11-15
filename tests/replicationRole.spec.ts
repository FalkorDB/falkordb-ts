import { describe, it, expect } from '@jest/globals';
import { isReplica } from '../src/replication-role';

/** An `INFO replication` reply shaped like the real ones, with `role:<role>` in it. */
function infoReplication(role: string | undefined, eol = '\r\n') {
    return [
        '# Replication',
        ...(role === undefined ? [] : [`role:${role}`]),
        'connected_slaves:0',
        'master_failover_state:no-failover',
        '',
    ].join(eol);
}

describe('isReplica', () => {
    describe.each([['\\r\\n', '\r\n'], ['\\n', '\n']])('with %s line endings', (_name, eol) => {
        it('reads role:slave as a replica', () => {
            expect(isReplica(infoReplication('slave', eol))).toBe(true);
        });

        it('reads role:replica as a replica', () => {
            expect(isReplica(infoReplication('replica', eol))).toBe(true);
        });

        it('reads role:master as not a replica', () => {
            expect(isReplica(infoReplication('master', eol))).toBe(false);
        });

        it('reads a reply without a role as not a replica', () => {
            expect(isReplica(infoReplication(undefined, eol))).toBe(false);
        });
    });

    it('only reads the role field itself', () => {
        // `includes('role:slave')` matched this
        expect(isReplica('# Replication\r\nfailover_role:slave\r\nrole:master\r\n')).toBe(false);
    });
});
