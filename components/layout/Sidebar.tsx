"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WorkspacePage } from "@/lib/workspace-store";
import {
  Plus,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calculator,
  Atom,
  MessageSquare,
  Code2,
  Puzzle,
  FolderKanban,
} from "lucide-react";

interface SidebarProps {
  pages: WorkspacePage[];
  activePageId: string;
  onSelectPage: (id: string) => void;
  onCreateNewPage: (category?: WorkspacePage["category"]) => void;
  onDeletePage: (id: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export function Sidebar({
  pages,
  activePageId,
  onSelectPage,
  onCreateNewPage,
  onDeletePage,
  isOpen,
  onToggleOpen,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPages = pages.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryIcon = (category: WorkspacePage["category"]) => {
    switch (category) {
      case "math":
        return <Calculator className="w-3.5 h-3.5 text-indigo-500" />;
      case "physics":
        return <Atom className="w-3.5 h-3.5 text-emerald-500" />;
      case "coding":
        return <Code2 className="w-3.5 h-3.5 text-amber-500" />;
      case "puzzles":
        return <Puzzle className="w-3.5 h-3.5 text-purple-500" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed top-16 left-3 z-30">
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleOpen}
          className="w-9 h-9 rounded-xl bg-background/80 backdrop-blur border shadow-md hover:bg-accent"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="w-64 border-r bg-background/95 backdrop-blur-xl flex flex-col h-full z-20 transition-all duration-300 animate-in slide-in-from-left">
      {/* Sidebar Top Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xs">
          <FolderKanban className="w-4 h-4 text-indigo-500" />
          <span>Workspace History</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleOpen}
          className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* New Page CTA */}
      <div className="p-3 space-y-2 border-b">
        <Button
          onClick={() => onCreateNewPage("math")}
          size="sm"
          className="w-full text-xs font-semibold rounded-xl gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Canvas Page
        </Button>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs h-8 rounded-xl bg-muted/50 border-none"
          />
        </div>
      </div>

      {/* Saved Pages List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2.5 py-1">
          Recent Pages ({filteredPages.length})
        </div>

        {filteredPages.map((page) => {
          const isActive = page.id === activePageId;
          return (
            <div
              key={page.id}
              onClick={() => onSelectPage(page.id)}
              className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors text-xs ${
                isActive
                  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-500/20"
                  : "hover:bg-accent/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {getCategoryIcon(page.category)}
                <span className="truncate">{page.title}</span>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {pages.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePage(page.id);
                    }}
                    className="p-1 text-muted-foreground hover:text-destructive rounded-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
