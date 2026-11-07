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
