// UDF library entry: [library_name, [function_names...]]
// or with code: [library_name, [function_names...], code]
export type UdfLibraryEntry = [string, string[]] | [string, string[], string];

export type UdfListReply = UdfLibraryEntry[];
