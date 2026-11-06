/** Backup success means the written archive was read back and verified. */
import { expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { crc32 } from 'node:zlib';
import { join } from 'node:path';
import { fingerprint, writeZip } from './zip';
vi.mock('node:fs/promises',async importOriginal=>{const actual=await importOriginal<typeof import('node:fs/promises')>();return {...actual,open:vi.fn(actual.open)};});
it.each(['payload','matching CRCs','entry list'])('rejects a written archive with corrupted %s and preserves the previous backup',async corruption=>{
 const root=await fs.mkdtemp(join(tmpdir(),'zip-readback-'));
 const actual=await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
 try {
  const source=join(root,'data'),destination=join(root,'backup.zip');await fs.writeFile(source,'fixture-data');await fs.writeFile(destination,'previous backup');
  const entry={name:'vstudy.sqlite',path:source,...await fingerprint(source)};
  vi.mocked(fs.open).mockImplementationOnce(async(path,flags,mode)=>{
   const file=await actual.open(path,flags,mode),close=file.close.bind(file);
   file.close=async()=>{
    await close();const bytes=await actual.readFile(path),start=30+Buffer.byteLength(entry.name),central=start+entry.bytes;
    if(corruption==='entry list'){
     bytes.write('manifest.json',30);bytes.write('manifest.json',central+46);
    } else {
     bytes[start]=0;
     if(corruption==='matching CRCs'){const crc=crc32(bytes.subarray(start,central));bytes.writeUInt32LE(crc,14);bytes.writeUInt32LE(crc,central+16);}
    }
    await actual.writeFile(path,bytes);
   };return file;
  });
  await expect(writeZip(destination,[entry])).rejects.toThrow('storage.invalid_backup');
  expect(await fs.readFile(destination,'utf8')).toBe('previous backup');
 } finally {await fs.rm(root,{recursive:true,force:true});vi.mocked(fs.open).mockClear();}
});
