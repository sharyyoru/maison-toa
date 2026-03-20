"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { supabaseClient } from "@/lib/supabaseClient";
import { Image, Upload, Trash2, X, Loader2 } from "lucide-react";

// Dynamically import to avoid SSR issues
const EmailEditor = dynamic(() => import("react-email-editor"), { ssr: false });

type EmailTemplate = {
  id: string;
  name: string;
  type: string;
  subject_template: string;
  body_template: string;
  design_json: any;
  html_content: string | null;
  created_at: string;
};

type GalleryImage = {
  name: string;
  url: string;
  created_at: string;
};

type EmailTemplateBuilderProps = {
  open: boolean;
  onClose: () => void;
  onSelectTemplate?: (template: EmailTemplate) => void;
  initialTemplateId?: string | null;
};

// Merge tags for patient variables
const MERGE_TAGS = {
  patient: {
    name: "Patient",
    mergeTags: {
      first_name: { name: "First Name", value: "{{patient.first_name}}" },
      last_name: { name: "Last Name", value: "{{patient.last_name}}" },
      email: { name: "Email", value: "{{patient.email}}" },
      phone: { name: "Phone", value: "{{patient.phone}}" },
      full_name: { name: "Full Name", value: "{{patient.full_name}}" },
    },
  },
  deal: {
    name: "Deal",
    mergeTags: {
      title: { name: "Title", value: "{{deal.title}}" },
      pipeline: { name: "Pipeline", value: "{{deal.pipeline}}" },
      stage: { name: "Stage", value: "{{deal.stage}}" },
      notes: { name: "Notes", value: "{{deal.notes}}" },
    },
  },
  appointment: {
    name: "Appointment",
    mergeTags: {
      date: { name: "Date", value: "{{appointment.date}}" },
      time: { name: "Time", value: "{{appointment.time}}" },
      service: { name: "Service", value: "{{appointment.service}}" },
      provider: { name: "Provider", value: "{{appointment.provider}}" },
    },
  },
  clinic: {
    name: "Clinic",
    mergeTags: {
      name: { name: "Clinic Name", value: "{{clinic.name}}" },
      phone: { name: "Phone", value: "{{clinic.phone}}" },
      address: { name: "Address", value: "{{clinic.address}}" },
      website: { name: "Website", value: "{{clinic.website}}" },
    },
  },
};

export default function EmailTemplateBuilder({
  open,
  onClose,
  onSelectTemplate,
  initialTemplateId,
}: EmailTemplateBuilderProps) {
  const emailEditorRef = useRef<any>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [view, setView] = useState<"list" | "editor">("list");
  
  // AI generation state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  // Image gallery state
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageSelectDoneRef = useRef<((data: { url: string }) => void) | null>(null);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  // Load images from Supabase emailgallery bucket
  const loadGalleryImages = useCallback(async () => {
    try {
      setLoadingImages(true);
      const { data, error } = await supabaseClient.storage
        .from("emailgallery")
        .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

      if (error) throw error;

      const images: GalleryImage[] = (data || [])
        .filter((file) => file.name && !file.name.endsWith("/"))
        .map((file) => {
          const { data: urlData } = supabaseClient.storage
            .from("emailgallery")
            .getPublicUrl(file.name);
          return {
            name: file.name,
            url: urlData.publicUrl,
            created_at: file.created_at || new Date().toISOString(),
          };
        });

      setGalleryImages(images);
    } catch (err) {
      console.error("Failed to load gallery images:", err);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  // Handle image upload to Supabase
  async function handleImageUpload(file: File) {
    try {
      setUploadingImage(true);
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabaseClient.storage
        .from("emailgallery")
        .upload(fileName, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseClient.storage
        .from("emailgallery")
        .getPublicUrl(fileName);

      // Refresh the gallery
      await loadGalleryImages();

      return urlData.publicUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
      return null;
    } finally {
      setUploadingImage(false);
    }
  }

  // Handle image deletion from Supabase
  async function handleImageDelete(imageName: string) {
    if (!confirm("Delete this image? This cannot be undone.")) return;

    try {
      const { error } = await supabaseClient.storage
        .from("emailgallery")
        .remove([imageName]);

      if (error) throw error;
      await loadGalleryImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image");
    }
  }

  async function loadTemplates() {
    try {
      setLoading(true);
      const { data, error } = await supabaseClient
        .from("email_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);

      if (initialTemplateId) {
        const template = data?.find((t) => t.id === initialTemplateId);
        if (template) {
          handleEditTemplate(template);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  function handleEditTemplate(template: EmailTemplate) {
    setSelectedTemplate(template);
    setTemplateName(template.name);
    setSubjectTemplate(template.subject_template);
    setView("editor");
    setEditorReady(false);
  }

  function handleNewTemplate() {
    setSelectedTemplate(null);
    setTemplateName("New Email Template");
    setSubjectTemplate("");
    setView("editor");
    setEditorReady(false);
  }

  // Called when editor iframe is created but before it's fully loaded
  function onEditorLoad(unlayer: any) {
    console.log("Unlayer onLoad - registering selectImage callback", unlayer);
    
    // Register custom image selection callback
    unlayer.registerCallback(
      "selectImage",
      function (data: any, done: (data: { url: string }) => void) {
        console.log("selectImage callback triggered!", data);
        // Store the done callback and open the gallery
        imageSelectDoneRef.current = done;
        setShowImageGallery(true);
        loadGalleryImages();
      }
    );
  }

  function onEditorReady() {
    setEditorReady(true);
    if (selectedTemplate?.design_json && emailEditorRef.current) {
      emailEditorRef.current.editor.loadDesign(selectedTemplate.design_json);
    }
  }

  async function handleSave() {
    if (!emailEditorRef.current || !editorReady) return;

    try {
      setSaving(true);
      setError(null);

      // Export design and HTML
      const design = await new Promise<any>((resolve) => {
        emailEditorRef.current.editor.saveDesign((design: any) => resolve(design));
      });

      const html = await new Promise<string>((resolve) => {
        emailEditorRef.current.editor.exportHtml((data: any) => resolve(data.html));
      });

      const templateData = {
        name: templateName,
        type: "workflow",
        subject_template: subjectTemplate,
        body_template: html,
        design_json: design,
        html_content: html,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (selectedTemplate) {
        result = await supabaseClient
          .from("email_templates")
          .update(templateData)
          .eq("id", selectedTemplate.id)
          .select()
          .single();
      } else {
        result = await supabaseClient
          .from("email_templates")
          .insert(templateData)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      setSuccess("Template saved successfully!");
      setSelectedTemplate(result.data);
      await loadTemplates();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(template: EmailTemplate) {
    if (!confirm(`Delete "${template.name}"?`)) return;

    try {
      const { error } = await supabaseClient
        .from("email_templates")
        .delete()
        .eq("id", template.id);

      if (error) throw error;
      await loadTemplates();
      if (selectedTemplate?.id === template.id) {
        setView("list");
        setSelectedTemplate(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    }
  }

  async function handleDuplicate(template: EmailTemplate) {
    try {
      setError(null);
      const { data, error } = await supabaseClient
        .from("email_templates")
        .insert({
          name: `${template.name} (Copy)`,
          type: template.type,
          subject_template: template.subject_template,
          body_template: template.body_template,
          design_json: template.design_json,
          html_content: template.html_content,
        })
        .select()
        .single();

      if (error) throw error;
      setSuccess("Template duplicated successfully!");
      setTimeout(() => setSuccess(null), 3000);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate template");
    }
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim() || !emailEditorRef.current) return;

    try {
      setAiGenerating(true);
      setError(null);

      const response = await fetch("/api/workflows/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: aiPrompt,
          tone: "professional and friendly",
          variables: [
            { path: "patient.first_name", label: "Patient first name" },
            { path: "patient.last_name", label: "Patient last name" },
            { path: "patient.email", label: "Patient email" },
            { path: "deal.title", label: "Deal title" },
            { path: "appointment.date", label: "Appointment date" },
            { path: "appointment.time", label: "Appointment time" },
            { path: "clinic.name", label: "Clinic name" },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate email");

      if (data.subject) {
        setSubjectTemplate(data.subject);
      }

      if (emailEditorRef.current) {
        // Use the Unlayer design from API (with text blocks) if available
        if (data.design) {
          emailEditorRef.current.editor.loadDesign(data.design);
        } else if (data.html) {
          // Fallback to HTML block if no design provided
          const design = {
            body: {
              rows: [
                {
                  cells: [1],
                  columns: [
                    {
                      contents: [
                        {
                          type: "html",
                          values: {
                            html: data.html,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          };
          emailEditorRef.current.editor.loadDesign(design);
        }
      }

      setAiPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate email");
    } finally {
      setAiGenerating(false);
    }
  }

  function handleSelectAndClose() {
    if (selectedTemplate && onSelectTemplate) {
      onSelectTemplate(selectedTemplate);
    }
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50">
      <div className="flex h-full w-full flex-col bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-4">
            {view === "editor" && (
              <button
                onClick={() => setView("list")}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {view === "list" ? "Email Templates" : templateName}
              </h2>
              <p className="text-sm text-slate-500">
                {view === "list"
                  ? "Create and manage email templates for your workflows"
                  : "Design your email using the drag-and-drop editor"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {view === "editor" && (
              <>
                {onSelectTemplate && selectedTemplate && (
                  <button
                    onClick={handleSelectAndClose}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Use This Template
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Template"}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {view === "list" ? (
          /* Template List View */
          <div className="flex-1 overflow-auto p-6">
            <div className="mb-6">
              <button
                onClick={handleNewTemplate}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Template
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-slate-500">Loading templates...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 text-4xl">📧</div>
                <h3 className="font-medium text-slate-900">No templates yet</h3>
                <p className="mt-1 text-sm text-slate-500">Create your first email template</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-slate-900 truncate">{template.name}</h3>
                        <p className="mt-1 text-xs text-slate-500 truncate">
                          Subject: {template.subject_template || "No subject"}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(template.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => handleEditTemplate(template)}
                        className="flex-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      {onSelectTemplate && (
                        <button
                          onClick={() => {
                            onSelectTemplate(template);
                            onClose();
                          }}
                          className="flex-1 rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-200"
                        >
                          Select
                        </button>
                      )}
                      <button
                        onClick={() => handleDuplicate(template)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600"
                        title="Duplicate template"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(template)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        title="Delete template"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Editor View */
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-80 shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 p-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email Subject
                  </label>
                  <textarea
                    value={subjectTemplate}
                    onChange={(e) => setSubjectTemplate(e.target.value)}
                    placeholder="Enter subject line..."
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 resize-y"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Use {"{{patient.first_name}}"} etc. for variables
                  </p>
                </div>

                {/* AI Generation */}
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <h4 className="text-sm font-medium text-slate-900 mb-2">
                    ✨ Generate with AI
                  </h4>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Describe the email you want to create... e.g., 'Welcome email for new patients with appointment confirmation'"
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                  />
                  <button
                    onClick={handleAiGenerate}
                    disabled={aiGenerating || !aiPrompt.trim()}
                    className="mt-2 w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {aiGenerating ? "Generating..." : "Generate Email"}
                  </button>
                </div>

                {/* Available Variables */}
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <h4 className="text-sm font-medium text-slate-900 mb-2">
                    Available Variables
                  </h4>
                  <div className="space-y-2 text-xs">
                    {Object.entries(MERGE_TAGS).map(([category, data]) => (
                      <div key={category}>
                        <p className="font-medium text-slate-700 mb-1">{data.name}</p>
                        <div className="space-y-0.5 pl-2">
                          {Object.entries(data.mergeTags).map(([key, tag]) => (
                            <button
                              key={key}
                              onClick={() => {
                                navigator.clipboard.writeText(tag.value);
                              }}
                              className="block w-full text-left rounded px-1 py-0.5 text-slate-600 hover:bg-slate-100"
                              title="Click to copy"
                            >
                              <code className="text-sky-600">{tag.value}</code>
                              <span className="text-slate-400 ml-1">- {tag.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Email Editor */}
            <div className="flex-1">
              <EmailEditor
                ref={emailEditorRef}
                onLoad={onEditorLoad}
                onReady={onEditorReady}
                projectId={284973}
                options={{
                  mergeTags: MERGE_TAGS,
                  features: {
                    textEditor: {
                      spellChecker: true,
                    },
                  },
                  appearance: {
                    theme: "light",
                  },
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Image Gallery Modal */}
      {showImageGallery && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[80vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <Image className="h-5 w-5 text-sky-600" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Image Gallery</h3>
                  <p className="text-sm text-slate-500">Select or upload an image for your email</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowImageGallery(false);
                  imageSelectDoneRef.current = null;
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Upload Section */}
            <div className="border-b border-slate-200 px-6 py-4">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 hover:border-sky-400 hover:bg-sky-50 transition-colors">
                {uploadingImage ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                    <span className="text-sm font-medium text-slate-600">Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-slate-400" />
                    <span className="text-sm font-medium text-slate-600">
                      Click to upload a new image
                    </span>
                    <span className="text-xs text-slate-400">(JPG, PNG, GIF, WebP, SVG)</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const url = await handleImageUpload(file);
                      if (url && imageSelectDoneRef.current) {
                        imageSelectDoneRef.current({ url });
                        imageSelectDoneRef.current = null;
                        setShowImageGallery(false);
                      }
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {/* Gallery Grid */}
            <div className="flex-1 overflow-auto p-6">
              {loadingImages ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : galleryImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Image className="h-12 w-12 text-slate-300 mb-3" />
                  <h4 className="font-medium text-slate-700">No images yet</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Upload your first image to get started
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                  {galleryImages.map((image) => (
                    <div
                      key={image.name}
                      className="group relative aspect-square rounded-lg border border-slate-200 bg-slate-50 overflow-hidden hover:border-sky-400 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => {
                        // Use the done callback if available (from selectImage)
                        if (imageSelectDoneRef.current) {
                          imageSelectDoneRef.current({ url: image.url });
                          imageSelectDoneRef.current = null;
                        }
                        setShowImageGallery(false);
                      }}
                    >
                      <img
                        src={image.url}
                        alt={image.name}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-white truncate">{image.name}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImageDelete(image.name);
                        }}
                        className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                        title="Delete image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 px-6 py-3 flex justify-end">
              <button
                onClick={() => {
                  setShowImageGallery(false);
                  imageSelectDoneRef.current = null;
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
