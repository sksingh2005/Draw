"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import { Slider } from "@/components/ui/slider";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KatexRenderer } from "./KatexRenderer";
import { Activity, Sliders, Eye } from "lucide-react";
import { GraphConfig, generateSamplePoints } from "@/lib/math-parser";

interface FunctionGrapherProps {
  config: GraphConfig;
  className?: string;
}

export function FunctionGrapher({ config, className }: FunctionGrapherProps) {
  const [paramA, setParamA] = useState<number>(1);
  const [paramB, setParamB] = useState<number>(0);
  const [paramC, setParamC] = useState<number>(0);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Determine if function has adjustable quadratic or linear parameters
  const isQuadratic = config.functionString.includes("x^2") || config.functionString.includes("x*x");
  const isLinear = config.functionString.includes("x") && !isQuadratic;

  // Calculate dynamic points when sliders change
  const graphData = useMemo(() => {
    const minX = config.domain[0];
    const maxX = config.domain[1];
    const step = (maxX - minX) / 80;
    const points = [];

    for (let x = minX; x <= maxX; x += step) {
      let y = 0;
      if (isQuadratic) {
        // a*x^2 + b*x + c
        y = paramA * x * x + paramB * x + paramC;
      } else if (isLinear) {
        // a*x + b
        y = paramA * x + paramB;
      } else if (config.functionString.includes("sin")) {
        y = paramA * Math.sin(paramB * x + paramC);
      } else if (config.functionString.includes("cos")) {
        y = paramA * Math.cos(paramB * x + paramC);
      } else {
        // Fallback to initial sampled points
        const match = config.points.find((p) => Math.abs(p.x - x) < step);
        y = match ? match.y : x;
      }

      points.push({
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      });
    }

    return points;
  }, [config, paramA, paramB, paramC, isQuadratic, isLinear]);

  // Compute quadratic vertex if applicable
  const vertex = useMemo(() => {
    if (isQuadratic && paramA !== 0) {
      const vx = -paramB / (2 * paramA);
      const vy = paramA * vx * vx + paramB * vx + paramC;
      return { x: Number(vx.toFixed(2)), y: Number(vy.toFixed(2)) };
    }
    return null;
  }, [isQuadratic, paramA, paramB, paramC]);

  return (
    <Card className={`border shadow-sm bg-card/80 backdrop-blur ${className || ""}`}>
      <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-500" />
          <CardTitle className="text-sm font-semibold">
            {config.title || "Interactive Math Function Graph"}
          </CardTitle>
        </div>
        <Badge variant="outline" className="font-mono text-[11px] bg-primary/5">
          <KatexRenderer math={config.functionString} block={false} />
        </Badge>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Graph Display Area */}
        <div className="w-full h-64 bg-background/90 rounded-lg p-2 border relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={graphData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
              <XAxis
                dataKey="x"
                type="number"
                domain={config.domain}
                tick={{ fontSize: 11 }}
                stroke="#888888"
              />
              <YAxis tick={{ fontSize: 11 }} stroke="#888888" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "12px",
                }}
                formatter={(val: any) => [`y = ${val}`, "Value"]}
                labelFormatter={(label) => `x = ${label}`}
              />

              {/* Axes Zero Lines */}
              <ReferenceLine y={0} stroke="#666" strokeWidth={1.5} />
              <ReferenceLine x={0} stroke="#666" strokeWidth={1.5} />

              {/* Main Function Curve */}
              <Line
                type="monotone"
                dataKey="y"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 6, fill: "#6366f1", stroke: "#fff" }}
              />

              {/* Vertex Point Marker */}
              {vertex && (
                <ReferenceDot
                  x={vertex.x}
                  y={vertex.y}
                  r={5}
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}

              {/* Critical Points */}
              {config.criticalPoints?.map((cp, idx) => (
                <ReferenceDot
                  key={idx}
                  x={cp.x}
                  y={cp.y}
                  r={4}
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Dynamic Parameter Sliders */}
        {(isQuadratic || isLinear) && (
          <div className="space-y-3 pt-2 border-t text-xs">
            <div className="flex items-center justify-between font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5 text-foreground">
                <Sliders className="w-3.5 h-3.5 text-indigo-500" /> Dynamic Coefficients
              </span>
              {vertex && (
                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                  Vertex: ({vertex.x}, {vertex.y})
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Coefficient a (scale / curvature): <strong>{paramA}</strong></span>
              </div>
              <Slider
                value={[paramA]}
                onValueChange={(val: any) => {
                  const num = Array.isArray(val) ? val[0] : val;
                  if (typeof num === "number") setParamA(num);
                }}
                min={-5}
                max={5}
                step={0.5}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Coefficient b (shift): <strong>{paramB}</strong></span>
              </div>
              <Slider
                value={[paramB]}
                onValueChange={(val: any) => {
                  const num = Array.isArray(val) ? val[0] : val;
                  if (typeof num === "number") setParamB(num);
                }}
                min={-10}
                max={10}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Constant c (y-intercept): <strong>{paramC}</strong></span>
              </div>
              <Slider
                value={[paramC]}
                onValueChange={(val: any) => {
                  const num = Array.isArray(val) ? val[0] : val;
                  if (typeof num === "number") setParamC(num);
                }}
                min={-10}
                max={10}
                step={1}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
