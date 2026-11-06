/**
 * Reject unsafe signatures, archive entries, links, and text encodings before conversion.
 * Owned by main/services.
 * Privileged IO stays in main; callers receive validated domain data rather than raw paths or secrets.
 * @packageDocumentation
 */
import { lstat, readFile } from "node:fs/promises";
import { readFileSync, lstatSync } from 'node:fs';
import { isPortableRelativePath } from '../platform/paths';
/** Validate file signatures and archive declarations before staging conversion. */
export function validateImport(path: string, extension: string) {
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || lstatSync(path).nlink !== 1)
        throw new Error('Symlink imports are not allowed');
    if (lstatSync(path).size > 50 * 1024 * 1024) throw new Error("Document exceeds 50 MiB");
    validateImportBytes(readFileSync(path), extension);
}
/** Validate imports through the asynchronous IO boundary with the same file policy. */
export async function validateImportAsync(path: string, extension: string): Promise<void> {
    const info = await lstat(path);
    if (!info.isFile() || info.nlink !== 1) throw new Error("Symlink imports are not allowed");
    if (info.size > 50 * 1024 * 1024) throw new Error("Document exceeds 50 MiB");
    validateImportBytes(await readFile(path), extension);
}
function validateImportBytes(data: Buffer, extension: string): void {
    if (!data.length) throw new Error('empty file');
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
        const seenNames = new Set<string>();
        for (let n = 0; n < entries; n++) {
            if (cursor + 46 > data.length || data.readUInt32LE(cursor) !== 0x02014b50)
                throw new Error('Invalid ZIP entry');
            const compressed = data.readUInt32LE(cursor + 20), size = data.readUInt32LE(cursor + 24), length = data.readUInt16LE(cursor + 28), extra = data.readUInt16LE(cursor + 30), comment = data.readUInt16LE(cursor + 32), flags = data.readUInt16LE(cursor + 8), mode = data.readUInt32LE(cursor + 38) >>> 16;
            total += size;
            const name = data.subarray(cursor + 46, cursor + 46 + length).toString();
            if (seenNames.has(name.toLowerCase()) ||
                total > 256 * 1024 * 1024 || size / Math.max(1, compressed) > 200 || (flags & 1) || (mode & 0xf000) === 0xa000 || !isPortableRelativePath(name.replace(/\/$/, '')))
                throw new Error('Unsafe ZIP archive');
            names.push(name);seenNames.add(name.toLowerCase());
            cursor += 46 + length + extra + comment;
        }
        const prefix = { docx: 'word/', xlsx: 'xl/', pptx: 'ppt/' }[extension]!;
        if (!names.includes('[Content_Types].xml') || !names.some(n => n.startsWith(prefix)))
            throw new Error('Office content mismatch');
        return;
    }
    if (extension === 'csv' && ['UTF-16LE','UTF-16BE'].includes(sniffTextEncoding(data))) throw new Error('Text encoding: ' + sniffTextEncoding(data));
    if (data.includes(0) || data.subarray(0, 4).toString() === 'PK\x03\x04')
        throw new Error('Text signature mismatch');
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(data);
    }
    catch {
        throw new Error('Text encoding: ' + sniffTextEncoding(data));
    }
}

/** Recognize supported text encodings and reject binary content masquerading as text. */
export function sniffTextEncoding(data: Uint8Array): string {
    const sample = data.subarray(0, 64 * 1024);
    if (sample[0] === 0xff && sample[1] === 0xfe) return 'UTF-16LE';
    if (sample[0] === 0xfe && sample[1] === 0xff) return 'UTF-16BE';
    try { new TextDecoder('utf-8', {fatal:true}).decode(sample, {stream: data.length > sample.length}); return 'UTF-8'; }
    catch { /* Legacy encodings are ambiguous; only report a possible encoding. */ }
    try {
        const decoded = new TextDecoder('shift_jis', {fatal:true}).decode(sample, {stream:data.length > sample.length});
        if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(decoded)) return 'Shift_JIS';
    } catch { /* Unknown encodings receive the same UTF-8 export guidance. */ }
    return 'unknown';
}
