"use client";

import { PageElement } from "./types";
import { X, ChevronDown, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

interface PropertyEditorProps {
  element: PageElement;
  language: "en" | "fr";
  onUpdate: (updates: Partial<PageElement["props"]>) => void;
  onClose: () => void;
}

export function PropertyEditor({
  element,
  language,
  onUpdate,
  onClose,
}: PropertyEditorProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([
    "content",
    "style",
  ]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const updateLocalizedText = (
    key: string,
    lang: "en" | "fr",
    value: string
  ) => {
    const currentValue = (element.props as Record<string, unknown>)[key] as
      | { en: string; fr: string }
      | undefined;
    onUpdate({
      [key]: {
        en: currentValue?.en || "",
        fr: currentValue?.fr || "",
        [lang]: value,
      },
    });
  };

  const Section = ({
    title,
    id,
    children,
  }: {
    title: string;
    id: string;
    children: React.ReactNode;
  }) => (
    <div className="border-b border-slate-200">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${
            expandedSections.includes(id) ? "rotate-180" : ""
          }`}
        />
      </button>
      {expandedSections.includes(id) && (
        <div className="px-4 pb-4 space-y-4">{children}</div>
      )}
    </div>
  );

  const InputField = ({
    label,
    value,
    onChange,
    type = "text",
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: "text" | "url" | "number";
    placeholder?: string;
  }) => (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
      />
    </div>
  );

  const TextAreaField = ({
    label,
    value,
    onChange,
    rows = 3,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    placeholder?: string;
  }) => (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
      />
    </div>
  );

  const SelectField = ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all bg-white"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  const ToggleField = ({
    label,
    value,
    onChange,
    description,
  }: {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    description?: string;
  }) => (
    <div className="flex items-start justify-between gap-3">
      <div>
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors ${
          value ? "bg-blue-500" : "bg-slate-200"
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            value ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );

  const LocalizedTextField = ({
    label,
    propKey,
    multiline = false,
  }: {
    label: string;
    propKey: string;
    multiline?: boolean;
  }) => {
    const value = (element.props as Record<string, unknown>)[propKey] as
      | { en: string; fr: string }
      | undefined;
    
    return (
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          {label} ({language.toUpperCase()})
        </label>
        {multiline ? (
          <textarea
            value={value?.[language] || ""}
            onChange={(e) => updateLocalizedText(propKey, language, e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
          />
        ) : (
          <input
            type="text"
            value={value?.[language] || ""}
            onChange={(e) => updateLocalizedText(propKey, language, e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
          />
        )}
        <p className="text-xs text-slate-400 mt-1">
          Currently editing {language === "en" ? "English" : "French"} version
        </p>
      </div>
    );
  };

  const renderElementProperties = () => {
    switch (element.type) {
      case "heading":
        return (
          <>
            <Section title="Content" id="content">
              <LocalizedTextField label="Heading Text" propKey="text" />
              <SelectField
                label="Level"
                value={element.props.level}
                onChange={(v) =>
                  onUpdate({ level: v as "h1" | "h2" | "h3" | "h4" })
                }
                options={[
                  { value: "h1", label: "H1 - Page Title" },
                  { value: "h2", label: "H2 - Section Title" },
                  { value: "h3", label: "H3 - Subsection" },
                  { value: "h4", label: "H4 - Small Heading" },
                ]}
              />
            </Section>
            <Section title="Style" id="style">
              <SelectField
                label="Alignment"
                value={element.props.alignment}
                onChange={(v) =>
                  onUpdate({ alignment: v as "left" | "center" | "right" })
                }
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
              />
              <InputField
                label="Color"
                value={element.props.color || ""}
                onChange={(v) => onUpdate({ color: v || undefined })}
                placeholder="#000000"
              />
            </Section>
          </>
        );

      case "text":
        return (
          <>
            <Section title="Content" id="content">
              <LocalizedTextField
                label="Text Content"
                propKey="content"
                multiline
              />
            </Section>
            <Section title="Style" id="style">
              <SelectField
                label="Font Size"
                value={element.props.fontSize}
                onChange={(v) =>
                  onUpdate({ fontSize: v as "sm" | "base" | "lg" | "xl" })
                }
                options={[
                  { value: "sm", label: "Small" },
                  { value: "base", label: "Normal" },
                  { value: "lg", label: "Large" },
                  { value: "xl", label: "Extra Large" },
                ]}
              />
              <SelectField
                label="Alignment"
                value={element.props.alignment}
                onChange={(v) =>
                  onUpdate({ alignment: v as "left" | "center" | "right" })
                }
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
              />
              <InputField
                label="Color"
                value={element.props.color || ""}
                onChange={(v) => onUpdate({ color: v || undefined })}
                placeholder="#666666"
              />
            </Section>
          </>
        );

      case "button":
        return (
          <>
            <Section title="Content" id="content">
              <LocalizedTextField label="Button Text" propKey="text" />
              <InputField
                label="Link URL"
                value={element.props.href}
                onChange={(v) => onUpdate({ href: v })}
                type="url"
                placeholder="https://..."
              />
            </Section>
            <Section title="Style" id="style">
              <SelectField
                label="Variant"
                value={element.props.variant}
                onChange={(v) =>
                  onUpdate({
                    variant: v as "primary" | "secondary" | "outline",
                  })
                }
                options={[
                  { value: "primary", label: "Primary (Dark)" },
                  { value: "secondary", label: "Secondary (Light)" },
                  { value: "outline", label: "Outline" },
                ]}
              />
              <SelectField
                label="Size"
                value={element.props.size}
                onChange={(v) => onUpdate({ size: v as "sm" | "md" | "lg" })}
                options={[
                  { value: "sm", label: "Small" },
                  { value: "md", label: "Medium" },
                  { value: "lg", label: "Large" },
                ]}
              />
              <SelectField
                label="Icon"
                value={element.props.icon || "none"}
                onChange={(v) =>
                  onUpdate({
                    icon: v as
                      | "calendar"
                      | "arrow-right"
                      | "phone"
                      | "email"
                      | "none",
                  })
                }
                options={[
                  { value: "none", label: "No Icon" },
                  { value: "calendar", label: "Calendar" },
                  { value: "arrow-right", label: "Arrow Right" },
                  { value: "phone", label: "Phone" },
                  { value: "email", label: "Email" },
                ]}
              />
              <ToggleField
                label="Full Width"
                value={element.props.fullWidth || false}
                onChange={(v) => onUpdate({ fullWidth: v })}
              />
            </Section>
          </>
        );

      case "image":
        return (
          <>
            <Section title="Image" id="content">
              <div className="space-y-3">
                <InputField
                  label="Image URL"
                  value={element.props.src}
                  onChange={(v) => onUpdate({ src: v })}
                  type="url"
                  placeholder="/images/..."
                />
                <div className="aspect-video bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200 overflow-hidden">
                  {element.props.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={element.props.src}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <LocalizedTextField label="Alt Text" propKey="alt" />
              </div>
            </Section>
            <Section title="Size" id="size">
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label="Width (px)"
                  value={String(element.props.width || "")}
                  onChange={(v) =>
                    onUpdate({ width: v ? parseInt(v) : undefined })
                  }
                  type="number"
                  placeholder="400"
                />
                <InputField
                  label="Height (px)"
                  value={String(element.props.height || "")}
                  onChange={(v) =>
                    onUpdate({ height: v ? parseInt(v) : undefined })
                  }
                  type="number"
                  placeholder="300"
                />
              </div>
            </Section>
            <Section title="Style" id="style">
              <ToggleField
                label="Rounded Corners"
                value={element.props.rounded || false}
                onChange={(v) => onUpdate({ rounded: v })}
              />
              <ToggleField
                label="Shadow"
                value={element.props.shadow || false}
                onChange={(v) => onUpdate({ shadow: v })}
              />
            </Section>
          </>
        );

      case "spacer":
        return (
          <Section title="Size" id="content">
            <SelectField
              label="Height"
              value={element.props.height}
              onChange={(v) =>
                onUpdate({ height: v as "xs" | "sm" | "md" | "lg" | "xl" })
              }
              options={[
                { value: "xs", label: "Extra Small (8px)" },
                { value: "sm", label: "Small (16px)" },
                { value: "md", label: "Medium (32px)" },
                { value: "lg", label: "Large (48px)" },
                { value: "xl", label: "Extra Large (64px)" },
              ]}
            />
          </Section>
        );

      case "divider":
        return (
          <Section title="Style" id="style">
            <SelectField
              label="Line Style"
              value={element.props.style}
              onChange={(v) =>
                onUpdate({ style: v as "solid" | "dashed" | "dotted" })
              }
              options={[
                { value: "solid", label: "Solid" },
                { value: "dashed", label: "Dashed" },
                { value: "dotted", label: "Dotted" },
              ]}
            />
            <SelectField
              label="Width"
              value={element.props.width || "full"}
              onChange={(v) =>
                onUpdate({ width: v as "full" | "half" | "quarter" })
              }
              options={[
                { value: "full", label: "Full Width" },
                { value: "half", label: "Half Width" },
                { value: "quarter", label: "Quarter Width" },
              ]}
            />
            <InputField
              label="Color"
              value={element.props.color || ""}
              onChange={(v) => onUpdate({ color: v || undefined })}
              placeholder="#e2e8f0"
            />
          </Section>
        );

      case "logo":
        return (
          <>
            <Section title="Image" id="content">
              <InputField
                label="Logo URL"
                value={element.props.src}
                onChange={(v) => onUpdate({ src: v })}
                type="url"
                placeholder="/logos/..."
              />
              <InputField
                label="Alt Text"
                value={element.props.alt}
                onChange={(v) => onUpdate({ alt: v })}
              />
            </Section>
            <Section title="Size" id="size">
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label="Width (px)"
                  value={String(element.props.width)}
                  onChange={(v) => onUpdate({ width: parseInt(v) || 200 })}
                  type="number"
                />
                <InputField
                  label="Height (px)"
                  value={String(element.props.height)}
                  onChange={(v) => onUpdate({ height: parseInt(v) || 60 })}
                  type="number"
                />
              </div>
            </Section>
            <Section title="Style" id="style">
              <SelectField
                label="Alignment"
                value={element.props.alignment}
                onChange={(v) =>
                  onUpdate({ alignment: v as "left" | "center" | "right" })
                }
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
              />
            </Section>
          </>
        );

      case "card":
        return (
          <>
            <Section title="Content" id="content">
              <LocalizedTextField label="Title" propKey="title" />
              <LocalizedTextField
                label="Description"
                propKey="description"
                multiline
              />
              <InputField
                label="Image URL"
                value={element.props.image || ""}
                onChange={(v) => onUpdate({ image: v || undefined })}
                type="url"
                placeholder="/images/..."
              />
              <InputField
                label="Link URL"
                value={element.props.link || ""}
                onChange={(v) => onUpdate({ link: v || undefined })}
                type="url"
              />
            </Section>
            <Section title="Style" id="style">
              <SelectField
                label="Variant"
                value={element.props.variant}
                onChange={(v) =>
                  onUpdate({
                    variant: v as "default" | "bordered" | "elevated",
                  })
                }
                options={[
                  { value: "default", label: "Default" },
                  { value: "bordered", label: "Bordered" },
                  { value: "elevated", label: "Elevated (Shadow)" },
                ]}
              />
            </Section>
          </>
        );

      case "hero":
        return (
          <>
            <Section title="Content" id="content">
              <LocalizedTextField label="Title" propKey="title" />
              <LocalizedTextField
                label="Subtitle"
                propKey="subtitle"
                multiline
              />
              <ToggleField
                label="Show Logo"
                value={element.props.showLogo || false}
                onChange={(v) => onUpdate({ showLogo: v })}
              />
              {element.props.showLogo && (
                <InputField
                  label="Logo URL"
                  value={element.props.logoUrl || ""}
                  onChange={(v) => onUpdate({ logoUrl: v })}
                  type="url"
                />
              )}
            </Section>
            <Section title="Style" id="style">
              <SelectField
                label="Alignment"
                value={element.props.alignment}
                onChange={(v) =>
                  onUpdate({ alignment: v as "left" | "center" | "right" })
                }
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
              />
              <InputField
                label="Background Color"
                value={element.props.backgroundColor || ""}
                onChange={(v) => onUpdate({ backgroundColor: v || undefined })}
                placeholder="#ffffff"
              />
              <InputField
                label="Background Image URL"
                value={element.props.backgroundImage || ""}
                onChange={(v) => onUpdate({ backgroundImage: v || undefined })}
                type="url"
              />
            </Section>
          </>
        );

      case "feature-grid":
        return (
          <Section title="Grid Settings" id="content">
            <SelectField
              label="Columns"
              value={String(element.props.columns)}
              onChange={(v) =>
                onUpdate({ columns: parseInt(v) as 2 | 3 | 4 })
              }
              options={[
                { value: "2", label: "2 Columns" },
                { value: "3", label: "3 Columns" },
                { value: "4", label: "4 Columns" },
              ]}
            />
            <p className="text-xs text-slate-500">
              Add feature items by editing the JSON configuration.
            </p>
          </Section>
        );

      // Booking Flow Elements
      case "progress-stepper":
        return (
          <Section title="Stepper Settings" id="content">
            <InputField
              label="Current Step"
              value={String(element.props.currentStep)}
              onChange={(v) => onUpdate({ currentStep: parseInt(v) || 1 })}
              type="number"
            />
            <InputField
              label="Total Steps"
              value={String(element.props.totalSteps)}
              onChange={(v) => onUpdate({ totalSteps: parseInt(v) || 5 })}
              type="number"
            />
            <ToggleField
              label="Show Labels"
              value={element.props.showLabels || false}
              onChange={(v) => onUpdate({ showLabels: v })}
            />
          </Section>
        );

      case "choice-buttons":
        return (
          <>
            <Section title="Layout" id="style">
              <SelectField
                label="Layout Direction"
                value={element.props.layout}
                onChange={(v) =>
                  onUpdate({ layout: v as "horizontal" | "vertical" })
                }
                options={[
                  { value: "horizontal", label: "Horizontal" },
                  { value: "vertical", label: "Vertical" },
                ]}
              />
            </Section>
            <Section title="Choices" id="content">
              <p className="text-xs text-slate-500 mb-2">
                Configure choice buttons. Each choice has a label, icon, link, and style.
              </p>
              {element.props.choices.map((choice, idx) => (
                <div key={choice.id} className="mb-4 p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs font-medium text-slate-600 mb-2">Choice {idx + 1}</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={choice.label[language]}
                      onChange={(e) => {
                        const newChoices = [...element.props.choices];
                        newChoices[idx] = {
                          ...newChoices[idx],
                          label: { ...choice.label, [language]: e.target.value },
                        };
                        onUpdate({ choices: newChoices });
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      placeholder={`Label (${language.toUpperCase()})`}
                    />
                    <input
                      type="text"
                      value={choice.href}
                      onChange={(e) => {
                        const newChoices = [...element.props.choices];
                        newChoices[idx] = { ...newChoices[idx], href: e.target.value };
                        onUpdate({ choices: newChoices });
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      placeholder="Link URL"
                    />
                  </div>
                </div>
              ))}
            </Section>
          </>
        );

      case "category-grid":
        return (
          <Section title="Grid Settings" id="content">
            <SelectField
              label="Patient Type"
              value={element.props.dynamicSource}
              onChange={(v) =>
                onUpdate({ dynamicSource: v as "new-patient" | "existing-patient" })
              }
              options={[
                { value: "new-patient", label: "New Patient Categories" },
                { value: "existing-patient", label: "Existing Patient Categories" },
              ]}
            />
            <SelectField
              label="Columns"
              value={String(element.props.columns)}
              onChange={(v) => onUpdate({ columns: parseInt(v) as 2 | 3 | 4 })}
              options={[
                { value: "2", label: "2 Columns" },
                { value: "3", label: "3 Columns" },
                { value: "4", label: "4 Columns" },
              ]}
            />
            <SelectField
              label="Card Style"
              value={element.props.cardStyle}
              onChange={(v) =>
                onUpdate({ cardStyle: v as "minimal" | "bordered" | "elevated" })
              }
              options={[
                { value: "minimal", label: "Minimal" },
                { value: "bordered", label: "Bordered" },
                { value: "elevated", label: "Elevated" },
              ]}
            />
            <ToggleField
              label="Show Description"
              value={element.props.showDescription || false}
              onChange={(v) => onUpdate({ showDescription: v })}
            />
          </Section>
        );

      case "treatment-list":
        return (
          <Section title="List Settings" id="content">
            <SelectField
              label="Columns"
              value={String(element.props.columns)}
              onChange={(v) => onUpdate({ columns: parseInt(v) as 2 | 3 | 4 })}
              options={[
                { value: "2", label: "2 Columns" },
                { value: "3", label: "3 Columns" },
                { value: "4", label: "4 Columns" },
              ]}
            />
            <SelectField
              label="Card Style"
              value={element.props.cardStyle}
              onChange={(v) =>
                onUpdate({ cardStyle: v as "minimal" | "bordered" | "elevated" })
              }
              options={[
                { value: "minimal", label: "Minimal" },
                { value: "bordered", label: "Bordered" },
                { value: "elevated", label: "Elevated" },
              ]}
            />
            <ToggleField
              label="Show Duration"
              value={element.props.showDuration || false}
              onChange={(v) => onUpdate({ showDuration: v })}
            />
            <ToggleField
              label="Show Price"
              value={element.props.showPrice || false}
              onChange={(v) => onUpdate({ showPrice: v })}
            />
          </Section>
        );

      case "booking-form":
        return (
          <>
            <Section title="Form Title" id="content">
              <LocalizedTextField label="Title" propKey="title" />
              <ToggleField
                label="Show Step Tabs"
                value={element.props.showTabs || false}
                onChange={(v) => onUpdate({ showTabs: v })}
              />
            </Section>
            <Section title="Form Fields" id="fields">
              <p className="text-xs text-slate-500 mb-2">
                Fields shown in the booking form. Required fields are marked with *.
              </p>
              {['firstName', 'lastName', 'email', 'phone', 'notes'].map((field) => (
                <ToggleField
                  key={field}
                  label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                  value={element.props.fields.includes(field as 'firstName' | 'lastName' | 'email' | 'phone' | 'notes')}
                  onChange={(v) => {
                    const newFields = v
                      ? [...element.props.fields, field as 'firstName' | 'lastName' | 'email' | 'phone' | 'notes']
                      : element.props.fields.filter((f) => f !== field);
                    onUpdate({ fields: newFields });
                  }}
                />
              ))}
            </Section>
          </>
        );

      case "time-slots":
        return (
          <Section title="Time Slot Settings" id="content">
            <LocalizedTextField label="Title" propKey="title" />
            <LocalizedTextField label="Subtitle" propKey="subtitle" />
            <ToggleField
              label="Show Earliest Available"
              value={element.props.showEarliestAvailable || false}
              onChange={(v) => onUpdate({ showEarliestAvailable: v })}
            />
          </Section>
        );

      case "confirmation-summary":
        return (
          <Section title="Summary Settings" id="content">
            <LocalizedTextField label="Title" propKey="title" />
            <p className="text-xs text-slate-500 mb-2">
              Fields to display in the confirmation summary.
            </p>
            {['name', 'email', 'phone', 'doctor', 'date', 'time', 'service', 'location'].map((field) => (
              <ToggleField
                key={field}
                label={field.charAt(0).toUpperCase() + field.slice(1)}
                value={element.props.fields.includes(field as 'name' | 'email' | 'phone' | 'doctor' | 'date' | 'time' | 'service' | 'location')}
                onChange={(v) => {
                  const newFields = v
                    ? [...element.props.fields, field as 'name' | 'email' | 'phone' | 'doctor' | 'date' | 'time' | 'service' | 'location']
                    : element.props.fields.filter((f) => f !== field);
                  onUpdate({ fields: newFields });
                }}
              />
            ))}
          </Section>
        );

      case "success-message":
        return (
          <>
            <Section title="Content" id="content">
              <LocalizedTextField label="Title" propKey="title" />
              <LocalizedTextField label="Message" propKey="message" multiline />
              <LocalizedTextField label="Button Text" propKey="buttonText" />
              <InputField
                label="Button Link"
                value={element.props.buttonHref}
                onChange={(v) => onUpdate({ buttonHref: v })}
                type="url"
              />
            </Section>
            <Section title="Display Options" id="style">
              <ToggleField
                label="Show Success Icon"
                value={element.props.showIcon || false}
                onChange={(v) => onUpdate({ showIcon: v })}
              />
              <ToggleField
                label="Show Booking Details"
                value={element.props.showDetails || false}
                onChange={(v) => onUpdate({ showDetails: v })}
              />
            </Section>
          </>
        );

      default:
        return (
          <div className="p-4 text-sm text-slate-500">
            No properties available for this element type.
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 capitalize">
            {element.type.replace("-", " ")}
          </h3>
          <p className="text-xs text-slate-500">Edit element properties</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-auto">{renderElementProperties()}</div>
    </div>
  );
}
