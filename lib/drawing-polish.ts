/**
 * Client-side polish for LLM canvas drawings.
 * Models often return messy coords, hachure fills, long essays in boxes,
 * and stray freedraw squiggles. We normalize to a clean visual system.
 */

import type { AiCanvasElement, MathAnalysisResult } from "./math-parser";

export type DiagramKind =
  | "architecture"
  | "schema"
  | "flowchart"
  | "math"
  | "graph"
  | "concept"
  | "generic";

const PALETTE = {
  structure: { stroke: "#4f46e5", fill: "#e0e7ff" }, // indigo
  service: { stroke: "#059669", fill: "#d1fae5" }, // emerald
  data: { stroke: "#d97706", fill: "#fef3c7" }, // amber
  cache: { stroke: "#dc2626", fill: "#fee2e2" }, // red
  decision: { stroke: "#7c3aed", fill: "#ede9fe" }, // violet
  connector: { stroke: "#64748b", fill: "transparent" }, // slate
  callout: { stroke: "#6366f1", fill: "#eef2ff" },
  math: { stroke: "#6366f1", fill: "#e0e7ff" },
  text: { stroke: "#1e1b4b", fill: "transparent" },
};

export function classifyDiagramKind(
  classification?: MathAnalysisResult["classification"] | string,
  promptText?: string
): DiagramKind {
  const c = (classification || "").toLowerCase();
  const p = (promptText || "").toLowerCase();
  if (
    c === "architecture" ||
    /microservice|architecture|system design|load balancer|kafka|k8s|kubernetes/.test(p)
  ) {
    return "architecture";
  }
  if (c === "schema" || /database|schema|er diagram|sql|table|foreign key/.test(p)) {
    return "schema";
  }
  if (c === "flowchart" || /flowchart|state machine|sequence diagram|user flow/.test(p)) {
    return "flowchart";
  }
  if (c === "graph" || c === "calculus") return "graph";
  if (["equation", "geometry", "physics"].includes(c)) return "math";
  if (c === "concept") return "concept";
  return "generic";
}

/** Clean label text for diagram nodes — title + short bullets only. */
export function polishNodeText(raw?: string, maxLines = 4): string | undefined {
  if (!raw) return undefined;
  let t = raw
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Strip markdown bold/italic noise
  t = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");

  const lines = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map((line, i) => {
      // Soft-truncate very long lines
      if (line.length > 42) return line.slice(0, 40) + "…";
      // Promote first line as title-ish (no bullet prefix needed)
      if (i > 0 && !line.startsWith("•") && !line.startsWith("-") && !line.startsWith("→")) {
        return line.length < 36 ? `• ${line}` : line;
      }
      return line.replace(/^-\s+/, "• ");
    });

  return lines.join("\n") || undefined;
}

function estimateSize(text: string | undefined, fallbackW: number, fallbackH: number) {
  if (!text) return { width: fallbackW, height: fallbackH };
  const lines = text.split("\n");
  const maxLen = Math.max(...lines.map((l) => l.length), 8);
  const width = Math.max(fallbackW, Math.min(320, maxLen * 8 + 48));
  const height = Math.max(fallbackH, lines.length * 22 + 36);
  return { width, height };
}

function isNode(d: AiCanvasElement) {
  return d.type === "rectangle" || d.type === "ellipse" || d.type === "diamond";
}

function isConnector(d: AiCanvasElement) {
  return d.type === "arrow" || d.type === "line";
}

function applyPalette(d: AiCanvasElement, kind: DiagramKind): AiCanvasElement {
  const text = (d.text || d.label || "").toLowerCase();
  let stroke = d.strokeColor;
  let fill = d.backgroundColor;
  let fillStyle: AiCanvasElement["fillStyle"] = "solid";

  if (isConnector(d)) {
    return {
      ...d,
      strokeColor: stroke || PALETTE.connector.stroke,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: d.strokeWidth || 2,
      strokeStyle: d.strokeStyle || "solid",
    };
  }

  if (d.type === "text") {
    return {
      ...d,
      strokeColor: stroke || PALETTE.text.stroke,
      backgroundColor: "transparent",
      fillStyle: "solid",
    };
  }

  if (d.type === "freedraw") {
    return {
      ...d,
      strokeColor: stroke || PALETTE.math.stroke,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: d.strokeWidth || 2.5,
    };
  }

  // Nodes
  if (kind === "architecture" || kind === "schema" || kind === "flowchart") {
    if (d.type === "diamond") {
      stroke = stroke || PALETTE.decision.stroke;
      fill = fill && fill !== "transparent" ? fill : PALETTE.decision.fill;
    } else if (
      d.type === "ellipse" ||
      /db|database|postgres|mysql|mongo|redis|cache|s3|storage|kafka|queue|broker/.test(text)
    ) {
      const isCache = /redis|cache|memcached/.test(text);
      stroke = stroke || (isCache ? PALETTE.cache.stroke : PALETTE.data.stroke);
      fill =
        fill && fill !== "transparent"
          ? fill
          : isCache
            ? PALETTE.cache.fill
            : PALETTE.data.fill;
    } else if (/auth|api|service|gateway|pod|worker|client|nginx|ingress/.test(text)) {
      stroke = stroke || PALETTE.service.stroke;
      fill = fill && fill !== "transparent" ? fill : PALETTE.service.fill;
    } else {
      stroke = stroke || PALETTE.structure.stroke;
      fill = fill && fill !== "transparent" ? fill : PALETTE.structure.fill;
    }
  } else {
    stroke = stroke || PALETTE.math.stroke;
    fill =
      fill && fill !== "transparent"
        ? fill
        : d.type === "ellipse"
          ? "#fee2e2"
          : PALETTE.math.fill;
  }

  // Prefer solid over noisy hachure for product-quality diagrams
  if (!d.fillStyle || d.fillStyle === "hachure") {
    fillStyle = "solid";
  } else {
    fillStyle = d.fillStyle;
  }

  return {
    ...d,
    strokeColor: stroke,
    backgroundColor: fill,
    fillStyle,
    strokeWidth: d.strokeWidth || 2,
  };
}

/**
 * Snap architecture/schema nodes onto a clean multi-column grid so the
 * board looks intentional even when the model drifts coordinates.
 */
function snapNodesToGrid(
  drawings: AiCanvasElement[],
  origin: { x: number; y: number }
): AiCanvasElement[] {
  const nodes = drawings.filter(isNode);
  const others = drawings.filter((d) => !isNode(d));
  if (nodes.length < 2) return drawings;

  // Sort by original y then x to preserve intended reading order
  const ordered = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);

  const cols = ordered.length <= 4 ? 2 : ordered.length <= 9 ? 3 : 4;
  const colGap = 48;
  const rowGap = 40;
  const cellW = 260;
  const cellH = 110;

  const laidOut = ordered.map((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const text = polishNodeText(node.text || node.label, 4);
    const size = estimateSize(text, node.width || cellW, node.height || cellH);
    return {
      ...node,
      text,
      x: origin.x + col * (cellW + colGap),
      y: origin.y + row * (cellH + rowGap),
      width: Math.min(300, Math.max(cellW - 20, size.width)),
      height: Math.min(160, Math.max(90, size.height)),
    };
  });

  // Rebuild simple flow arrows between consecutive nodes (row-wise)
  const autoArrows: AiCanvasElement[] = [];
  for (let i = 0; i < laidOut.length - 1; i++) {
    const a = laidOut[i];
    const b = laidOut[i + 1];
    const sameRow = Math.abs(a.y - b.y) < 20;
    if (sameRow) {
      autoArrows.push({
        type: "arrow",
        x: a.x + a.width,
        y: a.y + a.height / 2,
        width: b.x - (a.x + a.width),
        height: 0,
        strokeColor: PALETTE.connector.stroke,
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
      });
    } else if (i % cols === cols - 1 || Math.floor(i / cols) !== Math.floor((i + 1) / cols)) {
      // vertical connector to next tier first node-ish
      autoArrows.push({
        type: "arrow",
        x: a.x + a.width / 2,
        y: a.y + a.height,
        width: 0,
        height: b.y - (a.y + a.height),
        strokeColor: PALETTE.connector.stroke,
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
      });
    }
  }

  // Keep model arrows only if few nodes; else prefer auto layout arrows
  const modelConnectors = others.filter(isConnector);
  const modelText = others.filter((d) => d.type === "text");
  const modelFreedraw = others.filter((d) => d.type === "freedraw");

  const connectors =
    modelConnectors.length >= laidOut.length - 1 && laidOut.length <= 6
      ? modelConnectors.map((c) => applyPalette(c, "architecture"))
      : autoArrows;

  return [...laidOut, ...connectors, ...modelText, ...modelFreedraw];
}

export interface PolishOptions {
  classification?: MathAnalysisResult["classification"] | string;
  promptText?: string;
  /** Origin for grid layout (suggested free space). */
  origin?: { x: number; y: number };
  /** When true, force architecture grid snap. */
  forceGrid?: boolean;
}

/**
 * Main entry: polish a batch of AI drawings before they hit Excalidraw.
 */
export function polishCanvasDrawings(
  drawings: AiCanvasElement[] | undefined,
  opts: PolishOptions = {}
): AiCanvasElement[] {
  if (!drawings?.length) return [];

  const kind = classifyDiagramKind(opts.classification, opts.promptText);
  const origin = opts.origin || { x: drawings[0].x || 120, y: drawings[0].y || 120 };

  let list = drawings.map((d) => {
    const text = polishNodeText(d.text || d.label, isNode(d) ? 4 : 8);
    let next: AiCanvasElement = { ...d, text };

    // Drop freedraw for structured diagrams — looks like scribble noise
    if (
      next.type === "freedraw" &&
      (kind === "architecture" || kind === "schema" || kind === "flowchart")
    ) {
      return null;
    }

    // Normalize transparent-ish fills for nodes
    if (isNode(next) && (!next.width || next.width < 80)) next.width = 240;
    if (isNode(next) && (!next.height || next.height < 50)) next.height = 100;

    if (text && isNode(next)) {
      const size = estimateSize(text, next.width || 240, next.height || 100);
      next.width = Math.max(next.width || 0, size.width);
      next.height = Math.max(next.height || 0, size.height);
    }

    next = applyPalette(next, kind);

    // Soft-snap coords to 8px grid for cleaner alignment
    next.x = Math.round(next.x / 8) * 8;
    next.y = Math.round(next.y / 8) * 8;

    return next;
  }).filter(Boolean) as AiCanvasElement[];

  const nodeCount = list.filter(isNode).length;
  const shouldGrid =
    opts.forceGrid ||
    ((kind === "architecture" || kind === "schema" || kind === "flowchart") &&
      nodeCount >= 3);

  if (shouldGrid) {
    list = snapNodesToGrid(list, origin).map((d) => applyPalette(d, kind));
  }

  // Final text polish pass after grid
  list = list.map((d) => ({
    ...d,
    text: polishNodeText(d.text || d.label, isNode(d) ? 4 : 8),
  }));

  return list;
}
