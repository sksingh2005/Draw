"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KatexRenderer } from "./KatexRenderer";
import { Sparkles, Calculator, Compass, Atom, FunctionSquare, Server, Database } from "lucide-react";

export interface MathTemplate {
  id: string;
  name: string;
  category: "algebra" | "calculus" | "geometry" | "physics" | "architecture";
  latex: string;
  description: string;
}

const PRESET_TEMPLATES: MathTemplate[] = [
  // System Architecture & DB Schemas
  {
    id: "microservices-arch",
    name: "Microservices Cloud Architecture",
    category: "architecture",
    latex: "\\text{Client} \\rightarrow \\text{API Gateway} \\rightarrow \\text{Auth Service} \\rightarrow \\text{PostgreSQL}",
    description: "Decoupled cloud infrastructure with API Gateway, Auth Microservice, and DB."
  },
  {
    id: "database-er-schema",
    name: "E-Commerce Database ER Schema",
    category: "architecture",
    latex: "\\text{Users}(id) \\xleftarrow{1:N} \\text{Orders}(id, user\\_id) \\xrightarrow{N:1} \\text{Payments}",
    description: "Relational database schema with Primary/Foreign Keys and entity relationships."
  },
  {
    id: "kafka-event-driven",
    name: "Event-Driven Kafka Architecture",
    category: "architecture",
    latex: "\\text{Producers} \\rightarrow \\text{Kafka Cluster} \\rightarrow \\text{Consumer Groups}",
    description: "Asynchronous pub/sub event pipeline with message brokers and workers."
  },
  {
    id: "oauth2-auth-flow",
    name: "OAuth 2.0 Authorization Flow",
    category: "architecture",
    latex: "\\text{Client} \\rightarrow \\text{Auth Server} \\rightarrow \\text{JWT Token} \\rightarrow \\text{Resource API}",
    description: "Secure token-based authentication and authorization flow."
  },

  // Algebra
  {
    id: "quad-formula",
    name: "Quadratic Formula",
    category: "algebra",
    latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
    description: "Finds real and complex roots for quadratic equation ax² + bx + c = 0."
  },
  {
    id: "poly-factor",
    name: "Difference of Squares",
    category: "algebra",
    latex: "a^2 - b^2 = (a - b)(a + b)",
    description: "Algebraic identity for factoring square differences."
  },

  // Calculus
  {
    id: "derivative-power",
    name: "Power Rule Derivative",
    category: "calculus",
    latex: "\\frac{d}{dx}[x^n] = n x^{n-1}",
    description: "Fundamental rule for differentiating power functions."
  },
  {
    id: "integral-parts",
    name: "Integration by Parts",
    category: "calculus",
    latex: "\\int u \\, dv = uv - \\int v \\, du",
    description: "Calculus integration technique for product functions."
  },

  // Geometry & Trig
  {
    id: "pythagorean-theorem",
    name: "Pythagorean Theorem",
    category: "geometry",
    latex: "a^2 + b^2 = c^2",
    description: "Relates hypotenuse c to leg lengths a and b in right triangles."
  },

  // Physics
  {
    id: "einstein-energy",
    name: "Mass-Energy Equivalence",
    category: "physics",
    latex: "E = m c^2",
    description: "Einstein's relation between mass and rest energy."
  },
  {
    id: "kinematic-motion",
    name: "Kinematic Position Equation",
    category: "physics",
    latex: "x(t) = x_0 + v_0 t + \\frac{1}{2} a t^2",
    description: "Describes displacement under constant acceleration."
  }
];

interface MathPresetLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: MathTemplate) => void;
}

export function MathPresetLibrary({
  open,
  onOpenChange,
  onSelectTemplate,
}: MathPresetLibraryProps) {
  const [selectedTab, setSelectedTab] = useState<string>("all");

  const filteredTemplates = PRESET_TEMPLATES.filter(
    (t) => selectedTab === "all" || t.category === selectedTab
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            Canvas Template & Architecture Library
          </DialogTitle>
          <DialogDescription>
            Select a system architecture diagram, database schema, or math formula to insert onto your whiteboard.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="all" value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-6 w-full bg-muted/60 p-1">
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="architecture" className="text-xs flex items-center gap-1">
              <Server className="w-3.5 h-3.5" /> Systems
            </TabsTrigger>
            <TabsTrigger value="algebra" className="text-xs flex items-center gap-1">
              <Calculator className="w-3.5 h-3.5" /> Algebra
            </TabsTrigger>
            <TabsTrigger value="calculus" className="text-xs flex items-center gap-1">
              <FunctionSquare className="w-3.5 h-3.5" /> Calculus
            </TabsTrigger>
            <TabsTrigger value="geometry" className="text-xs flex items-center gap-1">
              <Compass className="w-3.5 h-3.5" /> Geometry
            </TabsTrigger>
            <TabsTrigger value="physics" className="text-xs flex items-center gap-1">
              <Atom className="w-3.5 h-3.5" /> Physics
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-3">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                onClick={() => {
                  onSelectTemplate(template);
                  onOpenChange(false);
                }}
                className="group border rounded-xl p-4 transition-all duration-200 hover:border-primary hover:shadow-md cursor-pointer bg-card hover:bg-accent/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                      {template.name}
                    </h4>
                    <Badge variant="outline" className="capitalize text-[10px] py-0 px-2">
                      {template.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {template.description}
                  </p>
                </div>

                <div className="bg-muted/80 dark:bg-zinc-900 px-3 py-2 rounded-lg border text-center self-start sm:self-center min-w-[180px]">
                  <KatexRenderer math={template.latex} block={false} className="text-sm font-semibold" />
                </div>
              </div>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
