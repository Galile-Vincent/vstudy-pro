/** Remove credential-shaped values before diagnostics reach logs. */
export function redact(value: unknown): string {
  let text: string;
  try {
    text = value instanceof Error ? value.stack ?? value.message : typeof value === 'string' ? value : JSON.stringify(value, (_key, item: unknown) => item instanceof Error ? item.stack ?? item.message : item) ?? '';
  } catch { return '[unserializable diagnostic]'; }
  return redactNamedSecrets(text.slice(0, 20_000))
    .replace(/\bsk-[a-z0-9_-]+/gi, '[redacted]')
    .replace(/\b(?:AIza[\w-]{20,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{12,}|xox[abprs]-[\w-]{10,})/g, '[redacted]')
    .replace(/((?:cookie|set-cookie)["'\s]*:\s*["']?)[^"'\r\n}]+/gi, '$1[redacted]')
    .replace(/((?:proxy-)?authorization["'\s]*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"?|'(?:\\.|[^'\\\r\n])*'?|[^&\r\n}]+)/gi, '$1[redacted]')
    .replace(/((?:Basic|Bearer|Digest|Negotiate)(?:\s+|%20|\+))[^\s"'&,}]+/gi, '$1[redacted]')
    .replace(/((?:x-api-key|api[_-]?key|token|sesskey|private[_-]?key|passw(?:or)?d|(?:client[_-])?secret)["'\s]*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"?|'(?:\\.|[^'\\\r\n])*'?|[^&"'\r\n,}]+)/gi, '$1[redacted]')
    .replace(/(["'])(?:[a-z]:[\\/]+|\\\\|~?\/)[^"'\r\n]*\1/gi, '$1[path]$1')
    .replace(/(?:[a-z]:[\\/]+Users[\\/]+|\/(?:Users|home)\/|~\/)[^"'\r\n<>|)]+/gi, '[path]')
    .replace(/[a-z]:[\\/]+[^\s"'<>|)]+|(?:~|file:\/\/)?\/[^\s"'<>|)]+/gi, path => /^\/v\d+(?:\/[a-z0-9_-]+)+$/i.test(path) ? path : '[path]')
    .replace(/[\p{L}\p{N}_.-]+/gu, token => /\.(?:pdf|docx?|xlsx?|pptx?|txt|md|csv|json|db|sqlite|log|[cm]?js|tsx?|png|jpe?g|zip)\b/i.test(token) ? '[file]' : token);
}
function redactNamedSecrets(text:string):string {
  const identifiers = /[a-z0-9_][a-z0-9_.-]*/gi;
  const parts:string[] = [];
  let copied = 0;
  for (let match = identifiers.exec(text); match; match = identifiers.exec(text)) {
    const name = match[0];
    if (!/(?:key|secret|token|password|passwd|credential)$/i.test(name) || /^monkey$/i.test(name)) continue;
    const end = identifiers.lastIndex;
    const assignment = /^["']?\s*([:=])\s*["']?([^\s"',&\]})]{6,})/.exec(text.slice(end));
    if (!assignment) continue;
    const value = assignment[2]!;
    identifiers.lastIndex = end + assignment[0].length;
    if (/^key$/i.test(name)) {
      const token = /^[a-z0-9_+/=.@~:-]{16,}$/i.test(value) && /[0-9]/.test(value);
      const shortAssignment = assignment[1] === '=' && /^[a-z0-9_+/=.@~:-]{11,}$/i.test(value) && /[0-9]/.test(value);
      const legacyToken = /^[A-Z]+_[A-Z_]+$/.test(value);
      const context = /[?&;]\s*$/.test(text.slice(Math.max(0,match.index - 3),match.index)) ||
        /\b(?:headers?|cookies?)[:=\s{["']*$/i.test(text.slice(Math.max(0,match.index - 100),match.index));
      if (!token && !shortAssignment && !legacyToken && !context) continue;
    }
    const valueStart = end + assignment[0].length - value.length;
    parts.push(text.slice(copied,valueStart),'[redacted]');
    copied = identifiers.lastIndex;
  }
  return parts.length ? parts.join('') + text.slice(copied) : text;
}
