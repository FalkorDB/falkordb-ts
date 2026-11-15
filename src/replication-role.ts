// Redis and Valkey both report `role:slave` today; `replica` is the name both
// use everywhere else (REPLICAOF, `replica-*` settings), so accept it too.
const ROLE_FIELD = /^role:([^\r\n]*)\r?$/m;
const REPLICA_ROLES = new Set(['slave', 'replica']);

/**
 * Reads the `role` field of an `INFO replication` reply and says whether the
 * server is a replica. A reply without a role is not a replica.
 */
export function isReplica(info: string): boolean {
    const role = ROLE_FIELD.exec(info)?.[1].trim();
    return role !== undefined && REPLICA_ROLES.has(role);
}
