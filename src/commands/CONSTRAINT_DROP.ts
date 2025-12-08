import { ConstraintType, EntityType } from "../enums";

// GRAPH.CONSTRAINT DROP key constraintType {NODE label | RELATIONSHIP reltype} PROPERTIES propCount prop [prop...]
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

export declare function transformReply(): 'OK';
