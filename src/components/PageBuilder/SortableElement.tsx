"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageElement } from "./types";
import { ElementRenderer } from "./ElementRenderer";
import {
  GripVertical,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface SortableElementProps {
  element: PageElement;
  language: "en" | "fr";
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function SortableElement({
  element,
  language,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: SortableElementProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl transition-all ${
        isDragging
          ? "opacity-50 shadow-2xl z-50"
          : isSelected
          ? "ring-2 ring-blue-500 ring-offset-2"
          : "hover:ring-2 hover:ring-blue-200 hover:ring-offset-2"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Element Content */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <ElementRenderer element={element} language={language} isEditing />
      </div>

      {/* Toolbar */}
      <div
        className={`absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-slate-200 px-1 py-1 transition-opacity ${
          isSelected || isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-200" />

        {/* Move Up */}
        {onMoveUp && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Move up"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        )}

        {/* Move Down */}
        {onMoveDown && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Move down"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        <div className="w-px h-4 bg-slate-200" />

        {/* Duplicate */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Duplicate"
        >
          <Copy className="w-4 h-4" />
        </button>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Element Type Label */}
      {isSelected && (
        <div className="absolute -bottom-2 left-4 bg-blue-500 text-white text-xs px-2 py-0.5 rounded font-medium capitalize">
          {element.type}
        </div>
      )}
    </div>
  );
}
