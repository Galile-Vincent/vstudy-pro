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
