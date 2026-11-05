/**
 * Decode named and numeric HTML entities without evaluating markup.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
import { decodeNamedCharacterReference } from "decode-named-character-reference";
/** Decode entities as text without evaluating or trusting surrounding HTML. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, name: string) => {
    if (name[0] !== "#") return decodeNamedCharacterReference(name) || entity;
    const point = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "�";
  });
}
