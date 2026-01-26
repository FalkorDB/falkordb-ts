import { CommandParser } from '@redis/client';

export enum ConstraintType {
    MANDATORY = "MANDATORY",
    UNIQUE = "UNIQUE" 
}

export enum EntityType {
    NODE = "NODE",
    RELATIONSHIP = "RELATIONSHIP"
}

// GRAPH.CONSTRAINT CREATE key constraintType {NODE label | RELATIONSHIP reltype} PROPERTIES propCount prop [prop...]
export function parseCommand(
    parser: CommandParser,
    key: string, 
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]): void {
    parser.push(
        'GRAPH.CONSTRAINT', 'CREATE',
        key, constraintType, entityType, label, 
        'PROPERTIES', properties.length.toString(), ...properties
    );
}

export function transformArguments(
    key: string, 
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]): Array<string> {
    return [
            'GRAPH.CONSTRAINT', 'CREATE',
            key, constraintType, entityType, label, 
            'PROPERTIES', properties.length.toString(), ...properties
    ];
}

export function transformReply(reply: unknown): 'PENDING' {
    return reply as 'PENDING';
}
