/**
 * Read and write the bounded portable backup archive format.
 * Owned by main/storage.
 * Filesystem operations stay inside the application namespace and preserve recoverable state.
 * @packageDocumentation
 */
/** Streaming ZIP32 storage. Only this app's uncompressed, regular-file backup format is accepted. */
import { createReadStream } from 'node:fs';
import { open, rename, rm, mkdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { retryBusy, syncDirectory, validateDestination } from './atomic';
export interface ArchiveFile { name: string; path: string; bytes: number; sha256: string; crc: number }
const maxBytes = 0xffff_ffff;
export const allowedBackupPath = (name: string): boolean => name === 'manifest.json' || name === 'vstudy.sqlite' || /^library\/[a-f0-9]{64}\/(?:source\.[a-z0-9]{1,12}|image-[a-f0-9]{64}\.(?:jpg|png|gif|webp)|content(?:\.ai)?\.md(?:\.json)?)$/.test(name);

/** Hash without buffering a library or database file in memory. */
export async function fingerprint(path: string): Promise<{bytes:number;sha256:string;crc:number}> {
  const hash=createHash('sha256');let bytes=0,crc=0;
  for await (const raw of createReadStream(path)) {
    const chunk=raw as Buffer; bytes+=chunk.length;hash.update(chunk);crc=crc32(chunk,crc);
  }
  return {bytes,sha256:hash.digest('hex'),crc};
}

/** Write a standard ZIP with bounded metadata and 64 KiB streaming file reads. */
export async function writeZip(destination: string, files: ArchiveFile[]): Promise<void> {
  if (files.length > 50000 || files.some(f => !allowedBackupPath(f.name))) throw new Error('storage.invalid_backup');
  if(files.some(file=>file.bytes>maxBytes) || files.reduce((sum,file)=>sum+file.bytes+Buffer.byteLength(file.name)*2+76,22)>maxBytes)throw new Error('storage.backup_too_large');
  await validateDestination(destination);
  const temporary=`${destination}.${randomUUID()}.tmp`;
  try {
    const output=await open(temporary,'wx',0o600);
    try {
      let offset=0; const directory:Buffer[]=[];
      const write=async (data:Buffer) => {offset+=data.length;if(offset>maxBytes)throw new Error('storage.backup_too_large');await output.writeFile(data);};
      for (const file of files) {
        const name=Buffer.from(file.name); const local=Buffer.alloc(30);const start=offset;
        local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);
        local.writeUInt32LE(file.crc,14);local.writeUInt32LE(file.bytes,18);local.writeUInt32LE(file.bytes,22);local.writeUInt16LE(name.length,26);
        await write(local);await write(name);
        let size=0; const hash=createHash('sha256');
        for await (const raw of createReadStream(file.path)) {const chunk=raw as Buffer;size+=chunk.length;hash.update(chunk);await write(chunk);}
        if(size!==file.bytes || hash.digest('hex')!==file.sha256)throw new Error('storage.changed_during_backup');
        const central=Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x314,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);
        central.writeUInt32LE(file.crc,16);central.writeUInt32LE(file.bytes,20);central.writeUInt32LE(file.bytes,24);central.writeUInt16LE(name.length,28);
        central.writeUInt32LE(0x81800000,38);central.writeUInt32LE(start,42);directory.push(central,name);
      }
      const start=offset;
      for(const chunk of directory)await write(chunk);
      const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
      end.writeUInt32LE(offset-start,12);end.writeUInt32LE(start,16);await write(end);await output.sync();
    } finally {await output.close();}
    const verified=await readZip(temporary);
    if(verified.size!==files.length || files.some(expected=>{const actual=verified.get(expected.name);return !actual || actual.bytes!==expected.bytes || actual.sha256!==expected.sha256;}))throw new Error('storage.invalid_backup');
    await retryBusy(() => rename(temporary,destination));await syncDirectory(dirname(destination));
  } finally {await rm(temporary,{force:true});}
}
async function read(file: FileHandle, position:number, length:number):Promise<Buffer> {
  const buffer=Buffer.alloc(length);let offset=0;
  while(offset<length){const result=await file.read(buffer,offset,length-offset,position+offset);if(!result.bytesRead)throw new Error('storage.invalid_backup');offset+=result.bytesRead;}
  return buffer;
}

/** Extract into an empty private staging directory. Reject traversal, compression, duplicates, and malformed headers. */
export async function extractZip(source:string, destination:string):Promise<Map<string,{bytes:number;sha256:string}>> {
  return readZip(source,destination);
}

async function readZip(source:string, destination?:string):Promise<Map<string,{bytes:number;sha256:string}>> {
  if(destination)destination=resolve(destination);
  const file=await open(source,'r');
  try {
    const size=(await file.stat()).size;
    if(size<22 || size>maxBytes)throw new Error('storage.invalid_backup');
    const end=await read(file,size-22,22);
    if(end.readUInt32LE(0)!==0x06054b50 || end.readUInt16LE(4) || end.readUInt16LE(6) || end.readUInt16LE(20))throw new Error('storage.invalid_backup');
    const count=end.readUInt16LE(10),directorySize=end.readUInt32LE(12),directoryStart=end.readUInt32LE(16);
    if(count!==end.readUInt16LE(8) || count>50000 || directoryStart+directorySize!==size-22 || directorySize>16*1024*1024)throw new Error('storage.invalid_backup');
    const directory=await read(file,directoryStart,directorySize);
    const directories=new Set<string>(destination?[destination]:[]);
    const entries=new Map<string,{bytes:number;sha256:string}>();let cursor=0,total=0;
    for(let i=0;i<count;i++){
      if(cursor+46>directory.length || directory.readUInt32LE(cursor)!==0x02014b50)throw new Error('storage.invalid_backup');
      const length=directory.readUInt16LE(cursor+28),extra=directory.readUInt16LE(cursor+30),comment=directory.readUInt16LE(cursor+32);
      const name=directory.subarray(cursor+46,cursor+46+length).toString('utf8');
      const bytes=directory.readUInt32LE(cursor+24),compressed=directory.readUInt32LE(cursor+20),crc=directory.readUInt32LE(cursor+16),offset=directory.readUInt32LE(cursor+42);
      const flags=directory.readUInt16LE(cursor+8),method=directory.readUInt16LE(cursor+10),mode=directory.readUInt32LE(cursor+38)>>>16;
      if(cursor+46+length+extra+comment>directory.length || !allowedBackupPath(name) || entries.has(name) || flags!==0x800 || method!==0 || bytes!==compressed || (mode&0xf000)!==0x8000)throw new Error('storage.invalid_backup');
      if(name==='manifest.json' && bytes>4*1024*1024)throw new Error('storage.invalid_backup');
      total+=bytes;if(total>maxBytes)throw new Error('storage.backup_too_large');
      const local=await read(file,offset,30);
      if(local.readUInt32LE(0)!==0x04034b50 || local.readUInt16LE(6)!==flags || local.readUInt16LE(8)!==method || local.readUInt32LE(14)!==crc || local.readUInt32LE(18)!==bytes || local.readUInt32LE(22)!==bytes)throw new Error('storage.invalid_backup');
      const localName=local.readUInt16LE(26),localExtra=local.readUInt16LE(28),start=offset+30+localName+localExtra;
      if((await read(file,offset+30,localName)).toString('utf8')!==name || start+bytes>directoryStart)throw new Error('storage.invalid_backup');
      let output:FileHandle|undefined;
      if(destination){
        const path=join(destination,name);await mkdir(dirname(path),{recursive:true,mode:0o700});
        for(let directory=dirname(path);directory!==destination;directory=dirname(directory))directories.add(directory);
        output=await open(path,'wx',0o600);
      }
      const hash=createHash('sha256');let actualCrc=0;
      try {
        for(let n=0;n<bytes;n+=65536){const chunk=await read(file,start+n,Math.min(65536,bytes-n));hash.update(chunk);actualCrc=crc32(chunk,actualCrc);await output?.writeFile(chunk);}
        await output?.sync();
      } finally {await output?.close();}
      if(actualCrc!==crc)throw new Error('storage.invalid_backup');
      entries.set(name,{bytes,sha256:hash.digest('hex')});cursor+=46+length+extra+comment;
    }
    if(cursor!==directory.length)throw new Error('storage.invalid_backup');
    for(const directory of [...directories].sort((a,b)=>b.length-a.length))await syncDirectory(directory);
    return entries;
  } finally {await file.close();}
}
