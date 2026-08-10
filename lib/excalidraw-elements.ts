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
  /** Groups all generated scene elements so a prior diagram can be reselected. */
  diagramId?: string;
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
    diagramId: provenance?.diagramId,
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
  // Solid fills read as product UI; hachure looks noisy for architecture
  const fillStyle = item.fillStyle || "solid";
  const provenance = { ...opts, index };
  // Cleaner look for system diagrams; slightly sketchy for freehand math
  const roughness = item.type === "freedraw" ? 1 : 0.4;
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
    const rawText = item.text || item.label || "";
    const formattedText = wrapText(rawText, 45);
    const fontSize = item.fontSize || 16;
    const textBounds = calcTextBounds(formattedText, fontSize);
    const width = Math.max(item.width || 0, textBounds.width + 20);
    const height = Math.max(item.height || 0, textBounds.height + 10);

    elements.push(
      baseProps(
        {
          id: baseId,
          type: "text",
          x: item.x,
          y: item.y,
          width,
          height,
          strokeColor: strokeColor === "#6366f1" ? "#1e1b4b" : strokeColor,
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: 1,
          roundness: null,
          text: formattedText,
          fontSize,
          fontFamily: 1,
          textAlign: "left",
          verticalAlign: "top",
          containerId: null,
          originalText: formattedText,
          autoResize: true,
          lineHeight: 1.25,
        },
        provenance
      )
    );
    return elements;
  }

  // rectangle | diamond | ellipse — paired with properly bound text
  const shapeType =
    item.type === "diamond" || item.type === "ellipse" ? item.type : "rectangle";
  const rawItemText = item.text || item.label;

  const formattedText = rawItemText ? wrapText(rawItemText, 34) : undefined;
  const textId = formattedText ? randId(`ai-text-${index}`) : null;

  const fontSize = item.fontSize || (formattedText && formattedText.length > 80 ? 14 : 15);
  const paddingX = 18;
  const paddingY = 14;
  const textDimensions = formattedText
    ? calcTextBounds(formattedText, fontSize)
    : { width: 0, height: 0 };

  const minRequiredWidth = formattedText ? textDimensions.width + paddingX * 2 : 140;
  const minRequiredHeight = formattedText ? textDimensions.height + paddingY * 2 : 90;

  const boxWidth = Math.max(item.width || 240, minRequiredWidth, 160);
  const boxHeight = Math.max(item.height || 100, minRequiredHeight, 72);

  const bg =
    backgroundColor === "transparent" || !backgroundColor
      ? shapeType === "ellipse"
        ? "#fef3c7"
        : shapeType === "diamond"
          ? "#ede9fe"
          : "#e0e7ff"
      : backgroundColor;

  elements.push(
    baseProps(
      {
        id: baseId,
        type: shapeType,
        x: item.x,
        y: item.y,
        width: boxWidth,
        height: boxHeight,
        strokeColor,
        backgroundColor: bg,
        fillStyle,
        strokeWidth: item.strokeWidth || 2,
        roughness,
        roundness: shapeType === "ellipse" ? null : { type: 3 },
        boundElements: textId ? [{ type: "text", id: textId }] : null,
      },
      provenance
    )
  );

  if (formattedText && textId) {
    // Bound text: containerId links label into the shape so Excalidraw keeps them together
    elements.push(
      baseProps(
        {
          id: textId,
          type: "text",
          x: item.x + paddingX,
          y: item.y + paddingY,
          width: Math.max(40, boxWidth - paddingX * 2),
          height: Math.max(24, boxHeight - paddingY * 2),
          strokeColor: "#0f172a",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1,
          roughness: 0,
          roundness: null,
          text: formattedText,
          fontSize,
          fontFamily: 3, // code / clean sans-like in Excalidraw
          textAlign: "center",
          verticalAlign: "middle",
          containerId: baseId,
          originalText: formattedText,
          autoResize: false,
          lineHeight: 1.25,
        },
        provenance
      )
    );
  }

  return elements;
}

/** Word-wrap long single lines into ~maxCharsPerLine columns */
function wrapText(text: string, maxCharsPerLine = 38): string {
  const rawLines = text.split("\n");
  const wrappedLines: string[] = [];

  for (const line of rawLines) {
    if (line.length <= maxCharsPerLine) {
      wrappedLines.push(line);
      continue;
    }

    const words = line.split(" ");
    let current = "";

    for (const word of words) {
      if ((current + " " + word).trim().length <= maxCharsPerLine) {
        current = (current + " " + word).trim();
      } else {
        if (current) wrappedLines.push(current);
        current = word;
      }
    }
    if (current) wrappedLines.push(current);
  }

  return wrappedLines.join("\n");
}

/** Calculate pixel bounding box for multiline text */
function calcTextBounds(text: string, fontSize: number): { width: number; height: number } {
  const lines = text.split("\n");
  const maxLineLength = Math.max(...lines.map((l) => l.length), 1);
  const charWidthRatio = fontSize * 0.58;
  const lineHeight = fontSize * 1.35;

  return {
    width: Math.round(maxLineLength * charWidthRatio),
    height: Math.round(lines.length * lineHeight),
  };
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

function pencilOutlineFor(element: ExcalidrawElement): ExcalidrawElement | null {
  const type = String(element.type || "");
  const width = Math.max(1, Number(element.width) || 1);
  const height = Math.max(1, Number(element.height) || 1);
  let points: [number, number][];

  if (type === "rectangle") {
    points = [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];
  } else if (type === "diamond") {
    points = [[width / 2, 0], [width, height / 2], [width / 2, height], [0, height / 2], [width / 2, 0]];
  } else if (type === "ellipse") {
    const steps = 18;
    points = Array.from({ length: steps + 1 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / steps - Math.PI / 2;
      return [width / 2 + (width / 2) * Math.cos(angle), height / 2 + (height / 2) * Math.sin(angle)];
    });
  } else if (type === "line" || type === "arrow") {
    const sourcePoints = element.points as [number, number][] | undefined;
    points = sourcePoints?.length ? sourcePoints : [[0, 0], [width, height]];
  } else {
    return null;
  }

  return {
    ...element,
    id: `${String(element.id)}-pencil-outline`,
    type: "freedraw",
    x: Number(element.x) || 0,
    y: Number(element.y) || 0,
    width,
    height,
    backgroundColor: "transparent",
    fillStyle: "solid",
    points,
    pressures: points.map(() => 0.5),
    simulatePressure: true,
    lastCommittedPoint: null,
    containerId: null,
    boundElements: null,
    version: 1,
  };
}

/**
 * Gives structured elements a short pencil-outline reveal before settling on
 * their final selectable Excalidraw shape. Text is revealed character-by-character.
 */
export async function animatePencilElement(
  api: ExcalidrawAPILike,
  element: ExcalidrawElement,
  opts: { pointDelayMs?: number; characterDelayMs?: number; onFrame?: (els: ExcalidrawElement[]) => void } = {}
): Promise<ExcalidrawElement[]> {
  if (element.type === "freedraw") {
    return animateFreedraw(api, element, {
      pointDelayMs: opts.pointDelayMs ?? 18,
      onFrame: opts.onFrame,
    });
  }

  if (element.type === "text") {
    const completeText = String(element.text || "");
    if (!completeText) return appendToScene(api, [element]);

    const id = String(element.id);
    let scene = appendToScene(api, [{ ...element, text: "", originalText: completeText, version: 1 }]);
    opts.onFrame?.(scene);

    const chunkSize = Math.max(1, Math.ceil(completeText.length / 20));
    for (let end = chunkSize; end < completeText.length; end += chunkSize) {
      const current = api.getSceneElements().filter((item) => !item.isDeleted && item.id !== id);
      scene = [
        ...current,
        {
          ...element,
          text: completeText.slice(0, end),
          originalText: completeText,
          version: end + 1,
          versionNonce: Math.floor(Math.random() * 100000),
          updated: Date.now(),
        },
      ];
      api.updateScene({ elements: scene });
      opts.onFrame?.(scene);
      await sleep(opts.characterDelayMs ?? 14);
    }

    const current = api.getSceneElements().filter((item) => !item.isDeleted && item.id !== id);
    scene = [...current, element];
    api.updateScene({ elements: scene });
    opts.onFrame?.(scene);
    return scene;
  }

  const outline = pencilOutlineFor(element);
  if (!outline) return appendToScene(api, [element]);

  let scene = await animateFreedraw(api, outline, {
    pointDelayMs: opts.pointDelayMs ?? 14,
    onFrame: opts.onFrame,
  });
  scene = [...api.getSceneElements().filter((item) => !item.isDeleted && item.id !== outline.id), element];
  api.updateScene({ elements: scene });
  opts.onFrame?.(scene);
  return scene;
}

export interface ProgressiveDrawOptions {
  shapeDelayMs?: number;
  pointDelayMs?: number;
  onSceneUpdate?: (elements: ExcalidrawElement[]) => void;
  onDrawStart?: (item: AiCanvasElement, index: number) => void;
  signal?: AbortSignal;
}

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
        lastScene = appendToScene(api, [el]);
        opts.onSceneUpdate?.(lastScene);
        await sleep(Math.min(120, shapeDelayMs / 2));
      }
    }

    await sleep(shapeDelayMs);
  }

  try {
    api.scrollToContent?.(lastScene.slice(-3));
  } catch {
    /* optional API */
  }

  return lastScene;
}

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

  const rawText = elem.text ? String(elem.text) : elem.label ? String(elem.label) : undefined;
  const shapeKind = ["rectangle", "ellipse", "arrow", "text", "diamond", "freedraw", "line"].includes(type)
    ? type
    : "rectangle";

  // Guarantee every container shape has non-empty text content
  const text = rawText || (["rectangle", "diamond", "ellipse"].includes(shapeKind) ? "AI Visual Step" : undefined);

  return {
    type: shapeKind as AiCanvasElement["type"],
    x: Number(elem.x) || 0,
    y: Number(elem.y) || 0,
    width: Number(elem.width) || 120,
    height: Number(elem.height) || 80,
    strokeColor: (elem.strokeColor as string) || "#6366f1",
    backgroundColor: (elem.backgroundColor as string) || "transparent",
    fillStyle: (elem.fillStyle as AiCanvasElement["fillStyle"]) || "hachure",
    text,
    label: elem.label ? String(elem.label) : undefined,
    points,
    strokeWidth: elem.strokeWidth ? Number(elem.strokeWidth) : undefined,
    strokeStyle: elem.strokeStyle as AiCanvasElement["strokeStyle"],
    fontSize: elem.fontSize ? Number(elem.fontSize) : undefined,
  };
}
