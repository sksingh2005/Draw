import type { Bounds, SceneElementLike } from "./canvas-provenance";
import { findOpenBounds, stampAiProvenance, unionBounds } from "./canvas-provenance";
import {
  canvasIconDataUrl,
  inferCanvasIcon,
  type AiCanvasImageAsset,
} from "./excalidraw-elements";

export interface MermaidCanvasResult {
  elements: Record<string, unknown>[];
  files: Record<string, Record<string, unknown>>;
  bounds: Bounds;
}

const SUPPORTED_DIAGRAM = /^(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b|^(?:sequenceDiagram|erDiagram|stateDiagram(?:-v2)?|classDiagram)\b/i;
const UNSAFE_DIRECTIVE = /^\s*(?:click\s+|%%\{)|<(?:script|iframe|object|embed|style)\b/im;

/**
 * Keep the AI-authored source portable and safe before handing it to Mermaid.
 * The converter is security patched, but rejecting interactive directives here
 * also makes the saved text suitable for docs and source control.
 */
export function normalizeMermaidSource(source: string): string {
  const normalized = source
    .trim()
    .replace(/^```mermaid\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (!normalized) throw new Error("Mermaid source is empty.");
  if (normalized.length > 12_000) {
    throw new Error("Mermaid source is too large to render safely.");
  }
  if (!SUPPORTED_DIAGRAM.test(normalized)) {
    throw new Error("Use a flowchart, sequence, ER, state, or class diagram.");
  }
  if (UNSAFE_DIRECTIVE.test(normalized)) {
    throw new Error("Interactive Mermaid directives and HTML are not supported.");
  }

  return normalized;
}

function translatedBounds(
  elements: readonly SceneElementLike[],
  target: Pick<Bounds, "x" | "y">,
  occupied: readonly Bounds[]
): { dx: number; dy: number; bounds: Bounds } {
  const rawBounds = unionBounds(
    elements.map((element) => ({
      x: Number(element.x) || 0,
      y: Number(element.y) || 0,
      width: Math.max(1, Number(element.width) || 1),
      height: Math.max(1, Number(element.height) || 1),
    }))
  ) || { x: 0, y: 0, width: 1, height: 1 };

  const placement = findOpenBounds(
    { x: target.x, y: target.y, width: rawBounds.width, height: rawBounds.height },
    occupied,
    32
  );
  const dx = placement.x - rawBounds.x;
  const dy = placement.y - rawBounds.y;
  return {
    dx,
    dy,
    bounds: placement,
  };
}

function createSemanticNodeIcons(
  elements: readonly Record<string, unknown>[],
  meta: { sessionId: string; diagramId: string }
): AiCanvasImageAsset[] {
  const labels = elements.filter((element) => element.type === "text" && element.containerId);
  const nodeIconCount = new Map<string, number>();

  return elements.flatMap((element, index) => {
    if (!["rectangle", "ellipse", "diamond"].includes(String(element.type))) return [];
    if (String(element.id).startsWith("subgraph")) return [];
    const label = labels.find((candidate) => candidate.containerId === element.id);
    const icon = inferCanvasIcon(String(label?.text || ""));
    if (!icon) return [];

    const nodeId = String(element.id);
    const count = nodeIconCount.get(nodeId) || 0;
    if (count > 0) return [];
    nodeIconCount.set(nodeId, count + 1);

    const fileId = `semantic-icon-${icon}-${meta.diagramId}-${index}`;
    const size = Math.max(18, Math.min(28, Number(element.height) * 0.28));
    const color = String(element.strokeColor || "#4f46e5");
    const groupIds = Array.isArray(element.groupIds) ? element.groupIds : [];
    return [{
      file: {
        id: fileId,
        mimeType: "image/svg+xml" as const,
        dataURL: canvasIconDataUrl(icon, color),
        created: Date.now(),
      },
      element: stampAiProvenance(
        {
          id: `semantic-icon-element-${icon}-${meta.diagramId}-${index}`,
          type: "image",
          x: Number(element.x) + 12,
          y: Number(element.y) + 12,
          width: size,
          height: size,
          angle: 0,
          strokeColor: "transparent",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          groupIds,
          frameId: null,
          roundness: null,
          seed: Math.floor(Math.random() * 100000),
          version: 1,
          versionNonce: Math.floor(Math.random() * 100000),
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
          fileId,
          status: "saved",
          scale: [1, 1],
          crop: null,
          customData: { semanticIcon: icon, nodeId },
        },
        { ...meta, role: "semantic-node-icon", index }
      ) as Record<string, unknown>,
    }];
  });
}

function semanticNodePalette(icon?: string): { backgroundColor: string; strokeColor: string } | null {
  if (!icon) return null;
  if (["database", "storage", "origin"].includes(icon)) {
    return { backgroundColor: "#fff7ed", strokeColor: "#ea580c" };
  }
  if (["cache", "catalog", "search", "cdn"].includes(icon)) {
    return { backgroundColor: "#fffbeb", strokeColor: "#d97706" };
  }
  if (["queue", "event", "analytics", "notification"].includes(icon)) {
    return { backgroundColor: "#faf5ff", strokeColor: "#9333ea" };
  }
  if (["identity", "shield"].includes(icon)) {
    return { backgroundColor: "#fff1f2", strokeColor: "#e11d48" };
  }
  if (["service", "worker", "recommendation", "playback"].includes(icon)) {
    return { backgroundColor: "#ecfdf5", strokeColor: "#059669" };
  }
  return { backgroundColor: "#eef2ff", strokeColor: "#4f46e5" };
}

/** Convert portable Mermaid text into clean, editable, native Excalidraw nodes. */
export async function mermaidToCanvas(
  source: string,
  placement: Pick<Bounds, "x" | "y">,
  meta: { sessionId: string; diagramId: string; occupied?: readonly Bounds[] }
): Promise<MermaidCanvasResult> {
  const definition = normalizeMermaidSource(source);
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }] = await Promise.all([
    import("@excalidraw/mermaid-to-excalidraw"),
    import("@excalidraw/excalidraw"),
  ]);

  const parsed = await parseMermaidToExcalidraw(definition, {
    startOnLoad: false,
    flowchart: { curve: "linear" },
    themeVariables: { fontSize: "18px" },
    maxEdges: 160,
    maxTextSize: 12_000,
  });
  const converted = convertToExcalidrawElements(parsed.elements, { regenerateIds: true });
  if (!converted.length) throw new Error("Mermaid produced an empty diagram.");

  const { dx, dy, bounds } = translatedBounds(
    converted as SceneElementLike[],
    placement,
    meta.occupied || []
  );
  const convertedLabels = (converted as unknown as Record<string, unknown>[])
    .filter((element) => element.type === "text" && element.containerId);
  const nativeElements = converted.map((element, index) => {
    const isNode = element.type === "rectangle" || element.type === "ellipse" || element.type === "diamond";
    const isConnector = element.type === "arrow" || element.type === "line";
    const isText = element.type === "text";
    const nodeLabel = isNode
      ? convertedLabels.find((candidate) => candidate.containerId === element.id)
      : undefined;
    const semanticIcon = inferCanvasIcon(String(nodeLabel?.text || ""));
    const semanticPalette = semanticNodePalette(semanticIcon);
    const semanticGroupId = semanticIcon ? `semantic-node-${String(element.id)}` : undefined;
    const visualDefaults = isNode
      ? {
          backgroundColor: semanticPalette?.backgroundColor || (element.backgroundColor === "#fff" || element.backgroundColor === "#ffffff"
            ? "#eef2ff"
            : element.backgroundColor),
          strokeColor: semanticPalette?.strokeColor || (element.strokeColor === "#000000" || element.strokeColor === "#000"
            ? "#4f46e5"
            : element.strokeColor),
          fillStyle: "solid",
          strokeWidth: Math.max(2, Number(element.strokeWidth) || 1),
          groupIds: semanticGroupId
            ? Array.from(new Set([...(element.groupIds || []), semanticGroupId]))
            : element.groupIds,
          customData: semanticIcon ? { semanticRole: semanticIcon } : undefined,
        }
      : isConnector
        ? { strokeColor: "#64748b", strokeWidth: Math.max(2, Number(element.strokeWidth) || 1) }
        : isText
          ? { fontFamily: 2, strokeColor: "#0f172a" }
          : {};

    return stampAiProvenance(
      {
        ...element,
        ...visualDefaults,
        x: Number(element.x) + dx,
        y: Number(element.y) + dy,
        roughness: 0,
      } as SceneElementLike,
      {
        sessionId: meta.sessionId,
        diagramId: meta.diagramId,
        role: "mermaid-diagram",
        index,
      }
    ) as Record<string, unknown>;
  });
  const semanticAssets = createSemanticNodeIcons(nativeElements, meta);
  const elements = [...nativeElements, ...semanticAssets.map((asset) => asset.element)];
  const files = Object.fromEntries([
    ...Object.entries((parsed.files || {}) as Record<string, Record<string, unknown>>),
    ...semanticAssets.map((asset) => [asset.file.id, asset.file]),
  ]);

  return {
    elements,
    files,
    bounds,
  };
}

export function resultUsesMermaidCanvas(result: {
  classification?: string;
  mermaidCode?: string;
}): boolean {
  return Boolean(
    result.mermaidCode &&
      ["architecture", "schema", "flowchart"].includes(result.classification || "")
  );
}
