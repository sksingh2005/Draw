"use client";

import React, { useCallback } from "react";
import dynamic from "next/dynamic";

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
  initialElements?: readonly any[];
}

export function ExcalidrawCanvas({
  onApiReady,
  onElementsChange,
  initialElements = [],
}: ExcalidrawCanvasProps) {
  const handleExcalidrawAPI = useCallback(
    (api: any) => {
      if (onApiReady && api) onApiReady(api as ExcalidrawImperativeAPI);
    },
    [onApiReady]
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
        onChange={(elements, appState) => {
          if (onElementsChange) onElementsChange(elements);
        }}
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
