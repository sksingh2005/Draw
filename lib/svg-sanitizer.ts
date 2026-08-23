const MAX_SVG_LENGTH = 12_000;
const MAX_SVG_NODES = 240;

const ALLOWED_TAGS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline",
  "polygon", "text", "tspan", "defs", "marker", "lineargradient",
  "radialgradient", "stop", "clippath", "mask", "title", "desc",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "xmlns", "viewbox", "preserveaspectratio", "id", "d", "points",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "fill", "fill-opacity", "fill-rule", "stroke",
  "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "clip-rule", "clip-path", "mask",
  "opacity", "transform", "offset", "stop-color", "stop-opacity",
  "gradientunits", "gradienttransform", "fx", "fy", "refx", "refy",
  "markerwidth", "markerheight", "markerunits", "orient", "marker-start",
  "marker-mid", "marker-end", "font-size", "font-weight", "font-family", "text-anchor",
  "dominant-baseline", "dx", "dy",
]);

const SAFE_COLOR = /^(?:none|currentColor|transparent|#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|[a-z]{3,20})$/i;
const SAFE_LOCAL_REF = /^url\(#[a-zA-Z][\w:.-]{0,80}\)$/;
const SAFE_TRANSFORM = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([\d\s.,+\-eE]+\)\s*)+$/;

export interface SanitizedSvg {
  markup: string;
  viewBox: [number, number, number, number];
}

function finiteDimension(value: string | null, fallback: number): number {
  const parsed = Number.parseFloat(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 4096) : fallback;
}

function isSafeAttribute(name: string, value: string): boolean {
  const lowerName = name.toLowerCase();
  const trimmed = value.trim();
  if (!ALLOWED_ATTRIBUTES.has(lowerName) || lowerName.startsWith("on")) return false;
  if (/^(?:href|xlink:href|src)$/i.test(lowerName)) return false;
  if (/javascript:|data:|https?:|\/\//i.test(trimmed)) return false;
  if (["fill", "stroke", "stop-color"].includes(lowerName)) {
    return SAFE_COLOR.test(trimmed) || SAFE_LOCAL_REF.test(trimmed);
  }
  if (["clip-path", "mask", "marker-start", "marker-mid", "marker-end"].includes(lowerName)) {
    return trimmed === "none" || SAFE_LOCAL_REF.test(trimmed);
  }
  if (lowerName === "transform" || lowerName === "gradienttransform") {
    return SAFE_TRANSFORM.test(trimmed);
  }
  if (lowerName === "font-family") {
    return /^(?:sans-serif|serif|monospace|system-ui|Arial|Inter)(?:\s*,\s*(?:sans-serif|serif|monospace|system-ui|Arial|Inter))*$/i.test(trimmed);
  }
  if (lowerName === "id") return /^[a-zA-Z][\w:.-]{0,80}$/.test(trimmed);
  if (lowerName === "d") return trimmed.length <= 4_000 && /^[MmZzLlHhVvCcSsQqTtAaEe\d\s.,+\-]+$/.test(trimmed);
  return trimmed.length <= 500;
}

/**
 * Strictly sanitize an LLM-authored SVG before it becomes an Excalidraw file.
 * This deliberately supports static vector primitives only: no CSS, scripts,
 * foreignObject, external images, links, animation, or event attributes.
 */
export function sanitizeGeneratedSvg(input: string): SanitizedSvg {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    throw new Error("SVG rendering is only available in the browser.");
  }
  const source = input.trim().replace(/^```svg\s*/i, "").replace(/\s*```$/, "");
  if (!source || source.length > MAX_SVG_LENGTH) throw new Error("SVG source is empty or too large.");
  if (/<!doctype|<!entity/i.test(source)) throw new Error("SVG document declarations are not supported.");

  const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) throw new Error("SVG source is not valid XML.");
  const root = documentNode.documentElement;
  if (root.localName.toLowerCase() !== "svg") throw new Error("SVG source must have an <svg> root.");

  const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
  if (nodes.length > MAX_SVG_NODES) throw new Error("SVG contains too many elements.");

  for (const node of nodes) {
    if (!ALLOWED_TAGS.has(node.localName.toLowerCase())) {
      throw new Error(`SVG element <${node.localName}> is not supported.`);
    }
    for (const attribute of Array.from(node.attributes)) {
      if (!isSafeAttribute(attribute.name, attribute.value)) node.removeAttribute(attribute.name);
    }
  }

  const rawViewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const hasViewBox = rawViewBox?.length === 4 && rawViewBox.every(Number.isFinite) && rawViewBox[2] > 0 && rawViewBox[3] > 0;
  const viewBox: [number, number, number, number] = hasViewBox
    ? [rawViewBox[0], rawViewBox[1], Math.min(rawViewBox[2], 4096), Math.min(rawViewBox[3], 4096)]
    : [0, 0, finiteDimension(root.getAttribute("width"), 320), finiteDimension(root.getAttribute("height"), 220)];

  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.setAttribute("viewBox", viewBox.join(" "));
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");

  return { markup: new XMLSerializer().serializeToString(root), viewBox };
}

export function svgMarkupToDataUrl(markup: string): string {
  const bytes = new TextEncoder().encode(markup);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
