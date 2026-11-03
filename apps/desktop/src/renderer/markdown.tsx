import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import {
  headingsIn,
  headingPath,
  rangeSelection,
  sourceOffsets,
} from "./selection";
import { desktop } from "./bridge";
import { externalUrlSchema } from "../shared/ipc";
import type { Document, Selection } from "../shared";
import "katex/dist/katex.min.css";

export const schema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, src: ["data"] },
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "data-start",
      "data-end",
      "data-source-text",
    ],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./, "math-inline", "math-display"],
    ],
  },
};
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
}: {
  source: string;
  documentId: Document["id"];
  onSelect: (selection: Selection) => void;
  onNotice: (message: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState<{
    selection: Selection;
    x: number;
    y: number;
  } | null>(null);
  const headings = useMemo(() => headingsIn(source), [source]);
  useEffect(() => {
    const update = () => {
          const selected = window.getSelection();
          if (!root.current || !selected?.rangeCount) {
            setFloating(null);
            return;
          }
          const range = selected.getRangeAt(0),
            selection = rangeSelection(root.current, range, source, documentId);
          if (!selection) {
            setFloating(null);
            return;
          }
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
        const selection = root.current && selected?.rangeCount ? rangeSelection(root.current, selected.getRangeAt(0), source, documentId) : null;
        if (selection) { event.preventDefault(); onSelect(selection); setFloating(null); }
      }
    };
    document.addEventListener("selectionchange", update);
    document.addEventListener("keydown", shortcut);
    return () => { document.removeEventListener("selectionchange", update); document.removeEventListener("keydown", shortcut); };
  }, [source, documentId, onSelect]);
  return (
    <div className="reading-scroll" onScroll={() => setFloating(null)}>
      <div
        ref={root}
        className="markdown"
        data-testid="document-markdown"

      >
        <Markdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[
            sourceOffsets,
            [rehypeSanitize, schema],
            rehypeKatex,
            rehypeHighlight,
          ]}
          skipHtml
          urlTransform={(url, key) =>
            key === "src"
              ? (safeImage(url) ?? "")
              : (url.startsWith("#") || externalUrlSchema.safeParse(url).success)
                ? url
                : ""
          }
          components={{
            a: ({ children, href }) => (
              <a
                href={href}
                role="link"
                tabIndex={0}
                onClick={(event) => {
                  if (href && !href.startsWith("#")) {
                    event.preventDefault();
                    void desktop.invoke("shell:openExternal", { url: href }).catch((error: unknown) =>
                      onNotice(error instanceof Error ? error.message : "Could not open link"));
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
                <span className="muted">[Image unavailable: {alt}]</span>
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
                  const Tag = `h${depth}` as "h1";
                  return (
                    <Tag {...props}>
                      {children}
                      {heading && (
                        <button
                          className="section-action"
                          aria-label={`Use section ${heading.text}`}
                          onClick={() => {
                            onSelect({
                              documentId,
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
                          Use this section
                        </button>
                      )}
                    </Tag>
                  );
                },
              ]),
            ),
          }}
        >
          {source}
        </Markdown>
      </div>
      {floating && (
        <button
          className="floating-action"
          style={{ left: floating.x, top: floating.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onSelect(floating.selection);
            setFloating(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          Ask about this
        </button>
      )}
    </div>
  );
}

export function ReplyMarkdown({ text }: { text: string }) {
  return <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeSanitize, schema], rehypeKatex, rehypeHighlight]} skipHtml
    urlTransform={(url) => externalUrlSchema.safeParse(url).success ? url : ""}
    components={{ a: ({ href, children }) => <a href={href} onClick={event => { event.preventDefault(); if (href) void desktop.invoke("shell:openExternal", { url: href }); }}>{children}</a> }}>{text}</Markdown>;
}
