"use client";

import React, { useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import {
  ensureUserProvenance,
  getElementSource,
  type SceneElementLike,
} from "@/lib/canvas-provenance";

export interface ExcalidrawImperativeAPI {
  getSceneElements: () => readonly any[];
  getAppState: () => any;
  getFiles: () => any;
  updateScene: (scene: { elements?: readonly any[]; appState?: any; files?: any }) => void;
  scrollToContent: (target?: any) => void;
  resetScene: () => void;
}

// Dynamically import Excalidraw to prevent SSR window/browser API issues
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-background text-muted-foreground gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold">Loading Excalidraw Engine...</span>
      </div>
    ),
  }
);

interface ExcalidrawCanvasProps {
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
  onElementsChange?: (elements: readonly any[]) => void;
  /** Fired when the set of selected element ids changes. */
  onSelectionChange?: (selectedElements: readonly any[]) => void;
  initialElements?: readonly any[];
}

export function ExcalidrawCanvas({
  onApiReady,
  onElementsChange,
  onSelectionChange,
  initialElements = [],
}: ExcalidrawCanvasProps) {
  const lastSelectionKey = useRef<string>("");
  const stampedIds = useRef<Set<string>>(new Set());

  const handleExcalidrawAPI = useCallback(
    (api: any) => {
      if (onApiReady && api) onApiReady(api as ExcalidrawImperativeAPI);
    },
    [onApiReady]
  );

  const handleChange = useCallback(
    (elements: readonly any[], appState: any) => {
      // Stamp new user strokes with provenance once (skip already-AI-tagged)
      const stamped = elements.map((el) => {
        if (!el || el.isDeleted) return el;
        const id = String(el.id);
        if (stampedIds.current.has(id)) return el;
        if (getElementSource(el as SceneElementLike) === "ai") {
          stampedIds.current.add(id);
          return el;
        }
        // Only stamp plain user-drawn elements that lack ownership
        if (!el.customData?.drawSource) {
          stampedIds.current.add(id);
          return ensureUserProvenance(el as SceneElementLike);
        }
        stampedIds.current.add(id);
        return el;
      });

      if (onElementsChange) onElementsChange(stamped);

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
          const selected = stamped.filter(
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
            currentItemStrokeColor: "#6366f1",
            gridSize: 20,
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
    </div>
  );
}
