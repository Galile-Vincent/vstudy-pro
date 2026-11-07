import { schema } from "./markdown-schema";
import { useMarkdownPlugins } from './markdown-plugins';
import { highlightCitation } from "./citation-highlight";
import { errorText } from "./status";
import { contentLanguage } from "../shared/content-language";
import { useTranslation } from "react-i18next";
import { tr } from '../shared/i18n';
import { Children, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  headingsIn,
  headingPath,
  pageAt,
  rangeSelection,
  sourceOffsets,
} from "./selection";
import { desktop } from "./bridge";
import { externalUrlSchema } from "../shared/ipc";
import { documentCitationSchema } from "../shared";
import type { Document, Selection } from "../shared";

export function safeImage(url: string): string | undefined {
  if (/^data:image\/(png|gif|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(url))
    return url;
  if (!url || /^(?:[a-z][a-z\d+.-]*:|[/\\]|#)/i.test(url)) return undefined;
  try {
    const decoded = decodeURIComponent(url);
    if (
      [...decoded].some((char) => char.charCodeAt(0) < 32) ||
      decoded.includes("\\") ||
      decoded.split(/[/?#]/).includes("..") ||
      /:/.test(decoded)
    )
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}
export function DocumentMarkdown({
  source,
  documentId,
  onSelect,
  onNotice,
  decorative = false,
  version = "original",
}: {
  source: string;
  decorative?: boolean;
  version?: "original"|"ai";
  documentId: Document["id"];
  onSelect: (selection: Selection) => void;
  onNotice: (message: string) => void;
}) {
  const { i18n } = useTranslation();
  const plugins = useMarkdownPlugins(source);
  const root = useRef<HTMLDivElement>(null);
  const selectCallback = useRef(onSelect);
  selectCallback.current = onSelect;
  const selectedSnapshot = useRef<Selection | null>(null);
  const [floating, setFloating] = useState<{
    selection: Selection;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const jump = (event: Event) => {
      const citation = documentCitationSchema.safeParse((event as CustomEvent).detail);
      if (!citation.success || citation.data.documentId !== documentId || (citation.data.version ?? "original") !== version || citation.data.offset > source.length || !root.current) return;
      cleanup?.();
      cleanup = highlightCitation(root.current,citation.data.offset,window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    };
    window.addEventListener('vstudy:document-citation',jump);
    return () => { window.removeEventListener('vstudy:document-citation',jump); cleanup?.(); };
  },[source,documentId,version]);
  const headings = useMemo(() => headingsIn(source), [source]);
  useEffect(() => {
    const update = (event: Event) => {
          if (event.target instanceof Element && event.target.closest(".floating-action,.section-action,.paragraph-action")) return;
          const selected = window.getSelection();
          if (!root.current || !selected?.rangeCount) {
            selectedSnapshot.current = null;
            setFloating(null);
            return;
          }
          const range = selected.getRangeAt(0),
            selection = rangeSelection(root.current, range, source, documentId);
          if (!selection) {
            selectedSnapshot.current = null;
            setFloating(null);
            return;
          }
          selectedSnapshot.current = selection;
          const rect = range.getBoundingClientRect();
          setFloating({
            selection,
            x: Math.max(12, Math.min(window.innerWidth - 155, rect.left)),
            y: Math.max(60, Math.min(window.innerHeight - 48, rect.bottom + 8)),
          });

    };
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
        const selected = window.getSelection();
        const selection = selectedSnapshot.current ?? (root.current && selected?.rangeCount ? rangeSelection(root.current, selected.getRangeAt(0), source, documentId) : null);
        if (selection) { event.preventDefault(); selectCallback.current(selection); setFloating(null); }
      }
    };
    document.addEventListener("mouseup", update);
    document.addEventListener("keyup", update);
    document.addEventListener("keydown", shortcut);
    return () => { document.removeEventListener("mouseup", update); document.removeEventListener("keyup", update); document.removeEventListener("keydown", shortcut); };
  }, [source, documentId, onSelect]);
  const components = useMemo<Components>(() => ({
            p: ({ children, node, ...props }) => <p {...props}>{children}{!decorative && node?.position && <button tabIndex={-1} className="paragraph-action" aria-label={tr('common:ask_about_paragraph')} onClick={() => {
              const start = node.position!.start.offset!, end = node.position!.end.offset!;
              selectCallback.current({documentId,startOffset:start,endOffset:end,text:source.slice(start,end),headingPath:headingPath(headings,start),page:pageAt(source,start)});
            }}>{tr('common:ask_about_this')}</button>}</p>,
            input: ({ checked, ...props }) => <input {...props} checked={checked} aria-label={tr(checked ? 'chat:completed_task' : 'chat:incomplete_task')} />,
            a: ({ children, href }) => (
              <a
                href={href}
                role="link"
                tabIndex={0}
                onClick={(event) => {
                  if (href && !href.startsWith("#")) {
                    event.preventDefault();
                    void desktop.invoke("shell:openExternal", { url: href }).catch((error: unknown) =>
                      onNotice(errorText(error)));
                  }
                }}
              >
                {children}
              </a>
            ),
            img: ({ src, alt }) =>
              src && safeImage(src) ? (
                <img src={/^data:/i.test(src) ? src : `vstudy-asset://${documentId}/${src}`} alt={alt ?? ""} loading="lazy" />
              ) : (
                <span className="muted">{tr('common:image_unavailable')}{alt}]</span>
              ),
            ...Object.fromEntries(
              [1, 2, 3, 4, 5, 6].map((depth) => [
                `h${depth}`,
                ({
                  children,
                  node,
                  ...props
                }: import("react-markdown").ExtraProps &
                  React.HTMLAttributes<HTMLHeadingElement>) => {
                  const start = node?.position?.start.offset;
                  const heading = headings.find((h) => h.start === start);
                  const Tag = decorative ? "div" : `h${depth}` as "h1";
                  return (
                    <Tag {...props} data-demo-depth={decorative ? depth : undefined}>
                      {children}
                      {heading && !decorative && (
                        <button
                          className="section-action"
                          aria-label={tr('chat:section_label',{title:heading.text})}
                          onClick={() => {
                            selectCallback.current({
                              documentId,
                              page: pageAt(source, heading.start),
                              startOffset: heading.start,
                              endOffset: heading.end,
                              text: source
                                .slice(heading.start, heading.end)
                                .trimEnd(),
                              headingPath: headingPath(headings, heading.start),
                            });
                            setFloating(null);
                          }}
                        >
                          {tr('common:use_this_section')}</button>
                      )}
                    </Tag>
                  );
                },
              ]),
            ),
          }), [source, documentId, headings, decorative, onNotice, i18n.language]);
  const rendered = useMemo(() => (        <Markdown
          remarkPlugins={[remarkGfm, ...plugins.remark]}
          rehypePlugins={[
            sourceOffsets,
            [rehypeSanitize, schema],
            ...plugins.rehype,
          ]}
          skipHtml
          urlTransform={(url, key) =>
            key === "src"
              ? (safeImage(url) ?? "")
              : (url.startsWith("#") || externalUrlSchema.safeParse(url).success)
                ? url
                : ""
          }
          components={components}
        >
          {source}
        </Markdown>), [source, components, documentId, onNotice, plugins]);
  return (
    <div className="reading-scroll" onScroll={() => setFloating(null)}>
      <div
        ref={root}
        tabIndex={0} role="document"
        onKeyDown={event => {
          if (event.target !== event.currentTarget || event.metaKey || event.ctrlKey || event.altKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
          const selection = window.getSelection();
          if (!selection) return;
          event.preventDefault();
          if (!selection.anchorNode || !event.currentTarget.contains(selection.anchorNode)) {
            const text = document.createTreeWalker(event.currentTarget, NodeFilter.SHOW_TEXT).nextNode();
            if (text) selection.collapse(text,0);
          }
          selection.modify(event.shiftKey ? 'extend' : 'move', ['ArrowLeft','ArrowUp','Home'].includes(event.key) ? 'backward' : 'forward', ['Home','End'].includes(event.key) ? 'lineboundary' : ['ArrowUp','ArrowDown'].includes(event.key) ? 'line' : 'character');
        }}
        className="markdown" lang={contentLanguage(source)}
        data-testid="document-markdown"

      >
        {rendered}
      </div>
      {floating && (
        <button
          className="floating-action"
          style={{ left: floating.x, top: floating.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            selectCallback.current(floating.selection);
            setFloating(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          {tr('common:ask_about_this')}</button>
      )}
    </div>
  );
}

export function ReplyMarkdown({ text, revealWords = false }: { text: string; revealWords?: boolean }) {
  useTranslation();
  const plugins = useMarkdownPlugins(text);
  return <div lang={contentLanguage(text)}><Markdown remarkPlugins={[remarkGfm, ...plugins.remark]} rehypePlugins={[[rehypeSanitize, schema], ...plugins.rehype]} skipHtml
    urlTransform={(url) => externalUrlSchema.safeParse(url).success ? url : ""}
    components={{ img: ({ alt }) => <span>{alt}</span>, ...(revealWords ? { p: ({ children }: { children?: React.ReactNode }) => <p>{Children.map(children, child => {
      if (typeof child !== 'string') return child;
      const words = Intl.Segmenter ? [...new Intl.Segmenter(contentLanguage(text), { granularity: 'word' }).segment(child)].map(part => part.segment) : [child];
      const size = Math.max(1, Math.ceil(words.length / 36));
      return Array.from({ length: Math.ceil(words.length / size) }, (_, i) => <span className="w-answer-word" key={i} style={{ '--i': i } as CSSProperties}>{words.slice(i * size, (i + 1) * size).join('')}</span>);
    })}</p> } : {}), pre: ({ children }) => <CodeBlock>{children}</CodeBlock>, a: ({ href, children }) => <a href={href} onClick={event => { event.preventDefault(); if (href) void desktop.invoke("shell:openExternal", { url: href }); }}>{children}</a> }}>{text}</Markdown></div>;
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  useTranslation();
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return <div className="code-block"><button type="button" aria-label={tr('common:copy_code')} onClick={() => { void navigator.clipboard.writeText(ref.current?.textContent ?? '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>{copied ? tr('common:copied') : tr('common:copy_code')}</button><pre ref={ref}>{children}</pre></div>;
}
