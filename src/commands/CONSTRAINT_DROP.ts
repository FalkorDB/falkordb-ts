import { CommandParser } from '@redis/client';
import { ConstraintType, EntityType } from "./CONSTRAINT_CREATE";

// GRAPH.CONSTRAINT DROP key constraintType {NODE label | RELATIONSHIP reltype} PROPERTIES propCount prop [prop...]
export function parseCommand(
    parser: CommandParser,
    key: string, 
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]): void {
    parser.push(
        'GRAPH.CONSTRAINT', 'DROP',
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
            'GRAPH.CONSTRAINT', 'DROP',
            key, constraintType, entityType, label, 
            'PROPERTIES', properties.length.toString(), ...properties
    ];
}

export function transformReply(reply: unknown): 'OK' {
    return reply as 'OK';
}
