import type { Bounds, SceneElementLike } from "./canvas-provenance";
import { findOpenBounds, stampAiProvenance, unionBounds } from "./canvas-provenance";

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
  const elements = converted.map((element, index) => {
    const isNode = element.type === "rectangle" || element.type === "ellipse" || element.type === "diamond";
    const isConnector = element.type === "arrow" || element.type === "line";
    const isText = element.type === "text";
    const visualDefaults = isNode
      ? {
          backgroundColor: element.backgroundColor === "#fff" || element.backgroundColor === "#ffffff"
            ? "#eef2ff"
            : element.backgroundColor,
          strokeColor: element.strokeColor === "#000000" || element.strokeColor === "#000"
            ? "#4f46e5"
            : element.strokeColor,
          fillStyle: "solid",
          strokeWidth: Math.max(2, Number(element.strokeWidth) || 1),
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

  return {
    elements,
    files: (parsed.files || {}) as Record<string, Record<string, unknown>>,
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
