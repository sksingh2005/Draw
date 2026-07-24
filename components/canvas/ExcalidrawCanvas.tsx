"use client";

import React, { useCallback, useRef } from "react";
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
  onElementsChange?: (elements: readonly ExcalidrawElement[]) => void;
  onSelectionChange?: (selectedElements: readonly ExcalidrawElement[]) => void;
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
}

export function ExcalidrawCanvas({
  initialElements = [],
  onElementsChange,
  onSelectionChange,
  onApiReady,
}: ExcalidrawCanvasProps) {
  const lastSelectionKey = useRef<string>("");
  const lastElementsKey = useRef<string>("");
  const stampedIds = useRef<Set<string>>(new Set());

  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
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
    </div>
  );
}
