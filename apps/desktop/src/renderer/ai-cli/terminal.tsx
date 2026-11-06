/** Action-scoped xterm view. Output is inert text; every link requires main's native confirmation. */
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { CliActionSession } from '../../shared/ai-cli';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { Button } from '../components/ui/button';
import { outputLinks, terminalDelta } from './model';

export function CliTerminal({ session }: { session: CliActionSession }) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | undefined>(undefined);
  const previous = useRef('');
  const latest = useRef(session);
  latest.current = session;
  const [error, setError] = useState(false);
  const openLink = (url: string) => {
    if (!url.startsWith('https://')) return;
    void desktop.invoke('shell:openExternal', { url }).catch(() => setError(true));
  };
  useEffect(() => {
    if (!host.current) return;
    Terminal.strings = { promptLabel: tr('ai-cli:terminal_input'), tooMuchOutput: tr('ai-cli:too_much_output') };
    const term = new Terminal({
      allowProposedApi: false, convertEol: true, scrollback: 2000, fontSize: 13,
      fontFamily: 'ui-monospace, monospace', cursorBlink: false,
      screenReaderMode: true,
      disableStdin: latest.current.phase !== 'running',
      linkHandler: { activate: (_event, text) => openLink(text) },
    });
    terminal.current = term;
    const fit = new FitAddon(); term.loadAddon(fit); term.open(host.current);
    const colors = () => {
      const css = getComputedStyle(document.documentElement);
      const token = (name: string) => css.getPropertyValue(`--${name}`).trim();
      term.options.theme = {
        background: token('code-background'), foreground: token('ink'), cursor: token('ink'),
        selectionBackground: token('selection-color'), black: token('muted'), brightBlack: token('muted'),
        red: token('danger'), brightRed: token('danger'), green: token('success'), brightGreen: token('success'),
        yellow: token('warning'), brightYellow: token('warning'), blue: token('info'), brightBlue: token('info'),
        magenta: token('syntax-keyword'), brightMagenta: token('syntax-keyword'), cyan: token('accent-color'),
        brightCyan: token('accent-color'), white: token('ink'), brightWhite: token('ink'),
      };
    };
    const resize = () => {
      if (!host.current?.clientWidth || !host.current.clientHeight) return;
      fit.fit();
      if (latest.current.phase === 'running') void desktop.invoke('ai-cli:resize', {
        id: latest.current.id, columns: Math.min(300, Math.max(20, term.cols)), rows: Math.min(120, Math.max(5, term.rows)),
      }).catch(() => setError(true));
    };
    colors(); resize();
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    const theme = new MutationObserver(colors); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-scheme'] });
    const input = term.onData(data => {
      if (latest.current.phase !== 'running') return;
      for (let start = 0; start < data.length; start += 4096) void desktop.invoke('ai-cli:input', {
        id: latest.current.id, data: data.slice(start, start + 4096),
      }).catch(() => setError(true));
    });
    const links = term.registerLinkProvider({ provideLinks: (row, callback) => {
      const line = term.buffer.active.getLine(row - 1)?.translateToString() ?? '';
      callback(outputLinks(line).map(text => {
        const start = line.indexOf(text) + 1;
        return { text, range: { start: { x: start, y: row }, end: { x: start + text.length - 1, y: row } }, activate: () => openLink(text) };
      }));
    } });
    previous.current = ''; term.write(latest.current.output); previous.current = latest.current.output;
    return () => { input.dispose(); links.dispose(); observer.disconnect(); theme.disconnect(); term.dispose(); terminal.current = undefined; previous.current = ''; };
  }, [session.id]);
  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    term.options.disableStdin = session.phase !== 'running';
    const delta = terminalDelta(previous.current, session.output);
    if (delta.reset) term.reset();
    if (delta.text) term.write(delta.text);
    previous.current = session.output;
  }, [session.output, session.phase]);
  return <section className="ai-cli-terminal" aria-label={tr('ai-cli:terminal')}>
    <div className="ai-cli-terminal-heading"><strong>{tr('ai-cli:terminal')}</strong><span role="status">{tr(`ai-cli:phase_${session.phase}`)}</span></div>
    <p className="muted">{tr('ai-cli:terminal_help')}</p>
    <div ref={host} className="ai-cli-xterm" />
    {session.truncated && <p>{tr('ai-cli:truncated')}</p>}
    {outputLinks(session.output).map(url => <Button key={url} variant="link" onClick={() => openLink(url)}>{url}</Button>)}
    <details><summary>{tr('ai-cli:plain_output')}</summary><pre className="ai-cli-output">{session.output}</pre></details>
    {error && <p role="alert">{tr('ai-cli:terminal_error')}</p>}
  </section>;
}
