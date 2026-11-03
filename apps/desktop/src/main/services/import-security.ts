import { readFileSync, lstatSync } from 'node:fs';
export function validateImport(path: string, extension: string) {
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || lstatSync(path).nlink !== 1)
        throw new Error('Symlink imports are not allowed');
    if (lstatSync(path).size > 50 * 1024 * 1024) throw new Error("Document exceeds 50 MiB");
    const data = readFileSync(path);
    if (data.subarray(0, 2).toString() === 'MZ' || data.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'].includes(data.subarray(0, 4).toString('hex')))
        throw new Error('Executable import rejected');
    if (extension === 'pdf') {
        if (data.subarray(0, 5).toString() !== '%PDF-')
            throw new Error('PDF signature mismatch');
        return;
    }
    if (['docx', 'xlsx', 'pptx'].includes(extension)) {
        if (data.length < 4 || data.readUInt32LE(0) !== 0x04034b50)
            throw new Error('Office signature mismatch');
        let end = -1;
        for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
            if (data.readUInt32LE(i) === 0x06054b50) {
                end = i;
                break;
            }
        if (end < 0)
            throw new Error('Invalid ZIP directory');
        const entries = data.readUInt16LE(end + 10), offset = data.readUInt32LE(end + 16);
        if (entries > 10000 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6))
            throw new Error('ZIP entry limit');
        let cursor = offset, total = 0;
        const names: string[] = [];
        for (let n = 0; n < entries; n++) {
            if (cursor + 46 > data.length || data.readUInt32LE(cursor) !== 0x02014b50)
                throw new Error('Invalid ZIP entry');
            const compressed = data.readUInt32LE(cursor + 20), size = data.readUInt32LE(cursor + 24), length = data.readUInt16LE(cursor + 28), extra = data.readUInt16LE(cursor + 30), comment = data.readUInt16LE(cursor + 32), flags = data.readUInt16LE(cursor + 8), mode = data.readUInt32LE(cursor + 38) >>> 16;
            total += size;
            const name = data.subarray(cursor + 46, cursor + 46 + length).toString();
            names.push(name);
            if (total > 256 * 1024 * 1024 || size / Math.max(1, compressed) > 200 || (flags & 1) || (mode & 0xf000) === 0xa000 || name.includes('..') || name.startsWith('/') || name.includes('\\'))
                throw new Error('Unsafe ZIP archive');
            cursor += 46 + length + extra + comment;
        }
        const prefix = { docx: 'word/', xlsx: 'xl/', pptx: 'ppt/' }[extension]!;
        if (!names.includes('[Content_Types].xml') || !names.some(n => n.startsWith(prefix)))
            throw new Error('Office content mismatch');
        return;
    }
    if (data.includes(0) || data.subarray(0, 4).toString() === 'PK\x03\x04')
        throw new Error('Text signature mismatch');
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(data);
    }
    catch {
        throw new Error('Text must be UTF-8');
    }
}
