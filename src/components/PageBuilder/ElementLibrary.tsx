"use client";

import { ELEMENT_TEMPLATES, ElementType } from "./types";
import {
  Layout,
  Type,
  AlignLeft,
  Image,
  MousePointer,
  SeparatorHorizontal,
  Minus,
  Square,
  Grid3x3,
  Sparkles,
  MessageSquare,
  Phone,
  ListOrdered,
  ToggleLeft,
  LayoutGrid,
  List,
  FileText,
  Clock,
  ClipboardCheck,
  CheckCircle,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Layout,
  Type,
  AlignLeft,
  Image,
  MousePointer,
  SeparatorHorizontal,
  Minus,
  Square,
  Grid3x3,
  Sparkles,
  MessageSquare,
  Phone,
  ListOrdered,
  ToggleLeft,
  LayoutGrid,
  List,
  FileText,
  Clock,
  ClipboardCheck,
  CheckCircle,
};

interface ElementLibraryProps {
  onAddElement: (type: ElementType) => void;
}

export function ElementLibrary({ onAddElement }: ElementLibraryProps) {
  const categories = [
    {
      name: "Layout",
      types: ["hero", "spacer", "divider", "progress-stepper"] as ElementType[],
    },
    {
      name: "Content",
      types: ["heading", "text", "image", "logo"] as ElementType[],
    },
    {
      name: "Actions",
      types: ["button", "card", "choice-buttons"] as ElementType[],
    },
    {
      name: "Booking Flow",
      types: ["category-grid", "treatment-list", "booking-form", "time-slots", "confirmation-summary", "success-message"] as ElementType[],
    },
    {
      name: "Advanced",
      types: ["feature-grid"] as ElementType[],
    },
  ];

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6">
      {categories.map((category) => (
        <div key={category.name}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            {category.name}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {category.types.map((type) => {
              const template = ELEMENT_TEMPLATES.find((t) => t.type === type);
              if (!template) return null;

              const IconComponent = ICON_MAP[template.icon];

              return (
                <button
                  key={type}
                  onClick={() => onAddElement(type)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 hover:shadow-md transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                    {IconComponent && (
                      <IconComponent className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-slate-700 group-hover:text-blue-700 text-center transition-colors">
                    {template.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Quick Add Section */}
      <div className="pt-4 border-t border-slate-200">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Quick Add
        </h3>
        <div className="space-y-2">
          <button
            onClick={() => {
              onAddElement("heading");
              onAddElement("text");
              onAddElement("button");
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <Layout className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-slate-700 group-hover:text-blue-700">
                Content Block
              </p>
              <p className="text-xs text-slate-500">
                Heading + Text + Button
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
