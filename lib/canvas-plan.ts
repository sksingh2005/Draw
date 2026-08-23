import type { AiCanvasElement, CanvasIconName } from "./math-parser";

export type CanvasPlanClassification =
  | "equation"
  | "calculus"
  | "geometry"
  | "physics"
  | "concept"
  | "graph"
  | "architecture"
  | "schema"
  | "flowchart";

export type CanvasPlanNodeKind =
  | "client"
  | "service"
  | "gateway"
  | "database"
  | "cache"
  | "queue"
  | "storage"
  | "decision"
  | "process"
  | "entity"
  | "start"
  | "end"
  | "result"
  | "generic";

export interface CanvasPlanNode {
  id: string;
  kind: CanvasPlanNodeKind;
  label: string;
  details: string[];
  icon?: CanvasIconName;
}

export interface CanvasPlanEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind: "flow" | "data" | "async" | "relation" | "yes" | "no";
}

export interface CanvasPlanBlock {
  id: string;
  kind: "given" | "equation" | "explanation" | "result" | "warning";
  text?: string;
  latex?: string;
}

export interface CanvasPlanAnnotation {
  id: string;
  text: string;
  targetId?: string;
  tone: "info" | "success" | "warning";
}

export interface CanvasPlanConstraint {
  type: "near" | "after" | "below" | "same-row" | "inside";
  item: string;
  anchor: string;
}

/**
 * Semantic, coordinate-free representation produced by the model.
 * Coordinates, text measurement, connector routing, and Excalidraw details are
 * deliberately compiler concerns rather than model concerns.
 */
export interface CanvasPlan {
  version: "1";
  classification: CanvasPlanClassification;
  layout: {
    type: "layered" | "lesson";
    direction: "LR" | "TB";
  };
  nodes: CanvasPlanNode[];
  edges: CanvasPlanEdge[];
  blocks: CanvasPlanBlock[];
  annotations: CanvasPlanAnnotation[];
  constraints: CanvasPlanConstraint[];
}

export type CompiledCanvasPlan =
  | { kind: "mermaid"; source: string }
  | { kind: "drawings"; drawings: AiCanvasElement[] };

const CLASSIFICATIONS = new Set<CanvasPlanClassification>([
  "equation", "calculus", "geometry", "physics", "concept", "graph",
  "architecture", "schema", "flowchart",
]);
const NODE_KINDS = new Set<CanvasPlanNodeKind>([
  "client", "service", "gateway", "database", "cache", "queue", "storage",
  "decision", "process", "entity", "start", "end", "result", "generic",
]);
const ICONS = new Set<CanvasIconName>([
  "client", "gateway", "identity", "catalog", "recommendation", "playback",
  "database", "cache", "event", "cdn", "origin", "shield", "api", "service",
  "load-balancer", "queue", "worker", "notification", "analytics", "search", "storage",
]);

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown, max = 160): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function cleanId(value: unknown, fallback: string): string {
  const id = cleanText(value, 48)
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const resolved = id || fallback;
  return /^\d/.test(resolved) ? `n_${resolved}` : resolved;
}

/** Runtime boundary for model-authored CanvasPlan data. Invalid references are dropped. */
export function parseCanvasPlan(value: unknown): CanvasPlan | undefined {
  const raw = asObject(value);
  if (!raw || raw.version !== "1") return undefined;

  const classification = typeof raw.classification === "string" &&
    CLASSIFICATIONS.has(raw.classification as CanvasPlanClassification)
    ? raw.classification as CanvasPlanClassification
    : undefined;
  if (!classification) return undefined;

  const rawLayout = asObject(raw.layout);
  const layout: CanvasPlan["layout"] = {
    type: rawLayout?.type === "lesson" ? "lesson" : "layered",
    direction: rawLayout?.direction === "TB" ? "TB" : "LR",
  };

  const seen = new Set<string>();
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).flatMap((value, index) => {
    const node = asObject(value);
    if (!node) return [];
    const id = cleanId(node.id, `node-${index + 1}`);
    if (seen.has(id)) return [];
    seen.add(id);
    const label = cleanText(node.label, 80);
    if (!label) return [];
    const kind = typeof node.kind === "string" && NODE_KINDS.has(node.kind as CanvasPlanNodeKind)
      ? node.kind as CanvasPlanNodeKind
      : "generic";
    const icon = typeof node.icon === "string" && ICONS.has(node.icon as CanvasIconName)
      ? node.icon as CanvasIconName
      : undefined;
    return [{
      id,
      kind,
      label,
      details: (Array.isArray(node.details) ? node.details : [])
        .map((item) => cleanText(item, 72))
        .filter(Boolean)
        .slice(0, 3),
      icon,
    }];
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(raw.edges) ? raw.edges : []).flatMap((value, index) => {
    const edge = asObject(value);
    if (!edge) return [];
    const from = cleanId(edge.from, "");
    const to = cleanId(edge.to, "");
    if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) return [];
    const validKinds: CanvasPlanEdge["kind"][] = ["flow", "data", "async", "relation", "yes", "no"];
    const kind = validKinds.includes(edge.kind as CanvasPlanEdge["kind"])
      ? edge.kind as CanvasPlanEdge["kind"]
      : "flow";
    return [{
      id: cleanId(edge.id, `edge-${index + 1}`),
      from,
      to,
      label: cleanText(edge.label, 48) || undefined,
      kind,
    }];
  });

  const blockKinds: CanvasPlanBlock["kind"][] = ["given", "equation", "explanation", "result", "warning"];
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : []).flatMap((value, index) => {
    const block = asObject(value);
    if (!block) return [];
    const text = cleanText(block.text, 240) || undefined;
    const latex = cleanText(block.latex, 240) || undefined;
    if (!text && !latex) return [];
    return [{
      id: cleanId(block.id, `block-${index + 1}`),
      kind: blockKinds.includes(block.kind as CanvasPlanBlock["kind"])
        ? block.kind as CanvasPlanBlock["kind"]
        : "explanation",
      text,
      latex,
    }];
  });

  const tones: CanvasPlanAnnotation["tone"][] = ["info", "success", "warning"];
  const annotations = (Array.isArray(raw.annotations) ? raw.annotations : []).flatMap((value, index) => {
    const annotation = asObject(value);
    if (!annotation) return [];
    const text = cleanText(annotation.text, 180);
    if (!text) return [];
    const targetId = cleanId(annotation.targetId, "") || undefined;
    return [{
      id: cleanId(annotation.id, `annotation-${index + 1}`),
      text,
      targetId,
      tone: tones.includes(annotation.tone as CanvasPlanAnnotation["tone"])
        ? annotation.tone as CanvasPlanAnnotation["tone"]
        : "info",
    }];
  });

  const constraintTypes: CanvasPlanConstraint["type"][] = ["near", "after", "below", "same-row", "inside"];
  const constraints = (Array.isArray(raw.constraints) ? raw.constraints : []).flatMap((value) => {
    const constraint = asObject(value);
    if (!constraint || !constraintTypes.includes(constraint.type as CanvasPlanConstraint["type"])) return [];
    const item = cleanId(constraint.item, "");
    const anchor = cleanId(constraint.anchor, "");
    if (!item || !anchor) return [];
    return [{ type: constraint.type as CanvasPlanConstraint["type"], item, anchor }];
  });

  if (!nodes.length && !blocks.length) return undefined;
  return { version: "1", classification, layout, nodes, edges, blocks, annotations, constraints };
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "'").replace(/[<>]/g, "");
}

function mermaidNode(node: CanvasPlanNode): string {
  const label = escapeMermaidLabel([node.label, ...node.details].join("\\n"));
  if (node.kind === "decision") return `${node.id}{"${label}"}`;
  if (["database", "cache", "storage"].includes(node.kind)) return `${node.id}[("${label}")]`;
  if (["start", "end"].includes(node.kind)) return `${node.id}(["${label}"])`;
  return `${node.id}["${label}"]`;
}

/** Compile graph semantics to safe Mermaid; the existing converter owns layout and bindings. */
export function canvasPlanToMermaid(plan: CanvasPlan): string {
  const lines = [`flowchart ${plan.layout.direction}`];
  for (const node of plan.nodes) lines.push(`  ${mermaidNode(node)}`);
  for (const edge of plan.edges) {
    const label = escapeMermaidLabel(edge.label || (edge.kind === "yes" ? "Yes" : edge.kind === "no" ? "No" : ""));
    const connector = edge.kind === "async" ? "-.->" : "-->";
    lines.push(label
      ? `  ${edge.from} ${connector}|"${label}"| ${edge.to}`
      : `  ${edge.from} ${connector} ${edge.to}`);
  }
  const nodeIds = new Set(plan.nodes.map((node) => node.id));
  for (const annotation of plan.annotations) {
    if (!annotation.targetId || !nodeIds.has(annotation.targetId)) continue;
    const noteId = `note_${annotation.id}`;
    lines.push(`  ${noteId}["${escapeMermaidLabel(annotation.text)}"]`);
    lines.push(`  ${annotation.targetId} -.-> ${noteId}`);
  }
  return lines.join("\n");
}

function blockColors(kind: CanvasPlanBlock["kind"]): Pick<AiCanvasElement, "strokeColor" | "backgroundColor"> {
  if (kind === "result") return { strokeColor: "#059669", backgroundColor: "#d1fae5" };
  if (kind === "warning") return { strokeColor: "#d97706", backgroundColor: "#fef3c7" };
  if (kind === "given") return { strokeColor: "#4f46e5", backgroundColor: "#e0e7ff" };
  return { strokeColor: "#6366f1", backgroundColor: "#eef2ff" };
}

function compileLesson(plan: CanvasPlan, origin: { x: number; y: number }): AiCanvasElement[] {
  const blocks: CanvasPlanBlock[] = plan.blocks.length > 0
    ? plan.blocks
    : plan.nodes.map((node) => ({
        id: node.id,
        kind: node.kind === "result" ? "result" as const : "explanation" as const,
        text: [node.label, ...node.details].join("\n"),
        latex: undefined,
      }));
  const drawings: AiCanvasElement[] = [];
  const horizontal = plan.layout.direction === "LR";
  const width = horizontal ? 250 : 360;
  const height = 96;

  blocks.forEach((block, index) => {
    const x = origin.x + (horizontal ? index * (width + 72) : 0);
    const y = origin.y + (horizontal ? 0 : index * (height + 64));
    const body = block.latex || block.text || "";
    drawings.push({
      type: "rectangle",
      x,
      y,
      width,
      height,
      fillStyle: "solid",
      text: body,
      fontSize: block.latex ? 20 : 16,
      ...blockColors(block.kind),
    });
    if (index > 0) {
      drawings.push(horizontal
        ? {
            type: "arrow", x: x - 72, y: y + height / 2, width: 72, height: 0,
            strokeColor: "#64748b", backgroundColor: "transparent", fillStyle: "solid",
          }
        : {
            type: "arrow", x: x + width / 2, y: y - 64, width: 0, height: 64,
            strokeColor: "#64748b", backgroundColor: "transparent", fillStyle: "solid",
          });
    }
  });

  plan.annotations.forEach((annotation, index) => {
    drawings.push({
      type: "text",
      x: origin.x + width + 56,
      y: origin.y + index * 88,
      width: 240,
      height: 64,
      text: annotation.text,
      fontSize: 15,
      strokeColor: annotation.tone === "warning" ? "#92400e" : annotation.tone === "success" ? "#065f46" : "#334155",
      backgroundColor: "transparent",
      fillStyle: "solid",
    });
  });
  return drawings;
}

export function compileCanvasPlan(
  plan: CanvasPlan,
  origin: { x: number; y: number } = { x: 120, y: 120 }
): CompiledCanvasPlan {
  if (plan.layout.type === "layered" && plan.nodes.length > 0) {
    return { kind: "mermaid", source: canvasPlanToMermaid(plan) };
  }
  return { kind: "drawings", drawings: compileLesson(plan, origin) };
}

export function resultUsesCanvasPlan(result: { canvasPlan?: CanvasPlan }): boolean {
  return Boolean(result.canvasPlan && (result.canvasPlan.nodes.length || result.canvasPlan.blocks.length));
}
