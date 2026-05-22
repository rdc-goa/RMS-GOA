
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { 
  Bold, Italic, Underline, Strikethrough, 
  Type, List, ListOrdered, AlignLeft, 
  AlignCenter, AlignRight, Quote, Link, 
  Image as ImageIcon, Subscript, Superscript,
  Eraser
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface RichTextEditorProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A custom, lightweight Rich Text Editor using native contentEditable.
 * This implementation avoids third-party library dependency conflicts (like Tiptap/Quill)
 * while providing the necessary scientific and rich text formatting.
 */
export function RichTextEditor({ value, onChange, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Synchronize internal value with external value on mount
  useEffect(() => {
    setIsMounted(true);
    if (editorRef.current && value !== undefined && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, []);

  // Update editor content if value changes externally (and it's not our own change)
  useEffect(() => {
    if (editorRef.current && value !== undefined && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      const content = editorRef.current.innerHTML;
      onChange(content);
    }
  };

  const execCommand = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  const ToolbarButton = ({ 
    icon: Icon, 
    onClick, 
    label, 
    active = false 
  }: { 
    icon: any, 
    onClick: () => void, 
    label: string,
    active?: boolean
  }) => (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0",
              active && "bg-muted text-primary"
            )}
            onClick={(e) => {
              e.preventDefault();
              onClick();
            }}
          >
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  if (!isMounted) {
    return <div className="h-[200px] w-full animate-pulse bg-muted rounded-md border" />;
  }

  return (
    <div className={cn("flex flex-col w-full rounded-md border border-input bg-background", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-1 border-bottom bg-muted/50 rounded-t-md border-b">
        <div className="flex items-center border-r pr-1 mr-1">
          <ToolbarButton icon={Type} label="Heading 1" onClick={() => execCommand('formatBlock', '<h1>')} />
          <ToolbarButton icon={Type} label="Heading 2" onClick={() => execCommand('formatBlock', '<h2>')} />
        </div>
        
        <div className="flex items-center border-r pr-1 mr-1">
          <ToolbarButton icon={Bold} label="Bold" onClick={() => execCommand('bold')} />
          <ToolbarButton icon={Italic} label="Italic" onClick={() => execCommand('italic')} />
          <ToolbarButton icon={Underline} label="Underline" onClick={() => execCommand('underline')} />
          <ToolbarButton icon={Strikethrough} label="Strike" onClick={() => execCommand('strikeThrough')} />
        </div>

        <div className="flex items-center border-r pr-1 mr-1 text-primary">
          <ToolbarButton icon={Subscript} label="Subscript" onClick={() => execCommand('subscript')} />
          <ToolbarButton icon={Superscript} label="Superscript" onClick={() => execCommand('superscript')} />
        </div>

        <div className="flex items-center border-r pr-1 mr-1">
          <ToolbarButton icon={List} label="Bullet List" onClick={() => execCommand('insertUnorderedList')} />
          <ToolbarButton icon={ListOrdered} label="Ordered List" onClick={() => execCommand('insertOrderedList')} />
        </div>

        <div className="flex items-center border-r pr-1 mr-1">
          <ToolbarButton icon={AlignLeft} label="Align Left" onClick={() => execCommand('justifyLeft')} />
          <ToolbarButton icon={AlignCenter} label="Align Center" onClick={() => execCommand('justifyCenter')} />
          <ToolbarButton icon={AlignRight} label="Align Right" onClick={() => execCommand('justifyRight')} />
        </div>

        <div className="flex items-center">
          <ToolbarButton icon={Quote} label="Blockquote" onClick={() => execCommand('formatBlock', '<blockquote>')} />
          <ToolbarButton icon={Link} label="Insert Link" onClick={() => {
            const url = prompt('Enter URL:');
            if (url) execCommand('createLink', url);
          }} />
          <ToolbarButton icon={Eraser} label="Clear Formatting" onClick={() => execCommand('removeFormat')} />
        </div>
      </div>

      {/* Editor Content Area */}
      <div 
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="min-h-[200px] w-full p-4 focus:outline-none overflow-y-auto prose prose-sm dark:prose-invert max-w-none"
        style={{ scrollbarWidth: 'thin' }}
      />

      <style jsx global>{`
        [contenteditable]:empty:before {
          content: "Type your content here...";
          color: hsl(var(--muted-foreground));
          font-style: italic;
        }
        [contenteditable] h1 { font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem; }
        [contenteditable] h2 { font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem; }
        [contenteditable] blockquote { border-left: 2px solid hsl(var(--border)); padding-left: 1rem; color: hsl(var(--muted-foreground)); }
        [contenteditable] ul { list-style-type: disc; padding-left: 1.5rem; }
        [contenteditable] ol { list-style-type: decimal; padding-left: 1.5rem; }
      `}</style>
    </div>
  );
}
