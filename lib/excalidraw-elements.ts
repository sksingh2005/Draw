/**
 * Convert AI canvas drawing specs into Excalidraw scene elements,
 * and progressively animate them onto the whiteboard in real time.
 */

import type { AiCanvasElement } from "./math-parser";
import { stampAiProvenance } from "./canvas-provenance";

export type ExcalidrawElement = Record<string, unknown>;

export interface ExcalidrawAPILike {
  getSceneElements: () => readonly ExcalidrawElement[];
  updateScene: (scene: { elements?: readonly ExcalidrawElement[] }) => void;
  scrollToContent?: (target?: unknown) => void;
}

export interface AiBuildOptions {
  sessionId?: string;
  role?: string;
}

function randId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function baseProps(
  overrides: Partial<ExcalidrawElement> = {},
  provenance?: AiBuildOptions & { index?: number }
): ExcalidrawElement {
  const base: ExcalidrawElement = {
    angle: 0,
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    seed: Math.floor(Math.random() * 100000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 100000),
    isDeleted: false,
    ...overrides,
  };
  return stampAiProvenance(base, {
    sessionId: provenance?.sessionId,
    role: provenance?.role || "explanation",
    index: provenance?.index,
  }) as ExcalidrawElement;
}

/** Build one or more Excalidraw elements from a single AI drawing instruction. */
export function aiElementToExcalidraw(
  item: AiCanvasElement,
  index = 0,
  opts: AiBuildOptions = {}
): ExcalidrawElement[] {
  const baseId = randId(`ai-${item.type}-${index}`);
  const strokeColor = item.strokeColor || "#6366f1";
  const backgroundColor = item.backgroundColor || "transparent";
  const fillStyle = item.fillStyle || "hachure";
  const provenance = { ...opts, index };
  const elements: ExcalidrawElement[] = [];

  if (item.type === "freedraw" && item.points && item.points.length > 0) {
    const pts = item.points.map((p) => [p[0], p[1]] as [number, number]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    elements.push(
      baseProps(
        {
          id: baseId,
          type: "freedraw",
          x: item.x + minX,
          y: item.y + minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          strokeColor,
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: item.strokeWidth || 2.5,
          roundness: null,
          points: pts.map((p) => [p[0] - minX, p[1] - minY]),
          pressures: pts.map(() => 0.5),
          simulatePressure: true,
          lastCommittedPoint: null,
        },
        provenance
      )
    );
    return elements;
  }

  if (item.type === "line" || item.type === "arrow") {
    const w = item.width ?? 120;
    const h = item.height ?? 0;
    elements.push(
      baseProps(
        {
          id: baseId,
          type: item.type === "line" ? "line" : "arrow",
          x: item.x,
          y: item.y,
          width: Math.abs(w),
          height: Math.abs(h),
          strokeColor,
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: item.strokeWidth || 2,
          strokeStyle: item.strokeStyle || "solid",
          roundness: { type: 2 },
          points: item.points?.length
            ? item.points.map((p) => [p[0], p[1]])
            : [
                [0, 0],
                [w, h],
              ],
          startBinding: null,
          endBinding: null,
          startArrowhead: null,
          endArrowhead: item.type === "arrow" ? "arrow" : null,
          lastCommittedPoint: null,
        },
        provenance
      )
    );
    return elements;
  }

  if (item.type === "text") {
    const text = item.text || item.label || "";
    elements.push(
      baseProps(
        {
          id: baseId,
          type: "text",
          x: item.x,
          y: item.y,
          width: item.width || 200,
          height: item.height || 40,
          strokeColor: strokeColor === "#6366f1" ? "#1e1b4b" : strokeColor,
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: 1,
          roundness: null,
          text,
          fontSize: item.fontSize || 16,
          fontFamily: 1,
          textAlign: "left",
          verticalAlign: "top",
          containerId: null,
          originalText: text,
          autoResize: true,
          lineHeight: 1.25,
        },
        provenance
      )
    );
    return elements;
  }

  // rectangle | diamond | ellipse
  const shapeType =
    item.type === "diamond" || item.type === "ellipse" ? item.type : "rectangle";

  elements.push(
    baseProps(
      {
        id: baseId,
        type: shapeType,
        x: item.x,
        y: item.y,
        width: item.width || 200,
        height: item.height || 120,
        strokeColor,
        backgroundColor:
          backgroundColor === "transparent" && shapeType === "rectangle"
            ? "#e0e7ff"
            : backgroundColor,
        fillStyle,
        strokeWidth: item.strokeWidth || 2,
        roundness: shapeType === "ellipse" ? null : { type: 3 },
      },
      provenance
    )
  );

  if (item.text) {
    const textId = randId(`ai-text-${index}`);
    elements.push(
      baseProps(
        {
          id: textId,
          type: "text",
          x: item.x + 14,
          y: item.y + 14,
          width: Math.max(40, (item.width || 200) - 28),
          height: Math.max(24, (item.height || 120) - 28),
          strokeColor: "#1e1b4b",
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: 1,
          roundness: null,
          text: item.text,
          fontSize: item.fontSize || 15,
          fontFamily: 1,
          textAlign: "left",
          verticalAlign: "top",
          containerId: baseId,
          originalText: item.text,
          autoResize: false,
          lineHeight: 1.25,
        },
        provenance
      )
    );
  }

  return elements;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Append elements to the live Excalidraw scene (non-destructive).
 */
export function appendToScene(
  api: ExcalidrawAPILike,
  newElements: ExcalidrawElement[]
): ExcalidrawElement[] {
  const current = api.getSceneElements().filter((e) => !e.isDeleted);
  const updated = [...current, ...newElements];
  api.updateScene({ elements: updated });
  return updated;
}

/**
 * Animate a freedraw stroke point-by-point so it looks like a real pencil.
 */
export async function animateFreedraw(
  api: ExcalidrawAPILike,
  fullElement: ExcalidrawElement,
  opts: { pointDelayMs?: number; onFrame?: (els: ExcalidrawElement[]) => void } = {}
): Promise<ExcalidrawElement[]> {
  const pointDelayMs = opts.pointDelayMs ?? 18;
  const allPoints = (fullElement.points as [number, number][]) || [];
  if (allPoints.length === 0) {
    return appendToScene(api, [fullElement]);
  }

  const id = String(fullElement.id);
  let last: ExcalidrawElement[] = [];

  // Seed with first point
  const seed: ExcalidrawElement = {
    ...fullElement,
    points: [allPoints[0]],
    width: 1,
    height: 1,
    version: 1,
  };
  last = appendToScene(api, [seed]);
  opts.onFrame?.(last);

  for (let i = 2; i <= allPoints.length; i++) {
    const slice = allPoints.slice(0, i);
    const xs = slice.map((p) => p[0]);
    const ys = slice.map((p) => p[1]);
    const partial: ExcalidrawElement = {
      ...fullElement,
      points: slice,
      width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
      version: i,
      versionNonce: Math.floor(Math.random() * 100000),
      updated: Date.now(),
    };

    const current = api.getSceneElements().filter((e) => !e.isDeleted && e.id !== id);
    last = [...current, partial];
    api.updateScene({ elements: last });
    opts.onFrame?.(last);
    await sleep(pointDelayMs);
  }

  return last;
}

export interface ProgressiveDrawOptions {
  /** Delay between discrete shapes (rect, arrow, text…). */
  shapeDelayMs?: number;
  /** Delay between freedraw points. */
  pointDelayMs?: number;
  /** Called after each visual frame with the full scene. */
  onSceneUpdate?: (elements: ExcalidrawElement[]) => void;
  /** Called when a single AI instruction starts drawing. */
  onDrawStart?: (item: AiCanvasElement, index: number) => void;
  /** Abort mid-animation. */
  signal?: AbortSignal;
}

/**
 * Draw AI elements onto the canvas one-by-one in real time.
 * Freedraw strokes animate point-by-point like a pencil.
 */
export async function progressiveDrawOnCanvas(
  api: ExcalidrawAPILike,
  drawings: AiCanvasElement[],
  opts: ProgressiveDrawOptions = {}
): Promise<ExcalidrawElement[]> {
  const shapeDelayMs = opts.shapeDelayMs ?? 280;
  let lastScene: ExcalidrawElement[] = api
    .getSceneElements()
    .filter((e) => !e.isDeleted) as ExcalidrawElement[];

  for (let i = 0; i < drawings.length; i++) {
    if (opts.signal?.aborted) break;

    const item = drawings[i];
    opts.onDrawStart?.(item, i);

    const built = aiElementToExcalidraw(item, i);

    for (const el of built) {
      if (opts.signal?.aborted) break;

      if (el.type === "freedraw") {
        lastScene = await animateFreedraw(api, el, {
          pointDelayMs: opts.pointDelayMs ?? 16,
          onFrame: (els) => {
            lastScene = els;
            opts.onSceneUpdate?.(els);
          },
        });
      } else {
        // Brief "pop-in": insert, then soft delay before next
        lastScene = appendToScene(api, [el]);
        opts.onSceneUpdate?.(lastScene);
        await sleep(Math.min(120, shapeDelayMs / 2));
      }
    }

    await sleep(shapeDelayMs);
  }

  // Nudge viewport to show the new work
  try {
    api.scrollToContent?.(lastScene.slice(-3));
  } catch {
    /* optional API */
  }

  return lastScene;
}

/**
 * Extract newly completed objects from a streaming `canvasDrawings: [...]` JSON array.
 * Returns only items beyond `alreadyCount` so callers can emit deltas.
 */
export function extractNewCanvasDrawings(
  partialJsonText: string,
  alreadyCount: number
): { items: AiCanvasElement[]; totalFound: number } {
  const keyIdx = partialJsonText.search(/"canvasDrawings"\s*:\s*\[/);
  if (keyIdx < 0) return { items: [], totalFound: alreadyCount };

  const arrayStart = partialJsonText.indexOf("[", keyIdx);
  if (arrayStart < 0) return { items: [], totalFound: alreadyCount };

  const slice = partialJsonText.slice(arrayStart + 1);
  const objects: AiCanvasElement[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
      continue;
    }

    if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        const raw = slice.slice(objStart, i + 1);
        try {
          const parsed = JSON.parse(raw);
          objects.push(normalizeDrawing(parsed));
        } catch {
          /* incomplete / invalid object — skip */
        }
        objStart = -1;
      }
      continue;
    }

    // End of array
    if (ch === "]" && depth === 0) break;
  }

  return {
    items: objects.slice(alreadyCount),
    totalFound: objects.length,
  };
}

function normalizeDrawing(elem: Record<string, unknown>): AiCanvasElement {
  const type = String(elem.type || "rectangle") as AiCanvasElement["type"];
  const points = Array.isArray(elem.points)
    ? (elem.points as unknown[])
        .map((p) => {
          if (Array.isArray(p) && p.length >= 2) {
            return [Number(p[0]) || 0, Number(p[1]) || 0] as [number, number];
          }
          return null;
        })
        .filter(Boolean) as [number, number][]
    : undefined;

  return {
    type: (["rectangle", "ellipse", "arrow", "text", "diamond", "freedraw", "line"].includes(
      type
    )
      ? type
      : "rectangle") as AiCanvasElement["type"],
    x: Number(elem.x) || 0,
    y: Number(elem.y) || 0,
    width: Number(elem.width) || 120,
    height: Number(elem.height) || 80,
    strokeColor: (elem.strokeColor as string) || "#6366f1",
    backgroundColor: (elem.backgroundColor as string) || "transparent",
    fillStyle: (elem.fillStyle as AiCanvasElement["fillStyle"]) || "hachure",
    text: elem.text ? String(elem.text) : undefined,
    label: elem.label ? String(elem.label) : undefined,
    points,
    strokeWidth: elem.strokeWidth ? Number(elem.strokeWidth) : undefined,
    strokeStyle: elem.strokeStyle as AiCanvasElement["strokeStyle"],
    fontSize: elem.fontSize ? Number(elem.fontSize) : undefined,
  };
}
