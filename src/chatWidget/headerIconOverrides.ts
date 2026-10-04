import { useCallback, useEffect, useState } from "react";

export const HEADER_ICON_OVERRIDES_URL =
  "https://cdn.punku.ai/chat/header-icon-overrides.json";
const TIMEOUT_MS = 1500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { hostUrl: string; flowId: string; pageOrigin: string };
type Entry = { selector: string; header_icon: string };
let manifestRequest: Promise<unknown> | undefined;

function httpsUrl(value: unknown): URL | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

function normalizedContext(context: Context): string[] | undefined {
  const backend = httpsUrl(context.hostUrl);
  const page = httpsUrl(context.pageOrigin);
  if (!backend || !page || !UUID_PATTERN.test(context.flowId)) return undefined;
  return [backend.origin, context.flowId.toLowerCase(), page.origin];
}

export async function createHeaderIconSelector(context: Context): Promise<string | undefined> {
  const values = normalizedContext(context);
  if (!values) return undefined;
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(values));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

function validEntries(value: unknown): value is Entry[] {
  if (!Array.isArray(value) || value.length > 100) return false;
  const selectors = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const keys = Object.keys(entry).sort();
    if (keys.join(",") !== "header_icon,selector") return false;
    if (typeof entry.selector !== "string" || !/^[0-9a-f]{64}$/.test(entry.selector)) return false;
    if (!httpsUrl(entry.header_icon) || selectors.has(entry.selector)) return false;
    selectors.add(entry.selector);
  }
  return true;
}

export async function selectHeaderIconOverride(
  entries: unknown,
  context: Context,
): Promise<string | undefined> {
  if (!validEntries(entries)) return undefined;
  const selector = await createHeaderIconSelector(context);
  return selector ? entries.find((entry) => entry.selector === selector)?.header_icon : undefined;
}

export function clearHeaderIconOverridesCache(): void {
  manifestRequest = undefined;
}

function loadManifest(): Promise<unknown> {
  if (manifestRequest) return manifestRequest;
  manifestRequest = new Promise((resolve) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      resolve([]);
    }, TIMEOUT_MS);
    fetch(HEADER_ICON_OVERRIDES_URL, {
      credentials: "omit",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : [])
      .then(resolve)
      .catch(() => resolve([]))
      .finally(() => clearTimeout(timeout));
  });
  return manifestRequest;
}

export function useHeaderIconOverride({
  headerIcon,
  hostUrl,
  flowId,
  pageOrigin = typeof window === "undefined" ? "" : window.location.origin,
}: {
  headerIcon?: string;
  hostUrl: string;
  flowId: string;
  pageOrigin?: string;
}): { headerIcon: string | undefined; onImageError: () => void } {
  const key = JSON.stringify([hostUrl, flowId, pageOrigin, headerIcon]);
  const [replacement, setReplacement] = useState<{ key: string; url: string }>();

  useEffect(() => {
    if (headerIcon || !normalizedContext({ hostUrl, flowId, pageOrigin })) return;
    let active = true;
    let image: HTMLImageElement | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    loadManifest()
      .then((entries) => selectHeaderIconOverride(entries, { hostUrl, flowId, pageOrigin }))
      .then((url) => {
        if (!active || !url) return;
        image = new Image();
        const stop = () => {
          clearTimeout(timeout);
          if (image) {
            image.onload = null;
            image.onerror = null;
          }
        };
        image.onload = () => {
          if (active && image && image.naturalWidth > 0) setReplacement({ key, url });
          stop();
        };
        image.onerror = stop;
        timeout = setTimeout(stop, TIMEOUT_MS);
        image.src = url;
      })
      .catch(() => undefined);

    return () => {
      active = false;
      clearTimeout(timeout);
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [headerIcon, hostUrl, flowId, pageOrigin, key]);

  const onImageError = useCallback(() => {
    if (!headerIcon) setReplacement(undefined);
  }, [headerIcon]);

  return {
    headerIcon: headerIcon || (replacement?.key === key ? replacement.url : undefined),
    onImageError,
  };
}
