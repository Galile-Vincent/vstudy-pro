/**
 * Resolve library files only after lexical, realpath, and link containment checks.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import { realpathSync, lstatSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep, join } from 'node:path';
/** Reject escaping, symbolic, or hard-linked paths before returning a real library path. */
export function containedPath(root: string, path: string) {
    const lexical = relative(resolve(root), resolve(path));
    if (!lexical || lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical))
        throw new Error('Path outside library');
    let current = resolve(root);
    for (const part of lexical.split(sep)) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink() || (lstatSync(current).isFile() && lstatSync(current).nlink !== 1))
            throw new Error('Symlink in library path');
    }
    const realRoot = realpathSync(root), real = realpathSync(path), rel = relative(realRoot, real);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
        throw new Error('Path outside library');
    return real;
}
