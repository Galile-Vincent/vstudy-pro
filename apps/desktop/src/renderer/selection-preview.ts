import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { RootContent } from "mdast";
export function plainSelection(source: string): string {
  const text = (node: RootContent): string => {
    if (node.type === "image" || node.type === "imageReference" || node.type === "html") return "";
    if ("value" in node) return node.value;
    if ("children" in node) return node.children.map(text).join(node.type === "paragraph" || node.type === "heading" || node.type === "link" || node.type === "strong" || node.type === "emphasis" ? "" : " ");
    return "";
  };
  return unified().use(remarkParse).use(remarkGfm).parse(source).children.map(text).join(" ").replace(/\s+/g, " ").trim();
}
