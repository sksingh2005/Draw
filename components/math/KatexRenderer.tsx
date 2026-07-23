"use client";

import React, { useMemo } from "react";
import katex from "katex";
import { cn } from "@/lib/utils";

interface KatexRendererProps {
  math: string;
  block?: boolean;
  className?: string;
  fallbackText?: string;
}

export function KatexRenderer({
  math,
  block = false,
  className,
  fallbackText
}: KatexRendererProps) {
  const html = useMemo(() => {
    if (!math || typeof math !== "string") return null;

    let cleanMath = math.trim();
    // Remove wrapping delimiters if present
    if (cleanMath.startsWith("$$") && cleanMath.endsWith("$$")) {
      cleanMath = cleanMath.slice(2, -2).trim();
    } else if (cleanMath.startsWith("$") && cleanMath.endsWith("$")) {
      cleanMath = cleanMath.slice(1, -1).trim();
    }

    try {
      return katex.renderToString(cleanMath, {
        displayMode: block,
        throwOnError: false,
        output: "html",
      });
    } catch (err) {
      console.warn("KaTeX rendering error for math string:", math, err);
      return null;
    }
  }, [math, block]);

  if (!html) {
    return (
      <span className={cn("font-mono text-sm opacity-80", className)}>
        {fallbackText || math || ""}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "katex-container inline-block selection:bg-primary/20",
        block && "block text-center my-2 overflow-x-auto py-1",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
