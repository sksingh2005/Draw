"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  PanelLeft,
  MessageSquare,
  Maximize2,
  Minimize2,
  Download,
  Upload,
  FileJson,
  FolderOpen,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activePageTitle?: string;
  onToggleChat: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onExportPage?: () => void;
  onExportAll?: () => void;
  onImportJson?: (file: File) => void;
}

export function Navbar({
  sidebarOpen,
  onToggleSidebar,
  activePageTitle = "Untitled Board",
  onToggleChat,
  isMaximized,
  onToggleMaximize,
  onExportPage,
  onExportAll,
  onImportJson,
}: NavbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportJson) {
      onImportJson(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <header className="h-14 border-b bg-background/80 backdrop-blur-xl px-4 flex items-center justify-between z-30 sticky top-0">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
      />

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

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-sm font-bold text-xs">
            ∑
          </div>
          <span className="font-semibold text-sm tracking-tight hidden sm:inline-block">
            Antigravity<span className="text-indigo-500 font-bold ml-1">Draw</span>
          </span>
        </div>

        <div className="h-4 w-px bg-border mx-1" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md max-w-[200px] truncate">
            {activePageTitle}
          </span>
        </div>
      </div>

      {/* File controls stay together so the canvas has a single primary action. */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-indigo-500" /> File
              </Button>
            }
          />
          <DropdownMenuContent align="center" className="w-48 z-50">
            <DropdownMenuItem
              onClick={() => fileInputRef.current?.click()}
              className="text-xs gap-2 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-500" /> Import board
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportPage} className="text-xs gap-2 cursor-pointer">
              <Download className="w-3.5 h-3.5 text-indigo-500" /> Export Active Board
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportAll} className="text-xs gap-2 cursor-pointer">
              <FileJson className="w-3.5 h-3.5 text-purple-500" /> Export All Boards
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMaximize}
          className="w-8 h-8 rounded-xl text-muted-foreground hover:text-foreground"
          title={isMaximized ? "Exit Maximize Mode" : "Maximize Canvas"}
        >
          {isMaximized ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
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
