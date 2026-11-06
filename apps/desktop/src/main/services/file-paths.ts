/**
 * Resolve library files only after lexical, realpath, and link containment checks.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import { realpathSync, lstatSync } from 'node:fs';
import { resolve, relative, sep, join } from 'node:path';
import { isPathWithin } from '../platform/paths';
/** Reject escaping, symbolic, or hard-linked paths before returning a real library path. */
export function containedPath(root: string, path: string) {
    const realRoot = realpathSync.native(root);
    const lexicalRoot = isPathWithin(root, path) ? resolve(root) : realRoot;
    const lexical = relative(lexicalRoot, resolve(path));
    if (!isPathWithin(lexicalRoot, path))
        throw new Error('Path outside library');
    let current = lexicalRoot;
    for (const part of lexical.split(sep)) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink() || (lstatSync(current).isFile() && lstatSync(current).nlink !== 1))
            throw new Error('Symlink in library path');
    }
    const real = realpathSync.native(path);
    if (!isPathWithin(realRoot, real))
        throw new Error('Path outside library');
    return real;
}
