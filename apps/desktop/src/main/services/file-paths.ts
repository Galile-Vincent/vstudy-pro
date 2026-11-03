import { realpathSync, lstatSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep, join } from 'node:path';
export function containedPath(root: string, path: string) {
    const lexical = relative(resolve(root), resolve(path));
    if (!lexical || lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical))
        throw new Error('Path outside library');
    let current = resolve(root);
    for (const part of lexical.split(sep)) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink())
            throw new Error('Symlink in library path');
    }
    const realRoot = realpathSync(root), real = realpathSync(path), rel = relative(realRoot, real);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
        throw new Error('Path outside library');
    return real;
}
