"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseLeadsCSV, generateLeadsSummary, type ParsedLead } from "@/lib/csvParser";
import { formatSwissPhone, extractLeadPhones, isValidSwissPhone, formatSwissPhoneDisplay } from "@/lib/phoneFormatter";

type ImportStep = "upload" | "preview" | "confirm" | "importing" | "complete";

export default function LeadImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [leads, setLeads] = useState<ParsedLead[]>([]);
  const [confirmedService, setConfirmedService] = useState<string>("");
  const [customService, setCustomService] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; skippedDuplicates?: number; dealsCreated?: number; dealsSkipped?: number; matchedService?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serviceOptions = [
    "Breast Augmentation",
    "Face Fillers",
    "Wrinkle Treatment",
    "Blepharoplasty",
    "Liposuction",
    "Hyperbaric Oxygen Therapy",
    "Longevity",
    "IV Therapy",
    "Rhinoplasty",
    "Facelift",
    "Botox",
    "Lip Fillers",
    "Tummy Tuck",
    "Breast Lift",
    "Consultation",
    "Custom (specify below)",
  ];

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError("Please select a CSV file");
      return;
    }

    setFile(selectedFile);
    setError(null);

    try {
      const text = await selectedFile.text();
      const parsedLeads = parseLeadsCSV(text, selectedFile.name);
      
      if (parsedLeads.length === 0) {
        setError("No leads found in CSV file");
        return;
      }

      setLeads(parsedLeads);
      setConfirmedService(parsedLeads[0]?.detectedService || "");
      setStep("preview");
    } catch (err) {
      console.error("Error parsing CSV:", err);
      setError(err instanceof Error ? err.message : "Failed to parse CSV file");
    }
  }

  async function handleImport() {
    if (!file || leads.length === 0) return;

    const finalService = confirmedService || "General Inquiry";

    setStep("importing");
    setImporting(true);
    setImportProgress(0);

    try {
      // Process leads with phone formatting
      const leadsToImport = leads.map(lead => {
        const phones = extractLeadPhones(
          lead.phones.primary,
          lead.phones.secondary,
          lead.phones.whatsapp
        );

        return {
          ...lead,
          formattedPhones: phones,
          bestPhone: phones[0]?.phone || null,
          service: finalService,
        };
      });

      // Process in batches with progress
      const BATCH_SIZE = 25;
      let totalImported = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      let totalDealsCreated = 0;
      let totalDealsSkipped = 0;

      for (let i = 0; i < leadsToImport.length; i += BATCH_SIZE) {
        const batch = leadsToImport.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(leadsToImport.length / BATCH_SIZE);

        const response = await fetch("/api/leads/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leads: batch,
            service: finalService,
            filename: file.name,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `Batch ${batchNum} failed`);
        }

        totalImported += result.imported || 0;
        totalFailed += result.failed || 0;
        totalSkipped += result.skippedDuplicates || 0;
        totalDealsCreated += result.dealsCreated || 0;
        totalDealsSkipped += result.dealsSkipped || 0;

        setImportProgress(Math.round(((i + batch.length) / leadsToImport.length) * 100));
      }

      setImportResult({
        success: totalImported,
        failed: totalFailed,
        skippedDuplicates: totalSkipped,
        dealsCreated: totalDealsCreated,
        dealsSkipped: totalDealsSkipped,
        matchedService: finalService,
      });
      setStep("complete");
    } catch (err) {
      console.error("Import error:", err);
      setError(err instanceof Error ? err.message : "Failed to import leads");
      setStep("confirm");
    } finally {
      setImporting(false);
    }
  }

  function resetImport() {
    setStep("upload");
    setFile(null);
    setLeads([]);
    setConfirmedService("");
    setCustomService("");
    setError(null);
    setImportResult(null);
  }

  const summary = leads.length > 0 ? generateLeadsSummary(leads) : null;
  const leadsWithIssues = leads.filter(l => l.validationIssues.length > 0);
  const leadsWithPhoneIssues = leads.filter(l => {
    const phones = extractLeadPhones(l.phones.primary, l.phones.secondary, l.phones.whatsapp);
    return phones.length === 0 || !phones.some(p => isValidSwissPhone(p.phone));
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lead Import</h1>
          <p className="mt-1 text-sm text-slate-600">
            Import leads from CSV files and enroll them in automated workflows
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/lead-import/resend-whatsapp")}
            className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 shadow-sm hover:bg-green-50"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
            Resend WhatsApp
          </button>
          <button
            onClick={() => router.push("/lead-import/history")}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Import History
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 flex-shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-red-900">Error</h3>
              <p className="mt-1 text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {step === "upload" && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto max-w-xl text-center">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-sky-100 p-4">
                <svg className="h-12 w-12 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Upload Lead CSV File</h2>
            <p className="mb-6 text-sm text-slate-600">
              Select a CSV file exported from your lead generation platform
            </p>
            
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Choose CSV File
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="sr-only"
              />
            </label>

            <div className="mt-8 rounded-lg bg-slate-50 p-4 text-left">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Expected Format
              </h3>
              <div className="space-y-1 text-xs text-slate-700">
                <p>• CSV file with headers</p>
                <p>• Required: Created, Name, Email or Phone</p>
                <p>• Optional: Source, Form, Channel, Stage, Labels</p>
                <p>• Phone numbers will be auto-formatted for Switzerland</p>
                <p>• Service will be detected from filename</p>
                <p>• <strong>Multilingual support:</strong> Columns in any language (EN, FR, DE, ES, RU, UK)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === "preview" && summary && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-2xl font-bold text-slate-900">{summary.total}</div>
              <div className="text-xs text-slate-600">Total Leads</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-2xl font-bold text-emerald-900">{summary.valid}</div>
              <div className="text-xs text-emerald-800">Valid Leads</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-2xl font-bold text-amber-900">{summary.withIssues}</div>
              <div className="text-xs text-amber-800">Needs Review</div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="text-2xl font-bold text-red-900">{leadsWithPhoneIssues.length}</div>
              <div className="text-xs text-red-800">Phone Issues</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Service Detection</h2>

            {summary.serviceBreakdown && Object.keys(summary.serviceBreakdown).length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-2 text-xs font-semibold text-emerald-900">Detected Services (from Form column per lead):</p>
                <div className="grid gap-1 text-xs text-emerald-800">
                  {Object.entries(summary.serviceBreakdown)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([svc, count]) => (
                      <div key={svc} className="flex justify-between">
                        <span>{svc}</span>
                        <span className="font-mono font-semibold">{count as number}</span>
                      </div>
                    ))}
                </div>
                <p className="mt-2 text-[10px] text-emerald-700">
                  Each lead will be matched to its existing HubSpot service. Unmatched leads will have no service linked.
                </p>
              </div>
            )}
          </div>

          {leadsWithPhoneIssues.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
              <h3 className="mb-3 text-sm font-semibold text-amber-900">
                Phone Number Issues ({leadsWithPhoneIssues.length} leads)
              </h3>
              <p className="mb-4 text-xs text-amber-800">
                The following leads have phone numbers that couldn't be formatted to Swiss standard.
                They will still be imported but may not work with WhatsApp automation.
              </p>
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {leadsWithPhoneIssues.slice(0, 10).map((lead) => (
                  <div key={lead.rowNumber} className="rounded-lg bg-white p-3 text-xs">
                    <div className="font-medium text-slate-900">{lead.name}</div>
                    <div className="mt-1 text-slate-600">
                      {lead.phones.primary && `Phone: ${lead.phones.primary}`}
                      {lead.phones.whatsapp && ` | WhatsApp: ${lead.phones.whatsapp}`}
                    </div>
                  </div>
                ))}
                {leadsWithPhoneIssues.length > 10 && (
                  <p className="text-xs text-amber-700">
                    +{leadsWithPhoneIssues.length - 10} more...
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={resetImport}
              className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => setStep("confirm")}
              disabled={!confirmedService || (confirmedService === "Custom (specify below)" && !customService)}
              className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
            >
              Continue to Import
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="rounded-xl border border-slate-200 bg-white p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="rounded-full bg-amber-100 p-3">
              <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Confirm Import</h2>
              <p className="mt-1 text-sm text-slate-600">
                Please review the import details before proceeding
              </p>
            </div>
          </div>

          <div className="space-y-4 rounded-lg bg-slate-50 p-6">
            <div className="flex justify-between border-b border-slate-200 pb-3">
              <span className="text-sm font-medium text-slate-700">File:</span>
              <span className="text-sm text-slate-900">{file?.name}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-3">
              <span className="text-sm font-medium text-slate-700">Service:</span>
              <span className="text-sm font-semibold text-slate-900">
                {confirmedService === "Custom (specify below)" ? customService : confirmedService}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-3">
              <span className="text-sm font-medium text-slate-700">Total Leads:</span>
              <span className="text-sm text-slate-900">{leads.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-slate-700">Workflow:</span>
              <span className="text-sm text-emerald-600">Request for Information (Auto-enrolled)</span>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> All leads will be created as patients and deals in the system.
              Phone numbers have been formatted for WhatsApp automation.
              Leads will be automatically enrolled in the "Request for Information" workflow.
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setStep("preview")}
              disabled={importing}
              className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {importing ? "Importing..." : "Import Leads"}
            </button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <div className="mb-6 flex justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600"></div>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-slate-900">Importing Leads...</h2>
          <p className="mb-4 text-sm text-slate-600">
            Processing {leads.length} leads in batches of 25
          </p>
          <div className="mx-auto max-w-md">
            <div className="mb-2 flex justify-between text-xs text-slate-600">
              <span>Progress</span>
              <span>{importProgress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-3 rounded-full bg-sky-600 transition-all duration-300"
                style={{ width: `${importProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {step === "complete" && importResult && (
        <div className="rounded-xl border border-emerald-200 bg-white p-8">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-emerald-100 p-4">
              <svg className="h-12 w-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h2 className="mb-2 text-center text-2xl font-bold text-slate-900">Import Complete!</h2>
          <p className="mb-6 text-center text-sm text-slate-600">
            Your leads have been successfully imported and enrolled in workflows
          </p>

          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
              <div className="text-3xl font-bold text-emerald-900">{importResult.success}</div>
              <div className="text-sm text-emerald-800">New Patients</div>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-6 text-center">
              <div className="text-3xl font-bold text-sky-900">{importResult.dealsCreated ?? 0}</div>
              <div className="text-sm text-sky-800">Deals Created</div>
            </div>
            {(importResult.skippedDuplicates ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                <div className="text-3xl font-bold text-amber-900">{importResult.skippedDuplicates}</div>
                <div className="text-sm text-amber-800">Existing Patients</div>
              </div>
            )}
            {importResult.failed > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
                <div className="text-3xl font-bold text-red-900">{importResult.failed}</div>
                <div className="text-sm text-red-800">Failed</div>
              </div>
            )}
          </div>

          {importResult.matchedService && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
              <p className="text-sm text-blue-800">
                <strong>Matched HubSpot Service:</strong> {importResult.matchedService}
              </p>
            </div>
          )}

          {(importResult.skippedDuplicates ?? 0) > 0 && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-800">
                <strong>Note:</strong> {importResult.skippedDuplicates} leads matched existing patients by email or phone. 
                Deals were still created for these patients unless a duplicate deal already existed within the last 6 hours.
              </p>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <button
              onClick={resetImport}
              className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Import More Leads
            </button>
            <button
              onClick={() => router.push("/patients")}
              className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              View Patients
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
