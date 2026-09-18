import React, { useEffect, useState } from "react";
import { Bot, MessageCircle, MessageSquare, MessagesSquare, MountainSnow, Sparkles, type LucideIcon } from "lucide-react";

/*
 * Header icon by name, loaded from the PUNKU CDN.
 *
 * The platform lets customers pick any Lucide icon for `header_icon_name`.
 * Bundling the full icon set costs several hundred KB on every customer page,
 * and the bundled set goes stale when the platform updates Lucide. So the
 * widget loads the one SVG it needs. scripts/build-lucide-icons.js builds the
 * files and publish-icons.yml uploads them. See SELF_HOSTING.md.
 */
export const LUCIDE_ICON_BASE_URL = "https://cdn.punku.ai/chat/icons/lucide";

// Same rule as scripts/build-lucide-icons.js and the platform icon picker:
// "MessageSquare", "message-square" and "messageSquare" are one icon.
export const normalizeIconName = (name?: string): string =>
  (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// The most common header icons render with no request. The platform default
// is "MessageSquare", so most embeds never touch the network for their icon.
// Every other Lucide name loads from the CDN.
const BUILT_IN_ICONS: Partial<Record<string, LucideIcon>> = {
  bot: Bot,
  messagecircle: MessageCircle,
  messagesquare: MessageSquare,
  messagessquare: MessagesSquare,
  mountainsnow: MountainSnow,
  sparkles: Sparkles,
};

// The full Lucide set uses only these elements and attributes.
const ALLOWED_ELEMENTS = new Set(["path", "circle", "rect", "line", "ellipse", "polyline", "polygon"]);
const ALLOWED_ATTRIBUTES = new Set([
  "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "fill",
]);
// No parentheses, quotes, or colons: blocks url(...) and script values.
const SAFE_ATTRIBUTE_VALUE = /^[\w\s.,#%+-]*$/;

export type IconNode = { tag: string; attributes: Record<string, string> };

// The markup comes from our own CDN. It is still parsed and filtered, because
// the widget runs inside customer pages and must never inject active content.
export const parseIconSvg = (svgText: string): IconNode[] | null => {
  const svgDocument = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = svgDocument.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || svgDocument.getElementsByTagName("parsererror").length > 0) {
    return null;
  }

  const nodes: IconNode[] = [];
  for (const child of Array.from(root.children)) {
    const tag = child.nodeName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(tag) || child.children.length > 0) {
      return null;
    }

    const attributes: Record<string, string> = {};
    for (const attribute of Array.from(child.attributes)) {
      if (!ALLOWED_ATTRIBUTES.has(attribute.name) || !SAFE_ATTRIBUTE_VALUE.test(attribute.value)) {
        return null;
      }
      attributes[attribute.name] = attribute.value;
    }
    nodes.push({ tag, attributes });
  }

  return nodes.length > 0 ? nodes : null;
};

// One request per icon name for the lifetime of the page.
const iconCache = new Map<string, Promise<IconNode[] | null>>();

export const clearLucideIconCache = () => iconCache.clear();

export const loadLucideIcon = (iconName: string): Promise<IconNode[] | null> => {
  const cached = iconCache.get(iconName);
  if (cached) {
    return cached;
  }

  const request = fetch(`${LUCIDE_ICON_BASE_URL}/${iconName}.svg`, { credentials: "omit" })
    .then((response) => (response.ok ? response.text() : null))
    .then((svgText) => (svgText ? parseIconSvg(svgText) : null))
    .catch(() => null);

  iconCache.set(iconName, request);
  return request;
};

type IconState = { iconName: string; nodes: IconNode[] | null; loaded: boolean };

export default function LucideCdnIcon({
  name,
  className,
  color = "currentColor",
  size = 24,
}: {
  name?: string;
  className?: string;
  color?: string;
  size?: number;
}) {
  const iconName = normalizeIconName(name);
  const BuiltInIcon = BUILT_IN_ICONS[iconName];
  const [state, setState] = useState<IconState>({ iconName: "", nodes: null, loaded: false });

  useEffect(() => {
    if (!iconName || BuiltInIcon) {
      return;
    }

    let active = true;
    loadLucideIcon(iconName).then((nodes) => {
      if (active) {
        setState({ iconName, nodes, loaded: true });
      }
    });
    return () => {
      active = false;
    };
  }, [iconName, BuiltInIcon]);

  if (BuiltInIcon) {
    return <BuiltInIcon className={className} color={color} size={size} />;
  }

  const current = state.iconName === iconName ? state : null;

  // No name, unknown name, blocked request, or invalid file: the default icon.
  if (!iconName || (current?.loaded && !current.nodes)) {
    return <MessagesSquare className={className} color={color} size={size} />;
  }

  // Same root attributes as lucide-react, so theme CSS applies unchanged.
  // While the file loads, the empty <svg> keeps the layout stable and avoids
  // a flash of the default icon.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lucide lucide-${iconName}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      {(current?.nodes || []).map((node, index) => React.createElement(node.tag, { key: index, ...node.attributes }))}
    </svg>
  );
}
