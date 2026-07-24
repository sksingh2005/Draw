"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ExcalidrawCanvas, ExcalidrawImperativeAPI } from "@/components/canvas/ExcalidrawCanvas";
import { MathPresetLibrary, MathTemplate } from "@/components/math/MathPresetLibrary";
import { SolutionPanel } from "@/components/canvas/SolutionPanel";
import { ApiKeyModal } from "@/components/layout/ApiKeyModal";
import { MathAnalysisResult } from "@/lib/math-parser";
import { Button } from "@/components/ui/button";
import { Sparkles, BookOpen } from "lucide-react";
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
  const [currentResult, setCurrentResult] = useState<MathAnalysisResult | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [presetLibraryOpen, setPresetLibraryOpen] = useState<boolean>(false);

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

  // Trigger Canvas Spatial AI Analysis
  const handleAnalyzeCanvas = async () => {
    if (isAnalyzing) return;

    if (!userApiKey && !process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      setApiKeyModalOpen(true);
      return;
    }

    setIsAnalyzing(true);
    const imageBase64 = await exportExcalidrawSnapshot();
    const existingSummary = getExistingElementsSummary();

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-api-key": userApiKey,
        },
        body: JSON.stringify({
          imageBase64: imageBase64 || undefined,
          coordinates: { x: 100, y: 100, width: 400, height: 300 },
          userApiKey,
          existingElementsSummary: existingSummary,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const resultData: MathAnalysisResult = json.data;
        setCurrentResult(resultData);
        setIsPanelOpen(true);

        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          sender: "assistant",
          text: `Analyzed Excalidraw canvas: **${resultData.summary}**`,
          imageCrop: imageBase64 || undefined,
          analysisResult: resultData,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        insertAiExplanationOnCanvas(resultData);
      } else if (json.error) {
        alert(`Gemini AI Error: ${json.error}`);
        setApiKeyModalOpen(true);
      }
    } catch (err: any) {
      console.error("Failed to analyze Excalidraw canvas:", err);
      alert(`Gemini API error: ${err.message || err}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Helper to place AI visual drawings (shapes, arrows, ellipses, callout boxes) directly on Excalidraw Canvas
  const insertAiExplanationOnCanvas = (result: MathAnalysisResult) => {
    if (!excalidrawAPI) return;
    const currentElems = excalidrawAPI.getSceneElements();

    const newExcalidrawElements: any[] = [];
    const baseId = Date.now();

    if (result.canvasDrawings && result.canvasDrawings.length > 0) {
      result.canvasDrawings.forEach((item, idx) => {
        const elemId = `ai-elem-${baseId}-${idx}`;

        if (item.type === "rectangle" || item.type === "diamond") {
          newExcalidrawElements.push({
            id: elemId,
            type: item.type,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            angle: 0,
            strokeColor: item.strokeColor || "#6366f1",
            backgroundColor: item.backgroundColor || "#e0e7ff",
            fillStyle: item.fillStyle || "hachure",
            strokeWidth: 2,
            strokeStyle: "solid",
            roughness: 1,
            opacity: 100,
            groupIds: [],
            frameId: null,
            roundness: { type: 3 },
            seed: Math.floor(Math.random() * 100000),
            version: 1,
            versionNonce: Math.floor(Math.random() * 100000),
            isDeleted: false,
          });

          if (item.text) {
            newExcalidrawElements.push({
              id: `ai-text-${baseId}-${idx}`,
              type: "text",
              x: item.x + 16,
              y: item.y + 16,
              width: item.width - 32,
              height: item.height - 32,
              angle: 0,
              strokeColor: "#1e1b4b",
              backgroundColor: "transparent",
              fillStyle: "hachure",
              strokeWidth: 1,
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
              text: item.text,
              fontSize: 16,
              fontFamily: 1,
              textAlign: "left",
              verticalAlign: "top",
              containerId: elemId,
              originalText: item.text,
              lineHeight: 1.25,
            });
          }
        } else if (item.type === "ellipse") {
          newExcalidrawElements.push({
            id: elemId,
            type: "ellipse",
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            angle: 0,
            strokeColor: item.strokeColor || "#ef4444",
            backgroundColor: item.backgroundColor || "transparent",
            fillStyle: item.fillStyle || "hachure",
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
          });
        } else if (item.type === "arrow") {
          newExcalidrawElements.push({
            id: elemId,
            type: "arrow",
            x: item.x,
            y: item.y,
            width: Math.abs(item.width),
            height: Math.abs(item.height),
            angle: 0,
            strokeColor: item.strokeColor || "#3b82f6",
            backgroundColor: "transparent",
            fillStyle: "hachure",
            strokeWidth: 2,
            strokeStyle: "solid",
            roughness: 1,
            opacity: 100,
            groupIds: [],
            frameId: null,
            roundness: { type: 2 },
            seed: Math.floor(Math.random() * 100000),
            version: 1,
            versionNonce: Math.floor(Math.random() * 100000),
            isDeleted: false,
            points: [
              [0, 0],
              [item.width || 120, item.height || 0],
            ],
            startBinding: null,
            endBinding: null,
            startArrowhead: null,
            endArrowhead: "arrow",
          });
        }
      });
    } else {
      // Calculate smart anchor coordinates (rightmost edge of existing elements)
      let rightmostX = 150;
      let topY = 150;
      currentElems.forEach((e: any) => {
        if (!e.isDeleted) {
          const rightEdge = (e.x || 0) + (e.width || 0);
          if (rightEdge > rightmostX) rightmostX = rightEdge;
          if (e.y && e.y < topY) topY = e.y;
        }
      });

      const targetX = rightmostX + 40;
      const targetY = topY;

      const stepsText = result.steps
        .slice(0, 3)
        .map((s) => `${s.stepNumber}. ${s.title}`)
        .join("\n");
      const fullNoteText = `✨ AI Analysis:\n${result.summary}\n\nKey Steps:\n${stepsText}`;

      // Arrow pointing from rightmost element to new solution box
      newExcalidrawElements.push({
        id: `ai-arrow-${baseId}`,
        type: "arrow",
        x: rightmostX + 10,
        y: targetY + 40,
        width: 60,
        height: 0,
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
        roundness: { type: 2 },
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        points: [
          [0, 0],
          [60, 0],
        ],
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: "arrow",
      });

      // Callout Rectangle Box
      newExcalidrawElements.push({
        id: `ai-box-${baseId}`,
        type: "rectangle",
        x: targetX,
        y: targetY,
        width: 320,
        height: 180,
        angle: 0,
        strokeColor: "#6366f1",
        backgroundColor: "#e0e7ff",
        fillStyle: "hachure",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
      });

      // Formatted Callout Text
      newExcalidrawElements.push({
        id: `ai-note-${baseId}`,
        type: "text",
        x: targetX + 16,
        y: targetY + 16,
        width: 288,
        height: 148,
        angle: 0,
        strokeColor: "#1e1b4b",
        backgroundColor: "transparent",
        fillStyle: "hachure",
        strokeWidth: 1,
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
        text: fullNoteText,
        fontSize: 15,
        fontFamily: 1,
        textAlign: "left",
        verticalAlign: "top",
        containerId: `ai-box-${baseId}`,
        originalText: fullNoteText,
        lineHeight: 1.25,
      });
    }

    const updated = [...currentElems, ...newExcalidrawElements];
    excalidrawAPI.updateScene({ elements: updated as any });
    setExcalidrawElements(updated);
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

    const existingSummary = getExistingElementsSummary();

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      imageCrop: finalCrop,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsAnalyzing(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-api-key": userApiKey,
        },
        body: JSON.stringify({
          imageBase64: finalCrop,
          coordinates: { x: 150, y: 150, width: 300, height: 200 },
          promptText: text,
          userApiKey,
          existingElementsSummary: existingSummary,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const resultData: MathAnalysisResult = json.data;
        const assistantMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          text: resultData.summary,
          analysisResult: resultData,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setCurrentResult(resultData);
        insertAiExplanationOnCanvas(resultData);
      } else if (json.error) {
        alert(`Gemini AI Error: ${json.error}`);
        setApiKeyModalOpen(true);
      }
    } catch (err: any) {
      console.error("Chat analysis failed:", err);
      alert(`Chat analysis error: ${err.message || err}`);
    } finally {
      setIsAnalyzing(false);
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
              {isAnalyzing ? "Analyzing..." : "Analyze Canvas ✨"}
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
