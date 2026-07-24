"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ExcalidrawCanvas, ExcalidrawImperativeAPI } from "@/components/canvas/ExcalidrawCanvas";
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
} from "@/lib/workspace-store";
import { streamAnalyze } from "@/lib/analyze-client";
import {
  progressiveDrawOnCanvas,
  aiElementToExcalidraw,
  appendToScene,
  animateFreedraw,
} from "@/lib/excalidraw-elements";

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
  const streamAbortRef = useRef<AbortController | null>(null);
  const drawQueueRef = useRef<Promise<void>>(Promise.resolve());

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

  // Extract compact layout summary of existing canvas elements
  const getExistingElementsSummary = useCallback((): string => {
    if (!excalidrawAPI) return "";
    const elems = excalidrawAPI.getSceneElements();
    if (!elems || elems.length === 0) return "Canvas is empty.";

    return elems
      .filter((e: any) => !e.isDeleted)
      .map((e: any, idx: number) => {
        const textSnippet = e.text ? ` text="${e.text.slice(0, 30)}..."` : "";
        return `[Elem ${idx + 1}]: id="${e.id}" type="${e.type}" bounds=[x:${Math.round(e.x)}, y:${Math.round(e.y)}, w:${Math.round(e.width || 0)}, h:${Math.round(e.height || 0)}]${textSnippet}`;
      })
      .join("\n");
  }, [excalidrawAPI]);

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

  /** Queue one AI drawing so stream events animate in order on the canvas. */
  const enqueueLiveDraw = useCallback(
    (item: AiCanvasElement, index: number) => {
      drawQueueRef.current = drawQueueRef.current.then(async () => {
        if (!excalidrawAPI) return;
        setIsDrawingLive(true);
        setDrawStatus(`Drawing ${item.type} #${index + 1}…`);

        const built = aiElementToExcalidraw(item, index);
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
    [excalidrawAPI]
  );

  /** Fallback: animate a full result's drawings if none streamed mid-flight. */
  const insertAiExplanationOnCanvas = useCallback(
    async (result: MathAnalysisResult) => {
      if (!excalidrawAPI) return;

      const drawings = result.canvasDrawings;
      if (drawings && drawings.length > 0) {
        setIsDrawingLive(true);
        setDrawStatus("Animating explanation on canvas…");
        await progressiveDrawOnCanvas(excalidrawAPI, drawings, {
          shapeDelayMs: 220,
          pointDelayMs: 14,
          onSceneUpdate: (els) => setExcalidrawElements(els),
          onDrawStart: (item, idx) =>
            setDrawStatus(`Drawing ${item.type} #${idx + 1}…`),
        });
        setIsDrawingLive(false);
        setDrawStatus("");
        return;
      }

      // Hardcoded visual fallback when model omitted canvasDrawings
      let rightmostX = 150;
      let topY = 150;
      excalidrawAPI.getSceneElements().forEach((e: any) => {
        if (!e.isDeleted) {
          const rightEdge = (e.x || 0) + (e.width || 0);
          if (rightEdge > rightmostX) rightmostX = rightEdge;
          if (e.y && e.y < topY) topY = e.y;
        }
      });
      const targetX = rightmostX + 60;
      const targetY = topY;

      const fallback: AiCanvasElement[] = [
        {
          type: "freedraw",
          x: targetX,
          y: targetY,
          width: 180,
          height: 120,
          strokeColor: "#6366f1",
          strokeWidth: 3,
          points: [
            [0, 110],
            [20, 65],
            [40, 30],
            [60, 10],
            [80, 0],
            [100, 10],
            [120, 30],
            [140, 65],
            [160, 110],
          ],
        },
        {
          type: "arrow",
          x: targetX - 30,
          y: targetY + 70,
          width: 220,
          height: 0,
          strokeColor: "#94a3b8",
          strokeStyle: "dashed",
        },
        {
          type: "ellipse",
          x: targetX + 10,
          y: targetY + 55,
          width: 32,
          height: 32,
          strokeColor: "#ef4444",
          backgroundColor: "#fee2e2",
        },
        {
          type: "ellipse",
          x: targetX + 118,
          y: targetY + 55,
          width: 32,
          height: 32,
          strokeColor: "#ef4444",
          backgroundColor: "#fee2e2",
        },
        {
          type: "arrow",
          x: targetX + 180,
          y: targetY + 40,
          width: 80,
          height: 0,
          strokeColor: "#3b82f6",
        },
        {
          type: "rectangle",
          x: targetX + 280,
          y: targetY - 20,
          width: 350,
          height: 230,
          strokeColor: "#6366f1",
          backgroundColor: "#e0e7ff",
          fillStyle: "hachure",
          text: `✨ Visual Lesson: Quadratic Roots\nStandard Form: ax² + bx + c = 0\n\nQuadratic Formula:\nx = (-b ± √(b² - 4ac)) / (2a)\n\nDiscriminant D = b² - 4ac:\n• D > 0: 2 Real Roots\n• D = 0: 1 Repeated Root\n• D < 0: Complex Roots`,
        },
      ];

      setIsDrawingLive(true);
      await progressiveDrawOnCanvas(excalidrawAPI, fallback, {
        shapeDelayMs: 240,
        pointDelayMs: 14,
        onSceneUpdate: (els) => setExcalidrawElements(els),
      });
      setIsDrawingLive(false);
      setDrawStatus("");
    },
    [excalidrawAPI]
  );

  /** Shared realtime analyze pipeline for canvas button + chat. */
  const runRealtimeAnalysis = async (opts: {
    promptText?: string;
    imageBase64?: string | null;
    openSolutionPanel?: boolean;
  }) => {
    if (isAnalyzing) return;

    if (!userApiKey && !process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      setApiKeyModalOpen(true);
      return;
    }

    streamAbortRef.current?.abort();
    const abort = new AbortController();
    streamAbortRef.current = abort;

    setIsAnalyzing(true);
    setDrawStatus("Preparing canvas snapshot…");
    drawQueueRef.current = Promise.resolve();

    const imageBase64 =
      opts.imageBase64 === undefined
        ? await exportExcalidrawSnapshot()
        : opts.imageBase64;
    const existingSummary = getExistingElementsSummary();
    let streamedDrawCount = 0;

    try {
      const result = await streamAnalyze({
        imageBase64: imageBase64 || undefined,
        coordinates: { x: 100, y: 100, width: 400, height: 300 },
        promptText: opts.promptText,
        userApiKey,
        existingElementsSummary: existingSummary,
        signal: abort.signal,
        onEvent: async (event) => {
          if (event.type === "status") {
            setDrawStatus(event.message);
            if (event.message.toLowerCase().includes("drawing")) {
              setIsDrawingLive(true);
            }
          } else if (event.type === "draw") {
            streamedDrawCount++;
            await enqueueLiveDraw(event.element, event.index);
          } else if (event.type === "result") {
            setCurrentResult(event.data);
            if (opts.openSolutionPanel) setIsPanelOpen(true);

            const assistantMsg: ChatMessage = {
              id: `msg-${Date.now()}`,
              sender: "assistant",
              text: event.data.summary,
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

      // Wait for in-flight pencil animations to finish
      await drawQueueRef.current;

      // If the model never streamed drawings mid-flight, animate full set now
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
    await runRealtimeAnalysis({ openSolutionPanel: true });
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

    await runRealtimeAnalysis({
      promptText: text,
      imageBase64: finalCrop,
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

    const updated = [...currentElems, newTextElement];
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTitle={activePage?.title || "Excalidraw AI Workspace"}
        isMaximized={isCanvasMaximized}
        onToggleMaximize={() => setIsCanvasMaximized((prev) => !prev)}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onToggleChat={() => setIsChatOpen((prev) => !prev)}
        onOpenPresets={() => setPresetLibraryOpen(true)}
        onClearCanvas={handleClearAll}
        onExportCanvas={async () => {
          const crop = await exportExcalidrawSnapshot();
          if (!crop) return;
          const link = document.createElement("a");
          link.download = `excalidraw-${Date.now()}.png`;
          link.href = crop;
          link.click();
        }}
        onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
        hasApiKey={Boolean(userApiKey)}
        analysisCount={messages.length}
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
