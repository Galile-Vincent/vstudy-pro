import { containedPath } from "./services/file-paths";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { documentIdSchema } from "../shared/domain";
import type { Store } from "./db";

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function resolveAssetPath(root: string, encodedPath: string): Promise<string> {
  const path = decodeURIComponent(encodedPath);
  if (!path || path.includes("\\") || [...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      isAbsolute(path) || path.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error("Invalid asset path");
  }
  const candidate = resolve(root, path);
  if (!isWithin(resolve(root), candidate)) throw new Error("Asset outside document");
  return containedPath(root, candidate);
}

const imageTypes: Readonly<Record<string, string>> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp",
};

export function assetHandler(store: Store, userData: string) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.protocol !== "vstudy-asset:" || url.port || url.username || url.password || url.search) {
        return new Response(null, { status: 400 });
      }
      const id = documentIdSchema.parse(url.hostname);
      const document = store.documents.get(id);
      if (!document || document.status !== "ready") return new Response(null, { status: 404 });
      const path = await resolveAssetPath(join(userData, "library", document.sourceHash), url.pathname.slice(1));
      const type = imageTypes[extname(path).toLowerCase()];
      if (!type) return new Response(null, { status: 415 });
      return new Response(new Uint8Array(await readFile(path)), {
        headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
      });
    } catch { return new Response(null, { status: 404 }); }
  };
}
