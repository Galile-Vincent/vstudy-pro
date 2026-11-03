// Purge must wait until the last converter can no longer publish files in the hash directory.
export const activeConversions = new Set<string>();
