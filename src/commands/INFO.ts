export const IS_READ_ONLY = true;

export function transformArguments(section?: string): Array<string> {
    const args = ['GRAPH.INFO'];

    if (section) {
        args.push(section);
    }

    return args;
}

export declare function transformReply(): Array<string | Array<string>>;
