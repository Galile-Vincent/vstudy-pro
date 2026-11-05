/**
 * Share active conversion and purge ownership between document and storage services.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
// Purge must wait until the last converter can no longer publish files in the hash directory.
export const activeConversions = new Set<string>();

export const activePurges = new Set<string>();
