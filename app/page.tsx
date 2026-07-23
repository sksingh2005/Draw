"use client";

import React, { useState, useRef, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MathCanvas, MathCanvasRef, CanvasNoteNode, CanvasStroke } from "@/components/canvas/MathCanvas";
import { CanvasToolbar, CanvasToolMode, GridMode } from "@/components/canvas/CanvasToolbar";
import { MathPresetLibrary, MathTemplate } from "@/components/math/MathPresetLibrary";
import { SolutionPanel } from "@/components/canvas/SolutionPanel";
import { NodeCard } from "@/components/canvas/NodeCard";
import { MathAnalysisResult, CanvasCoordinates } from "@/lib/math-parser";
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
  const canvasRef = useRef<MathCanvasRef | null>(null);

  // Multi-page Workspace state
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [activePageId, setActivePageIdState] = useState<string>("page-default-math");
  const [activePage, setActivePage] = useState<WorkspacePage | null>(null);

  // Layout UI Toggles
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);

  // Canvas tool states
  const [toolMode, setToolMode] = useState<CanvasToolMode>("pan");
  const [strokeColor, setStrokeColor] = useState<string>("#6366f1");
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [gridMode, setGridMode] = useState<GridMode>("graph");

  // Viewport & Canvas state
  const [zoom, setZoom] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
  const [noteNodes, setNoteNodes] = useState<CanvasNoteNode[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<MathAnalysisResult | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [presetLibraryOpen, setPresetLibraryOpen] = useState<boolean>(false);

  // Load initial pages from local storage
  useEffect(() => {
    const loadedPages = getSavedPages();
    setPages(loadedPages);
    const activeId = getActivePageId();
    const current = loadedPages.find((p) => p.id === activeId) || loadedPages[0];
    if (current) {
      setActivePageIdState(current.id);
      setActivePage(current);
      setStrokes(current.strokes || []);
      setNoteNodes(current.noteNodes || []);
      setMessages(current.messages || []);
    }
  }, []);

  // Save current workspace state on strokes/notes/messages change
  useEffect(() => {
    if (!activePage) return;
    const updatedPage: WorkspacePage = {
      ...activePage,
      strokes,
      noteNodes,
      messages,
      updatedAt: Date.now(),
    };
    savePage(updatedPage);
  }, [strokes, noteNodes, messages, activePage]);

  // Switch Workspace Page
  const handleSelectPage = (id: string) => {
    setActivePageId(id);
    setActivePageIdState(id);
    const target = pages.find((p) => p.id === id);
    if (target) {
      setActivePage(target);
      setStrokes(target.strokes || []);
      setNoteNodes(target.noteNodes || []);
      setMessages(target.messages || []);
      setCurrentResult(null);
      setIsPanelOpen(false);
    }
  };

  // Create New Workspace Page
  const handleCreateNewPage = (category: WorkspacePage["category"] = "general") => {
    const count = pages.length + 1;
    const newP = createNewPage(`Canvas Workspace ${count}`, category);
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

  // Trigger Canvas Spatial AI Analysis
  const handleAnalyzeCanvas = async () => {
    if (!canvasRef.current || isAnalyzing) return;

    setIsAnalyzing(true);
    const region = canvasRef.current.getCroppedRegion();

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: region?.imageBase64,
          coordinates: region?.coordinates || { x: 100, y: 100, width: 350, height: 250 },
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const resultData: MathAnalysisResult = json.data;
        setCurrentResult(resultData);
        setIsPanelOpen(true);

        // Add to Chat Thread as Assistant Response
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          sender: "assistant",
          text: `Analyzed canvas crop: **${resultData.summary}**`,
          imageCrop: region?.imageBase64,
          analysisResult: resultData,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      console.error("Failed to analyze canvas region:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Send Text Question in Right Chat Panel
  const handleSendChatMessage = async (text: string, imageCrop?: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      imageCrop,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsAnalyzing(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imageCrop,
          coordinates: { x: 150, y: 150, width: 300, height: 200 },
          promptText: text,
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
      }
    } catch (err) {
      console.error("Chat analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Insert Formula Preset
  const handleSelectTemplate = (template: MathTemplate) => {
    const newNode: CanvasNoteNode = {
      id: `node-${Date.now()}`,
      x: 180 + Math.random() * 60,
      y: 140 + Math.random() * 40,
      text: template.name,
      latex: template.latex,
    };
    setNoteNodes((prev) => [...prev, newNode]);
  };

  // Export PNG
  const handleExportCanvas = () => {
    const region = canvasRef.current?.getCroppedRegion();
    if (!region) return;
    const link = document.createElement("a");
    link.download = `workspace-${activePage?.title || "canvas"}-${Date.now()}.png`;
    link.href = region.imageBase64;
    link.click();
  };

  // Clear Canvas
  const handleClearAll = () => {
    canvasRef.current?.clearCanvas();
    setStrokes([]);
    setNoteNodes([]);
    setCurrentResult(null);
    setIsPanelOpen(false);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTitle={activePage?.title || "AI Whiteboard Workspace"}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onToggleChat={() => setIsChatOpen((prev) => !prev)}
        onOpenPresets={() => setPresetLibraryOpen(true)}
        onClearCanvas={handleClearAll}
        onExportCanvas={handleExportCanvas}
        analysisCount={messages.length}
      />

      {/* Main 3-Pane Responsive Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Pages & History */}
        <Sidebar
          pages={pages}
          activePageId={activePageId}
          onSelectPage={handleSelectPage}
          onCreateNewPage={handleCreateNewPage}
          onDeletePage={handleDeletePage}
          isOpen={isSidebarOpen}
          onToggleOpen={() => setIsSidebarOpen((prev) => !prev)}
        />

        {/* Center Infinite Canvas Work Area */}
        <main className="flex-1 relative w-full h-full overflow-hidden flex flex-col">
          <MathCanvas
            refCanvasApi={canvasRef}
            toolMode={toolMode}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            gridMode={gridMode}
            zoom={zoom}
            panX={panX}
            panY={panY}
            onPanChange={(px, py) => {
              setPanX(px);
              setPanY(py);
            }}
            onStrokesChange={(count) => {}}
            noteNodes={noteNodes}
            onAddNoteNode={(newNode) => setNoteNodes((prev) => [...prev, newNode])}
            strokes={strokes}
            setStrokes={setStrokes}
          />

          {/* Canvas Spatial Anchored Node Card */}
          {currentResult && !isPanelOpen && (
            <NodeCard
              result={currentResult}
              onExpandPanel={() => setIsPanelOpen(true)}
              onClose={() => setCurrentResult(null)}
            />
          )}

          {/* Floating Glassmorphism Toolbar */}
          <CanvasToolbar
            toolMode={toolMode}
            onToolModeChange={setToolMode}
            strokeColor={strokeColor}
            onStrokeColorChange={setStrokeColor}
            strokeWidth={strokeWidth}
            onStrokeWidthChange={setStrokeWidth}
            gridMode={gridMode}
            onGridModeChange={setGridMode}
            zoom={zoom}
            onZoomIn={() => setZoom((prev) => Math.min(prev + 0.15, 3))}
            onZoomOut={() => setZoom((prev) => Math.max(prev - 0.15, 0.4))}
            onResetZoom={() => {
              setZoom(1);
              setPanX(0);
              setPanY(0);
            }}
            canUndo={canvasRef.current?.canUndo || false}
            canRedo={canvasRef.current?.canRedo || false}
            onUndo={() => canvasRef.current?.undo()}
            onRedo={() => canvasRef.current?.redo()}
            onClear={handleClearAll}
            onOpenPresets={() => setPresetLibraryOpen(true)}
            onAnalyze={handleAnalyzeCanvas}
            isAnalyzing={isAnalyzing}
          />

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
        <ChatPanel
          messages={messages}
          onSendMessage={handleSendChatMessage}
          onAttachCanvasCrop={() => canvasRef.current?.getCroppedRegion() || null}
          isOpen={isChatOpen}
          onToggleOpen={() => setIsChatOpen((prev) => !prev)}
          isAnalyzing={isAnalyzing}
        />
      </div>
    </div>
  );
}
