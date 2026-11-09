export interface SiteRelease {
  version: string;
  publishedAt: string;
  assets: Record<string, { bytes: number }>;
}

export function parseRelease(source: string | undefined): SiteRelease | undefined {
  try {
    const data = JSON.parse(source ?? '') as SiteRelease;
    if (!/^\d+\.\d+\.\d+$/.test(data.version) || new Date(data.publishedAt).toISOString() !== data.publishedAt) return undefined;
    for (const key of ['mac-arm64', 'win-x64']) {
      if (!Number.isSafeInteger(data.assets?.[key]?.bytes) || data.assets[key].bytes <= 0) return undefined;
    }
    return data;
  } catch {
    return undefined;
  }
}
