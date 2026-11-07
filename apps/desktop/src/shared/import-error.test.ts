/**
 * Regression coverage for import-error.
 * Owned by shared.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import {expect,it} from 'vitest';
import {importError} from './import-error';
it.each([
 ['empty file','errors.empty_file',{}],
 ['Document exceeds 50 MiB','errors.file_too_large',{limit:50}],
 ['PDF signature mismatch','errors.type_mismatch',{}],
 ['Unsafe ZIP archive','errors.unsafe_archive',{}],
 ['Unsupported document type','errors.unsupported_type',{}],
 ['Text encoding: Shift_JIS','errors.text_encoding',{encoding:'Shift_JIS'}],
 ['NO_TEXT_LAYER: OCR not supported','errors.pdf_no_text',{}],
])('provides a specific stable reason for %s', (message,code,params) => {
 expect(importError(new Error(message))).toEqual({code,params});
});
it.each([
 [Object.assign(new Error('ENOSPC: no space left on device, copyfile'),{code:'ENOSPC'}),'errors.disk_full'],
 [Object.assign(new Error('storage.disk_full'),{code:'ENOSPC'}),'errors.disk_full'],
 [Object.assign(new Error("EACCES: permission denied, open 'empty.pdf'"),{code:'EACCES'}),'errors.permission_denied'],
 [Object.assign(new Error('read-only file system'),{code:'EROFS'}),'errors.permission_denied'],
 [Object.assign(new Error('getaddrinfo ENOTFOUND pypi.org'),{code:'ENOTFOUND'}),'errors.offline'],
])('maps system error %# to a specific next-step reason',(error,code) => {
 expect(importError(error)).toEqual({code,params:{}});
});
it.each([
 [Object.assign(new TypeError('fetch failed'),{cause:Object.assign(new Error('getaddrinfo ENOTFOUND pypi.org'),{code:'ENOTFOUND'})}),'errors.offline'],
 [Object.assign(new Error('copy failed'),{cause:{code:'ENOSPC'}}),'errors.disk_full'],
 [Object.assign(new Error('copy failed'),{cause:{code:'EACCES'}}),'errors.permission_denied'],
])('reads error.cause.code when error.code is absent %#',(error,code) => {
 expect(importError(error)).toEqual({code,params:{}});
});
const sqliteFull = () => Object.assign(new Error('database or disk is full'),{code:'ERR_SQLITE_ERROR',errcode:13});
it.each([
 ['SQLite errcode 13',sqliteFull(),'errors.disk_full'],
 ['SQLITE_FULL code',Object.assign(new Error('write failed'),{code:'SQLITE_FULL'}),'errors.disk_full'],
 ['EDQUOT',Object.assign(new Error('quota exceeded'),{code:'EDQUOT'}),'errors.disk_full'],
 ['message-only getaddrinfo ENOTFOUND',new Error('getaddrinfo ENOTFOUND pypi.org'),'errors.offline'],
 ['message-only ECONNRESET',new Error('read ECONNRESET'),'errors.offline'],
 ['EMFILE stays generic',Object.assign(new Error('too many open files'),{code:'EMFILE'}),'errors.generic'],
 ['ENFILE stays generic',Object.assign(new Error('file table overflow'),{code:'ENFILE'}),'errors.generic'],
 ['ENOSPC two causes deep',Object.assign(new Error('a'),{cause:Object.assign(new Error('b'),{cause:{code:'ENOSPC'}})}),'errors.disk_full'],
 ['ENOSPC five causes deep',[1,2,3,4,5].reduce<unknown>(inner => ({message:'wrap',cause:inner}),{code:'ENOSPC'}),'errors.disk_full'],
 ['ENOSPC six causes deep',[1,2,3,4,5,6].reduce<unknown>(inner => ({message:'wrap',cause:inner}),{code:'ENOSPC'}),'errors.generic'],
 ['AggregateError member',new AggregateError([new Error('first'),Object.assign(new Error('x'),{code:'ENOSPC'})],'multi'),'errors.disk_full'],
 ['AggregateError first classifiable wins',new AggregateError([Object.assign(new Error('x'),{code:'EACCES'}),Object.assign(new Error('y'),{code:'ENOSPC'})],'multi'),'errors.permission_denied'],
])('classifies %s',(_name,error,code) => {
 expect(importError(error)).toEqual({code,params:{}});
});
it('survives a circular cause chain',() => {
 const error = new Error('loop') as Error & {cause?: unknown};error.cause = error;
 expect(importError(error)).toEqual({code:'errors.generic',params:{}});
});
