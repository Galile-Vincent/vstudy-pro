// Kana is a stronger Japanese signal than shared Han characters; Han alone follows TC typography.
export function contentLanguage(text: string): 'ja' | 'zh-Hant' | undefined {
  if(/[\u3040-\u30ff]/u.test(text)) return 'ja';
  if(/[\u3400-\u9fff]/u.test(text)) return 'zh-Hant';
  return undefined;
}
