"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ExcalidrawCanvas, ExcalidrawImperativeAPI } from "@/components/canvas/ExcalidrawCanvas";
import { CanvasQueryBar } from "@/components/canvas/CanvasQueryBar";
import { MathPresetLibrary, MathTemplate } from "@/components/math/MathPresetLibrary";
import { SolutionPanel } from "@/components/canvas/SolutionPanel";
import { ApiKeyModal } from "@/components/layout/ApiKeyModal";
import { MathAnalysisResult, AiCanvasElement } from "@/lib/math-parser";
import { Button } from "@/components/ui/button";
import { Sparkles, BookOpen, Pencil } from "lucide-react";
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
} from "@/lib/workspace-store";
import { streamAnalyze } from "@/lib/analyze-client";
import {
  aiElementToExcalidraw,
  appendToScene,
  animateFreedraw,
} from "@/lib/excalidraw-elements";
import {
  buildLayoutMap,
  resolveNonOverlappingDrawings,
  selectionBoundsFromElements,
  summarizeSelection,
  getElementSource,
  ensureUserProvenance,
  type Bounds,
} from "@/lib/canvas-provenance";
import type { AnalysisMode } from "@/lib/prompts/whiteboard-professor";

export default function Home() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  // Multi-page Workspace state
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [activePageId, setActivePageIdState] = useState<string>("page-default-math");
  const [activePage, setActivePage] = useState<WorkspacePage | null>(null);

  // Layout UI Toggles & Modals
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);
  const [isCanvasMaximized, setIsCanvasMaximized] = useState<boolean>(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState<boolean>(false);
  const [userApiKey, setUserApiKey] = useState<string>("");

  // Canvas elements & Chat state
  const [excalidrawElements, setExcalidrawElements] = useState<readonly any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isDrawingLive, setIsDrawingLive] = useState<boolean>(false);
  const [drawStatus, setDrawStatus] = useState<string>("");
  const [currentResult, setCurrentResult] = useState<MathAnalysisResult | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [presetLibraryOpen, setPresetLibraryOpen] = useState<boolean>(false);
  const [selectedElements, setSelectedElements] = useState<readonly any[]>([]);
  const streamAbortRef = useRef<AbortController | null>(null);
  const drawQueueRef = useRef<Promise<void>>(Promise.resolve());
  const aiSessionRef = useRef<string>(`session-${Date.now()}`);
  const placementCtxRef = useRef<{
    occupied: Bounds[];
    suggested: Bounds | null;
    batchResolved: boolean;
    dx: number;
    dy: number;
  }>({ occupied: [], suggested: null, batchResolved: false, dx: 0, dy: 0 });

  // Load initial pages & API key
  useEffect(() => {
    const loadedPages = getSavedPages();
    setPages(loadedPages);
    const activeId = getActivePageId();
    const current = loadedPages.find((p) => p.id === activeId) || loadedPages[0];
    if (current) {
      setActivePageIdState(current.id);
      setActivePage(current);
      setExcalidrawElements((current.strokes as any) || []);
      setMessages(current.messages || []);
    }

    const savedKey = localStorage.getItem("gemini_api_key") || "";
    setUserApiKey(savedKey);
  }, []);

  const handleSaveApiKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem("gemini_api_key", key);
  };

  // Save workspace state
  useEffect(() => {
    if (!activePage) return;
    const updatedPage: WorkspacePage = {
      ...activePage,
      strokes: excalidrawElements as any,
      messages,
      updatedAt: Date.now(),
    };
    savePage(updatedPage);
  }, [excalidrawElements, messages, activePage]);

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
      .map((m) => `${m.sender === "user" ? "User" : "AI"}: ${m.text.slice(0, 160)}`)
      .join("\n");
  }, [messages]);

  // Switch Workspace Page
  const handleSelectPage = (id: string) => {
    setActivePageId(id);
    setActivePageIdState(id);
    const target = pages.find((p) => p.id === id);
    if (target) {
      setActivePage(target);
      const newElements = (target.strokes as any) || [];
      setExcalidrawElements(newElements);
      setMessages(target.messages || []);
      setCurrentResult(null);
      setIsPanelOpen(false);

      if (excalidrawAPI) {
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

  // Export Excalidraw Scene Snapshot as Base64 Data URL
  const exportExcalidrawSnapshot = async (): Promise<string | null> => {
    if (!excalidrawAPI) return null;
    try {
      const elements = excalidrawAPI.getSceneElements();
      if (!elements || elements.length === 0) return null;

      const mod = await import("@excalidraw/excalidraw");
      const blob = await mod.exportToBlob({
        elements,
        appState: {
          ...excalidrawAPI.getAppState(),
          exportWithBackground: true,
          viewBackgroundColor: "#ffffff",
        },
        files: excalidrawAPI.getFiles(),
        mimeType: "image/png",
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
    if (!ctx.occupied.length) return item;

    // Resolve whole-batch offset once using first drawing + suggested slot
    if (!ctx.batchResolved) {
      const [shifted] = resolveNonOverlappingDrawings(
        [item],
        ctx.occupied,
        ctx.suggested
      );
      ctx.dx = shifted.x - item.x;
      ctx.dy = shifted.y - item.y;
      ctx.batchResolved = true;
    }

    const next = {
      ...item,
      x: item.x + ctx.dx,
      y: item.y + ctx.dy,
    };

    // Track newly claimed space so later shapes in this turn don't stack
    ctx.occupied = [
      ...ctx.occupied,
      {
        x: next.x,
        y: next.y,
        width: Math.max(1, next.width || 80),
        height: Math.max(1, next.height || 40),
      },
    ];
    return next;
  }, []);

  /** Queue one AI drawing so stream events animate in order on the canvas. */
  const enqueueLiveDraw = useCallback(
    (item: AiCanvasElement, index: number) => {
      drawQueueRef.current = drawQueueRef.current.then(async () => {
        if (!excalidrawAPI) return;
        setIsDrawingLive(true);
        setDrawStatus(`Drawing ${item.type} #${index + 1}…`);

        const safe = deconflictDrawing(item);
        const built = aiElementToExcalidraw(safe, index, {
          sessionId: aiSessionRef.current,
          role: "explanation",
        });
        for (const el of built) {
          if (el.type === "freedraw") {
            const scene = await animateFreedraw(excalidrawAPI, el, {
              pointDelayMs: 14,
              onFrame: (els) => setExcalidrawElements(els),
            });
            setExcalidrawElements(scene);
          } else {
            const scene = appendToScene(excalidrawAPI, [el]);
            setExcalidrawElements(scene);
            await new Promise((r) => setTimeout(r, 160));
          }
        }
      });
      return drawQueueRef.current;
    },
    [excalidrawAPI, deconflictDrawing]
  );

  /** Fallback: animate a full result's drawings if none streamed mid-flight. */
  const insertAiExplanationOnCanvas = useCallback(
    async (result: MathAnalysisResult) => {
      if (!excalidrawAPI) return;

      let drawings = result.canvasDrawings || [];
      if (drawings.length > 0) {
        drawings = drawings.map((d) => deconflictDrawing(d));
        setIsDrawingLive(true);
        setDrawStatus("Animating explanation on canvas…");
        // progressiveDraw uses aiElementToExcalidraw without session — stamp via map
        const stamped = drawings;
        for (let i = 0; i < stamped.length; i++) {
          setDrawStatus(`Drawing ${stamped[i].type} #${i + 1}…`);
          const built = aiElementToExcalidraw(stamped[i], i, {
            sessionId: aiSessionRef.current,
            role: "explanation",
          });
          for (const el of built) {
            if (el.type === "freedraw") {
              const scene = await animateFreedraw(excalidrawAPI, el, {
                pointDelayMs: 14,
                onFrame: (els) => setExcalidrawElements(els),
              });
              setExcalidrawElements(scene);
            } else {
              const scene = appendToScene(excalidrawAPI, [el]);
              setExcalidrawElements(scene);
              await new Promise((r) => setTimeout(r, 160));
            }
          }
          await new Promise((r) => setTimeout(r, 200));
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

  /** Shared realtime analyze pipeline for canvas button, chat, and selection. */
  const runRealtimeAnalysis = async (opts: {
    promptText?: string;
    imageBase64?: string | null;
    openSolutionPanel?: boolean;
    mode?: AnalysisMode;
    selection?: readonly any[];
    skipUserMessage?: boolean;
  }) => {
    if (isAnalyzing) return;

    if (!userApiKey && !process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      setApiKeyModalOpen(true);
      return;
    }

    streamAbortRef.current?.abort();
    const abort = new AbortController();
    streamAbortRef.current = abort;
    aiSessionRef.current = `session-${Date.now()}`;

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
        ? await exportExcalidrawSnapshot()
        : opts.imageBase64;

    const selBounds = selectionBoundsFromElements(selection);
    const coordinates = selBounds || layout.suggestedPlacement;
    let streamedDrawCount = 0;

    try {
      const result = await streamAnalyze({
        imageBase64: imageBase64 || undefined,
        coordinates,
        promptText: opts.promptText,
        userApiKey,
        existingElementsSummary: layout.summary,
        freeSpaceHints: layout.freeSpaceHints,
        selectionSummary:
          selection.length > 0 ? summarizeSelection(selection) : undefined,
        suggestedPlacement: layout.suggestedPlacement,
        conversationSnippet: getConversationSnippet(),
        mode,
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
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        },
      });

      await drawQueueRef.current;

      if (result && streamedDrawCount === 0) {
        await insertAiExplanationOnCanvas(result);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("Realtime analysis failed:", err);
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes("api key")) {
        setApiKeyModalOpen(true);
      }
      alert(`Gemini AI Error: ${msg}`);
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
    if (!userApiKey && !process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      setApiKeyModalOpen(true);
      return;
    }

    let finalCrop = imageCrop;
    if (!finalCrop) {
      finalCrop = (await exportExcalidrawSnapshot()) || undefined;
    }

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
    await runRealtimeAnalysis({
      promptText: text,
      imageBase64: finalCrop,
      openSolutionPanel: false,
      mode: hasSelection ? "selection" : "followup",
      selection: hasSelection ? selectedElements : [],
    });
  };

  /** Canvas-native query about the current selection (no chat required). */
  const handleCanvasSelectionQuery = async (question: string) => {
    if (selectedElements.length === 0) return;

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
    });
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background font-sans">
      {/* Top Navbar */}
      <Navbar
        sidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        activePageTitle={activePage?.title || "Excalidraw AI Workspace"}
        isAnalyzing={isAnalyzing}
        onAnalyzeCanvas={handleAnalyzeCanvas}
        onOpenPresetLibrary={() => setPresetLibraryOpen(true)}
        hasApiKey={Boolean(userApiKey)}
        onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
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
            onSelectionChange={(selected) => setSelectedElements(selected)}
            initialElements={excalidrawElements}
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
            selectionLabel={
              selectedElements.length > 0
                ? `${selectedElements.filter((e) => getElementSource(e) === "user").length} user · ${selectedElements.filter((e) => getElementSource(e) === "ai").length} AI — append-only answer`
                : undefined
            }
            isAnalyzing={isAnalyzing}
            onAsk={handleCanvasSelectionQuery}
            onDismiss={() => setSelectedElements([])}
          />

          {/* Floating AI Actions Dock */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 p-2 rounded-2xl border bg-background/90 backdrop-blur-xl shadow-2xl">
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
                  : "Analyze Canvas ✨"}
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

          {/* Gemini API Key Configuration Modal */}
          <ApiKeyModal
            open={apiKeyModalOpen}
            onOpenChange={setApiKeyModalOpen}
            onSaveKey={handleSaveApiKey}
            currentKey={userApiKey}
          />
        </main>

        {/* Right LLM Chat & Analysis Panel */}
        {!isCanvasMaximized && (
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendChatMessage}
            onAttachCanvasCrop={() => {
              exportExcalidrawSnapshot().then((crop) => {
                if (crop) handleSendChatMessage("", crop);
              });
              return null;
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
