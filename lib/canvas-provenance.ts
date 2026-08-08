/**
 * Distinguishes USER vs AI canvas elements and computes non-overlapping
 * placement hints for partial (follow-up / selection) updates.
 */

export type ElementSource = "user" | "ai";

export const AI_CUSTOM_DATA_KEY = "drawSource";
export const AI_SESSION_KEY = "aiSessionId";
export const AI_ROLE_KEY = "aiRole";
/** Stable id shared by every element produced for one AI diagram/update. */
export const AI_DIAGRAM_KEY = "aiDiagramId";

export interface SceneElementLike {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  isDeleted?: boolean;
  customData?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutMapResult {
  summary: string;
  freeSpaceHints: string;
  suggestedPlacement: Bounds;
  occupied: Bounds[];
  userCount: number;
  aiCount: number;
}

export function getElementSource(el: SceneElementLike): ElementSource {
  if (el?.customData?.[AI_CUSTOM_DATA_KEY] === "ai") return "ai";
  // Legacy ids from earlier AI inserts
  const id = String(el?.id || "");
  if (id.startsWith("ai-") || id.startsWith("ai-elem-") || id.startsWith("ai-text-") || id.startsWith("ai-freedraw-") || id.startsWith("ai-box-") || id.startsWith("ai-note-") || id.startsWith("ai-root") || id.startsWith("ai-arrow-") || id.startsWith("ai-xaxis-")) {
    return "ai";
  }
  return "user";
}

export function isAiElement(el: SceneElementLike): boolean {
  return getElementSource(el) === "ai";
}

/** Stamp AI ownership metadata onto an Excalidraw element. */
export function stampAiProvenance<T extends SceneElementLike>(
  el: T,
  meta: { sessionId?: string; role?: string; index?: number; diagramId?: string } = {}
): T {
  const customData = {
    ...(el.customData || {}),
    [AI_CUSTOM_DATA_KEY]: "ai",
    [AI_SESSION_KEY]: meta.sessionId || `session-${Date.now()}`,
    [AI_ROLE_KEY]: meta.role || "explanation",
    ...(meta.diagramId ? { [AI_DIAGRAM_KEY]: meta.diagramId } : {}),
    aiIndex: meta.index ?? 0,
    createdAt: Date.now(),
  };
  return { ...el, customData };
}

/** Ensure elements without provenance are marked as user (for persistence). */
export function ensureUserProvenance<T extends SceneElementLike>(el: T): T {
  if (el.isDeleted) return el;
  if (el.customData?.[AI_CUSTOM_DATA_KEY]) return el;
  // Don't stamp pure legacy AI by id — leave getElementSource to handle
  if (getElementSource(el) === "ai") {
    return stampAiProvenance(el, { role: "legacy" });
  }
  return {
    ...el,
    customData: {
      ...(el.customData || {}),
      [AI_CUSTOM_DATA_KEY]: "user",
    },
  };
}

export function elementBounds(el: SceneElementLike): Bounds {
  return {
    x: Number(el.x) || 0,
    y: Number(el.y) || 0,
    width: Math.max(1, Number(el.width) || 1),
    height: Math.max(1, Number(el.height) || 1),
  };
}

export function boundsOverlap(a: Bounds, b: Bounds, pad = 16): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}

export function unionBounds(boxes: Bounds[]): Bounds | null {
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Build ownership-tagged layout map + free-space placement suggestions.
 */
export function buildLayoutMap(
  elements: readonly SceneElementLike[],
  opts: {
    selectionIds?: string[];
    selectionBounds?: Bounds | null;
    preferredNear?: Bounds | null;
  } = {}
): LayoutMapResult {
  const live = elements.filter((e) => e && !e.isDeleted);
  const occupied = live.map(elementBounds);
  let userCount = 0;
  let aiCount = 0;

  const lines = live.map((e, idx) => {
    const source = getElementSource(e);
    if (source === "user") userCount++;
    else aiCount++;
    const b = elementBounds(e);
    const text =
      typeof e.text === "string" && e.text
        ? ` text="${e.text.replace(/\s+/g, " ").slice(0, 48)}${e.text.length > 48 ? "…" : ""}"`
        : "";
    const selected =
      opts.selectionIds?.includes(String(e.id)) ? " SELECTED" : "";
    return `[${source.toUpperCase()}${selected}] #${idx + 1} id="${e.id}" type="${e.type}" bounds=[x:${Math.round(b.x)}, y:${Math.round(b.y)}, w:${Math.round(b.width)}, h:${Math.round(b.height)}]${text}`;
  });

  const contentUnion = unionBounds(occupied);
  const preferred =
    opts.preferredNear || opts.selectionBounds || contentUnion || {
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    };

  const candidates: Bounds[] = [
    // Right of focus
    {
      x: preferred.x + preferred.width + 48,
      y: preferred.y,
      width: 360,
      height: 260,
    },
    // Below focus
    {
      x: preferred.x,
      y: preferred.y + preferred.height + 48,
      width: 360,
      height: 260,
    },
    // Right of full content
    contentUnion
      ? {
          x: contentUnion.x + contentUnion.width + 60,
          y: contentUnion.y,
          width: 380,
          height: 280,
        }
      : { x: 200, y: 160, width: 380, height: 280 },
    // Below full content
    contentUnion
      ? {
          x: contentUnion.x,
          y: contentUnion.y + contentUnion.height + 60,
          width: 380,
          height: 280,
        }
      : { x: 200, y: 400, width: 380, height: 280 },
  ];

  let suggestedPlacement =
    candidates.find((c) => !occupied.some((o) => boundsOverlap(c, o, 24))) ||
    candidates[0];

  // If still overlapping, shove further right of union
  if (occupied.some((o) => boundsOverlap(suggestedPlacement, o, 24)) && contentUnion) {
    suggestedPlacement = {
      x: contentUnion.x + contentUnion.width + 80,
      y: contentUnion.y,
      width: 400,
      height: 300,
    };
  }

  const freeSpaceHints = [
    `Occupied element count: ${live.length} (USER=${userCount}, AI=${aiCount})`,
    contentUnion
      ? `Content bounding box: [x:${Math.round(contentUnion.x)}, y:${Math.round(contentUnion.y)}, w:${Math.round(contentUnion.width)}, h:${Math.round(contentUnion.height)}]`
      : "Content bounding box: empty canvas",
    `Best free placement: [x:${Math.round(suggestedPlacement.x)}, y:${Math.round(suggestedPlacement.y)}, w:${Math.round(suggestedPlacement.width)}, h:${Math.round(suggestedPlacement.height)}]`,
    "Rule: place ALL new drawings inside or near the best free placement; never stack on occupied bounds.",
  ].join("\n");

  return {
    summary:
      lines.length > 0
        ? lines.join("\n")
        : "Canvas is empty. No USER or AI elements yet.",
    freeSpaceHints,
    suggestedPlacement,
    occupied,
    userCount,
    aiCount,
  };
}

/**
 * If an AI drawing would land on occupied space, translate it into free space.
 * Preserves relative offsets within a batch by using a shared delta.
 */
export function resolveNonOverlappingDrawings<
  T extends { x: number; y: number; width: number; height: number },
>(
  drawings: T[],
  occupied: Bounds[],
  preferredOrigin?: Bounds | null
): T[] {
  if (!drawings.length) return drawings;

  // Batch bounds in proposed positions
  const batchBoxes = drawings.map((d) => ({
    x: d.x,
    y: d.y,
    width: Math.max(1, d.width || 80),
    height: Math.max(1, d.height || 40),
  }));
  const batchUnion = unionBounds(batchBoxes);
  if (!batchUnion) return drawings;

  const hits = occupied.some((o) => boundsOverlap(batchUnion, o, 20));
  if (!hits) return drawings;

  const target = preferredOrigin || {
    x: (unionBounds(occupied)?.x || 0) + (unionBounds(occupied)?.width || 0) + 60,
    y: unionBounds(occupied)?.y || batchUnion.y,
    width: 360,
    height: 260,
  };

  // Find a free slot for the whole batch by walking right/down
  let dx = target.x - batchUnion.x;
  let dy = target.y - batchUnion.y;
  let attempt = 0;
  while (attempt < 12) {
    const shifted: Bounds = {
      x: batchUnion.x + dx,
      y: batchUnion.y + dy,
      width: batchUnion.width,
      height: batchUnion.height,
    };
    if (!occupied.some((o) => boundsOverlap(shifted, o, 24))) break;
    attempt++;
    if (attempt % 2 === 1) dx += 80;
    else dy += 80;
  }

  return drawings.map((d) => ({
    ...d,
    x: d.x + dx,
    y: d.y + dy,
  }));
}

export function selectionBoundsFromElements(
  elements: readonly SceneElementLike[]
): Bounds | null {
  const boxes = elements.filter((e) => !e.isDeleted).map(elementBounds);
  return unionBounds(boxes);
}

export function summarizeSelection(
  elements: readonly SceneElementLike[]
): string {
  if (!elements.length) return "No elements selected.";
  return elements
    .filter((e) => !e.isDeleted)
    .map((e, i) => {
      const source = getElementSource(e);
      const b = elementBounds(e);
      const text =
        typeof e.text === "string" && e.text
          ? ` text="${e.text.replace(/\s+/g, " ").slice(0, 60)}"`
          : "";
      return `SELECTED[${source.toUpperCase()}] #${i + 1} id="${e.id}" type="${e.type}" bounds=[x:${Math.round(b.x)}, y:${Math.round(b.y)}, w:${Math.round(b.width)}, h:${Math.round(b.height)}]${text}`;
    })
    .join("\n");
}

export function filterOnlyUserElements<T extends SceneElementLike>(elements: readonly T[]): T[] {
  return elements.filter((e) => !e.isDeleted && getElementSource(e) !== "ai");
}

export function filterOnlyAiElements<T extends SceneElementLike>(elements: readonly T[]): T[] {
  return elements.filter((e) => !e.isDeleted && getElementSource(e) === "ai");
}

export function setElementsLockState<T extends SceneElementLike>(
  elements: readonly T[],
  targetSource: "user" | "ai" | "all",
  locked: boolean
): T[] {
  return elements.map((e) => {
    if (e.isDeleted) return e;
    const source = getElementSource(e);
    if (targetSource === "all" || source === targetSource) {
      return { ...e, locked };
    }
    return e;
  });
}
