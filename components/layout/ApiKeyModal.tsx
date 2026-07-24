"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, Sparkles, CheckCircle2, ExternalLink } from "lucide-react";

interface ApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveKey: (key: string) => void;
  currentKey: string;
}

export function ApiKeyModal({
  open,
  onOpenChange,
  onSaveKey,
  currentKey,
}: ApiKeyModalProps) {
  const [keyInput, setKeyInput] = useState(currentKey);

  useEffect(() => {
    setKeyInput(currentKey);
  }, [currentKey]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveKey(keyInput.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Key className="w-5 h-5 text-indigo-500" />
            Connect Google Gemini AI
          </DialogTitle>
          <DialogDescription className="text-xs">
            Enter your Google Gemini API key to enable live multimodal vision handwriting recognition and real-time LLM math/science problem solving.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Gemini API Key</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                Get Free API Key <ExternalLink className="w-3 h-3" />
              </a>
            </label>

            <Input
              type="password"
              placeholder="AIzaSy..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="text-xs font-mono rounded-xl h-10"
            />
          </div>

          <div className="bg-muted/60 p-3 rounded-xl border text-[11px] text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Model: gemini-2.5-flash
            </div>
            <p>Your API key is stored securely in your browser session and passed directly to your Next.js server route.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Save API Key
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
