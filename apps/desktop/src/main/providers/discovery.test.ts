import { expect, it } from 'vitest';
import { capture } from './models';
it('awaits killing TERM-resistant discovery process groups before rejecting', async () => {
  const source = `process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});setInterval(()=>{},1000);`;
  await expect(capture(process.execPath,['-e',source],'',false,100)).rejects.toThrow('timed out');
});
