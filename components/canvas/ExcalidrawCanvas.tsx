"use client";

import React, { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
export type ExcalidrawElement = any;
export type ExcalidrawAppState = any;
import { ensureUserProvenance, SceneElementLike } from "@/lib/canvas-provenance";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false }
);

export type ExcalidrawImperativeAPI = any;

interface ExcalidrawCanvasProps {
  initialElements?: readonly ExcalidrawElement[];
  /** A short-lived preview shown while generated elements are being placed. */
  liveReveal?: { id: string; elements: readonly ExcalidrawElement[] } | null;
  onElementsChange?: (elements: readonly ExcalidrawElement[]) => void;
  onSelectionChange?: (selectedElements: readonly ExcalidrawElement[]) => void;
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
}

function LiveCanvasReveal({
  reveal,
  api,
}: {
  reveal: ExcalidrawCanvasProps["liveReveal"];
  api: ExcalidrawImperativeAPI | null;
}) {
  if (!reveal || !api) return null;

  const appState = api.getAppState?.() || {};
  const zoom = appState.zoom?.value || 1;
  const scrollX = appState.scrollX || 0;
  const scrollY = appState.scrollY || 0;
  const containers = new Map(
    reveal.elements
      .filter((element) => ["rectangle", "ellipse", "diamond"].includes(element.type))
      .map((element) => [String(element.id), element])
  );

  const styleFor = (element: ExcalidrawElement): React.CSSProperties => ({
    left: (Number(element.x) + scrollX) * zoom,
    top: (Number(element.y) + scrollY) * zoom,
    width: Math.max(1, Number(element.width) || 1) * zoom,
    height: Math.max(1, Number(element.height) || 1) * zoom,
    opacity: 1,
    transformOrigin: "center",
    animation: "live-canvas-reveal 220ms cubic-bezier(.16, 1, .3, 1) both",
  });

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <style>{`@keyframes live-canvas-reveal { from { opacity: 0; } to { opacity: 1; } }`}</style>
      {reveal.elements.map((element) => {
        const type = String(element.type);
        const containerId = element.containerId ? String(element.containerId) : null;
        if (type === "text" && containerId && containers.has(containerId)) return null;

        if (type === "arrow" || type === "line") {
          const width = Math.max(1, Number(element.width) || 1) * zoom;
          const height = Math.max(1, Number(element.height) || 1) * zoom;
          return (
            <svg key={String(element.id)} className="absolute overflow-visible" style={styleFor(element)} viewBox={`0 0 ${width} ${height}`}>
              <line
                x1="0"
                y1="0"
                x2={width}
                y2={height}
                stroke={String(element.strokeColor || "#64748b")}
                strokeWidth={Math.max(2, Number(element.strokeWidth) || 2)}
                strokeLinecap="round"
                markerEnd={type === "arrow" ? "url(#live-arrowhead)" : undefined}
              />
              <defs>
                <marker id="live-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill={String(element.strokeColor || "#64748b")} />
                </marker>
              </defs>
            </svg>
          );
        }

        if (type === "freedraw") return null;

        const isContainer = containers.has(String(element.id));
        const label = isContainer
          ? reveal.elements.find((candidate) => String(candidate.containerId || "") === String(element.id))
          : null;
        const text = String(label?.text || element.text || "");
        const diamondTransform = type === "diamond"
          ? "rotate(45deg)"
          : undefined;

        return (
          <div
            key={String(element.id)}
            className="absolute flex items-center justify-center text-center shadow-[0_10px_30px_rgba(79,70,229,0.14)]"
            style={{
              ...styleFor(element),
              color: String(element.strokeColor || "#0f172a"),
              background: type === "text" ? "transparent" : String(element.backgroundColor || "#e0e7ff"),
              border: type === "text" ? "none" : `${Math.max(1.5, Number(element.strokeWidth) || 2)}px solid ${String(element.strokeColor || "#6366f1")}`,
              borderRadius: type === "ellipse" ? "999px" : type === "diamond" ? "16px" : "12px",
              padding: type === "text" ? 0 : `${10 * zoom}px ${14 * zoom}px`,
              fontSize: Math.max(12, Number(element.fontSize) || 15) * zoom,
              fontWeight: type === "text" ? 500 : 600,
              lineHeight: 1.25,
              whiteSpace: "pre-wrap",
              transform: diamondTransform || styleFor(element).transform,
            }}
          >
            <span style={type === "diamond" ? { transform: "rotate(-45deg)", maxWidth: "75%" } : undefined}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ExcalidrawCanvas({
  initialElements = [],
  liveReveal = null,
  onElementsChange,
  onSelectionChange,
  onApiReady,
}: ExcalidrawCanvasProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const lastSelectionKey = useRef<string>("");
  const lastElementsKey = useRef<string>("");
  const stampedIds = useRef<Set<string>>(new Set());

  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      setApi(api);
      if (onApiReady) onApiReady(api);
    },
    [onApiReady]
  );

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: ExcalidrawAppState) => {
      let hasNewStamp = false;
      const stamped = elements.map((el) => {
        const id = String(el.id);
        if (stampedIds.current.has(id)) return el;

        // Only stamp plain user-drawn elements that lack ownership
        if (!el.customData?.drawSource) {
          stampedIds.current.add(id);
          hasNewStamp = true;
          return ensureUserProvenance(el as SceneElementLike);
        }

        stampedIds.current.add(id);
        return el;
      });

      // Construct a lightweight version fingerprint of active elements
      const elemKey = stamped
        .filter((e) => !e.isDeleted)
        .map((e) => `${e.id}:${e.version}:${e.x}:${e.y}`)
        .join("|");

      if (elemKey !== lastElementsKey.current || hasNewStamp) {
        lastElementsKey.current = elemKey;
        if (onElementsChange) onElementsChange(stamped as any);
      }

      if (onSelectionChange && appState) {
        const selectedIds: string[] = Array.isArray(appState.selectedElementIds)
          ? appState.selectedElementIds
          : appState.selectedElementIds
          ? Object.entries(appState.selectedElementIds)
              .filter(([, v]) => Boolean(v))
              .map(([k]) => k)
          : [];

        const key = selectedIds.slice().sort().join(",");
        if (key !== lastSelectionKey.current) {
          lastSelectionKey.current = key;
          const selected = (stamped as any[]).filter(
            (e) => e && !e.isDeleted && selectedIds.includes(String(e.id))
          );
          onSelectionChange(selected);
        }
      }
    },
    [onElementsChange, onSelectionChange]
  );

  return (
    <div className="w-full h-full relative overflow-hidden select-none">
      <Excalidraw
        excalidrawAPI={handleExcalidrawAPI}
        initialData={{
          elements: initialElements as any,
          appState: {
            viewBackgroundColor: "#ffffff",
            currentItemFontFamily: 1,
          },
        }}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: true,
            clearCanvas: true,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: true,
          },
        }}
      />
      <LiveCanvasReveal reveal={liveReveal} api={api} />
    </div>
  );
}
