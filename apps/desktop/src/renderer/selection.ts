import { unified } from "unified";
import { decodeNamedCharacterReference } from "decode-named-character-reference";
import remarkParse from "remark-parse";
import type { Root as MdRoot, Nodes as MdNode } from "mdast";
import type { Root, Element, RootContent } from "hast";
import type { Selection, Document } from "../shared";

export interface Heading {
  depth: number;
  text: string;
  start: number;
  end: number;
}
export function headingsIn(source: string): Heading[] {
  const tree = unified().use(remarkParse).parse(source) as MdRoot;
  const text = (node: MdNode): string =>
    "value" in node
      ? node.value
      : "children" in node
        ? node.children.map(text).join("")
        : "";
  const headings: Heading[] = [];
  const visit = (node: MdNode) => {
    if (node.type === "heading")
      headings.push({
        depth: node.depth,
        text: text(node),
        start: node.position!.start.offset!,
        end: source.length,
      });
    if ("children" in node) node.children.forEach(visit);
  };
  visit(tree);
  return headings.map((heading, index) => ({
    ...heading,
    end:
      headings.slice(index + 1).find((next) => next.depth <= heading.depth)
        ?.start ?? source.length,
  }));
}
export function pageAt(source: string, offset: number): number | undefined {
  const markers = [...source.slice(0, offset).matchAll(/<!-- page (\d+) -->/g)];
  return markers.length ? Number(markers.at(-1)![1]) : undefined;
}

export function headingPath(headings: Heading[], offset: number): string[] {
  const path: Heading[] = [];
  for (const heading of headings) {
    if (heading.start > offset) break;
    while (path.length && path[path.length - 1]!.depth >= heading.depth)
      path.pop();
    path.push(heading);
  }
  return path.map((h) => h.text);
}

// Offsets count UTF-16 code units, matching both DOM Range and the stored JS string.
export function resolveTextOffset(
  raw: string,
  rendered: string,
  offset: number,
  end = false,
  code = false,
): number {
  const codeRanges: [number, number][] = [];
  const visit = (node: MdNode) => {
    if (node.type === "code" || node.type === "inlineCode") codeRanges.push([node.position!.start.offset!, node.position!.end.offset!]);
    if ("children" in node) node.children.forEach(visit);
  };
  visit(unified().use(remarkParse).parse(raw) as MdRoot);
  const tokens: { value: string; start: number; end: number }[] = [];
  for (let i = 0; i < raw.length;) {
    const start = i;
    const literal = code || codeRanges.some(([start, end]) => i >= start && i < end);
    const entity = !literal && /^&(#x[\da-f]+|#\d+|[a-z][a-z\d]*);/i.exec(raw.slice(i));
    if (entity) {
      const key = entity[1]!;
      const numeric = key.startsWith("#")
        ? Number.parseInt(
            key.slice(/^#x/i.test(key) ? 2 : 1),
            /^#x/i.test(key) ? 16 : 10,
          )
        : null;
      const value =
        numeric !== null && numeric > 0 && numeric <= 0x10ffff
          ? String.fromCodePoint(numeric)
          : decodeNamedCharacterReference(key);
      if (value) {
        i += entity[0].length;
        tokens.push({ value, start, end: i });
        continue;
      }
    }
    if (
      !literal && raw[i] === "\\" &&
      /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(raw[i + 1] ?? "")
    )
      i++;
    const value = raw[i] === "\r" ? "\n" : raw[i]!;
    i += raw[i] === "\r" && raw[i + 1] === "\n" ? 2 : 1;
    tokens.push({ value, start, end: i });
  }
  const starts: number[] = [],
    ends: number[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (rendered.slice(cursor, cursor + token.value.length) !== token.value)
      continue;
    for (let j = 0; j < token.value.length; j++) {
      starts.push(
        token.start + (token.end - token.start === token.value.length ? j : 0),
      );
      ends.push(
        token.end -
          (token.end - token.start === token.value.length
            ? token.value.length - j - 1
            : 0),
      );
    }
    cursor += token.value.length;
  }
  if (offset <= 0) return starts[0] ?? 0;
  if (end) return ends[Math.min(offset, ends.length) - 1] ?? raw.length;
  return starts[offset] ?? ends.at(-1) ?? raw.length;
}

export function sourceOffsets() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    const walk = (node: Root | Element) => {
      node.children = node.children.map((child): RootContent => {
        const start = child.position?.start.offset,
          end = child.position?.end.offset;
        if (child.type === "element") {
          if (start !== undefined && end !== undefined)
            Object.assign(child.properties, {
              "data-start": start,
              "data-end": end,
            });
          if (
            child.tagName === "code" &&
            start !== undefined &&
            end !== undefined
          ) {
            const raw = source.slice(start, end);
            const fence = /^ {0,3}(?:`{3,}|~{3,})[^\r\n]*\r?\n/.exec(raw);
            const ticks = /^`+/.exec(raw);
            if (fence) {
              const contentStart = start + fence[0].length;
              child.properties["data-start"] = contentStart;
              const body = raw.slice(fence[0].length);
              const closing = /^ {0,3}(?:`{3,}|~{3,})[ \t]*(?:\r?\n|$)/m.exec(
                body,
              );
              child.properties["data-end"] = closing
                ? contentStart + closing.index
                : end;
            } else if (ticks) {
              child.properties["data-start"] = start + ticks[0].length;
              child.properties["data-end"] = end - ticks[0].length;
            }
          }
          walk(child);
        } else if (
          child.type === "text" &&
          start !== undefined &&
          end !== undefined &&
          node.type === "element" &&
          !["code", "pre"].includes(node.tagName)
        ) {
          return {
            type: "element",
            tagName: "span",
            properties: {
              "data-start": start,
              "data-end": end,
              "data-source-text": true,
            },
            children: [child],
          };
        }
        return child;
      });
    };
    walk(tree);
  };
}
export function rangeSelection(
  root: HTMLElement,
  range: Range,
  source: string,
  documentId: Document["id"],
): Selection | null {
  if (
    range.collapsed ||
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null;
  const boundary = (node: Node, offset: number, end: boolean) => {
    const element = (
      node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
    )?.closest<HTMLElement>("[data-start][data-end]");
    if (!element || !root.contains(element)) return null;
    const prefix = root.ownerDocument.createRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(node, offset);
    const start = Number(element.dataset.start),
      stop = Number(element.dataset.end);
    return (
      start +
      resolveTextOffset(
        source.slice(start, stop),
        element.textContent ?? "",
        prefix.toString().length,
        end,
        !!element.closest("code, pre"),
      )
    );
  };
  const startOffset = boundary(range.startContainer, range.startOffset, false),
    endOffset = boundary(range.endContainer, range.endOffset, true);
  if (startOffset === null || endOffset === null || endOffset <= startOffset)
    return null;
  return {
    documentId,
    startOffset,
    endOffset,
    text: range.toString(),
    ...(pageAt(source, startOffset) ? { page: pageAt(source, startOffset) } : {}),
    headingPath: headingPath(headingsIn(source), startOffset),
  };
}
