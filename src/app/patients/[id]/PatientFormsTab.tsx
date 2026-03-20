"use client";

import { useEffect, useState } from "react";
import { getAllForms, getFormById, FormDefinition } from "@/lib/formDefinitions";
import { FileText, Send, Eye, Clock, CheckCircle, AlertCircle, Copy, ExternalLink, ChevronDown, X } from "lucide-react";

type FormSubmission = {
  id: string;
  form_id: string;
  form_name: string;
  status: "pending" | "submitted" | "reviewed";
  submission_data: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
  expires_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  formUrl: string | null;
};

type SendFormModalProps = {
  patientId: string;
  patientEmail: string | null;
  patientName: string;
  onClose: () => void;
  onSuccess: () => void;
};

function SendFormModal({ patientId, patientEmail, patientName, onClose, onSuccess }: SendFormModalProps) {
  const [forms] = useState<FormDefinition[]>(getAllForms());
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedForm = selectedFormId ? getFormById(selectedFormId) : null;

  const handleGenerateLink = async () => {
    if (!selectedFormId) return;

    try {
      setSending(true);
      setError(null);

      const response = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          formId: selectedFormId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to generate form link");
        setSending(false);
        return;
      }

      setGeneratedUrl(data.formUrl);
      setSending(false);
    } catch (err) {
      console.error("Error generating form link:", err);
      setError("Failed to generate form link");
      setSending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!generatedUrl || !patientEmail || !selectedForm) return;

    try {
      setSending(true);
      setError(null);

      const formName = selectedForm.language === "fr" && selectedForm.nameFr ? selectedForm.nameFr : selectedForm.name;
      const subject = selectedForm.language === "fr" 
        ? `Formulaire à remplir: ${formName}`
        : `Form to complete: ${formName}`;

      const html = selectedForm.language === "fr"
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e293b;">Bonjour ${patientName},</h2>
            <p style="color: #475569;">Veuillez remplir le formulaire suivant en cliquant sur le lien ci-dessous:</p>
            <p style="margin: 24px 0;">
              <a href="${generatedUrl}" style="display: inline-block; background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                ${formName}
              </a>
            </p>
            <p style="color: #64748b; font-size: 14px;">Ce lien expire dans 30 jours.</p>
            <p style="color: #475569;">Cordialement,<br/>L'équipe Aesthetics</p>
          </div>
        `
        : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e293b;">Hello ${patientName},</h2>
            <p style="color: #475569;">Please complete the following form by clicking the link below:</p>
            <p style="margin: 24px 0;">
              <a href="${generatedUrl}" style="display: inline-block; background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                ${formName}
              </a>
            </p>
            <p style="color: #64748b; font-size: 14px;">This link expires in 30 days.</p>
            <p style="color: #475569;">Best regards,<br/>The Aesthetics Team</p>
          </div>
        `;

      const emailResponse = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: patientEmail,
          subject,
          html,
          patientId,
        }),
      });

      if (!emailResponse.ok) {
        const emailData = await emailResponse.json();
        setError(emailData.error || "Failed to send email");
        setSending(false);
        return;
      }

      setSending(false);
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error sending email:", err);
      setError("Failed to send email");
      setSending(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Group forms by category
  const groupedForms = forms.reduce((acc, form) => {
    const category = form.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(form);
    return acc;
  }, {} as Record<string, FormDefinition[]>);

  const categoryLabels: Record<string, string> = {
    consent: "Consent Forms",
    questionnaire: "Questionnaires",
    instructions: "Instructions",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Send Form to Patient</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!generatedUrl ? (
          <>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Select Form</label>
              <div className="relative">
                <select
                  value={selectedFormId}
                  onChange={(e) => setSelectedFormId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-4 py-2.5 pr-10 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Select a form...</option>
                  {Object.entries(groupedForms).map(([category, categoryForms]) => (
                    <optgroup key={category} label={categoryLabels[category] || category}>
                      {categoryForms.map((form) => (
                        <option key={form.id} value={form.id}>
                          {form.language === "fr" && form.nameFr ? form.nameFr : form.name} ({form.language.toUpperCase()})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            {selectedForm && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">
                  {selectedForm.language === "fr" && selectedForm.nameFr ? selectedForm.nameFr : selectedForm.name}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {selectedForm.language === "fr" && selectedForm.descriptionFr ? selectedForm.descriptionFr : selectedForm.description}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    selectedForm.language === "fr" 
                      ? "bg-blue-100 text-blue-700" 
                      : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {selectedForm.language === "fr" ? "Français" : "English"}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                    {categoryLabels[selectedForm.category]}
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateLink}
                disabled={!selectedFormId || sending}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Generate Link
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Form Link Generated</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={generatedUrl}
                  readOnly
                  className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <p className="text-sm text-sky-800">
                <strong>Send via email to:</strong> {patientEmail || "No email on file"}
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Done
              </button>
              {patientEmail && (
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={sending}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Email
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type ViewSubmissionModalProps = {
  submission: FormSubmission;
  onClose: () => void;
};

function ViewSubmissionModal({ submission, onClose }: ViewSubmissionModalProps) {
  const form = getFormById(submission.form_id);
  const data = submission.submission_data;

  const formatValue = (value: unknown): string => {
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (typeof value === "string" && value.startsWith("data:image")) return "[Signature]";
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{submission.form_name}</h2>
            <p className="text-xs text-slate-500">
              Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {form ? (
          <div className="space-y-6">
            {form.sections.map((section) => (
              <div key={section.id} className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  {form.language === "fr" && section.titleFr ? section.titleFr : section.title}
                </h3>
                <dl className="space-y-2">
                  {section.fields.map((field) => {
                    const label = form.language === "fr" && field.labelFr ? field.labelFr : field.label;
                    const value = data[field.id];

                    if (field.type === "signature" && typeof value === "string" && value.startsWith("data:image")) {
                      return (
                        <div key={field.id} className="py-2">
                          <dt className="text-xs font-medium text-slate-500">{label}</dt>
                          <dd className="mt-1">
                            <img src={value} alt="Signature" className="h-20 rounded border border-slate-200 bg-white" />
                          </dd>
                        </div>
                      );
                    }

                    return (
                      <div key={field.id} className="flex items-start justify-between gap-4 py-1">
                        <dt className="text-xs font-medium text-slate-500">{label}</dt>
                        <dd className="text-right text-xs text-slate-900">{formatValue(value)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <pre className="text-xs text-slate-700">{JSON.stringify(data, null, 2)}</pre>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PatientFormsTab({
  patientId,
  patientEmail,
  patientName,
}: {
  patientId: string;
  patientEmail: string | null;
  patientName: string;
}) {
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [viewingSubmission, setViewingSubmission] = useState<FormSubmission | null>(null);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/forms/patient?patientId=${patientId}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to load form submissions");
        setSubmissions([]);
        setLoading(false);
        return;
      }

      setSubmissions(data.submissions || []);
      setLoading(false);
    } catch (err) {
      console.error("Error loading form submissions:", err);
      setError("Failed to load form submissions");
      setSubmissions([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, [patientId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "submitted":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "reviewed":
        return <CheckCircle className="h-4 w-4 text-sky-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Pending";
      case "submitted":
        return "Submitted";
      case "reviewed":
        return "Reviewed";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "submitted":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "reviewed":
        return "bg-sky-100 text-sky-700 border-sky-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Patient Forms</h3>
        <button
          type="button"
          onClick={() => setShowSendModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
        >
          <Send className="h-3.5 w-3.5" />
          Send Form
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
          <span className="ml-2 text-xs text-slate-500">Loading forms...</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && submissions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No forms yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Send a form to this patient to get started.
          </p>
        </div>
      )}

      {!loading && !error && submissions.length > 0 && (
        <div className="space-y-3">
          {submissions.map((submission) => (
            <div
              key={submission.id}
              className="rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-900">{submission.form_name}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusColor(submission.status)}`}>
                      {getStatusIcon(submission.status)}
                      {getStatusLabel(submission.status)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>Created {new Date(submission.created_at).toLocaleDateString()}</span>
                    {submission.submitted_at && (
                      <span>• Submitted {new Date(submission.submitted_at).toLocaleDateString()}</span>
                    )}
                    {submission.status === "pending" && (
                      <span className="text-amber-600">
                        Expires {new Date(submission.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {submission.status === "pending" && submission.formUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleCopyLink(submission.formUrl!)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                        title="Copy link"
                      >
                        <Copy className="h-3 w-3" />
                        Copy Link
                      </button>
                      <a
                        href={submission.formUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                        title="Open form"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </a>
                    </>
                  )}
                  {submission.status !== "pending" && (
                    <button
                      type="button"
                      onClick={() => setViewingSubmission(submission)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <Eye className="h-3 w-3" />
                      View Response
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSendModal && (
        <SendFormModal
          patientId={patientId}
          patientEmail={patientEmail}
          patientName={patientName}
          onClose={() => setShowSendModal(false)}
          onSuccess={loadSubmissions}
        />
      )}

      {viewingSubmission && (
        <ViewSubmissionModal
          submission={viewingSubmission}
          onClose={() => setViewingSubmission(null)}
        />
      )}
    </div>
  );
}
