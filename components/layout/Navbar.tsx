"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  BookOpen,
  Download,
  Trash2,
  Cpu,
  PanelLeft,
  MessageSquare,
  Maximize2,
  Minimize2,
  Key,
} from "lucide-react";

interface NavbarProps {
  activeTitle?: string;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  onOpenPresets: () => void;
  onClearCanvas: () => void;
  onExportCanvas: () => void;
  onOpenApiKeyModal: () => void;
  hasApiKey: boolean;
  analysisCount: number;
}

export function Navbar({
  activeTitle = "Interactive Workspace",
  isMaximized,
  onToggleMaximize,
  onToggleSidebar,
  onToggleChat,
  onOpenPresets,
  onClearCanvas,
  onExportCanvas,
  onOpenApiKeyModal,
  hasApiKey,
  analysisCount,
}: NavbarProps) {
  return (
    <header className="h-14 border-b bg-background/80 backdrop-blur-xl px-4 flex items-center justify-between z-30 sticky top-0">
      {/* Left Brand & Sidebar Toggle */}
      <div className="flex items-center gap-3">
        {!isMaximized && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground"
            title="Toggle Workspace Pages Sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        )}

        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
          <Sparkles className="w-4 h-4" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
              {activeTitle}
            </h1>
            <Badge variant="outline" className="text-[10px] py-0 px-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
              AI Whiteboard
            </Badge>
          </div>
        </div>
      </div>

      {/* Center AI Engine Status */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 border text-xs text-muted-foreground">
        <Cpu className="w-3.5 h-3.5 text-indigo-500" />
        <span>Gemini Engine:</span>
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${hasApiKey ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          {hasApiKey ? "Gemini 2.5 Active" : "Key Needed"}
        </span>
      </div>

      {/* Right Quick Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenApiKeyModal}
          className={`rounded-xl text-xs gap-1.5 border-indigo-500/30 ${
            hasApiKey
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse"
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          {hasApiKey ? "Gemini Connected" : "Connect Key"}
        </Button>

        <Button variant="outline" size="sm" onClick={onOpenPresets} className="rounded-xl text-xs gap-1.5 hidden sm:flex">
          <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> Formulas
        </Button>

        <Button variant="outline" size="sm" onClick={onExportCanvas} className="rounded-xl text-xs gap-1.5">
          <Download className="w-3.5 h-3.5 text-foreground" /> Export PNG
        </Button>

        <Button variant="ghost" size="sm" onClick={onClearCanvas} className="rounded-xl text-xs gap-1.5 text-destructive hover:bg-destructive/10">
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={onToggleMaximize}
          className="w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground"
          title={isMaximized ? "Minimize Canvas Workspace" : "Maximize Canvas Workspace"}
        >
          {isMaximized ? <Minimize2 className="w-4 h-4 text-indigo-500" /> : <Maximize2 className="w-4 h-4" />}
        </Button>

        {!isMaximized && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleChat}
            className="rounded-xl text-xs gap-1.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
          >
            <MessageSquare className="w-3.5 h-3.5" /> AI Chat
          </Button>
        )}
      </div>
    </header>
  );
}
