"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  PageConfig,
  PageElement,
  PageSection,
  ELEMENT_TEMPLATES,
  generateId,
  ElementType,
} from "./types";
import { ElementLibrary } from "./ElementLibrary";
import { PropertyEditor } from "./PropertyEditor";
import { SortableElement } from "./SortableElement";
import { ElementRenderer } from "./ElementRenderer";
import {
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  Undo,
  Redo,
  Save,
  X,
  GripVertical,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Plus,
  Layers,
} from "lucide-react";

type DevicePreview = "desktop" | "tablet" | "mobile";

interface PageBuilderProps {
  initialConfig: PageConfig;
  language: "en" | "fr";
  onLanguageChange: (lang: "en" | "fr") => void;
  onSave: (config: PageConfig) => Promise<void>;
  isSaving: boolean;
}

export function PageBuilder({
  initialConfig,
  language,
  onLanguageChange,
  onSave,
  isSaving,
}: PageBuilderProps) {
  const [config, setConfig] = useState<PageConfig>(initialConfig);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    config.sections[0]?.id || ""
  );
  const [devicePreview, setDevicePreview] = useState<DevicePreview>("desktop");
  const [showPreview, setShowPreview] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [history, setHistory] = useState<PageConfig[]>([initialConfig]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const currentSection = config.sections.find((s) => s.id === selectedSectionId);
  const selectedElement = currentSection?.elements.find(
    (e) => e.id === selectedElementId
  );

  // History management
  const pushHistory = useCallback((newConfig: PageConfig) => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), newConfig]);
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex((prev) => prev - 1);
      setConfig(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((prev) => prev + 1);
      setConfig(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  // Update config with history
  const updateConfig = useCallback(
    (newConfig: PageConfig) => {
      setConfig(newConfig);
      pushHistory(newConfig);
    },
    [pushHistory]
  );

  // Element operations
  const addElement = useCallback(
    (type: ElementType) => {
      const template = ELEMENT_TEMPLATES.find((t) => t.type === type);
      if (!template || !currentSection) return;

      const newElement: PageElement = {
        id: generateId(),
        type,
        props: template.defaultProps,
      } as PageElement;

      const newConfig = {
        ...config,
        sections: config.sections.map((section) =>
          section.id === selectedSectionId
            ? { ...section, elements: [...section.elements, newElement] }
            : section
        ),
      };

      updateConfig(newConfig);
      setSelectedElementId(newElement.id);
    },
    [config, currentSection, selectedSectionId, updateConfig]
  );

  const updateElement = useCallback(
    (elementId: string, updates: Partial<PageElement["props"]>) => {
      const newConfig: PageConfig = {
        ...config,
        sections: config.sections.map((section) => ({
          ...section,
          elements: section.elements.map((el) =>
            el.id === elementId
              ? { ...el, props: { ...el.props, ...updates } } as PageElement
              : el
          ),
        })),
      };
      updateConfig(newConfig);
    },
    [config, updateConfig]
  );

  const deleteElement = useCallback(
    (elementId: string) => {
      const newConfig = {
        ...config,
        sections: config.sections.map((section) => ({
          ...section,
          elements: section.elements.filter((el) => el.id !== elementId),
        })),
      };
      updateConfig(newConfig);
      setSelectedElementId(null);
    },
    [config, updateConfig]
  );

  const duplicateElement = useCallback(
    (elementId: string) => {
      if (!currentSection) return;
      
      const element = currentSection.elements.find((e) => e.id === elementId);
      if (!element) return;

      const newElement = {
        ...element,
        id: generateId(),
      };

      const elementIndex = currentSection.elements.findIndex(
        (e) => e.id === elementId
      );

      const newConfig = {
        ...config,
        sections: config.sections.map((section) =>
          section.id === selectedSectionId
            ? {
                ...section,
                elements: [
                  ...section.elements.slice(0, elementIndex + 1),
                  newElement,
                  ...section.elements.slice(elementIndex + 1),
                ],
              }
            : section
        ),
      };

      updateConfig(newConfig);
      setSelectedElementId(newElement.id);
    },
    [config, currentSection, selectedSectionId, updateConfig]
  );

  const moveElement = useCallback(
    (elementId: string, direction: "up" | "down") => {
      if (!currentSection) return;

      const elements = [...currentSection.elements];
      const index = elements.findIndex((e) => e.id === elementId);

      if (
        (direction === "up" && index === 0) ||
        (direction === "down" && index === elements.length - 1)
      ) {
        return;
      }

      const newIndex = direction === "up" ? index - 1 : index + 1;
      const newElements = arrayMove(elements, index, newIndex);

      const newConfig = {
        ...config,
        sections: config.sections.map((section) =>
          section.id === selectedSectionId
            ? { ...section, elements: newElements }
            : section
        ),
      };

      updateConfig(newConfig);
    },
    [config, currentSection, selectedSectionId, updateConfig]
  );

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id && currentSection) {
      const oldIndex = currentSection.elements.findIndex(
        (e) => e.id === active.id
      );
      const newIndex = currentSection.elements.findIndex(
        (e) => e.id === over.id
      );

      const newElements = arrayMove(currentSection.elements, oldIndex, newIndex);

      const newConfig = {
        ...config,
        sections: config.sections.map((section) =>
          section.id === selectedSectionId
            ? { ...section, elements: newElements }
            : section
        ),
      };

      updateConfig(newConfig);
    }
  };

  // Section operations
  const addSection = useCallback(() => {
    const newSection: PageSection = {
      id: generateId(),
      name: `Section ${config.sections.length + 1}`,
      elements: [],
      padding: "md",
      maxWidth: "lg",
    };

    const newConfig = {
      ...config,
      sections: [...config.sections, newSection],
    };

    updateConfig(newConfig);
    setSelectedSectionId(newSection.id);
  }, [config, updateConfig]);

  const deleteSection = useCallback(
    (sectionId: string) => {
      if (config.sections.length <= 1) return;

      const newConfig = {
        ...config,
        sections: config.sections.filter((s) => s.id !== sectionId),
      };

      updateConfig(newConfig);
      if (selectedSectionId === sectionId) {
        setSelectedSectionId(newConfig.sections[0]?.id || "");
      }
    },
    [config, selectedSectionId, updateConfig]
  );

  const activeElement = currentSection?.elements.find((e) => e.id === activeId);

  const previewWidths = {
    desktop: "w-full",
    tablet: "max-w-2xl",
    mobile: "max-w-sm",
  };

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Top Toolbar */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-900">Page Builder</h1>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {(["en", "fr"] as const).map((l) => (
              <button
                key={l}
                onClick={() => onLanguageChange(l)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                  language === l
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-2">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo"
            >
              <Undo className="w-4 h-4" />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo"
            >
              <Redo className="w-4 h-4" />
            </button>
          </div>

          {/* Device Preview */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setDevicePreview("desktop")}
              className={`p-1.5 rounded-md transition-colors ${
                devicePreview === "desktop"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="Desktop"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDevicePreview("tablet")}
              className={`p-1.5 rounded-md transition-colors ${
                devicePreview === "tablet"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="Tablet"
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDevicePreview("mobile")}
              className={`p-1.5 rounded-md transition-colors ${
                devicePreview === "mobile"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="Mobile"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>

          {/* Preview Toggle */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showPreview
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>

          {/* Save Button */}
          <button
            onClick={() => onSave(config)}
            disabled={isSaving}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Element Library */}
        {!showPreview && (
          <div className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Elements
              </h2>
            </div>
            <ElementLibrary onAddElement={addElement} />
          </div>
        )}

        {/* Center - Canvas */}
        <div className="flex-1 overflow-auto p-6">
          <div
            className={`mx-auto bg-white rounded-2xl shadow-xl overflow-hidden transition-all ${previewWidths[devicePreview]}`}
          >
            {/* Section Tabs */}
            {!showPreview && (
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
                <Layers className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {config.sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setSelectedSectionId(section.id);
                      setSelectedElementId(null);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      selectedSectionId === section.id
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                    }`}
                  >
                    {section.name}
                    {config.sections.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSection(section.id);
                        }}
                        className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </button>
                ))}
                <button
                  onClick={addSection}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-white/50 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  Add Section
                </button>
              </div>
            )}

            {/* Canvas Content */}
            <div className="min-h-[600px] bg-gradient-to-br from-slate-50 via-white to-slate-100">
              {showPreview ? (
                // Preview Mode
                <div className="py-8">
                  {config.sections.map((section) => (
                    <div
                      key={section.id}
                      className={`px-4 ${
                        section.padding === "sm"
                          ? "py-4"
                          : section.padding === "lg"
                          ? "py-12"
                          : section.padding === "xl"
                          ? "py-16"
                          : "py-8"
                      }`}
                      style={{ backgroundColor: section.backgroundColor }}
                    >
                      <div
                        className={`mx-auto ${
                          section.maxWidth === "sm"
                            ? "max-w-2xl"
                            : section.maxWidth === "md"
                            ? "max-w-4xl"
                            : section.maxWidth === "xl"
                            ? "max-w-7xl"
                            : "max-w-6xl"
                        } space-y-4`}
                      >
                        {section.elements.map((element) => (
                          <ElementRenderer
                            key={element.id}
                            element={element}
                            language={language}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Edit Mode
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <div className="p-6">
                    {currentSection && currentSection.elements.length > 0 ? (
                      <SortableContext
                        items={currentSection.elements.map((e) => e.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {currentSection.elements.map((element, index) => (
                            <SortableElement
                              key={element.id}
                              element={element}
                              language={language}
                              isSelected={selectedElementId === element.id}
                              onSelect={() => setSelectedElementId(element.id)}
                              onDelete={() => deleteElement(element.id)}
                              onDuplicate={() => duplicateElement(element.id)}
                              onMoveUp={
                                index > 0
                                  ? () => moveElement(element.id, "up")
                                  : undefined
                              }
                              onMoveDown={
                                index < currentSection.elements.length - 1
                                  ? () => moveElement(element.id, "down")
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      </SortableContext>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                          <Plus className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">
                          No elements yet
                        </h3>
                        <p className="text-sm text-slate-500 max-w-xs">
                          Click on an element in the left sidebar to add it to
                          your page
                        </p>
                      </div>
                    )}
                  </div>

                  <DragOverlay>
                    {activeElement && (
                      <div className="bg-white rounded-xl shadow-2xl p-4 opacity-90">
                        <ElementRenderer
                          element={activeElement}
                          language={language}
                        />
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Property Editor */}
        {!showPreview && selectedElement && (
          <div className="w-80 bg-white border-l border-slate-200 flex-shrink-0 overflow-auto">
            <PropertyEditor
              element={selectedElement}
              language={language}
              onUpdate={(updates) => updateElement(selectedElement.id, updates)}
              onClose={() => setSelectedElementId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
