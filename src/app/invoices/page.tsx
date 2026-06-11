"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import Link from "next/link";
import InsuranceBillingModal from "@/components/InsuranceBillingModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceStatus = "OPEN" | "PAID" | "CANCELLED" | "PARTIAL_PAID" | "PARTIAL_LOSS" | "OVERPAID";

type InvoiceRow = {
  id: string;
  patient_id: string | null;
  invoice_number: string;
  invoice_date: string | null;
  doctor_user_id: string | null;
  doctor_name: string | null;
  provider_id: string | null;
  provider_name: string | null;
  payment_method: string | null;
  total_amount: number;
  paid_amount: number | null;
  status: InvoiceStatus;
  is_complimentary: boolean;
  pdf_path: string | null;
  pdf_path_tg: string | null;
  pdf_path_tp: string | null;
  pdf_path_reminder: string | null;
  pdf_path_receipt: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  is_archived: boolean;
  health_insurance_law: string | null;
  billing_type: string | null;
};

type PatientInfo = { id: string; first_name: string | null; last_name: string | null; email: string | null };
type PatientsById = Record<string, PatientInfo>;

type BulkInsValidation = {
  invoiceId: string;
  invoiceNumber: string;
  patientId: string | null;
  patientName: string;
  amount: number;
  ready: boolean;
  warnings: string[];
  errors: string[];
  insurerGln: string | null;
  insurerName: string | null;
  lawType: string | null;
  billingType: string | null;
  policyNumber: string | null;
  avsNumber: string | null;
  caseNumber: string | null;
  accidentDate: string | null;
};

type BulkInsResult = {
  invoiceId: string;
  invoiceNumber: string;
  patientName: string;
  status: "success" | "error" | "skipped";
  message: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0.00";
  return amount.toFixed(2);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("fr-CH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function statusBadge(status: InvoiceStatus, isComplimentary: boolean) {
  if (isComplimentary) return { label: "Complimentary", cls: "bg-purple-50 text-purple-700 border-purple-200" };
  switch (status) {
    case "PAID": return { label: "Paid", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "PARTIAL_PAID": return { label: "Partial", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "PARTIAL_LOSS": return { label: "Partial Loss", cls: "bg-orange-50 text-orange-700 border-orange-200" };
    case "OVERPAID": return { label: "Overpaid", cls: "bg-sky-50 text-sky-700 border-sky-200" };
    case "CANCELLED": return { label: "Cancelled", cls: "bg-slate-100 text-slate-500 border-slate-200" };
    default: return { label: "Open", cls: "bg-red-50 text-red-700 border-red-200" };
  }
}

const RECEIPT_STATUSES: InvoiceStatus[] = ["PAID", "PARTIAL_PAID", "PARTIAL_LOSS", "OVERPAID"];

function insuranceBadge(status: string | null | undefined, billingType: string | null | undefined): {
  label: string;
  cls: string;
  title: string;
} {
  if (!status) {
    return { label: "Not submitted", cls: "bg-slate-100 text-slate-700 border-slate-300 font-semibold", title: "No insurance submission sent yet" };
  }
  switch (status.toLowerCase()) {
    case "draft":         return { label: "Draft",       cls: "bg-slate-50 text-slate-600 border-slate-200", title: "Draft submission" };
    case "pending":       return { label: "Pending",     cls: "bg-amber-50 text-amber-700 border-amber-200", title: "Submission queued — waiting on MediData / insurer" };
    case "transmitted":   return { label: "Transmitted", cls: "bg-blue-50  text-blue-700  border-blue-200",  title: "Submission delivered to MediData; awaiting insurer response" };
    case "delivered":     return { label: "Delivered",   cls: "bg-blue-50  text-blue-700  border-blue-200",  title: "Submission delivered to insurer; awaiting decision" };
    case "accepted":      return { label: "Accepted",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200", title: "Insurer accepted the submission" };
    case "paid":          return { label: "Paid",        cls: "bg-emerald-50 text-emerald-700 border-emerald-200", title: "Insurer marked the submission as paid via Sumex" };
    case "partially_paid":return { label: "Partial",     cls: "bg-amber-50 text-amber-700 border-amber-200", title: "Partial Sumex payment recorded" };
    case "rejected":      return { label: "Rejected",    cls: "bg-rose-50 text-rose-700 border-rose-200", title: "Insurer formally rejected via Sumex (read the explanation in the MediData page; bank reality may differ)" };
    case "disputed":      return { label: "Disputed",    cls: "bg-orange-50 text-orange-700 border-orange-200", title: "Disputed" };
    case "reminder_1":    return { label: "Reminder 1",  cls: "bg-yellow-50 text-yellow-700 border-yellow-200", title: "First reminder sent" };
    case "reminder_2":    return { label: "Reminder 2",  cls: "bg-orange-50 text-orange-700 border-orange-200", title: "Second reminder sent" };
    case "reminder_3":    return { label: "Reminder 3",  cls: "bg-red-50 text-red-700 border-red-200", title: "Third reminder sent" };
    case "collection":    return { label: "Collection",  cls: "bg-red-100 text-red-800 border-red-300", title: "Sent to collection" };
    case "cancelled":     return { label: "Cancelled",   cls: "bg-slate-100 text-slate-500 border-slate-200", title: "Submission cancelled (storno)" };
    default:              return { label: status, cls: "bg-slate-50 text-slate-600 border-slate-200", title: status };
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [patientsById, setPatientsById] = useState<PatientsById>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [billingTypeFilter, setBillingTypeFilter] = useState<string>("all");
  const [insuranceFilter, setInsuranceFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  type LatestInsurance = {
    status: string;
    created_at: string;
    has_response: boolean;
  };
  const [latestInsByInvoice, setLatestInsByInvoice] = useState<Record<string, LatestInsurance>>({});

  // Pagination
  const ROWS_PER_PAGE = 50;
  const [page, setPage] = useState(0);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Action states
  const [generatingPdf, setGeneratingPdf] = useState<Set<string>>(new Set());
  const [sendingEmail, setSendingEmail] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);

  // Per-row PDF generate dropdown
  const [pdfDropdownOpen, setPdfDropdownOpen] = useState<string | null>(null);

  // Per-row email modal
  const [emailModalInvoice, setEmailModalInvoice] = useState<InvoiceRow | null>(null);

  // Bulk email doc-type picker
  const [bulkEmailDocTypeOpen, setBulkEmailDocTypeOpen] = useState(false);
  const [bulkEmailDocType, setBulkEmailDocType] = useState<string>("tg");

  // Insurance modal state
  const [insuranceModalOpen, setInsuranceModalOpen] = useState(false);
  const [insuranceTarget, setInsuranceTarget] = useState<InvoiceRow | null>(null);

  // Bulk insurance modal state
  const [bulkInsuranceOpen, setBulkInsuranceOpen] = useState(false);
  const [bulkInsValidation, setBulkInsValidation] = useState<BulkInsValidation[]>([]);
  const [bulkInsSending, setBulkInsSending] = useState(false);
  const [bulkInsProgress, setBulkInsProgress] = useState(0);
  const [bulkInsResults, setBulkInsResults] = useState<BulkInsResult[]>([]);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: err } = await supabaseClient
          .from("invoices")
          .select("id, patient_id, invoice_number, invoice_date, doctor_user_id, doctor_name, provider_id, provider_name, payment_method, total_amount, paid_amount, status, is_complimentary, pdf_path, pdf_path_tg, pdf_path_tp, pdf_path_reminder, pdf_path_receipt, created_by_user_id, created_by_name, is_archived, health_insurance_law, billing_type")
          .eq("is_archived", false)
          .is("parent_invoice_id", null)
          .order("invoice_date", { ascending: false });

        if (!isMounted) return;
        if (err || !data) { setError(err?.message ?? "Failed to load"); setInvoices([]); setLoading(false); return; }

        const rows = data as InvoiceRow[];
        setInvoices(rows);

        // Fetch patients in batches
        const patientIds = Array.from(new Set(rows.map(r => r.patient_id).filter(Boolean) as string[]));
        if (patientIds.length > 0) {
          const map: PatientsById = {};
          const BATCH = 50;
          for (let i = 0; i < patientIds.length; i += BATCH) {
            if (!isMounted) return;
            const batch = patientIds.slice(i, i + BATCH);
            const { data: pd } = await supabaseClient.from("patients").select("id, first_name, last_name, email").in("id", batch);
            if (pd) for (const p of pd as any[]) map[p.id] = { id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email };
          }
          if (isMounted) setPatientsById(map);
        }

        // Fetch the latest medidata submission per invoice (newest first → first seen wins)
        {
          const latestMap: Record<string, LatestInsurance> = {};
          const { data: subs } = await supabaseClient
            .from("medidata_submissions")
            .select("invoice_id, status, created_at, insurance_response_date")
            .not("invoice_id", "is", null)
            .order("created_at", { ascending: false });
          if (subs) {
            for (const s of subs as any[]) {
              if (!s.invoice_id) continue;
              if (!latestMap[s.invoice_id]) {
                latestMap[s.invoice_id] = {
                  status: String(s.status || "draft"),
                  created_at: String(s.created_at || ""),
                  has_response: !!s.insurance_response_date,
                };
              }
            }
          }
          if (isMounted) setLatestInsByInvoice(latestMap);
        }

        setLoading(false);
      } catch {
        if (isMounted) { setError("Failed to load invoices."); setInvoices([]); setLoading(false); }
      }
    }

    void load();
    return () => { isMounted = false; };
  }, []);

  // ---------------------------------------------------------------------------
  // Derived / filtered data
  // ---------------------------------------------------------------------------

  const patientName = useCallback((pid: string | null) => {
    if (!pid) return "Unknown";
    const p = patientsById[pid];
    if (!p) return pid.slice(0, 8);
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown";
  }, [patientsById]);

  const patientEmail = useCallback((pid: string | null) => {
    if (!pid) return null;
    return patientsById[pid]?.email ?? null;
  }, [patientsById]);

  const paymentMethods = useMemo(() => {
    const s = new Set<string>();
    for (const r of invoices) if (r.payment_method) s.add(r.payment_method);
    return Array.from(s).sort();
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return invoices.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (paymentMethodFilter !== "all" && r.payment_method !== paymentMethodFilter) return false;
      if (billingTypeFilter !== "all" && (r.billing_type ?? "").toUpperCase() !== billingTypeFilter) return false;
      if (dateFrom && r.invoice_date && r.invoice_date < dateFrom) return false;
      if (dateTo && r.invoice_date && r.invoice_date > dateTo) return false;
      if (insuranceFilter !== "all") {
        const latest = latestInsByInvoice[r.id];
        const st = latest?.status?.toLowerCase();
        const invoicePaid = (Number(r.paid_amount) || 0) > 0;
        const isInsuranceInvoice = (r.payment_method ?? "").toLowerCase() === "insurance";
        const isNotSubmitted = !latest && isInsuranceInvoice;
        const isRejectedUnpaid = st === "rejected" && !invoicePaid;
        switch (insuranceFilter) {
          case "needs_action":
            if (!isNotSubmitted && !isRejectedUnpaid) return false;
            break;
          case "not_submitted":
            if (!isNotSubmitted) return false;
            break;
          case "in_flight":
            if (!st || !["pending","transmitted","draft","delivered"].includes(st)) return false;
            break;
          case "rejected":
            if (st !== "rejected") return false;
            break;
          case "rejected_unpaid":
            if (!isRejectedUnpaid) return false;
            break;
          case "rejected_paid":
            if (st !== "rejected" || !invoicePaid) return false;
            break;
          case "accepted":
            if (!st || !["accepted","paid","partially_paid"].includes(st)) return false;
            break;
        }
      }
      if (q) {
        const pName = patientName(r.patient_id).toLowerCase();
        const invNum = (r.invoice_number || "").toLowerCase();
        const docName = (r.doctor_name || "").toLowerCase();
        if (!pName.includes(q) && !invNum.includes(q) && !docName.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, search, statusFilter, paymentMethodFilter, billingTypeFilter, insuranceFilter, latestInsByInvoice, dateFrom, dateTo, patientName]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const paginated = useMemo(() => {
    const start = page * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, page]);

  const summary = useMemo(() => {
    let total = 0, paid = 0, unpaid = 0, count = 0;
    for (const r of filtered) {
      if (r.is_complimentary) continue;
      if (r.status === "CANCELLED") continue;
      const amt = Number(r.total_amount) || 0;
      if (amt <= 0) continue;
      count++;
      total += amt;
      const pa = Number(r.paid_amount) || 0;
      paid += pa;
      unpaid += amt - pa;
    }
    return { total, paid, unpaid, count };
  }, [filtered]);

  // Reset page + selection on filter change
  useEffect(() => { setPage(0); setSelected(new Set()); }, [search, statusFilter, paymentMethodFilter, billingTypeFilter, insuranceFilter, dateFrom, dateTo]);

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map(r => r.id)));
    }
  };

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleViewPdf = async (pdfPath: string) => {
    try {
      // Use signed URL — invoice-pdfs bucket is private in maison-toa
      const { data, error } = await supabaseClient.storage
        .from("invoice-pdfs")
        .createSignedUrl(pdfPath, 3600);
      if (error || !data?.signedUrl) {
        alert("Failed to load PDF. Please try again.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      alert("Failed to load PDF. Please try again.");
    }
  };

  const handleGeneratePdf = async (invoiceId: string, invoiceType: "tg" | "tp" | "reminder" | "receipt" = "tg", reminderLevel = 1) => {
    setGeneratingPdf(prev => new Set(prev).add(invoiceId));
    try {
      const res = await fetch("/api/invoices/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, invoiceType, reminderLevel }),
      });
      const data = await res.json();
      if (data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
        // Update both the generic pdf_path and the specific typed column in local state
        const typedCol = invoiceType === "tg" ? "pdf_path_tg"
          : invoiceType === "tp" ? "pdf_path_tp"
          : invoiceType === "reminder" ? "pdf_path_reminder"
          : "pdf_path_receipt";
        setInvoices(prev => prev.map(r => r.id === invoiceId ? {
          ...r,
          pdf_path: data.pdfPath || r.pdf_path,
          [typedCol]: data.pdfPath || r[typedCol as keyof InvoiceRow],
        } : r));
      } else {
        alert("Failed: " + (data.error || "Unknown error"));
      }
    } catch {
      alert("Failed to generate PDF");
    } finally {
      setGeneratingPdf(prev => { const n = new Set(prev); n.delete(invoiceId); return n; });
    }
  };

  const handleSendEmail = async (invoice: InvoiceRow, documentType?: string) => {
    const email = patientEmail(invoice.patient_id);
    if (!email) { alert("Patient has no email address."); return; }

    // Resolve path for the requested type
    const pathForType = documentType === "tg" ? invoice.pdf_path_tg
      : documentType === "tp" ? invoice.pdf_path_tp
      : documentType === "reminder" ? invoice.pdf_path_reminder
      : documentType === "receipt" ? invoice.pdf_path_receipt
      : invoice.pdf_path;

    if (!pathForType) { alert("Please generate that PDF type first."); return; }

    setSendingEmail(prev => new Set(prev).add(invoice.id));
    try {
      const res = await fetch("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, recipientEmail: email, ...(documentType ? { documentType } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        const toast = document.createElement("div");
        toast.className = "fixed top-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg";
        toast.innerHTML = `<div class="flex items-center gap-2"><svg class="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>Email sent to ${email}</span></div>`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.transition = "opacity 0.3s"; toast.style.opacity = "0"; setTimeout(() => document.body.removeChild(toast), 300); }, 3000);
      } else {
        const toast = document.createElement("div");
        toast.className = "fixed top-4 right-4 z-50 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg";
        toast.innerHTML = `<div class="flex items-center gap-2"><svg class="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg><span>Failed: ${data.error || "Unknown error"}</span></div>`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.transition = "opacity 0.3s"; toast.style.opacity = "0"; setTimeout(() => document.body.removeChild(toast), 300); }, 4000);
      }
    } catch {
      const toast = document.createElement("div");
      toast.className = "fixed top-4 right-4 z-50 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg";
      toast.innerHTML = `<div class="flex items-center gap-2"><svg class="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg><span>Failed to send email</span></div>`;
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.transition = "opacity 0.3s"; toast.style.opacity = "0"; setTimeout(() => document.body.removeChild(toast), 300); }, 4000);
    } finally {
      setSendingEmail(prev => { const n = new Set(prev); n.delete(invoice.id); return n; });
    }
  };

  // ---------------------------------------------------------------------------
  // Bulk actions
  // ---------------------------------------------------------------------------

  const handleBulkGeneratePdf = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Generate/regenerate PDF for ${ids.length} invoice(s)?`)) return;
    setBulkAction("pdf");
    for (const id of ids) await handleGeneratePdf(id);
    setBulkAction(null);
  };

  const handleBulkGenerateReceipt = async () => {
    const receiptIds = Array.from(selected).filter(id => {
      const inv = invoices.find(r => r.id === id);
      return inv && RECEIPT_STATUSES.includes(inv.status);
    });
    if (receiptIds.length === 0) { alert("No paid/partial invoices selected."); return; }
    if (!confirm(`Generate receipt PDF for ${receiptIds.length} invoice(s)?`)) return;
    setBulkAction("receipt");
    for (const id of receiptIds) await handleGeneratePdf(id, "receipt");
    setBulkAction(null);
  };

  const handleBulkSendEmail = () => {
    // Open the doc-type picker dialog; actual sending happens in handleBulkSendEmailConfirm
    setBulkEmailDocType("tg");
    setBulkEmailDocTypeOpen(true);
  };

  const handleBulkSendEmailConfirm = async (docType: string) => {
    setBulkEmailDocTypeOpen(false);
    const toSend = Array.from(selected).map(id => invoices.find(r => r.id === id)).filter(Boolean) as InvoiceRow[];
    const withEmail = toSend.filter(r => {
      const hasPath = docType === "tg" ? r.pdf_path_tg
        : docType === "tp" ? r.pdf_path_tp
        : docType === "reminder" ? r.pdf_path_reminder
        : docType === "receipt" ? r.pdf_path_receipt
        : r.pdf_path;
      return hasPath && patientEmail(r.patient_id);
    });
    if (withEmail.length === 0) { alert(`No selected invoices have a ${docType.toUpperCase()} PDF generated and a patient email.`); return; }
    if (!confirm(`Send ${withEmail.length} invoice(s) as ${docType.toUpperCase()} by email?`)) return;
    setBulkAction("email");
    for (const inv of withEmail) await handleSendEmail(inv, docType);
    setBulkAction(null);
  };

  const handleExportCsv = () => {
    const header = "Invoice #,Date,Patient,Amount,Paid,Remaining,Status,Payment Method,Doctor\n";
    const rows = filtered.map(r => {
      const amt = Number(r.total_amount) || 0;
      const pa = Number(r.paid_amount) || 0;
      return [
        r.invoice_number,
        r.invoice_date || "",
        `"${patientName(r.patient_id).replace(/"/g, '""')}"`,
        amt.toFixed(2),
        pa.toFixed(2),
        (amt - pa).toFixed(2),
        r.is_complimentary ? "Complimentary" : r.status,
        r.payment_method || "",
        `"${(r.doctor_name || "").replace(/"/g, '""')}"`,
      ].join(",");
    });
    const csv = header + rows.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // Insurance: single invoice
  // ---------------------------------------------------------------------------

  const handleOpenInsurance = (row: InvoiceRow) => {
    setInsuranceTarget(row);
    setInsuranceModalOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Insurance: bulk validation + sending
  // ---------------------------------------------------------------------------

  const handleBulkInsuranceOpen = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    setBulkInsuranceOpen(true);
    setBulkInsValidation([]);
    setBulkInsResults([]);
    setBulkInsSending(false);
    setBulkInsProgress(0);

    const rows = ids.map(id => invoices.find(r => r.id === id)).filter(Boolean) as InvoiceRow[];
    const validations: BulkInsValidation[] = [];

    for (const row of rows) {
      const errors: string[] = [];
      const warnings: string[] = [];
      let insurerGln: string | null = null;
      let insurerName: string | null = null;
      let lawType: string | null = row.health_insurance_law || null;
      let billingType: string | null = row.billing_type || null;
      let policyNumber: string | null = null;
      let avsNumber: string | null = null;
      let caseNumber: string | null = null;
      let accidentDate: string | null = null;

      if (!row.patient_id) {
        errors.push("No patient linked");
      } else {
        // maison-toa patient columns: dob, street_address, postal_code, town
        const { data: patient } = await supabaseClient
          .from("patients")
          .select("first_name, last_name, dob, gender, street_address, postal_code, town")
          .eq("id", row.patient_id)
          .maybeSingle();

        if (!patient) {
          errors.push("Patient record not found");
        } else {
          if (!patient.first_name || !patient.last_name) warnings.push("Missing patient name");
          if (!patient.dob) warnings.push("Missing date of birth");
          if (!patient.gender) warnings.push("Missing gender");
          if (!patient.street_address || !patient.postal_code || !patient.town) warnings.push("Incomplete address");
        }

        const { data: insurances } = await supabaseClient
          .from("patient_insurances")
          .select("insurer_gln, provider_name, law_type, billing_type, avs_number, policy_number, case_number, accident_date, is_primary")
          .eq("patient_id", row.patient_id)
          .order("is_primary", { ascending: false })
          .limit(5);

        if (!insurances || insurances.length === 0) {
          errors.push("No insurance on file");
        } else {
          const primary = (insurances as any[]).find((i) => i.is_primary) || insurances[0];
          insurerGln = primary.insurer_gln || null;
          insurerName = primary.provider_name || null;
          if (!lawType) lawType = primary.law_type || "KVG";
          if (!billingType) billingType = primary.billing_type || "TG";
          policyNumber = primary.policy_number || null;
          avsNumber = primary.avs_number || null;
          caseNumber = primary.case_number || null;
          accidentDate = primary.accident_date || null;

          if (!insurerGln) errors.push("Insurance has no GLN");
          if (!insurerName) warnings.push("Insurance name missing");
        }

        const { count } = await supabaseClient
          .from("invoice_line_items")
          .select("id", { count: "exact", head: true })
          .eq("invoice_id", row.id);

        if (!count || count === 0) errors.push("No line items");
      }

      const { data: existingSubs } = await supabaseClient
        .from("medidata_submissions")
        .select("id, status")
        .eq("invoice_id", row.id)
        .in("status", ["pending", "transmitted", "delivered", "accepted"])
        .limit(1);

      if (existingSubs && existingSubs.length > 0) {
        warnings.push("Already has an active submission");
      }

      validations.push({
        invoiceId: row.id,
        invoiceNumber: row.invoice_number,
        patientId: row.patient_id,
        patientName: patientName(row.patient_id),
        amount: Number(row.total_amount) || 0,
        ready: errors.length === 0,
        warnings,
        errors,
        insurerGln,
        insurerName,
        lawType,
        billingType,
        policyNumber,
        avsNumber,
        caseNumber,
        accidentDate,
      });
    }

    setBulkInsValidation(validations);
  };

  const handleBulkInsuranceSend = async () => {
    const ready = bulkInsValidation.filter(v => v.ready);
    if (ready.length === 0) return;

    setBulkInsSending(true);
    setBulkInsProgress(0);
    setBulkInsResults([]);

    const results: BulkInsResult[] = [];

    for (let i = 0; i < ready.length; i++) {
      const v = ready[i];
      setBulkInsProgress(i + 1);

      try {
        const res = await fetch("/api/medidata/send-invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: v.invoiceId,
            patientId: v.patientId,
            billingType: v.billingType || "TG",
            lawType: v.lawType || "KVG",
            reminderLevel: 0,
            diagnosisCodes: [],
            treatmentReason: v.lawType === "UVG" ? "accident" : "disease",
            insurerGln: v.insurerGln,
            insurerName: v.insurerName || "",
            policyNumber: v.policyNumber || "",
            avsNumber: v.avsNumber || "",
            caseNumber: v.caseNumber || "",
            accidentDate: v.lawType === "UVG" ? v.accidentDate : undefined,
            language: 2,
            skipValidation: false,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          const errMsg = data.abortInfo
            ? `${data.error}: ${data.abortInfo}`
            : data.details || data.error || "Unknown error";
          results.push({ invoiceId: v.invoiceId, invoiceNumber: v.invoiceNumber, patientName: v.patientName, status: "error", message: errMsg });
        } else {
          const transmitted = data.submission?.transmitted;
          results.push({
            invoiceId: v.invoiceId,
            invoiceNumber: v.invoiceNumber,
            patientName: v.patientName,
            status: "success",
            message: transmitted ? `Sent — ref: ${data.submission.messageId || "—"}` : "Created as draft (proxy not configured)",
          });
        }
      } catch (err) {
        results.push({
          invoiceId: v.invoiceId,
          invoiceNumber: v.invoiceNumber,
          patientName: v.patientName,
          status: "error",
          message: err instanceof Error ? err.message : "Network error",
        });
      }

      setBulkInsResults([...results]);
    }

    setBulkInsSending(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">Manage, search, and take action on all invoices.</p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-medium text-slate-500">Invoices</p>
          <p className="mt-0.5 text-lg font-semibold text-slate-900">{summary.count}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-medium text-slate-500">Total Billed</p>
          <p className="mt-0.5 text-lg font-semibold text-slate-900">CHF {formatCurrency(summary.total)}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 shadow-sm">
          <p className="text-[11px] font-medium text-emerald-600">Total Paid</p>
          <p className="mt-0.5 text-lg font-semibold text-emerald-700">CHF {formatCurrency(summary.paid)}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 shadow-sm">
          <p className="text-[11px] font-medium text-amber-600">Outstanding</p>
          <p className="mt-0.5 text-lg font-semibold text-amber-700">CHF {formatCurrency(summary.unpaid)}</p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>
          <input
            type="text"
            placeholder="Search by invoice #, patient, doctor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
          <option value="all">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="PAID">Paid</option>
          <option value="PARTIAL_PAID">Partial Paid</option>
          <option value="PARTIAL_LOSS">Partial Loss</option>
          <option value="OVERPAID">Overpaid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={paymentMethodFilter} onChange={e => setPaymentMethodFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
          <option value="all">All methods</option>
          {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={billingTypeFilter} onChange={e => setBillingTypeFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
          <option value="all">All billing</option>
          <option value="TP">TP (Tiers Payant)</option>
          <option value="TG">TG (Tiers Garant)</option>
        </select>
        <select value={insuranceFilter} onChange={e => setInsuranceFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
          <option value="all">All insurance</option>
          <option value="needs_action">⚠ Needs submission (not sent + rejected unpaid)</option>
          <option value="not_submitted">📋 Never submitted</option>
          <option value="in_flight">⏳ Pending / Transmitted</option>
          <option value="rejected">❌ Rejected (all)</option>
          <option value="rejected_unpaid">❌ Rejected &amp; Unpaid</option>
          <option value="rejected_paid">✓ Rejected but Paid (bank)</option>
          <option value="accepted">✓ Accepted / Paid (Sumex)</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        {(search || statusFilter !== "all" || paymentMethodFilter !== "all" || billingTypeFilter !== "all" || insuranceFilter !== "all" || dateFrom || dateTo) && (
          <button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); setPaymentMethodFilter("all"); setBillingTypeFilter("all"); setInsuranceFilter("all"); setDateFrom(""); setDateTo(""); }} className="text-[10px] text-sky-600 hover:text-sky-800 font-medium">
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-xs">
          <span className="font-semibold text-sky-800">{selected.size} selected</span>
          <div className="h-4 w-px bg-sky-200" />
          <button type="button" onClick={handleBulkGeneratePdf} disabled={!!bulkAction} className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 transition-colors">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            {bulkAction === "pdf" ? "Generating..." : "Bulk Generate PDF"}
          </button>
          <button type="button" onClick={handleBulkGenerateReceipt} disabled={!!bulkAction} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {bulkAction === "receipt" ? "Generating..." : "Bulk Generate Receipt"}
          </button>
          <button type="button" onClick={handleBulkSendEmail} disabled={!!bulkAction} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            {bulkAction === "email" ? "Sending..." : "Bulk Send Email"}
          </button>
          <div className="h-4 w-px bg-sky-200" />
          <button type="button" onClick={handleBulkInsuranceOpen} disabled={!!bulkAction || bulkInsSending} className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-white px-2.5 py-1 text-[10px] font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50 transition-colors">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            Bulk Send Insurance
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[10px] text-sky-600 hover:text-sky-800 font-medium">
            Deselect all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading invoices...</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No invoices match your filters.</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" checked={selected.size === paginated.length && paginated.length > 0} onChange={toggleSelectAll} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                </th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">Invoice #</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">Patient</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-right">Amount</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-right">Paid</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-right">Remaining</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">Status</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">Method</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">Insurance</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">Doctor</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-center">PDF</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginated.map(row => {
                const badge = statusBadge(row.status, row.is_complimentary);
                const amt = Number(row.total_amount) || 0;
                const pa = Number(row.paid_amount) || 0;
                const remaining = Math.max(0, amt - pa);
                const isReceipt = RECEIPT_STATUSES.includes(row.status);
                const isGenerating = generatingPdf.has(row.id);
                const isSending = sendingEmail.has(row.id);

                return (
                  <tr key={row.id} className={`hover:bg-sky-50/30 transition-colors ${selected.has(row.id) ? "bg-sky-50/50" : ""}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{row.invoice_number}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(row.invoice_date)}</td>
                    <td className="px-3 py-2">
                      {row.patient_id ? (
                        <Link href={`/patients/${row.patient_id}`} className="text-sky-700 hover:text-sky-900 hover:underline font-medium">
                          {patientName(row.patient_id)}
                        </Link>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900 whitespace-nowrap">{formatCurrency(amt)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 whitespace-nowrap">{pa > 0 ? formatCurrency(pa) : "-"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {remaining > 0.01 ? <span className="text-amber-700 font-medium">{formatCurrency(remaining)}</span> : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.payment_method || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {(() => {
                        const latest = latestInsByInvoice[row.id];
                        const b = insuranceBadge(latest?.status, row.billing_type);
                        return (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${b.cls}`} title={b.title}>
                            {b.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[120px] truncate">{row.doctor_name || "-"}</td>
                    <td className="px-3 py-2 text-center">
                      {row.pdf_path ? (
                        <button type="button" onClick={() => handleViewPdf(row.pdf_path!)} className="text-indigo-600 hover:text-indigo-800" title="View PDF">
                          <svg className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                      ) : (
                        <span className="text-slate-300" title="No PDF">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">

                        {/* Generate PDF — dropdown */}
                        <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPdfDropdownOpen(null); }}>
                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() => setPdfDropdownOpen(pdfDropdownOpen === row.id ? null : row.id)}
                            className="inline-flex items-center gap-0.5 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors"
                            title="Generate PDF"
                          >
                            {isGenerating ? "..." : "PDF ▾"}
                          </button>
                          {pdfDropdownOpen === row.id && (
                            <div className="absolute left-0 top-full z-30 mt-0.5 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                              <button type="button" className="w-full px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-violet-50" onClick={() => { setPdfDropdownOpen(null); handleGeneratePdf(row.id, "tg"); }}>Invoice (patient / TG)</button>
                              <button type="button" className="w-full px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-violet-50" onClick={() => { setPdfDropdownOpen(null); handleGeneratePdf(row.id, "tp"); }}>Invoice (insurance / TP)</button>
                              <div className="my-1 border-t border-slate-100" />
                              <button type="button" className="w-full px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-violet-50" onClick={() => { setPdfDropdownOpen(null); handleGeneratePdf(row.id, "reminder", 1); }}>Reminder (1st)</button>
                              <button type="button" className="w-full px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-violet-50" onClick={() => { setPdfDropdownOpen(null); handleGeneratePdf(row.id, "reminder", 2); }}>Reminder (2nd)</button>
                              <button type="button" className="w-full px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-violet-50" onClick={() => { setPdfDropdownOpen(null); handleGeneratePdf(row.id, "reminder", 3); }}>Reminder (3rd)</button>
                              <div className="my-1 border-t border-slate-100" />
                              <button type="button" className="w-full px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-violet-50" onClick={() => { setPdfDropdownOpen(null); handleGeneratePdf(row.id, "receipt"); }}>Patient receipt</button>
                            </div>
                          )}
                        </div>

                        {/* Email to patient — opens modal picker */}
                        {patientEmail(row.patient_id) ? (
                          <button
                            type="button"
                            onClick={() => setEmailModalInvoice(row)}
                            disabled={isSending}
                            className="inline-flex items-center gap-0.5 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                            title="Email to patient"
                          >
                            {isSending ? "..." : "Email"}
                          </button>
                        ) : (
                          <span className="inline-flex items-center rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-300 cursor-not-allowed" title="No email on file">Email</span>
                        )}

                        {row.patient_id && (
                          <button
                            type="button"
                            onClick={() => handleOpenInsurance(row)}
                            className="inline-flex items-center gap-0.5 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-medium text-teal-700 hover:bg-teal-100 transition-colors"
                            title="Send to insurance via MediData"
                          >
                            Insurance
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            Showing {page * ROWS_PER_PAGE + 1}–{Math.min((page + 1) * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded border border-slate-200 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 transition-colors">
              Previous
            </button>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="rounded border border-slate-200 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 transition-colors">
              Next
            </button>
          </div>
        </div>
      )}

      {/* Single invoice insurance modal */}
      {insuranceTarget && (
        <InsuranceBillingModal
          isOpen={insuranceModalOpen}
          onClose={() => { setInsuranceModalOpen(false); setInsuranceTarget(null); }}
          consultationId={insuranceTarget.id}
          patientId={insuranceTarget.patient_id || ""}
          patientName={patientName(insuranceTarget.patient_id)}
          invoiceAmount={Number(insuranceTarget.total_amount) || null}
          onSuccess={() => { setInsuranceModalOpen(false); setInsuranceTarget(null); }}
        />
      )}

      {/* Bulk insurance send modal */}
      {bulkInsuranceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50" onClick={(e) => { if (e.target === e.currentTarget && !bulkInsSending) setBulkInsuranceOpen(false); }}>
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Bulk Send to Insurance</h2>
                <p className="text-sm text-slate-500">Pre-flight validation &amp; batch MediData transmission</p>
              </div>
              {!bulkInsSending && (
                <button onClick={() => setBulkInsuranceOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {bulkInsValidation.length === 0 ? (
              <div className="py-12 text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  <svg className="h-5 w-5 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                </div>
                <p className="mt-3 text-sm text-slate-500">Validating invoices...</p>
              </div>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{bulkInsValidation.filter(v => v.ready).length}</p>
                    <p className="text-[11px] font-medium text-emerald-600">Ready to send</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{bulkInsValidation.filter(v => v.ready && v.warnings.length > 0).length}</p>
                    <p className="text-[11px] font-medium text-amber-600">With warnings</p>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{bulkInsValidation.filter(v => !v.ready).length}</p>
                    <p className="text-[11px] font-medium text-red-600">Will fail</p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2 font-semibold text-slate-600">Status</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Invoice</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Patient</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Insurer</th>
                        <th className="px-3 py-2 font-semibold text-slate-600 text-right">Amount</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Issues</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {bulkInsValidation.map(v => (
                        <tr key={v.invoiceId} className={v.ready ? "" : "bg-red-50/30"}>
                          <td className="px-3 py-2">
                            {v.ready ? (
                              v.warnings.length > 0 ? (
                                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">WARN</span>
                              ) : (
                                <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">READY</span>
                              )
                            ) : (
                              <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">FAIL</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-900">{v.invoiceNumber}</td>
                          <td className="px-3 py-2 text-slate-700">{v.patientName}</td>
                          <td className="px-3 py-2">
                            {v.insurerName ? <span className="text-slate-700">{v.insurerName}</span> : <span className="text-slate-400 italic">None</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">CHF {v.amount.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <div className="space-y-0.5">
                              {v.errors.map((e, i) => <p key={i} className="text-[10px] text-red-600 font-medium">{e}</p>)}
                              {v.warnings.map((w, i) => <p key={i} className="text-[10px] text-amber-600">{w}</p>)}
                              {v.errors.length === 0 && v.warnings.length === 0 && (
                                <span className="text-[10px] text-emerald-600">All checks passed</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {bulkInsSending && (
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                      <span>Sending {bulkInsProgress} of {bulkInsValidation.filter(v => v.ready).length}...</span>
                      <span>{Math.round((bulkInsProgress / bulkInsValidation.filter(v => v.ready).length) * 100)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${(bulkInsProgress / bulkInsValidation.filter(v => v.ready).length) * 100}%` }} />
                    </div>
                  </div>
                )}

                {bulkInsResults.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <h3 className="text-sm font-semibold text-slate-800">Results</h3>
                    {bulkInsResults.map(r => (
                      <div key={r.invoiceId} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${r.status === "success" ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                        {r.status === "success" ? (
                          <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /></svg>
                        ) : (
                          <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        )}
                        <div>
                          <span className="font-medium text-slate-900">{r.invoiceNumber}</span>
                          <span className="mx-1 text-slate-400">·</span>
                          <span className="text-slate-600">{r.patientName}</span>
                          <p className={`mt-0.5 ${r.status === "success" ? "text-emerald-700" : "text-red-700"}`}>{r.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5 flex items-center justify-end gap-3">
                  {!bulkInsSending && bulkInsResults.length === 0 && (
                    <>
                      <button type="button" onClick={() => setBulkInsuranceOpen(false)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkInsuranceSend}
                        disabled={bulkInsValidation.filter(v => v.ready).length === 0}
                        className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        Send {bulkInsValidation.filter(v => v.ready).length} invoice{bulkInsValidation.filter(v => v.ready).length !== 1 ? "s" : ""} to insurance
                      </button>
                    </>
                  )}
                  {!bulkInsSending && bulkInsResults.length > 0 && (
                    <button type="button" onClick={() => setBulkInsuranceOpen(false)} className="rounded-full bg-slate-800 px-5 py-2 text-sm font-medium text-white hover:bg-slate-900">
                      Done
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* ── Email to patient modal (per-row) ─────────────────────────────── */}
      {emailModalInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50" onClick={(e) => { if (e.target === e.currentTarget) setEmailModalInvoice(null); }}>
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Email to patient</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Invoice <strong>{emailModalInvoice.invoice_number}</strong> → {patientEmail(emailModalInvoice.patient_id)}
                </p>
              </div>
              <button onClick={() => setEmailModalInvoice(null)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <p className="mb-3 text-[11px] text-slate-500">Select the document type to send. Only already-generated PDFs can be sent.</p>

            <div className="space-y-1.5">
              {([
                { type: "tg",       label: "Invoice (patient / TG)",      path: emailModalInvoice.pdf_path_tg },
                { type: "tp",       label: "Invoice (insurance / TP)",     path: emailModalInvoice.pdf_path_tp },
                { type: "reminder", label: "Reminder",                     path: emailModalInvoice.pdf_path_reminder },
                { type: "receipt",  label: "Patient receipt",              path: emailModalInvoice.pdf_path_receipt },
              ] as { type: string; label: string; path: string | null }[]).map(({ type, label, path }) => (
                <div key={type} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${path ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-50"}`}>
                  <div className="flex items-center gap-2">
                    {path
                      ? <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" /></svg>
                      : <svg className="h-3.5 w-3.5 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    }
                    <span className="text-[12px] text-slate-700">{label}</span>
                    {!path && <span className="ml-1 text-[10px] text-slate-400 italic">not generated</span>}
                  </div>
                  {path && (
                    <button
                      type="button"
                      disabled={sendingEmail.has(emailModalInvoice.id)}
                      onClick={async () => {
                        const inv = emailModalInvoice;
                        setEmailModalInvoice(null);
                        await handleSendEmail(inv, type);
                      }}
                      className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                    >
                      Send
                    </button>
                  )}
                </div>
              ))}
            </div>

            <p className="mt-3 text-[10px] text-slate-400">To send a type not yet generated, close this modal and use the PDF ▾ button first.</p>
          </div>
        </div>
      )}

      {/* ── Bulk email doc-type picker ────────────────────────────────────── */}
      {bulkEmailDocTypeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50" onClick={(e) => { if (e.target === e.currentTarget) setBulkEmailDocTypeOpen(false); }}>
          <div className="relative w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-base font-semibold text-slate-900">Bulk Send Email</h2>
              <button onClick={() => setBulkEmailDocTypeOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <p className="mb-3 text-[11px] text-slate-500">Which document type should be emailed to all {selected.size} selected patient(s)?</p>

            <div className="space-y-1.5">
              {([
                { type: "tg",       label: "Invoice (patient / TG)" },
                { type: "tp",       label: "Invoice (insurance / TP)" },
                { type: "reminder", label: "Reminder" },
                { type: "receipt",  label: "Patient receipt" },
              ] as { type: string; label: string }[]).map(({ type, label }) => (
                <label key={type} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${bulkEmailDocType === type ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    name="bulkDocType"
                    value={type}
                    checked={bulkEmailDocType === type}
                    onChange={() => setBulkEmailDocType(type)}
                    className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-[12px] font-medium text-slate-700">{label}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBulkEmailDocTypeOpen(false)} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                type="button"
                onClick={() => handleBulkSendEmailConfirm(bulkEmailDocType)}
                className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                Send {bulkEmailDocType.toUpperCase()} to {selected.size} patient(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
