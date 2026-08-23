"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KatexRenderer } from "../math/KatexRenderer";
import { FunctionGrapher } from "../math/FunctionGrapher";
import { ChatMessage } from "@/lib/workspace-store";
import { MathAnalysisResult } from "@/lib/math-parser";
import {
  MessageSquare,
  Send,
  Crop,
  Sparkles,
  Bot,
  User,
  ChevronRight,
  X,
  Paperclip,
  CheckCircle2,
  Network,
  Database,
  GitBranch,
  Calculator,
  Lightbulb,
  MapPin,
  Layers,
  Focus,
  Braces,
  Copy,
  Check,
  RefreshCw,
  ImageIcon,
} from "lucide-react";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, imageCrop?: string) => void;
  onAttachCanvasCrop: () => Promise<string | null>;
  onFocusDiagram: (diagramId: string) => void;
  onRenderMermaid: (source: string, diagramId: string, messageId: string) => Promise<void>;
  isOpen: boolean;
  onToggleOpen: () => void;
  isAnalyzing: boolean;
}

const SUGGESTIONS = [
  "Design a chat app microservices architecture",
  "Draw an ER schema for users & orders",
  "Explain quadratic formula with a graph",
  "Flowchart for user signup + OAuth",
];

function looksLikeLatex(text: string): boolean {
  if (!text) return false;
  // Short pure latex-ish, or wrapped in $
  if (/^\$\$[\s\S]+\$\$$/.test(text.trim())) return true;
  if (/^\$[^$]+\$/.test(text.trim()) && text.length < 120) return true;
  if (/\\frac|\\sqrt|\\sum|\\int|\\begin\{/.test(text) && text.length < 200) return true;
  // Long prose should stay plain
  if (text.length > 80 && /[.!?]/.test(text)) return false;
  return false;
}

function classificationMeta(c?: MathAnalysisResult["classification"]) {
  switch (c) {
    case "architecture":
      return {
        label: "Architecture",
        icon: Network,
        className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
      };
    case "schema":
      return {
        label: "DB Schema",
        icon: Database,
        className: "bg-amber-500/10 text-amber-700 border-amber-500/20",
      };
    case "flowchart":
      return {
        label: "Flowchart",
        icon: GitBranch,
        className: "bg-violet-500/10 text-violet-700 border-violet-500/20",
      };
    case "equation":
    case "calculus":
    case "geometry":
    case "physics":
    case "graph":
      return {
        label: c === "graph" ? "Graph" : "Math",
        icon: Calculator,
        className: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20",
      };
    default:
      return {
        label: "Concept",
        icon: Lightbulb,
        className: "bg-sky-500/10 text-sky-700 border-sky-500/20",
      };
  }
}

function MessageBody({ text, isUser }: { text: string; isUser: boolean }) {
  // Support simple multi-paragraph + optional latex lines
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);

  return (
    <div
      className={`inline-block p-3 rounded-2xl text-xs leading-relaxed max-w-full ${
        isUser
          ? "bg-indigo-600 text-white rounded-tr-sm"
          : "bg-card border shadow-xs text-foreground rounded-tl-sm"
      }`}
    >
      <div className="space-y-2 whitespace-pre-wrap break-words">
        {paragraphs.map((p, i) => {
          if (!isUser && looksLikeLatex(p)) {
            return <KatexRenderer key={i} math={p} block={p.length > 40} className="text-xs" />;
          }
          return (
            <p key={i} className="text-xs leading-relaxed">
              {p}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function AnalysisCard({ result }: { result: MathAnalysisResult }) {
  const meta = classificationMeta(result.classification);
  const Icon = meta.icon;
  const drawCount = result.canvasDrawings?.length || 0;
  const hasSvgIllustration = result.canvasDrawings?.some((drawing) => drawing.type === "svg");

  return (
    <div className="space-y-2 text-xs">
      <Card className="border shadow-xs bg-muted/30 overflow-hidden">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b bg-background/60 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={`text-[10px] gap-1 ${meta.className}`}>
              <Icon className="w-3 h-3" />
              {meta.label}
            </Badge>
            {drawCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 bg-indigo-500/5 text-indigo-600 border-indigo-500/15"
              >
                <Layers className="w-3 h-3" />
                {drawCount} canvas mark{drawCount === 1 ? "" : "s"}
              </Badge>
            )}
            {result.mermaidCode && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 bg-sky-500/5 text-sky-700 border-sky-500/20"
              >
                <Braces className="w-3 h-3" />
                Auto-layout · editable
              </Badge>
            )}
            {hasSvgIllustration && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 bg-cyan-500/5 text-cyan-700 border-cyan-500/20"
              >
                <ImageIcon className="w-3 h-3" />
                Sanitized vector visual
              </Badge>
            )}
            {result.updateMode && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                append-only
              </Badge>
            )}
          </div>

          <div className="p-3 space-y-2.5">
            {result.focusNote && (
              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-background/80 rounded-lg border px-2 py-1.5">
                <MapPin className="w-3 h-3 mt-0.5 text-indigo-500 shrink-0" />
                <span>{result.focusNote}</span>
              </div>
            )}

            <div className="flex items-start gap-1.5 text-[11px] font-semibold text-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
              <span className="leading-snug">{result.summary}</span>
            </div>

            {result.keyVariables?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {result.keyVariables.slice(0, 6).map((v, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-background border text-[10px]"
                  >
                    <span className="font-semibold text-indigo-600">{v.symbol}</span>
                    {v.value && <span className="text-muted-foreground">= {v.value}</span>}
                  </span>
                ))}
              </div>
            )}

            {result.steps?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Steps
                </div>
                {result.steps.map((st) => (
                  <div
                    key={st.stepNumber}
                    className="bg-background p-2 rounded-lg border space-y-1 relative pl-7"
                  >
                    <span className="absolute left-2 top-2 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
                      {st.stepNumber}
                    </span>
                    <div className="font-semibold text-[11px]">{st.title}</div>
                    {st.explanation && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {st.explanation}
                      </p>
                    )}
                    {st.latex && looksLikeLatex(st.latex) && (
                      <KatexRenderer math={st.latex} block className="text-xs" />
                    )}
                    {st.latex && !looksLikeLatex(st.latex) && (
                      <p className="text-[11px] font-mono bg-muted/50 rounded px-1.5 py-1">
                        {st.latex}
                      </p>
                    )}
                    {st.result && (
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                        → {st.result}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.conceptExplanation && (
              <div className="rounded-lg border bg-amber-500/5 border-amber-500/15 p-2 space-y-1">
                <div className="text-[11px] font-bold flex items-center gap-1 text-amber-800 dark:text-amber-300">
                  <Lightbulb className="w-3 h-3" />
                  {result.conceptExplanation.title}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {result.conceptExplanation.coreIdea}
                </p>
                {result.conceptExplanation.keyTakeaway && (
                  <p className="text-[10px] font-medium text-foreground">
                    Takeaway: {result.conceptExplanation.keyTakeaway}
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {result.graphConfig && <FunctionGrapher config={result.graphConfig} />}
    </div>
  );
}

function MermaidSourceEditor({
  source,
  diagramId,
  messageId,
  onRender,
}: {
  source: string;
  diagramId: string;
  messageId: string;
  onRender: ChatPanelProps["onRenderMermaid"];
}) {
  const [draft, setDraft] = useState(source);
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copySource = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderSource = async () => {
    setIsRendering(true);
    setError(null);
    try {
      await onRender(draft, diagramId, messageId);
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Could not render this source.");
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <details className="rounded-xl border bg-muted/30 text-left overflow-hidden group">
      <summary className="cursor-pointer px-2.5 py-2 text-[10px] font-semibold text-muted-foreground flex items-center justify-between gap-2 hover:text-foreground">
        <span className="flex items-center gap-1.5">
          <Braces className="w-3 h-3 text-indigo-500" /> Diagram source
        </span>
        <span className="font-normal opacity-70">Mermaid · click to edit</span>
      </summary>
      <div className="border-t bg-background p-2 space-y-2">
        <textarea
          aria-label="Editable Mermaid diagram source"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          className="w-full min-h-40 resize-y rounded-lg border bg-slate-950 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
        />
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] ${error ? "text-destructive" : "text-muted-foreground"}`}>
            {error || "Edit the text, then rebuild this diagram without touching the rest of the board."}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={copySource} className="h-7 px-2 text-[10px] gap-1">
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={renderSource}
              disabled={isRendering || !draft.trim()}
              className="h-7 px-2.5 text-[10px] gap-1 bg-indigo-600 text-white hover:bg-indigo-500"
            >
              <RefreshCw className={`w-3 h-3 ${isRendering ? "animate-spin" : ""}`} />
              {isRendering ? "Laying out…" : "Update canvas"}
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}

export function ChatPanel({
  messages,
  onSendMessage,
  onAttachCanvasCrop,
  onFocusDiagram,
  onRenderMermaid,
  isOpen,
  onToggleOpen,
  isAnalyzing,
}: ChatPanelProps) {
  const [inputText, setInputText] = useState("");
  const [attachedCrop, setAttachedCrop] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAnalyzing]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !attachedCrop) return;
    onSendMessage(inputText.trim(), attachedCrop || undefined);
    setInputText("");
    setAttachedCrop(null);
  };

  const handleAttachCrop = async () => {
    const crop = await onAttachCanvasCrop();
    if (crop) setAttachedCrop(crop);
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

  const showSuggestions = messages.length <= 1 && !isAnalyzing;

  return (
    <aside className="w-80 xl:w-[26rem] border-l bg-background/95 backdrop-blur-xl flex flex-col h-full z-20 transition-all duration-300 animate-in slide-in-from-right">
      <div className="p-3 border-b flex items-center justify-between bg-muted/40">
        <div className="flex items-center gap-2 font-bold text-xs">
          <Bot className="w-4 h-4 text-indigo-500" />
          <span>AI Workspace Chat</span>
          <Badge
            variant="outline"
            className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/20"
          >
            Canvas-first
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

              <div className={`space-y-2 max-w-[88%] ${isUser ? "text-right" : "text-left"}`}>
                {msg.imageCrop && (
                  <div className="inline-block border rounded-xl overflow-hidden shadow-sm max-w-full bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={msg.imageCrop}
                      alt="Canvas Selection"
                      className="max-h-36 object-contain"
                    />
                  </div>
                )}

                {/* Avoid double-rendering summary when analysis card already shows it */}
                {msg.text && !(msg.analysisResult && msg.text.includes(msg.analysisResult.summary)) && (
                  <MessageBody text={msg.text} isUser={isUser} />
                )}
                {msg.text && msg.analysisResult && msg.text.includes(msg.analysisResult.summary) && (
                  // Show only focus prefix if we duplicated summary into text
                  msg.text.replace(msg.analysisResult.summary, "").trim() ? (
                    <MessageBody
                      text={msg.text.replace(msg.analysisResult.summary, "").trim()}
                      isUser={isUser}
                    />
                  ) : null
                )}

                {msg.analysisResult && <AnalysisCard result={msg.analysisResult} />}

                {!isUser && msg.diagramId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onFocusDiagram(msg.diagramId!)}
                    className="h-7 rounded-lg text-[10px] gap-1.5"
                    title="Select this diagram on the canvas, then ask a follow-up"
                  >
                    <Focus className="w-3 h-3 text-indigo-500" />
                    Focus {msg.diagramTitle || "diagram"}
                  </Button>
                )}

                {!isUser && msg.mermaidCode && msg.diagramId && (
                  <MermaidSourceEditor
                    source={msg.mermaidCode}
                    diagramId={msg.diagramId}
                    messageId={msg.id}
                    onRender={onRenderMermaid}
                  />
                )}
              </div>
            </div>
          );
        })}

        {showSuggestions && (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
              Try asking
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSendMessage(s)}
                  className="text-left text-[11px] px-3 py-2 rounded-xl border bg-card hover:bg-indigo-500/5 hover:border-indigo-500/30 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground p-2 rounded-xl border bg-indigo-500/5 border-indigo-500/15">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500 animate-spin" />
              <span className="font-medium text-foreground">Teaching on the canvas…</span>
            </div>
            <div className="text-[11px] text-indigo-600 dark:text-indigo-400 pl-6">
              Auto-layouting structured diagrams; drawing math annotations in free space
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t bg-muted/20 space-y-2">
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
            placeholder="Ask to draw architecture, schema, math…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 text-xs h-9 rounded-xl bg-background"
            disabled={isAnalyzing}
          />

          <Button
            type="submit"
            size="icon"
            disabled={(!inputText.trim() && !attachedCrop) || isAnalyzing}
            className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </aside>
  );
}
