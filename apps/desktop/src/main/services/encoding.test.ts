/**
 * Regression coverage for services encoding.
 * Owned by main/services.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import {expect,it} from 'vitest';
import {sniffTextEncoding} from './import-security';
it('bounds encoding detection and identifies common export encodings', () => {
 expect(sniffTextEncoding(Buffer.from([0x93,0xfa,0x96,0x7b,0x8c,0xea]))).toBe('Shift_JIS');
 expect(sniffTextEncoding(Buffer.from([0xff,0xfe,0x41,0]))).toBe('UTF-16LE');
 expect(sniffTextEncoding(Buffer.from('日本語'))).toBe('UTF-8');
 expect(sniffTextEncoding(Buffer.concat([Buffer.alloc(65536,65),Buffer.from([255])]))).toBe('UTF-8');
});
