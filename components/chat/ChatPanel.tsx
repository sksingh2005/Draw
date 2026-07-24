"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KatexRenderer } from "../math/KatexRenderer";
import { FunctionGrapher } from "../math/FunctionGrapher";
import { ChatMessage } from "@/lib/workspace-store";
import {
  MessageSquare,
  Send,
  Crop,
  Sparkles,
  Bot,
  User,
  ChevronRight,
  ChevronLeft,
  X,
  Paperclip,
  CheckCircle2,
} from "lucide-react";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, imageCrop?: string) => void;
  onAttachCanvasCrop: () => { imageBase64: string } | null;
  isOpen: boolean;
  onToggleOpen: () => void;
  isAnalyzing: boolean;
}

export function ChatPanel({
  messages,
  onSendMessage,
  onAttachCanvasCrop,
  isOpen,
  onToggleOpen,
  isAnalyzing,
}: ChatPanelProps) {
  const [inputText, setInputText] = useState("");
  const [attachedCrop, setAttachedCrop] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAnalyzing]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !attachedCrop) return;

    onSendMessage(inputText.trim(), attachedCrop || undefined);
    setInputText("");
    setAttachedCrop(null);
  };

  const handleAttachCrop = () => {
    const res = onAttachCanvasCrop();
    if (res?.imageBase64) {
      setAttachedCrop(res.imageBase64);
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed top-16 right-3 z-30">
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleOpen}
          className="w-9 h-9 rounded-xl bg-background/80 backdrop-blur border shadow-md hover:bg-accent relative"
        >
          <MessageSquare className="w-4 h-4 text-indigo-500" />
          {messages.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-indigo-600 border-2 border-background" />
          )}
        </Button>
      </div>
    );
  }

  return (
    <aside className="w-80 md:w-96 border-l bg-background/95 backdrop-blur-xl flex flex-col h-full z-20 transition-all duration-300 animate-in slide-in-from-right">
      {/* Top Header */}
      <div className="p-3 border-b flex items-center justify-between bg-muted/40">
        <div className="flex items-center gap-2 font-bold text-xs">
          <Bot className="w-4 h-4 text-indigo-500" />
          <span>AI Workspace Chat</span>
          <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
            Gemini Multimodal
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleOpen}
          className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs shrink-0 ${
                  isUser
                    ? "bg-indigo-600 text-white"
                    : "bg-muted border text-indigo-600 dark:text-indigo-400"
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div className={`space-y-2 max-w-[85%] ${isUser ? "text-right" : "text-left"}`}>
                {/* Attached Canvas Crop Thumbnail */}
                {msg.imageCrop && (
                  <div className="inline-block border rounded-xl overflow-hidden shadow-sm max-w-full bg-white">
                    <img
                      src={msg.imageCrop}
                      alt="Canvas Selection"
                      className="max-h-36 object-contain"
                    />
                  </div>
                )}

                {/* Message Text Bubble */}
                {msg.text && (
                  <div
                    className={`inline-block p-3 rounded-2xl text-xs leading-relaxed ${
                      isUser
                        ? "bg-indigo-600 text-white rounded-tr-xs"
                        : "bg-card border shadow-xs text-foreground rounded-tl-xs"
                    }`}
                  >
                    <KatexRenderer math={msg.text} block={false} />
                  </div>
                )}

                {/* AI Structured Analysis Steps */}
                {msg.analysisResult && (
                  <div className="space-y-2 text-xs">
                    <Card className="border shadow-xs bg-muted/40">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {msg.analysisResult.summary}
                        </div>

                        {msg.analysisResult.steps.map((st) => (
                          <div key={st.stepNumber} className="bg-background p-2 rounded-lg border space-y-1">
                            <div className="font-semibold text-[11px] flex justify-between">
                              <span>Step {st.stepNumber}: {st.title}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{st.explanation}</p>
                            {st.latex && <KatexRenderer math={st.latex} block={true} className="text-xs" />}
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    {msg.analysisResult.graphConfig && (
                      <FunctionGrapher config={msg.analysisResult.graphConfig} />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isAnalyzing && (
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground p-2">
            <div className="flex items-center gap-2 animate-pulse">
              <Sparkles className="w-4 h-4 text-indigo-500 animate-spin" />
              <span>AI analyzing query & canvas…</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-indigo-600 dark:text-indigo-400 pl-6">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
              Streaming shapes & pencil strokes onto the whiteboard in real time
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t bg-muted/20 space-y-2">
        {/* Attached Crop Preview Bar */}
        {attachedCrop && (
          <div className="flex items-center justify-between bg-card p-1.5 rounded-xl border text-xs">
            <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
              <Crop className="w-3.5 h-3.5" /> Canvas Snapshot Attached
            </span>
            <button
              type="button"
              onClick={() => setAttachedCrop(null)}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleAttachCrop}
            className="w-9 h-9 rounded-xl shrink-0"
            title="Attach Canvas Crop"
          >
            <Paperclip className="w-4 h-4 text-indigo-500" />
          </Button>

          <Input
            type="text"
            placeholder="Ask anything or attach canvas..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 text-xs h-9 rounded-xl bg-background"
          />

          <Button
            type="submit"
            size="icon"
            disabled={!inputText.trim() && !attachedCrop}
            className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </aside>
  );
}
