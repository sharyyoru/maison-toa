"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getFormById, FormDefinition, FormField, FormSection } from "@/lib/formDefinitions";
import Image from "next/image";

type FormData = Record<string, string | boolean | string[]>;

function SignatureCanvas({ 
  value, 
  onChange,
  label 
}: { 
  value: string; 
  onChange: (value: string) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set up canvas
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Load existing signature if any
    if (value) {
      const img = new window.Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
      };
      img.src = value;
    }
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dataUrl = canvas.toDataURL("image/png");
    onChange(dataUrl);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative rounded-lg border-2 border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="w-full cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <button
          type="button"
          onClick={clearSignature}
          className="absolute right-2 top-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
        >
          Clear
        </button>
      </div>
      <p className="text-xs text-slate-500">Draw your signature above</p>
    </div>
  );
}

function FormFieldComponent({
  field,
  value,
  onChange,
  language,
}: {
  field: FormField;
  value: string | boolean | string[];
  onChange: (value: string | boolean | string[]) => void;
  language: "en" | "fr";
}) {
  const label = language === "fr" && field.labelFr ? field.labelFr : field.label;
  const placeholder = language === "fr" && field.placeholderFr ? field.placeholderFr : field.placeholder;

  switch (field.type) {
    case "text":
    case "email":
    case "phone":
      return (
        <div className="space-y-1">
          <label htmlFor={field.id} className="block text-sm font-medium text-slate-700">
            {label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
          <input
            type={field.type === "phone" ? "tel" : field.type}
            id={field.id}
            value={value as string || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            required={field.required}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
      );

    case "number":
      return (
        <div className="space-y-1">
          <label htmlFor={field.id} className="block text-sm font-medium text-slate-700">
            {label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
          <input
            type="number"
            id={field.id}
            value={value as string || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            required={field.required}
            min={field.validation?.min}
            max={field.validation?.max}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
      );

    case "date":
      return (
        <div className="space-y-1">
          <label htmlFor={field.id} className="block text-sm font-medium text-slate-700">
            {label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
          <input
            type="date"
            id={field.id}
            value={value as string || ""}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
      );

    case "textarea":
      return (
        <div className="space-y-1">
          <label htmlFor={field.id} className="block text-sm font-medium text-slate-700">
            {label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
          <textarea
            id={field.id}
            value={value as string || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            required={field.required}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
      );

    case "checkbox":
      return (
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id={field.id}
            checked={value as boolean || false}
            onChange={(e) => onChange(e.target.checked)}
            required={field.required}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <label htmlFor={field.id} className="text-sm text-slate-700">
            {label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
        </div>
      );

    case "radio":
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            {label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </p>
          <div className="space-y-2">
            {field.options?.map((option) => {
              const optionLabel = language === "fr" && option.labelFr ? option.labelFr : option.label;
              return (
                <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name={field.id}
                    value={option.value}
                    checked={value === option.value}
                    onChange={(e) => onChange(e.target.value)}
                    required={field.required}
                    className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  {optionLabel}
                </label>
              );
            })}
          </div>
        </div>
      );

    case "select":
      return (
        <div className="space-y-1">
          <label htmlFor={field.id} className="block text-sm font-medium text-slate-700">
            {label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
          <select
            id={field.id}
            value={value as string || ""}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          >
            <option value="">{language === "fr" ? "Sélectionner..." : "Select..."}</option>
            {field.options?.map((option) => {
              const optionLabel = language === "fr" && option.labelFr ? option.labelFr : option.label;
              return (
                <option key={option.value} value={option.value}>
                  {optionLabel}
                </option>
              );
            })}
          </select>
        </div>
      );

    case "signature":
      return (
        <SignatureCanvas
          value={value as string || ""}
          onChange={(v) => onChange(v)}
          label={`${label}${field.required ? " *" : ""}`}
        />
      );

    default:
      return null;
  }
}

function FormSectionComponent({
  section,
  formData,
  onChange,
  language,
}: {
  section: FormSection;
  formData: FormData;
  onChange: (fieldId: string, value: string | boolean | string[]) => void;
  language: "en" | "fr";
}) {
  const title = language === "fr" && section.titleFr ? section.titleFr : section.title;
  const description = language === "fr" && section.descriptionFr ? section.descriptionFr : section.description;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>
      {description && <p className="mb-4 text-sm text-slate-600">{description}</p>}
      <div className="space-y-4">
        {section.fields.map((field) => (
          <FormFieldComponent
            key={field.id}
            field={field}
            value={formData[field.id] || (field.type === "checkbox" ? false : "")}
            onChange={(value) => onChange(field.id, value)}
            language={language}
          />
        ))}
      </div>
    </div>
  );
}

export default function PublicFormPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const formId = params.formId as string;
  const token = searchParams.get("token");

  const [form, setForm] = useState<FormDefinition | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<{ first_name: string; last_name: string } | null>(null);

  useEffect(() => {
    async function loadForm() {
      try {
        setLoading(true);
        setError(null);

        // Get form definition
        const formDef = getFormById(formId);
        if (!formDef) {
          setError("Form not found");
          setLoading(false);
          return;
        }
        setForm(formDef);

        // If token is provided, load existing submission data
        if (token) {
          const response = await fetch(`/api/forms/submit?token=${token}`);
          const data = await response.json();

          if (!response.ok) {
            if (data.expired) {
              setError(formDef.language === "fr" 
                ? "Ce lien de formulaire a expiré. Veuillez contacter la clinique pour un nouveau lien."
                : "This form link has expired. Please contact the clinic for a new link.");
            } else {
              setError(data.error || "Failed to load form");
            }
            setLoading(false);
            return;
          }

          if (data.submission.status === "submitted") {
            setSubmitted(true);
          }

          if (data.submission.submissionData) {
            setFormData(data.submission.submissionData);
          }

          if (data.submission.patient) {
            setPatientInfo(data.submission.patient);
            // Pre-fill patient name if form has full_name field
            if (data.submission.patient.first_name && data.submission.patient.last_name) {
              setFormData((prev) => ({
                ...prev,
                full_name: `${data.submission.patient.first_name} ${data.submission.patient.last_name}`,
              }));
            }
            // Pre-fill date of birth if available
            if (data.submission.patient.dob) {
              setFormData((prev) => ({
                ...prev,
                date_of_birth: data.submission.patient.dob,
              }));
            }
          }
        }

        // Set signature_date to today's date by default
        const today = new Date().toISOString().split("T")[0];
        setFormData((prev) => ({
          ...prev,
          signature_date: prev.signature_date || today,
        }));

        setLoading(false);
      } catch (err) {
        console.error("Error loading form:", err);
        setError("Failed to load form");
        setLoading(false);
      }
    }

    loadForm();
  }, [formId, token]);

  const handleFieldChange = (fieldId: string, value: string | boolean | string[]) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      setError("Invalid form link - no token provided");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          submissionData: formData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to submit form");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
      setSubmitting(false);
    } catch (err) {
      console.error("Error submitting form:", err);
      setError("Failed to submit form");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
          <p className="mt-4 text-sm text-slate-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Error</h2>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            {form?.language === "fr" ? "Formulaire soumis" : "Form Submitted"}
          </h2>
          <p className="text-sm text-slate-600">
            {form?.language === "fr"
              ? "Merci d'avoir rempli ce formulaire. Vos réponses ont été enregistrées."
              : "Thank you for completing this form. Your responses have been recorded."}
          </p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <p className="text-sm text-slate-600">Form not found</p>
        </div>
      </div>
    );
  }

  const formTitle = form.language === "fr" && form.nameFr ? form.nameFr : form.name;
  const formDescription = form.language === "fr" && form.descriptionFr ? form.descriptionFr : form.description;

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-2xl px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <Image
              src="/logos/aesthetics-logo.svg"
              alt="Aesthetics Clinic"
              width={140}
              height={40}
              className="h-10 w-auto"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{formTitle}</h1>
          <p className="mt-2 text-sm text-slate-600">{formDescription}</p>
          {patientInfo && (
            <p className="mt-2 text-sm font-medium text-sky-600">
              {form.language === "fr" ? "Patient:" : "Patient:"} {patientInfo.first_name} {patientInfo.last_name}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {form.sections.map((section) => (
            <FormSectionComponent
              key={section.id}
              section={section}
              formData={formData}
              onChange={handleFieldChange}
              language={form.language}
            />
          ))}

          {/* Submit Button */}
          <div className="flex justify-center pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-sky-500 px-8 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? form.language === "fr"
                  ? "Envoi en cours..."
                  : "Submitting..."
                : form.language === "fr"
                ? "Soumettre le formulaire"
                : "Submit Form"}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-500">
          <p>
            {form.language === "fr"
              ? "Les informations que vous fournissez sont confidentielles et sécurisées."
              : "The information you provide is confidential and secure."}
          </p>
        </div>
      </div>
    </div>
  );
}
