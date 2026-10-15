export type SlowLogRawReply = Array<[
    timestamp: string,
    command: string,
    query: string,
    took: string
]>;

export type SlowLogReply = Array<{
    timestamp: Date;
    command: string;
    query: string;
    took: number;
}>;
