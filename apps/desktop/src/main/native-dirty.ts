import type { Input } from 'electron';
export const NATIVE_DRAFT_PROTECTION_MS = 10 * 60_000;
export function draftInput(input:Input):boolean {
  if(input.type!=='keyDown') return false;
  return ['Backspace','Delete'].includes(input.key) || ((input.meta || input.control) ? ['v','x'].includes(input.key.toLowerCase()) : input.key.length===1);
}
export function draftProtected(lastInputAt:number):boolean {
  return lastInputAt>0 && Date.now()-lastInputAt<NATIVE_DRAFT_PROTECTION_MS;
}
