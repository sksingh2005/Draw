"use client";

import React, { useState } from "react";
import confetti from "canvas-confetti";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { KatexRenderer } from "../math/KatexRenderer";
import { FunctionGrapher } from "../math/FunctionGrapher";
import { MathAnalysisResult } from "@/lib/math-parser";
import {
  Sparkles,
  X,
  ListOrdered,
  LineChart,
  Lightbulb,
  CheckCircle2,
  HelpCircle,
  Copy,
  Braces,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface SolutionPanelProps {
  result: MathAnalysisResult | null;
  open: boolean;
  onClose: () => void;
}

export function SolutionPanel({ result, open, onClose }: SolutionPanelProps) {
  const [activeTab, setActiveTab] = useState<string>("steps");
  const [expandedPracticeId, setExpandedPracticeId] = useState<string | null>(null);
  const [copiedContent, setCopiedContent] = useState(false);

  if (!open || !result) return null;

  const triggerCelebration = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const isStructured = ["architecture", "schema", "flowchart"].includes(result.classification);
  const copyableSource = result.mermaidCode || result.latexFormula;
  const panelTitle =
    result.classification === "architecture"
      ? "Architecture breakdown"
      : result.classification === "schema"
        ? "Schema breakdown"
        : result.classification === "flowchart"
          ? "Flow breakdown"
          : "Solution breakdown";

  const handleCopySource = () => {
    if (!copyableSource) return;
    navigator.clipboard.writeText(copyableSource);
    setCopiedContent(true);
    setTimeout(() => setCopiedContent(false), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] md:w-[540px] bg-background/95 backdrop-blur-2xl border-l shadow-2xl flex flex-col transition-all duration-300 animate-in slide-in-from-right">
      {/* Panel Top Header */}
      <div className="p-4 border-b flex items-center justify-between bg-muted/40">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base">{panelTitle}</h3>
              <Badge variant="outline" className="capitalize text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/30">
                {result.classification}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">
              Detected: {result.detectedText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {copyableSource && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopySource}
              className="w-8 h-8 rounded-lg"
              title={result.mermaidCode ? "Copy Mermaid source" : "Copy LaTeX"}
            >
              {copiedContent ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8 rounded-lg">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Result-aware summary: never show an empty math banner for diagrams. */}
      {isStructured ? (
        <div className="p-4 border-b bg-gradient-to-r from-indigo-500/5 via-sky-500/5 to-emerald-500/5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            <Braces className="w-4 h-4" /> Mermaid source → editable Excalidraw elements
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{result.summary}</p>
        </div>
      ) : result.latexFormula ? (
        <div className="p-4 border-b bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 text-center relative">
          <div className="text-xs text-muted-foreground mb-1 font-medium">Canonical mathematical expression</div>
          <KatexRenderer math={result.latexFormula} block={true} className="text-lg font-bold text-foreground" />
          {copiedContent && (
            <span className="absolute bottom-1 right-3 text-[10px] text-emerald-600 font-semibold animate-pulse">
              LaTeX copied
            </span>
          )}
        </div>
      ) : null}

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-3 border-b bg-background">
          <TabsList className="grid grid-cols-4 w-full bg-muted/60 p-1">
            <TabsTrigger value="steps" className="text-xs flex items-center gap-1">
              <ListOrdered className="w-3.5 h-3.5" /> {isStructured ? "Details" : "Steps"}
            </TabsTrigger>
            <TabsTrigger value="graph" className="text-xs flex items-center gap-1">
              {isStructured ? <Braces className="w-3.5 h-3.5" /> : <LineChart className="w-3.5 h-3.5" />}
              {isStructured ? "Source" : "Graph"}
            </TabsTrigger>
            <TabsTrigger value="concept" className="text-xs flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5" /> Concept
            </TabsTrigger>
            <TabsTrigger value="practice" className="text-xs flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" /> Practice
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Step-by-Step Resolution Cards */}
        <TabsContent value="steps" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">
          {/* Key Variables & Given Summary */}
          {result.keyVariables.length > 0 && (
            <Card className="border shadow-xs bg-card/60">
              <CardHeader className="py-2.5 px-3 border-b">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" /> Key Variables & Coefficients
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 grid grid-cols-2 gap-2 text-xs">
                {result.keyVariables.map((v, i) => (
                  <div key={i} className="bg-muted/50 p-2 rounded-lg border">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                      <KatexRenderer math={v.symbol} block={false} /> = {v.value}
                    </span>
                    <p className="text-[11px] text-muted-foreground truncate">{v.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Sequential Step Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
              <span>Resolution Sequence ({result.steps.length} Steps)</span>
              <Button variant="ghost" size="sm" onClick={triggerCelebration} className="h-6 text-[11px] text-indigo-600 gap-1">
                Celebrate Solve 🎉
              </Button>
            </div>

            {result.steps.map((step) => (
              <Card key={step.stepNumber} className="border shadow-xs hover:border-indigo-500/40 transition-colors">
                <CardHeader className="py-2.5 px-3.5 border-b bg-muted/20 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                      {step.stepNumber}
                    </span>
                    <CardTitle className="text-xs font-bold">{step.title}</CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="p-3.5 space-y-2 text-xs">
                  <p className="text-muted-foreground leading-relaxed">
                    {step.explanation}
                  </p>

                  {step.latex && (
                    <div className="bg-muted/80 dark:bg-zinc-900 p-2.5 rounded-lg border text-center my-2">
                      <KatexRenderer math={step.latex} block={true} className="text-xs font-medium" />
                    </div>
                  )}

                  {step.result && (
                    <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
                      <span>Outcome:</span>
                      <KatexRenderer math={step.result} block={false} />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Interactive Function Graph */}
        <TabsContent value="graph" className="flex-1 overflow-y-auto p-4 m-0">
          {isStructured && result.mermaidCode ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                  <Braces className="w-3.5 h-3.5 text-indigo-500" /> Portable diagram source
                </div>
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">
                  {result.mermaidCode}
                </pre>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Edit and rebuild this source from its chat card. The generated shapes remain native and selectable on the canvas.
              </p>
            </div>
          ) : result.graphConfig ? (
            <FunctionGrapher config={result.graphConfig} />
          ) : (
            <div className="text-center py-12 text-muted-foreground text-xs space-y-2">
              <LineChart className="w-8 h-8 mx-auto opacity-40" />
              <p>No explicit 2D function detected for plotting in this expression.</p>
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Intuitive Concept Explanation */}
        <TabsContent value="concept" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">
          {result.conceptExplanation ? (
            <div className="space-y-4">
              <Card className="border shadow-xs bg-gradient-to-br from-indigo-500/5 to-purple-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" /> {result.conceptExplanation.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs leading-relaxed">
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Core Intuition</h4>
                    <p className="text-muted-foreground">{result.conceptExplanation.coreIdea}</p>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Real-World Application</h4>
                    <p className="text-muted-foreground">{result.conceptExplanation.realWorldApplication}</p>
                  </div>

                  <Separator />

                  <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
                    <h4 className="font-bold text-indigo-700 dark:text-indigo-300 mb-1 text-xs">💡 Key Takeaway</h4>
                    <p className="text-xs text-foreground font-medium">{result.conceptExplanation.keyTakeaway}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-xs">
              General problem resolution.
            </div>
          )}
        </TabsContent>

        {/* Tab 4: Practice Question Generator */}
        <TabsContent value="practice" className="flex-1 overflow-y-auto p-4 space-y-3 m-0">
          <div className="text-xs text-muted-foreground font-medium mb-1">
            Test your understanding with similar practice problems:
          </div>

          {result.practiceProblems.map((prob) => {
            const isExpanded = expandedPracticeId === prob.id;
            return (
              <Card key={prob.id} className="border shadow-xs">
                <CardHeader className="py-3 px-3.5 flex flex-row items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xs font-semibold">{prob.question}</CardTitle>
                    <div className="pt-1">
                      <KatexRenderer math={prob.latex} block={false} className="text-xs font-bold text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedPracticeId(isExpanded ? null : prob.id)}
                    className="h-8 text-xs gap-1"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {isExpanded ? "Hide Solution" : "Show Hint"}
                  </Button>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="px-3.5 pb-3.5 pt-0 border-t bg-muted/30 text-xs space-y-2">
                    <div className="pt-2 text-muted-foreground">
                      <strong className="text-foreground">Hint:</strong> {prob.hint}
                    </div>
                    <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium">
                      <strong>Solution:</strong> <KatexRenderer math={prob.solution} block={false} />
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
