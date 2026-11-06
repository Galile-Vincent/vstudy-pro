/**
 * Serve library assets through the application protocol without exposing arbitrary filesystem paths.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
import { containedPath } from "./services/file-paths";
import { productionCsp } from "./security";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { isPathWithin, isPortableRelativePath } from './platform/paths';
import { documentIdSchema } from "../shared/domain";
import type { Store } from "./db";

/** Resolve only assets contained by a known library document; reject linked or escaping paths. */
export async function resolveAssetPath(root: string, encodedPath: string): Promise<string> {
  const path = decodeURIComponent(encodedPath);
  if (!isPortableRelativePath(path)) {
    throw new Error("Invalid asset path");
  }
  const candidate = resolve(root, path);
  if (!isPathWithin(root, candidate)) throw new Error("Asset outside document");
  return containedPath(root, candidate);
}

const imageTypes: Readonly<Record<string, string>> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp",
};

/** Serve validated assets with the application protocol security headers. */
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
      if ((await stat(path)).size > 12 * 1024 * 1024) return new Response(null, { status: 413 });
      const data = await readFile(path);
      if (data.length > 12 * 1024 * 1024) return new Response(null, { status: 413 });
      return new Response(new Uint8Array(data), {
        headers: { "Content-Type": type, "Content-Security-Policy": productionCsp, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
      });
    } catch { return new Response(null, { status: 404 }); }
  };
}
