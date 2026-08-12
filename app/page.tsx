"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ExcalidrawCanvas, ExcalidrawImperativeAPI } from "@/components/canvas/ExcalidrawCanvas";
import { CanvasQueryBar } from "@/components/canvas/CanvasQueryBar";
import { MathPresetLibrary, MathTemplate } from "@/components/math/MathPresetLibrary";
import { SolutionPanel } from "@/components/canvas/SolutionPanel";
import { MathAnalysisResult, AiCanvasElement } from "@/lib/math-parser";
import { Button } from "@/components/ui/button";
import { Sparkles, BookOpen, Pencil, Eraser, Lock, Unlock, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WorkspacePage,
  ChatMessage,
  getSavedPages,
  savePage,
  createNewPage,
  deletePage,
  getActivePageId,
  setActivePageId,
  exportPageJson,
  exportAllPagesJson,
  parseAndValidateWorkspaceImport,
  getPageElements,
} from "@/lib/workspace-store";
import { streamAnalyze } from "@/lib/analyze-client";
import {
  aiElementToExcalidraw,
  aiIconToExcalidraw,
  animatePencilElement,
  appendToScene,
} from "@/lib/excalidraw-elements";
import { polishCanvasDrawings } from "@/lib/drawing-polish";
import { mermaidToCanvas, resultUsesMermaidCanvas } from "@/lib/mermaid-canvas";
import {
  buildLayoutMap,
  resolveNonOverlappingDrawings,
  findOpenBounds,
  routeConnectorAroundBounds,
  selectionBoundsFromElements,
  summarizeSelection,
  AI_DIAGRAM_KEY,
  ensureUserProvenance,
  filterOnlyUserElements,
  elementBounds,
  setElementsLockState,
  type Bounds,
} from "@/lib/canvas-provenance";
import type { AnalysisMode } from "@/lib/prompts/whiteboard-professor";

export default function Home() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  // Multi-page Workspace state
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [activePageId, setActivePageIdState] = useState<string>("page-default-math");
  const [activePage, setActivePage] = useState<WorkspacePage | null>(null);

  // Layout UI Toggles & Panels
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);
  const [isCanvasMaximized, setIsCanvasMaximized] = useState<boolean>(false);

  // Canvas elements & Chat state
  const [excalidrawElements, setExcalidrawElements] = useState<readonly any[]>([]);
  const [excalidrawFiles, setExcalidrawFiles] = useState<Record<string, Record<string, unknown>>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isDrawingLive, setIsDrawingLive] = useState<boolean>(false);
  const [drawStatus, setDrawStatus] = useState<string>("");
  const [currentResult, setCurrentResult] = useState<MathAnalysisResult | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [presetLibraryOpen, setPresetLibraryOpen] = useState<boolean>(false);
  const [selectedElements, setSelectedElements] = useState<readonly any[]>([]);
  const [liveReveal, setLiveReveal] = useState<{ id: string; elements: readonly any[] } | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const drawQueueRef = useRef<Promise<void>>(Promise.resolve());
  const aiSessionRef = useRef<string>(`session-${Date.now()}`);
  const activeDiagramIdRef = useRef<string | undefined>(undefined);
  const drawingPromptRef = useRef<string | undefined>(undefined);
  const placementCtxRef = useRef<{
    occupied: Bounds[];
    suggested: Bounds | null;
    batchResolved: boolean;
    dx: number;
    dy: number;
  }>({ occupied: [], suggested: null, batchResolved: false, dx: 0, dy: 0 });

  // Load initial pages
  useEffect(() => {
    const loadedPages = getSavedPages();
    setPages(loadedPages);
    const activeId = getActivePageId();
    const current = loadedPages.find((p) => p.id === activeId) || loadedPages[0];
    if (current) {
      setActivePageIdState(current.id);
      setActivePage(current);
      setExcalidrawElements(getPageElements(current) as any);
      setExcalidrawFiles(current.excalidrawFiles || {});
      setMessages(current.messages || []);
    }
  }, []);

  // Save workspace state
  useEffect(() => {
    if (!activePage) return;
    const updatedPage: WorkspacePage = {
      ...activePage,
      excalidrawElements: excalidrawElements as any,
      excalidrawFiles,
      messages,
      updatedAt: Date.now(),
    };
    savePage(updatedPage);
  }, [excalidrawElements, excalidrawFiles, messages, activePage]);

  /** Ownership-tagged layout map + free-space placement for the LLM. */
  const getLayoutContext = useCallback(
    (selection: readonly any[] = []) => {
      const elems = excalidrawAPI?.getSceneElements() || excalidrawElements || [];
      const selectionIds = selection.map((e) => String(e.id));
      const selBounds = selectionBoundsFromElements(selection);
      return buildLayoutMap(elems as any[], {
        selectionIds,
        selectionBounds: selBounds,
        preferredNear: selBounds,
      });
    },
    [excalidrawAPI, excalidrawElements]
  );

  const getConversationSnippet = useCallback(() => {
    return messages
      .slice(-4)
      .map((m) => {
        const line = `${m.sender === "user" ? "User" : "AI"}: ${m.text.slice(0, 160)}`;
        return m.mermaidCode
          ? `${line}\nCurrent portable diagram source:\n${m.mermaidCode.slice(0, 1800)}`
          : line;
      })
      .join("\n");
  }, [messages]);

  // Switch Workspace Page
  const handleSelectPage = (id: string) => {
    setActivePageId(id);
    setActivePageIdState(id);
    const target = pages.find((p) => p.id === id);
    if (target) {
      setActivePage(target);
      const newElements = getPageElements(target) as any;
      setExcalidrawElements(newElements);
      setExcalidrawFiles(target.excalidrawFiles || {});
      setMessages(target.messages || []);
      setCurrentResult(null);
      setIsPanelOpen(false);

      if (excalidrawAPI) {
        excalidrawAPI.addFiles?.(Object.values(target.excalidrawFiles || {}));
        excalidrawAPI.updateScene({ elements: newElements });
      }
    }
  };

  // Create New Workspace Page
  const handleCreateNewPage = (category: WorkspacePage["category"] = "general") => {
    const count = pages.length + 1;
    const newP = createNewPage(`Excalidraw Workspace ${count}`, category);
    setPages(getSavedPages());
    handleSelectPage(newP.id);
  };

  // Delete Workspace Page
  const handleDeletePage = (id: string) => {
    const updated = deletePage(id);
    setPages(updated);
    if (activePageId === id && updated.length > 0) {
      handleSelectPage(updated[0].id);
    }
  };

  // Export Excalidraw Scene Snapshot as Base64 Data URL (Support cropped selection export)
  const exportExcalidrawSnapshot = async (elementsToExport?: readonly any[]): Promise<string | null> => {
    if (!excalidrawAPI) return null;
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const elements = elementsToExport && elementsToExport.length > 0
        ? elementsToExport
        : excalidrawAPI.getSceneElements();

      if (!elements || elements.length === 0) return null;

      const blob = await exportToBlob({
        elements: elements as any,
        appState: {
          ...excalidrawAPI.getAppState(),
          exportBackground: true,
          viewBackgroundColor: "#ffffff",
          exportWithDarkMode: false,
        },
        files: excalidrawAPI.getFiles(),
        mimeType: "image/png",
        exportPadding: 30,
      });

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn("Failed to export Excalidraw snapshot blob:", err);
      return null;
    }
  };

  /** Shift a single drawing into free space if it would overlap occupied content. */
  const deconflictDrawing = useCallback((item: AiCanvasElement): AiCanvasElement => {
    const ctx = placementCtxRef.current;
    
    // Resolve whole-batch offset once using first drawing + suggested slot
    if (!ctx.batchResolved && ctx.occupied.length > 0) {
      const [shifted] = resolveNonOverlappingDrawings(
        [item],
        ctx.occupied,
        ctx.suggested
      );
      ctx.dx = shifted.x - item.x;
      ctx.dy = shifted.y - item.y;
      ctx.batchResolved = true;
    }

    let next = {
      ...item,
      x: item.x + ctx.dx,
      y: item.y + ctx.dy,
    };

    const isConnector = item.type === "arrow" || item.type === "line" || item.type === "freedraw";
    const isNode = item.type === "rectangle" || item.type === "ellipse" || item.type === "diamond";

    // Match the native card builder so collision checks reserve the final space,
    // including the left icon gutter when the model selected an SVG icon.
    let itemWidth = Math.max(isNode ? 252 : 120, next.width || 120);
    let itemHeight = Math.max(isNode ? 108 : 60, next.height || 60);

    if (item.text) {
      const lines = item.text.split("\n");
      const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
      itemWidth = Math.max(itemWidth, Math.min(420, maxLineLen * 9 + (item.icon ? 82 : 40)));
      itemHeight = Math.max(itemHeight, lines.length * 24 + 36);
    }

    if (!isConnector && ctx.occupied.length > 0) {
      const openBounds = findOpenBounds(
        { x: next.x, y: next.y, width: itemWidth, height: itemHeight },
        ctx.occupied,
        24
      );
      next.x = openBounds.x;
      next.y = openBounds.y;
    }

    if ((item.type === "arrow" || item.type === "line") && ctx.occupied.length > 1) {
      const route = routeConnectorAroundBounds(
        { x: next.x, y: next.y },
        { x: next.x + next.width, y: next.y + next.height },
        ctx.occupied
      );
      if (route) {
        next = { ...next, ...route };
      }
    }

    // Register container shapes in occupied tracking
    if (!isConnector) {
      ctx.occupied.push({
        x: next.x,
        y: next.y,
        width: itemWidth,
        height: itemHeight,
      });
    }

    return next;
  }, []);

  /** Queue one AI drawing so stream events animate in order on the canvas. */
  const enqueueLiveDraw = useCallback(
    (item: AiCanvasElement, index: number) => {
      drawQueueRef.current = drawQueueRef.current.then(async () => {
        if (!excalidrawAPI) return;
        setIsDrawingLive(true);
        setDrawStatus(`Building visual step ${index + 1}…`);

        const [polished = item] = polishCanvasDrawings([item], {
          promptText: drawingPromptRef.current,
        });
        const safe = deconflictDrawing(polished);
        let built = aiElementToExcalidraw(safe, index, {
          sessionId: aiSessionRef.current,
          role: "explanation",
          diagramId: activeDiagramIdRef.current,
        });
        const iconAsset = aiIconToExcalidraw(safe, built, index, {
          sessionId: aiSessionRef.current,
          role: "explanation",
          diagramId: activeDiagramIdRef.current,
        });
        if (iconAsset) {
          excalidrawAPI.addFiles?.([iconAsset.file]);
          built = [...built, iconAsset.element];
        }
        const freehand = built.length === 1 && built[0].type === "freedraw";
        if (freehand) {
          const scene = await animatePencilElement(excalidrawAPI, built[0], {
            pointDelayMs: 16,
            onFrame: (els) => setExcalidrawElements(els),
          });
          setExcalidrawElements(scene);
        } else {
          setLiveReveal({ id: `reveal-${Date.now()}-${index}`, elements: built });
          await new Promise((resolve) => setTimeout(resolve, 230));
          const scene = appendToScene(excalidrawAPI, built);
          setExcalidrawElements(scene);
          setLiveReveal(null);
        }
        await new Promise((resolve) => setTimeout(resolve, 36));
      });
      return drawQueueRef.current;
    },
    [excalidrawAPI, deconflictDrawing]
  );

  /** Fallback: animate a full result's drawings if none streamed mid-flight. */
  const insertAiExplanationOnCanvas = useCallback(
    async (result: MathAnalysisResult) => {
      if (!excalidrawAPI) return;

      let drawings = polishCanvasDrawings(result.canvasDrawings, {
        classification: result.classification,
        origin: getLayoutContext().suggestedPlacement,
      });
      if (drawings.length > 0) {
        drawings = drawings.map((d) => deconflictDrawing(d));
        setIsDrawingLive(true);
        setDrawStatus("Animating explanation on canvas…");
        const stamped = drawings;
        for (let i = 0; i < stamped.length; i++) {
          setDrawStatus(`Building visual step ${i + 1}…`);
          let built = aiElementToExcalidraw(stamped[i], i, {
            sessionId: aiSessionRef.current,
            role: "explanation",
            diagramId: activeDiagramIdRef.current,
          });
          const iconAsset = aiIconToExcalidraw(stamped[i], built, i, {
            sessionId: aiSessionRef.current,
            role: "explanation",
            diagramId: activeDiagramIdRef.current,
          });
          if (iconAsset) {
            excalidrawAPI.addFiles?.([iconAsset.file]);
            built = [...built, iconAsset.element];
          }
          const freehand = built.length === 1 && built[0].type === "freedraw";
          if (freehand) {
            const scene = await animatePencilElement(excalidrawAPI, built[0], {
              pointDelayMs: 16,
              onFrame: (els) => setExcalidrawElements(els),
            });
            setExcalidrawElements(scene);
          } else {
            setLiveReveal({ id: `reveal-${Date.now()}-${i}`, elements: built });
            await new Promise((resolve) => setTimeout(resolve, 230));
            const scene = appendToScene(excalidrawAPI, built);
            setExcalidrawElements(scene);
            setLiveReveal(null);
          }
          await new Promise((resolve) => setTimeout(resolve, 36));
        }
        setIsDrawingLive(false);
        setDrawStatus("");
        return;
      }

      // Minimal free-space fallback when model omitted canvasDrawings
      const layout = getLayoutContext();
      const targetX = layout.suggestedPlacement.x;
      const targetY = layout.suggestedPlacement.y;

      const fallback: AiCanvasElement[] = [
        {
          type: "rectangle",
          x: targetX,
          y: targetY,
          width: 320,
          height: 160,
          strokeColor: "#6366f1",
          backgroundColor: "#e0e7ff",
          fillStyle: "hachure",
          text: `✨ ${result.summary || "AI explanation"}\n${result.focusNote || "Appended in free space (no rewrite)."}`,
        },
      ];

      setIsDrawingLive(true);
      for (let i = 0; i < fallback.length; i++) {
        await enqueueLiveDraw(fallback[i], i);
      }
      await drawQueueRef.current;
      setIsDrawingLive(false);
      setDrawStatus("");
    },
    [excalidrawAPI, deconflictDrawing, getLayoutContext, enqueueLiveDraw]
  );

  /**
   * Turn a portable Mermaid definition into native, editable Excalidraw
   * elements. Re-rendering a saved source replaces only that AI diagram.
   */
  const insertMermaidOnCanvas = useCallback(
    async (source: string, diagramId: string, replaceExisting = false) => {
      if (!excalidrawAPI) throw new Error("Canvas is not ready yet.");

      setIsDrawingLive(true);
      setDrawStatus("Auto-layouting nodes and connectors…");

      const scene = excalidrawAPI.getSceneElements().filter((element: any) => !element.isDeleted);
      const existingDiagram = scene.filter(
        (element: any) => element.customData?.[AI_DIAGRAM_KEY] === diagramId
      );
      const existingBounds = selectionBoundsFromElements(existingDiagram);
      const retainedScene = replaceExisting
        ? scene.filter((element: any) => element.customData?.[AI_DIAGRAM_KEY] !== diagramId)
        : scene;
      const placement =
        (replaceExisting && existingBounds) || getLayoutContext().suggestedPlacement;

      const generated = await mermaidToCanvas(source, placement, {
        sessionId: aiSessionRef.current,
        diagramId,
        occupied: retainedScene.map(elementBounds),
      });
      const files = Object.values(generated.files);
      if (files.length) {
        excalidrawAPI.addFiles?.(files);
        setExcalidrawFiles((current) => ({ ...current, ...generated.files }));
      }

      const nextScene = [...retainedScene, ...generated.elements];
      excalidrawAPI.updateScene({ elements: nextScene });
      setExcalidrawElements(nextScene);
      setSelectedElements(generated.elements);

      // Show the complete graph at a readable zoom instead of leaving newly
      // generated content outside the current viewport.
      excalidrawAPI.scrollToContent?.(generated.elements, {
        fitToContent: true,
        viewportZoomFactor: 0.82,
        minZoom: 0.2,
        maxZoom: 1,
        animate: true,
        duration: 420,
      });
      setIsDrawingLive(false);
      setDrawStatus("");
    },
    [excalidrawAPI, getLayoutContext]
  );

  /** Shared realtime analyze pipeline for canvas button, chat, and selection. */
  const runRealtimeAnalysis = async (opts: {
    promptText?: string;
    imageBase64?: string | null;
    openSolutionPanel?: boolean;
    mode?: AnalysisMode;
    selection?: readonly any[];
    skipUserMessage?: boolean;
    diagramId?: string;
    diagramTitle?: string;
  }) => {
    if (isAnalyzing) return;

    streamAbortRef.current?.abort();
    const abort = new AbortController();
    streamAbortRef.current = abort;
    aiSessionRef.current = `session-${Date.now()}`;
    const diagramId = opts.diagramId || `diagram-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeDiagramIdRef.current = diagramId;
    drawingPromptRef.current = opts.promptText;

    const selection = opts.selection || [];
    const mode: AnalysisMode =
      opts.mode ||
      (selection.length > 0
        ? "selection"
        : opts.promptText?.trim()
          ? "followup"
          : "full");

    setIsAnalyzing(true);
    setDrawStatus(
      mode === "selection"
        ? "Focusing on selection…"
        : mode === "followup"
          ? "Preparing targeted update…"
          : "Preparing canvas snapshot…"
    );
    drawQueueRef.current = Promise.resolve();

    const layout = getLayoutContext(selection);
    placementCtxRef.current = {
      occupied: [...layout.occupied],
      suggested: layout.suggestedPlacement,
      batchResolved: false,
      dx: 0,
      dy: 0,
    };

    const imageBase64 =
      opts.imageBase64 === undefined
        ? await exportExcalidrawSnapshot(selection.length > 0 ? selection : undefined)
        : opts.imageBase64;

    const selBounds = selectionBoundsFromElements(selection);
    const coordinates = selBounds || layout.suggestedPlacement;
    let streamedDrawCount = 0;
    let renderedMermaid = false;

    try {
      const result = await streamAnalyze({
        imageBase64: imageBase64 || undefined,
        coordinates,
        promptText: opts.promptText,
        existingElementsSummary: layout.summary,
        freeSpaceHints: layout.freeSpaceHints,
        selectionSummary:
          selection.length > 0 ? summarizeSelection(selection) : undefined,
        suggestedPlacement: layout.suggestedPlacement,
        conversationSnippet: getConversationSnippet(),
        mode,
        diagramId,
        diagramTitle: opts.diagramTitle,
        signal: abort.signal,
        onEvent: async (event) => {
          if (event.type === "status") {
            setDrawStatus(event.message);
            if (
              event.message.toLowerCase().includes("drawing") ||
              event.message.toLowerCase().includes("append")
            ) {
              setIsDrawingLive(true);
            }
          } else if (event.type === "draw") {
            streamedDrawCount++;
            await enqueueLiveDraw(event.element, event.index);
          } else if (event.type === "result") {
            if (resultUsesMermaidCanvas(event.data) && event.data.mermaidCode) {
              try {
                await insertMermaidOnCanvas(event.data.mermaidCode, diagramId);
                renderedMermaid = true;
              } catch (error) {
                console.warn("Mermaid auto-layout failed; using primitive fallback:", error);
                setDrawStatus("Auto-layout failed; drawing safe fallback…");
              }
            }
            setCurrentResult(event.data);
            if (opts.openSolutionPanel) setIsPanelOpen(true);

            const focusPrefix = event.data.focusNote
              ? `📍 ${event.data.focusNote}\n\n`
              : "";
            const assistantMsg: ChatMessage = {
              id: `msg-${Date.now()}`,
              sender: "assistant",
              text: `${focusPrefix}${event.data.summary}`,
              imageCrop: imageBase64 || undefined,
              analysisResult: event.data,
              diagramId,
              diagramTitle: event.data.diagramTitle,
              mermaidCode: event.data.mermaidCode,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        },
      });

      await drawQueueRef.current;

      if (result && streamedDrawCount === 0 && !renderedMermaid) {
        await insertAiExplanationOnCanvas(result);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("Realtime analysis failed:", err);
      const msg = err?.message || String(err);
      alert(`OpenAI Error: ${msg}`);
    } finally {
      setIsAnalyzing(false);
      setIsDrawingLive(false);
      setDrawStatus("");
    }
  };

  // Trigger Canvas Spatial AI Analysis (floating dock button)
  const handleAnalyzeCanvas = async () => {
    await runRealtimeAnalysis({ openSolutionPanel: true, mode: "full" });
  };

  // Send Text Question in Right Chat Panel
  const handleSendChatMessage = async (text: string, imageCrop?: string) => {
    let finalCrop = imageCrop;
    if (!finalCrop) {
      finalCrop = (await exportExcalidrawSnapshot()) || undefined;
    }

    const diagramId = `diagram-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      imageCrop: finalCrop,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // If user has a canvas selection, treat chat as a selection follow-up
    const hasSelection = selectedElements.length > 0;
    const hasCanvasContent = (excalidrawAPI?.getSceneElements() || excalidrawElements)
      .some((element: any) => !element.isDeleted);
    await runRealtimeAnalysis({
      promptText: text,
      imageBase64: finalCrop,
      openSolutionPanel: false,
      mode: hasSelection ? "selection" : hasCanvasContent ? "followup" : "full",
      selection: hasSelection ? selectedElements : [],
      diagramId,
      diagramTitle: text.trim().slice(0, 72) || "Canvas update",
    });
  };

  /** Canvas-native query about the current selection (no chat required). */
  const handleCanvasSelectionQuery = async (question: string) => {
    if (selectedElements.length === 0) return;

    const diagramId = `diagram-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: `📌 [Canvas selection · ${selectedElements.length} element(s)] ${question}`,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    await runRealtimeAnalysis({
      promptText: question,
      mode: "selection",
      selection: selectedElements,
      openSolutionPanel: false,
      diagramId,
      diagramTitle: question.slice(0, 72),
    });
  };

  /** Re-select every native canvas element belonging to a previous AI diagram. */
  const handleFocusDiagram = (diagramId: string) => {
    if (!excalidrawAPI) return;
    const matching = excalidrawAPI
      .getSceneElements()
      .filter(
        (element: any) =>
          !element.isDeleted && element.customData?.[AI_DIAGRAM_KEY] === diagramId
      );
    if (!matching.length) return;

    const selectedElementIds = Object.fromEntries(
      matching.map((element: any) => [String(element.id), true])
    );
    excalidrawAPI.updateScene({ appState: { selectedElementIds } });
    setSelectedElements(matching);
    excalidrawAPI.scrollToContent?.(matching, { fitToContent: true });
  };

  const handleRenderMermaid = async (source: string, diagramId: string, messageId: string) => {
    aiSessionRef.current = `session-${Date.now()}`;
    try {
      await insertMermaidOnCanvas(source, diagramId, true);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                mermaidCode: source,
                analysisResult: message.analysisResult
                  ? { ...message.analysisResult, mermaidCode: source }
                  : message.analysisResult,
              }
            : message
        )
      );
    } finally {
      setIsDrawingLive(false);
      setDrawStatus("");
    }
  };

  // Insert Formula Preset into Excalidraw Scene
  const handleSelectTemplate = (template: MathTemplate) => {
    if (!excalidrawAPI) return;
    const currentElems = excalidrawAPI.getSceneElements();

    const newTextElement = {
      id: `elem-${Date.now()}`,
      type: "text",
      x: 200 + Math.random() * 80,
      y: 180 + Math.random() * 60,
      width: 260,
      height: 40,
      angle: 0,
      strokeColor: "#6366f1",
      backgroundColor: "transparent",
      fillStyle: "hachure",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: Math.floor(Math.random() * 100000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 100000),
      isDeleted: false,
      text: `${template.name}\n${template.latex}`,
      fontSize: 20,
      fontFamily: 1,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: null,
      originalText: `${template.name}\n${template.latex}`,
      lineHeight: 1.25,
    };

    const stamped = ensureUserProvenance(newTextElement as any);
    const updated = [...currentElems, stamped];
    excalidrawAPI.updateScene({ elements: updated as any });
    setExcalidrawElements(updated);
  };

  // Clear Canvas
  const handleClearAll = () => {
    if (excalidrawAPI) {
      excalidrawAPI.resetScene();
    }
    setExcalidrawElements([]);
    setCurrentResult(null);
    setIsPanelOpen(false);
  };

  const handleExportPage = () => {
    if (!activePage) return;
    const currentElements = excalidrawAPI ? excalidrawAPI.getSceneElements() : excalidrawElements;
    const pageToExport: WorkspacePage = {
      ...activePage,
      excalidrawElements: currentElements as any,
      messages,
      updatedAt: Date.now(),
    };
    exportPageJson(pageToExport);
  };

  const handleExportAll = () => {
    const currentElements = excalidrawAPI ? excalidrawAPI.getSceneElements() : excalidrawElements;
    const updatedPages = pages.map((p) =>
      p.id === activePageId
        ? {
            ...p,
            excalidrawElements: currentElements as any,
            messages,
            updatedAt: Date.now(),
          }
        : p
    );
    exportAllPagesJson(updatedPages);
  };

  const handleImportWorkspace = async (file: File) => {
    try {
      const text = await file.text();
      const importedPages = parseAndValidateWorkspaceImport(text);
      
      importedPages.forEach((p) => savePage(p));
      const allPages = getSavedPages();
      setPages(allPages);

      const firstImported = importedPages[0];
      if (firstImported) {
        handleSelectPage(firstImported.id);
      }
    } catch (err: any) {
      alert(`Import Failed: ${err?.message || "Invalid JSON file"}`);
    }
  };

  const [isUserLocked, setIsUserLocked] = useState(false);

  const handleClearAiOnly = () => {
    if (!excalidrawAPI) return;
    const currentElems = excalidrawAPI.getSceneElements();
    const userOnly = filterOnlyUserElements(currentElems);
    excalidrawAPI.updateScene({ elements: userOnly as any });
    setExcalidrawElements(userOnly);
  };

  const handleToggleLockUserLayers = () => {
    if (!excalidrawAPI) return;
    const nextLockState = !isUserLocked;
    setIsUserLocked(nextLockState);
    const currentElems = excalidrawAPI.getSceneElements();
    const updated = setElementsLockState(currentElems, "user", nextLockState);
    excalidrawAPI.updateScene({ elements: updated as any });
    setExcalidrawElements(updated);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background font-sans">
      {/* Top Navbar */}
      <Navbar
        sidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        activePageTitle={activePage?.title || "Excalidraw AI Workspace"}
        onToggleChat={() => setIsChatOpen((prev) => !prev)}
        isMaximized={isCanvasMaximized}
        onToggleMaximize={() => setIsCanvasMaximized((prev) => !prev)}
        onExportPage={handleExportPage}
        onExportAll={handleExportAll}
        onImportJson={handleImportWorkspace}
      />

      {/* Main 3-Pane Responsive Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Pages & History */}
        {!isCanvasMaximized && (
          <Sidebar
            pages={pages}
            activePageId={activePageId}
            onSelectPage={handleSelectPage}
            onCreateNewPage={handleCreateNewPage}
            onDeletePage={handleDeletePage}
            isOpen={isSidebarOpen}
            onToggleOpen={() => setIsSidebarOpen((prev) => !prev)}
          />
        )}

        {/* Center Excalidraw Engine Viewport */}
        <main className="flex-1 relative w-full h-full overflow-hidden flex flex-col">
          <ExcalidrawCanvas
            onApiReady={(api) => setExcalidrawAPI(api)}
            onElementsChange={(elems) => setExcalidrawElements(elems)}
            onFilesChange={(files) => setExcalidrawFiles(files)}
            onSelectionChange={(selected) => setSelectedElements(selected)}
            initialElements={excalidrawElements}
            initialFiles={excalidrawFiles}
            liveReveal={liveReveal}
          />

          {/* Live AI drawing status pill */}
          {(isAnalyzing || isDrawingLive) && drawStatus && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/30 bg-background/95 backdrop-blur-xl shadow-lg text-xs font-medium text-indigo-600 dark:text-indigo-300">
                {isDrawingLive ? (
                  <Pencil className="w-3.5 h-3.5 animate-pulse" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>{drawStatus}</span>
                {isDrawingLive && (
                  <span className="inline-flex gap-0.5 ml-1">
                    <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce [animation-delay:120ms]" />
                    <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce [animation-delay:240ms]" />
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Provenance legend */}
          <div className="absolute top-4 left-4 z-30 pointer-events-none">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border bg-background/90 backdrop-blur text-[10px] font-medium text-muted-foreground shadow-sm">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-slate-500" /> USER
              </span>
              <span className="text-border">|</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-indigo-500" /> AI
              </span>
              <span className="hidden sm:inline text-[10px] opacity-80">
                · select → ask without rewriting board
              </span>
            </div>
          </div>

          {/* Canvas-native selection query */}
          <CanvasQueryBar
            selectedCount={selectedElements.length}
            isAnalyzing={isAnalyzing}
            onSendQuery={handleCanvasSelectionQuery}
            onClearSelection={() => setSelectedElements([])}
          />

          {/* Floating AI Actions Dock */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur-xl transition-[bottom] duration-200 ${
              selectedElements.length > 0 ? "bottom-24" : "bottom-5"
            }`}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-xl text-muted-foreground"
                    title="Canvas actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="center" className="w-44">
                <DropdownMenuItem onClick={handleToggleLockUserLayers} className="gap-2 text-xs">
                  {isUserLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  {isUserLocked ? "Unlock user layers" : "Lock user layers"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleClearAiOnly}
                  className="gap-2 text-xs text-destructive focus:text-destructive"
                >
                  <Eraser className="size-3.5" /> Clear AI annotations
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPresetLibraryOpen(true)}
              className="rounded-xl text-xs gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> Formulas
            </Button>

            <Button
              onClick={handleAnalyzeCanvas}
              disabled={isAnalyzing}
              className="rounded-xl font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/25 gap-2 text-xs px-4"
            >
              <Sparkles className={`w-4 h-4 ${isAnalyzing ? "animate-spin" : "animate-bounce"}`} />
              {isDrawingLive
                ? "Drawing live…"
                : isAnalyzing
                  ? "Analyzing…"
                  : "Analyze canvas"}
            </Button>
          </div>

          {/* Sliding Solution & Problem Breakdown Panel */}
          <SolutionPanel
            result={currentResult}
            open={isPanelOpen}
            onClose={() => setIsPanelOpen(false)}
          />

          {/* Formula Preset Dialog */}
          <MathPresetLibrary
            open={presetLibraryOpen}
            onOpenChange={setPresetLibraryOpen}
            onSelectTemplate={handleSelectTemplate}
          />

        </main>

        {/* Right LLM Chat & Analysis Panel */}
        {!isCanvasMaximized && (
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendChatMessage}
            onFocusDiagram={handleFocusDiagram}
            onRenderMermaid={handleRenderMermaid}
            onAttachCanvasCrop={async () => {
              const target = selectedElements.length > 0 ? selectedElements : undefined;
              return exportExcalidrawSnapshot(target);
            }}
            isOpen={isChatOpen}
            onToggleOpen={() => setIsChatOpen((prev) => !prev)}
            isAnalyzing={isAnalyzing}
          />
        )}
      </div>
    </div>
  );
}
