export const IS_READ_ONLY = true;

export function transformArguments(dbname: string): Array<string> {
        return ['SENTINEL', 'MASTER', dbname];
}

export declare function transformReply(): Array<string>;
