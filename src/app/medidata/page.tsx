"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import InvoiceStatusBadge, { InvoiceStatusTimeline } from "@/components/InvoiceStatusBadge";
import type { MediDataInvoiceStatus } from "@/lib/medidata";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "submissions" | "responses" | "participants" | "notifications";

type Submission = {
  id: string;
  invoice_id: string | null;
  invoice_number: string;
  invoice?: {
    id: string;
    pdf_path: string | null;
    pdf_generated_at: string | null;
  } | null;
  status: MediDataInvoiceStatus;
  patient_id: string;
  invoice_amount: number | null;
  billing_type: string | null;
  law_type: string | null;
  medidata_message_id: string | null;
  patient_copy_ref: string | null;
  medidata_transmission_date: string | null;
  medidata_response_code: string | null;
  medidata_response_message: string | null;
  insurance_response_code: string | null;
  insurance_response_message: string | null;
  insurance_response_date: string | null;
  created_at: string;
  updated_at: string | null;
  history?: Array<{
    id: string;
    previous_status: string | null;
    new_status: string;
    response_code: string | null;
    response_message: string | null;
    notes: string | null;
    created_at: string;
  }>;
  rejection_responses?: Array<{
    id: string;
    response_type: string | null;
    explanation: string | null;
    content: string | null;
    status_in: string | null;
    status_out: string | null;
    sender_gln: string | null;
    created_at: string;
  }>;
  error_notifications?: Array<{
    id: string;
    severity: string | null;
    error_code: string | null;
    message: string | null;
    confirmed_at: string | null;
    medidata_created_at: string | null;
    created_at: string;
  }>;
};

type DbResponse = {
  id: string;
  medidata_message_id: string | null;
  document_reference: string | null;
  document_path?: string | null;
  correlation_reference: string | null;
  submission_id: string | null;
  response_type: string | null;
  status_in: string | null;
  status_out: string | null;
  sender_gln: string | null;
  content: string | null;
  explanation: string | null;
  confirmed_at: string | null;
  received_at: string | null;
  created_at: string;
};

type DbNotification = {
  id: string;
  medidata_notification_id: number | null;
  severity: string | null;
  error_code: string | null;
  message: string | null;
  transmission_reference: string | null;
  submission_id: string | null;
  confirmed_at: string | null;
  medidata_created_at: string | null;
  created_at: string;
};

type MediDataParticipant = {
  glnParticipant: string;
  glnReceiver: string;
  name: string;
  street?: string;
  zipCode?: string;
  town?: string;
  lawTypes: number[];
  bagNumber?: string | null;
  tgTpChange?: boolean;
  tgAllowed?: boolean;
};

// ---------------------------------------------------------------------------
// Law type helpers
// ---------------------------------------------------------------------------

const LAW_TYPE_MAP: Record<number, string> = {
  1: "KVG",
  2: "UVG",
  3: "IVG",
  4: "MVG",
  5: "VVG",
};

// ---------------------------------------------------------------------------
// Notification message parser
// ---------------------------------------------------------------------------

type ParsedNotification = {
  description: string;
  references: Array<{ label: string; value: string }>;
  cause: string | null;
  action: string | null;
  errorCode: string | null;
  communication: string | null;
};

function parseNotificationMessage(message: string | null): ParsedNotification {
  const result: ParsedNotification = {
    description: "",
    references: [],
    cause: null,
    action: null,
    errorCode: null,
    communication: null,
  };
  if (!message) return result;

  const lines = message.split("\n").map((l) => l.trim()).filter(Boolean);

  // First non-empty line is typically the description
  if (lines.length > 0) {
    result.description = lines[0];
  }

  // Parse structured lines with · bullet points and key:value patterns
  // German: Dokumentreferenz, Geschäftsfall, Übermittlung, Ursache, Massnahme, Fehler-Code, Mitteilung
  // French: Référence document, Transaction, Transmission, Cause, Mesures, Code d'erreur, Communication
  const refLabels: Record<string, string> = {
    "dokumentreferenz": "Document Ref",
    "référence document": "Document Ref",
    "riferimento documento": "Document Ref",
    "geschäftsfall": "Case",
    "transaction": "Case",
    "caso": "Case",
    "übermittlung": "Transmission",
    "transmission": "Transmission",
    "trasmissione": "Transmission",
  };
  const causeKeys = ["ursache", "cause", "causa"];
  const actionKeys = ["massnahme", "mesures", "misure"];
  const errorCodeKeys = ["fehler-code", "code d´erreur", "code d'erreur", "codice di errore"];
  const commKeys = ["mitteilung", "communication", "comunicazione"];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/^·\s*/, "").trim();
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;

    const rawKey = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    // Check references
    const refLabel = refLabels[rawKey];
    if (refLabel && val) {
      result.references.push({ label: refLabel, value: val });
      continue;
    }

    // Check cause
    if (causeKeys.some((k) => rawKey.includes(k)) && val) {
      result.cause = val;
      continue;
    }

    // Check action
    if (actionKeys.some((k) => rawKey.includes(k)) && val) {
      result.action = val;
      continue;
    }

    // Check error code
    if (errorCodeKeys.some((k) => rawKey.includes(k)) && val) {
      result.errorCode = val;
      continue;
    }

    // Check communication / technical message
    if (commKeys.some((k) => rawKey.includes(k)) && val) {
      result.communication = val;
      continue;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MediDataDashboard() {
  const [tab, setTab] = useState<Tab>("submissions");

  // Submissions
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);

  // Participants
  const [participants, setParticipants] = useState<MediDataParticipant[]>([]);
  const [partLoading, setPartLoading] = useState(false);
  const [partSearch, setPartSearch] = useState("");
  const [partLawFilter, setPartLawFilter] = useState<number | null>(null);

  // Responses (DB-backed)
  const [responses, setResponses] = useState<DbResponse[]>([]);
  const [respLoading, setRespLoading] = useState(false);
  const [expandedResp, setExpandedResp] = useState<string | null>(null);

  // Notifications (DB-backed)
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  // Actions
  const [connStatus, setConnStatus] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const [sendTestStatus, setSendTestStatus] = useState<string | null>(null);
  const [sendTestResults, setSendTestResults] = useState<any[] | null>(null);
  const [sendInvoiceIds, setSendInvoiceIds] = useState("");
  const [renderingPdf, setRenderingPdf] = useState<string | null>(null);

  const openStorageFile = useCallback((path: string | null | undefined) => {
    if (!path) return;
    const { data } = supabaseClient.storage.from("invoice-pdfs").getPublicUrl(path);
    const url = data?.publicUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  // ── Fetch submissions from local DB ──
  const fetchSubmissions = useCallback(async () => {
    setSubsLoading(true);
    try {
      const { data } = await supabaseClient
        .from("medidata_submissions")
        .select(`
          *,
          invoice:invoices(id,pdf_path,pdf_generated_at),
          history:medidata_submission_history(*)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      let subs = (data as Submission[]) || [];

      // Fetch rejection responses and error notifications separately (no FK constraints)
      if (subs.length > 0) {
        const subIds = subs.map((s) => s.id);
        const messageIds = subs.map((s) => s.medidata_message_id).filter(Boolean) as string[];

        const respPromise = supabaseClient
          .from("medidata_responses")
          .select("id,response_type,explanation,content,status_in,status_out,sender_gln,created_at,submission_id")
          .in("submission_id", subIds);

        const notifBySubIdPromise = supabaseClient
          .from("medidata_notifications_log")
          .select("id,severity,error_code,message,confirmed_at,medidata_created_at,created_at,submission_id,transmission_reference")
          .in("submission_id", subIds);

        const notifByTransRefPromise = messageIds.length > 0
          ? supabaseClient
              .from("medidata_notifications_log")
              .select("id,severity,error_code,message,confirmed_at,medidata_created_at,created_at,submission_id,transmission_reference")
              .in("transmission_reference", messageIds)
          : Promise.resolve({ data: [] as any[] });

        const [respResult, notifBySubId, notifByTransRef] = await Promise.all([
          respPromise, notifBySubIdPromise, notifByTransRefPromise,
        ]);

        const respMap = new Map<string, Submission["rejection_responses"]>();
        if (respResult.data) {
          for (const r of respResult.data) {
            const sid = r.submission_id as string;
            if (!respMap.has(sid)) respMap.set(sid, []);
            respMap.get(sid)!.push(r as any);
          }
        }

        // Build notification map: merge by submission_id + transmission_reference
        const notifMap = new Map<string, Submission["error_notifications"]>();
        const seenNotifIds = new Set<string>();

        // Build reverse lookup: medidata_message_id -> submission id
        const msgIdToSubId = new Map<string, string>();
        for (const s of subs) {
          if (s.medidata_message_id) msgIdToSubId.set(s.medidata_message_id, s.id);
        }

        const allNotifs = [...(notifBySubId.data || []), ...(notifByTransRef.data || [])];
        for (const n of allNotifs) {
          if (seenNotifIds.has(n.id)) continue;
          seenNotifIds.add(n.id);
          // Determine which submission this notification belongs to
          let sid = n.submission_id as string | null;
          if (!sid && n.transmission_reference) {
            sid = msgIdToSubId.get(n.transmission_reference) || null;
          }
          if (!sid) continue;
          if (!notifMap.has(sid)) notifMap.set(sid, []);
          notifMap.get(sid)!.push(n as any);
        }

        subs = subs.map((s) => ({
          ...s,
          rejection_responses: respMap.get(s.id) || [],
          error_notifications: notifMap.get(s.id) || [],
        }));
      }

      setSubmissions(subs);
    } catch (e) {
      console.error("Error fetching submissions:", e);
    }
    setSubsLoading(false);
  }, []);

  // ── Fetch responses from local DB ──
  const fetchResponses = useCallback(async () => {
    setRespLoading(true);
    try {
      const { data } = await supabaseClient
        .from("medidata_responses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setResponses((data as DbResponse[]) || []);
    } catch (e) {
      console.error("Error fetching responses:", e);
    }
    setRespLoading(false);
  }, []);

  // ── Fetch notifications from local DB ──
  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const { data } = await supabaseClient
        .from("medidata_notifications_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifications((data as DbNotification[]) || []);
    } catch (e) {
      console.error("Error fetching notifications:", e);
    }
    setNotifLoading(false);
  }, []);

  // ── Fetch participants from MediData proxy ──
  const fetchParticipants = useCallback(async () => {
    setPartLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (partSearch) params.set("name", partSearch);
      if (partLawFilter) params.set("lawtype", String(partLawFilter));
      const res = await fetch(`/api/medidata/proxy-participants?${params}`);
      const json = await res.json();
      setParticipants(json.participants || []);
    } catch (e) {
      console.error("Error fetching participants:", e);
    }
    setPartLoading(false);
  }, [partSearch, partLawFilter]);

  // ── Poll MediData: fetch downloads + notifications, store in DB ──
  const handlePollMediData = async () => {
    setPollStatus("Polling...");
    try {
      const res = await fetch("/api/medidata/poll", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        const parts: string[] = [];
        if (json.statusUpdates?.updated > 0)
          parts.push(`${json.statusUpdates.updated} status updates`);
        if (json.downloads?.processed > 0)
          parts.push(`${json.downloads.processed} responses`);
        if (json.notifications?.processed > 0)
          parts.push(`${json.notifications.processed} notifications`);
        setPollStatus(parts.length > 0 ? `Found: ${parts.join(", ")}` : "No new data");
        // Refresh all tabs
        fetchSubmissions();
        fetchResponses();
        fetchNotifications();
      } else {
        setPollStatus(`Error: ${json.error}`);
      }
    } catch {
      setPollStatus("Poll failed");
    }
    setTimeout(() => setPollStatus(null), 8000);
  };

  // ── Send invoices to MediData (production) ──
  const handleSendInvoices = async () => {
    // Parse invoice IDs from the text input (comma/space/newline separated)
    const ids = sendInvoiceIds
      .split(/[,\s\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      setSendTestStatus("Enter invoice IDs first");
      setTimeout(() => setSendTestStatus(null), 3000);
      return;
    }

    setSendTestStatus("Sending...");
    setSendTestResults(null);
    const results: any[] = [];
    let allSuccess = true;
    try {
      for (const invoiceId of ids) {
        try {
          const res = await fetch("/api/medidata/send-invoice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invoiceId }),
          });
          const json = await res.json();
          results.push({
            invoiceId,
            success: json.success ?? false,
            invoiceNumber: json.submission?.invoiceNumber || invoiceId,
            status: json.submission?.status || "error",
            messageId: json.submission?.messageId || null,
            error: json.error || null,
          });
          if (!json.success) allSuccess = false;
        } catch (err) {
          results.push({ invoiceId, success: false, error: String(err) });
          allSuccess = false;
        }
      }
      setSendTestResults(results);
      setSendTestStatus(allSuccess ? "Sent successfully!" : "Some failed");
      fetchSubmissions();
    } catch {
      setSendTestStatus("Send failed");
    }
    setTimeout(() => setSendTestStatus(null), 10000);
  };

  // ── Test connection ──
  const testConnection = async () => {
    setConnStatus("testing...");
    try {
      const res = await fetch("/api/medidata/proxy-participants?limit=1");
      const json = await res.json();
      setConnStatus(json.success && json.participants?.length >= 0 ? "Connected" : json.error || "Failed");
    } catch {
      setConnStatus("Error");
    }
  };

  // ── Check status of a submission via proxy ──
  const handleCheckStatus = async (sub: Submission) => {
    if (!sub.medidata_message_id) return;
    try {
      const res = await fetch(`/api/medidata/proxy-status?ref=${encodeURIComponent(sub.medidata_message_id)}`);
      const json = await res.json();
      if (json.rawResponse?.data) {
        const status = json.rawResponse.data.status;
        const errorReason = json.rawResponse.data.errorReason;
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === sub.id
              ? {
                  ...s,
                  medidata_response_code: status || s.medidata_response_code,
                  medidata_response_message: errorReason || s.medidata_response_message,
                }
              : s,
          ),
        );
      }
    } catch (e) {
      console.error("Error checking status:", e);
    }
  };

  // ── Render response XML as PDF (Sumex) or printable HTML (fallback) ──
  const handleRenderResponsePdf = async (responseId: string) => {
    setRenderingPdf(responseId);
    try {
      // First try Sumex PDF generation
      const pdfRes = await fetch("/api/medidata/response-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId }),
      });

      if (pdfRes.ok && pdfRes.headers.get("content-type")?.includes("application/pdf")) {
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setRenderingPdf(null);
        return;
      }

      // Sumex PDF failed — fall back to HTML rendering via mode=json
      console.warn("Sumex PDF failed, falling back to HTML rendering");
      const res = await fetch("/api/medidata/response-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, mode: "json" }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(`Failed: ${json.error || "Unknown error"}`);
        setRenderingPdf(null);
        return;
      }
      const d = json.data;
      const typeColor = d.responseType === "accepted" ? "#059669" : d.responseType === "rejected" ? "#dc2626" : d.responseType === "pending" ? "#d97706" : "#475569";
      const typeBg = d.responseType === "accepted" ? "#ecfdf5" : d.responseType === "rejected" ? "#fef2f2" : d.responseType === "pending" ? "#fffbeb" : "#f8fafc";
      const formatAddr = (a: Record<string, string> | null) => {
        if (!a) return "";
        const name = [a.title, a.givenName, a.familyName].filter(Boolean).join(" ");
        const company = a.companyName || "";
        const postal = [a.street, [a.zip, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        return [company, name, postal].filter(Boolean).join("<br/>");
      };
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Response — ${d.correlationReference || d.invoiceId || responseId.slice(0,8)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;padding:40px;max-width:800px;margin:0 auto;font-size:13px}
  h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#64748b;margin-bottom:20px;font-weight:400}
  .badge{display:inline-block;padding:4px 14px;border-radius:20px;font-weight:700;font-size:13px;color:${typeColor};background:${typeBg};border:1px solid ${typeColor}30;text-transform:uppercase;letter-spacing:.5px}
  .section{margin-top:24px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
  .section-title{background:#f8fafc;padding:10px 16px;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:1px solid #e2e8f0}
  .section-body{padding:16px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
  .field label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:2px;font-weight:600}
  .field p{font-size:13px;color:#1e293b}
  .field p.mono{font-family:ui-monospace,monospace;font-size:12px}
  .error-row{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin-top:8px}
  .error-row .code{font-weight:700;color:#dc2626;font-family:monospace;font-size:12px}
  .msg-row{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-top:8px}
  .print-btn{position:fixed;top:16px;right:16px;background:#4f46e5;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
  .print-btn:hover{background:#4338ca}
  @media print{.print-btn{display:none}body{padding:20px}}
</style></head><body>
<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
<h1>Insurer Response</h1>
<h2>Invoice ${d.invoiceId || d.correlationReference || "—"} · ${d.invoiceDate || ""}</h2>
<div style="margin-bottom:20px"><span class="badge">${d.responseType || "unknown"}</span>
${d.statusOut ? `<span style="margin-left:8px;font-size:13px;color:${typeColor}">Status: ${d.statusOut}</span>` : ""}</div>

${d.explanation ? `<div style="background:${typeBg};border:1px solid ${typeColor}30;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px">${d.explanation}</div>` : ""}

<div class="section"><div class="section-title">Parties</div><div class="section-body"><div class="grid">
<div class="field"><label>Biller</label><p>${d.biller ? `GLN: ${d.biller.gln}<br/>${formatAddr(d.biller.address)}` : "—"}</p></div>
<div class="field"><label>Provider</label><p>${d.provider ? `GLN: ${d.provider.gln}<br/>${formatAddr(d.provider.address)}` : "—"}</p></div>
<div class="field"><label>Insurance</label><p>${d.insurance ? `GLN: ${d.insurance.gln}<br/>${formatAddr(d.insurance.address)}` : "—"}</p></div>
<div class="field"><label>Patient</label><p>${d.patient ? `${formatAddr(d.patient.address)}${d.patient.birthdate ? `<br/>DOB: ${d.patient.birthdate}` : ""}${d.patient.ssn ? `<br/>SSN: ${d.patient.ssn}` : ""}` : "—"}</p></div>
</div></div></div>

${d.balance ? `<div class="section"><div class="section-title">Balance</div><div class="section-body"><div class="grid3">
<div class="field"><label>Amount</label><p>${d.balance.currency} ${d.balance.amount}</p></div>
<div class="field"><label>Amount Due</label><p>${d.balance.currency} ${d.balance.amountDue}</p></div>
<div class="field"><label>Amount Paid</label><p>${d.balance.currency} ${d.balance.amountPaid}</p></div>
</div></div></div>` : ""}

${d.accepted ? `<div class="section"><div class="section-title">Accepted Details</div><div class="section-body">
<div class="grid"><div class="field"><label>Status In</label><p>${d.accepted.statusIn}</p></div><div class="field"><label>Status Out</label><p>${d.accepted.statusOut}</p></div></div>
${d.accepted.explanation ? `<p style="margin-top:8px">${d.accepted.explanation}</p>` : ""}
</div></div>` : ""}

${d.rejected ? `<div class="section"><div class="section-title">Rejected Details</div><div class="section-body">
<div class="grid"><div class="field"><label>Status In</label><p>${d.rejected.statusIn}</p></div><div class="field"><label>Status Out</label><p>${d.rejected.statusOut}</p></div></div>
${d.rejected.explanation ? `<p style="margin-top:8px">${d.rejected.explanation}</p>` : ""}
${d.rejected.errors.map((e: {code:string;text:string;errorValue:string;validValue:string}) => `<div class="error-row"><span class="code">${e.code}</span> ${e.text}${e.errorValue ? ` (got: ${e.errorValue}, expected: ${e.validValue})` : ""}</div>`).join("")}
</div></div>` : ""}

${d.pending ? `<div class="section"><div class="section-title">Pending Details</div><div class="section-body">
<div class="grid"><div class="field"><label>Status In</label><p>${d.pending.statusIn}</p></div><div class="field"><label>Status Out</label><p>${d.pending.statusOut}</p></div></div>
${d.pending.explanation ? `<p style="margin-top:8px">${d.pending.explanation}</p>` : ""}
${d.pending.messages.map((m: {code:string;text:string}) => `<div class="msg-row"><strong>${m.code}</strong> ${m.text}</div>`).join("")}
</div></div>` : ""}

<div class="section"><div class="section-title">Metadata</div><div class="section-body"><div class="grid">
<div class="field"><label>Sender GLN</label><p class="mono">${d.senderGln || "—"}</p></div>
<div class="field"><label>Correlation Ref</label><p class="mono">${d.correlationReference || "—"}</p></div>
<div class="field"><label>Received</label><p>${d.receivedAt ? new Date(d.receivedAt).toLocaleString("fr-CH") : "—"}</p></div>
<div class="field"><label>Response Timestamp</label><p class="mono">${d.responseTimestamp || "—"}</p></div>
</div></div></div>
</body></html>`;

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setRenderingPdf(null);
  };

  // Load data when tab changes
  useEffect(() => {
    if (tab === "submissions") fetchSubmissions();
    if (tab === "participants") fetchParticipants();
    if (tab === "responses") fetchResponses();
    if (tab === "notifications") fetchNotifications();
  }, [tab, fetchSubmissions, fetchParticipants, fetchResponses, fetchNotifications]);

  // ── Tab buttons ──
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "submissions", label: "Submissions", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { id: "responses", label: "Responses", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
    { id: "participants", label: "Participants", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
    { id: "notifications", label: "Notifications", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">MediData Dashboard</h1>
          <p className="text-sm text-slate-500">
            Manage invoice transmissions, responses, participants, and notifications
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={testConnection}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Test Connection
          </button>
          {connStatus && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                connStatus === "Connected"
                  ? "bg-emerald-100 text-emerald-700"
                  : connStatus === "testing..."
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              {connStatus}
            </span>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handlePollMediData}
            disabled={pollStatus === "Polling..."}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Poll MediData
          </button>
          {pollStatus && (
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              {pollStatus}
            </span>
          )}
          {sendTestStatus && (
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              sendTestStatus === "Sent successfully!" ? "bg-emerald-50 text-emerald-700" :
              sendTestStatus === "Sending..." ? "bg-amber-50 text-amber-700" :
              "bg-red-50 text-red-700"
            }`}>
              {sendTestStatus}
            </span>
          )}
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Invoice IDs (UUID, comma-separated)</label>
            <input
              type="text"
              value={sendInvoiceIds}
              onChange={(e) => setSendInvoiceIds(e.target.value)}
              placeholder="e.g. 8e6b72b6-8817-4e98-9551-8b6bd80af0a5, 1309e720-6538-..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            onClick={() => handleSendInvoices()}
            disabled={sendTestStatus === "Sending..."}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Send to MediData
          </button>
        </div>
      </div>

      {/* Send test results */}
      {sendTestResults && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-medium text-slate-700">Send Results</h3>
          <div className="space-y-2">
            {sendTestResults.map((r: any, i: number) => (
              <div key={i} className={`flex items-center justify-between rounded-lg p-3 text-sm ${
                r.success ? "bg-emerald-50" : "bg-red-50"
              }`}>
                <div>
                  <span className="font-medium">{r.doctor}</span>
                  <span className="ml-2 font-mono text-xs text-slate-500">{r.invoiceNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.transmissionRef && (
                    <span className="font-mono text-[10px] text-slate-400">{r.transmissionRef}</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.success ? "bg-emerald-200 text-emerald-800" : "bg-red-200 text-red-800"
                  }`}>
                    {r.success ? "Sent" : r.error?.slice(0, 60) || "Failed"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Submissions ── */}
      {tab === "submissions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Invoice Submissions</h2>
            <button
              onClick={fetchSubmissions}
              disabled={subsLoading}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
            >
              {subsLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {submissions.length === 0 && !subsLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <p className="text-sm text-slate-400">No submissions found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map((sub) => (
                <div key={sub.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div
                    className="flex cursor-pointer items-center justify-between p-4 hover:bg-slate-50/50"
                    onClick={() => setExpandedSub(expandedSub === sub.id ? null : sub.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium text-slate-900">{sub.invoice_number}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(sub.created_at).toLocaleDateString("fr-CH")}{" "}
                          {new Date(sub.created_at).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {sub.billing_type && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {sub.billing_type}
                        </span>
                      )}
                      {sub.law_type && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {sub.law_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {sub.invoice_amount != null && (
                        <span className="text-sm font-medium text-slate-700">
                          CHF {sub.invoice_amount.toFixed(2)}
                        </span>
                      )}
                      <InvoiceStatusBadge status={sub.status} />
                      <svg
                        className={`h-4 w-4 text-slate-400 transition-transform ${expandedSub === sub.id ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {expandedSub === sub.id && (
                    <div className="border-t border-slate-100 p-4 space-y-4">
                      {/* Error Notifications Alert (transmission errors) */}
                      {sub.error_notifications && sub.error_notifications.length > 0 && (
                        <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <h4 className="text-sm font-bold text-orange-900 mb-2">Transmission Errors</h4>
                              {sub.error_notifications.map((notif, idx) => (
                                <div key={notif.id} className={idx > 0 ? "mt-3 pt-3 border-t border-orange-200" : ""}>
                                  <div className="flex items-center gap-2 mb-2">
                                    {notif.severity && (
                                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                        notif.severity === "ERROR" ? "bg-red-100 text-red-800" :
                                        notif.severity === "WARNING" ? "bg-yellow-100 text-yellow-800" :
                                        "bg-slate-100 text-slate-700"
                                      }`}>
                                        {notif.severity}
                                      </span>
                                    )}
                                    {notif.error_code && (
                                      <span className="inline-flex items-center rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-mono font-semibold text-orange-800">
                                        {notif.error_code}
                                      </span>
                                    )}
                                    {notif.confirmed_at && (
                                      <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                        Confirmed
                                      </span>
                                    )}
                                  </div>
                                  {notif.message && (
                                    <p className="text-xs text-orange-800 leading-relaxed whitespace-pre-wrap">
                                      {notif.message}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-orange-600 mt-1">
                                    {notif.medidata_created_at 
                                      ? new Date(notif.medidata_created_at).toLocaleString("fr-CH")
                                      : new Date(notif.created_at).toLocaleString("fr-CH")}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Insurer Responses (rejections, decisions, etc.) */}
                      {sub.rejection_responses && sub.rejection_responses.length > 0 && (() => {
                        const hasRejection = sub.rejection_responses!.some(
                          (r) => r.response_type === "rejected" || r.status_out === "rejected"
                        );
                        const borderColor = hasRejection ? "border-red-200" : "border-blue-200";
                        const bgColor = hasRejection ? "bg-red-50" : "bg-blue-50";
                        const iconColor = hasRejection ? "text-red-600" : "text-blue-600";
                        const titleColor = hasRejection ? "text-red-900" : "text-blue-900";
                        const title = hasRejection ? "Insurer Rejection" : "Insurer Response";
                        return (
                          <div className={`rounded-lg border-2 ${borderColor} ${bgColor} p-4`}>
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0">
                                <svg className={`h-5 w-5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <h4 className={`text-sm font-bold ${titleColor} mb-3`}>{title}</h4>
                                {sub.rejection_responses!.map((resp, idx) => {
                                  const isRejected = resp.response_type === "rejected" || resp.status_out === "rejected";
                                  const textColor = isRejected ? "text-red-800" : "text-blue-800";
                                  const subTextColor = isRejected ? "text-red-700" : "text-blue-700";
                                  const dateColor = isRejected ? "text-red-500" : "text-blue-500";
                                  const dividerColor = isRejected ? "border-red-200" : "border-blue-200";

                                  // Parse invoice XML response content
                                  type ParsedResponse = {
                                    errors: { code: string; text: string }[];
                                    explanations: string[];
                                    insurerName?: string;
                                    contactName?: string;
                                    contactPhone?: string;
                                    contactEmail?: string;
                                    patientName?: string;
                                    treatmentDates?: string;
                                    allowModification?: boolean;
                                  };
                                  const parsed: ParsedResponse = { errors: [], explanations: [] };
                                  let hasParsedContent = false;

                                  if (resp.content) {
                                    const xml = resp.content;

                                    // Extract error elements: <invoice:error code="13" text="..." />
                                    const errorRegex = /<(?:invoice:)?error\s+[^>]*code="([^"]*)"[^>]*text="([^"]*)"[^>]*\/?>/gi;
                                    let em;
                                    while ((em = errorRegex.exec(xml)) !== null) {
                                      parsed.errors.push({ code: em[1], text: em[2].trim() });
                                      hasParsedContent = true;
                                    }

                                    // Extract explanations from XML
                                    const explRegex = /<(?:invoice:)?explanation[^>]*>([\s\S]*?)<\/(?:invoice:)?explanation>/gi;
                                    let exm;
                                    while ((exm = explRegex.exec(xml)) !== null) {
                                      const txt = exm[1].replace(/<[^>]+>/g, "").trim();
                                      if (txt && !parsed.explanations.includes(txt)) {
                                        parsed.explanations.push(txt);
                                        hasParsedContent = true;
                                      }
                                    }

                                    // Extract insurer/debitor name
                                    const debitorMatch = xml.match(/<(?:invoice:)?debitor[^>]*>[\s\S]*?<(?:invoice:)?companyname>([\s\S]*?)<\/(?:invoice:)?companyname>/i);
                                    if (debitorMatch) parsed.insurerName = debitorMatch[1].trim();

                                    // Extract contact employee info
                                    const contactBlock = xml.match(/<(?:invoice:)?contact[^>]*>([\s\S]*?)<\/(?:invoice:)?contact>/i);
                                    if (contactBlock) {
                                      const cb = contactBlock[1];
                                      const famMatch = cb.match(/<(?:invoice:)?familyname>([\s\S]*?)<\/(?:invoice:)?familyname>/i);
                                      const givMatch = cb.match(/<(?:invoice:)?givenname>([\s\S]*?)<\/(?:invoice:)?givenname>/i);
                                      if (famMatch || givMatch) {
                                        parsed.contactName = [givMatch?.[1]?.trim(), famMatch?.[1]?.trim()].filter(Boolean).join(" ");
                                        if (parsed.contactName === ".") parsed.contactName = undefined;
                                      }
                                      const phoneMatch = cb.match(/<(?:invoice:)?phone>([\s\S]*?)<\/(?:invoice:)?phone>/i);
                                      if (phoneMatch) parsed.contactPhone = phoneMatch[1].trim();
                                      const emailMatch = cb.match(/<(?:invoice:)?email>([\s\S]*?)<\/(?:invoice:)?email>/i);
                                      if (emailMatch) parsed.contactEmail = emailMatch[1].trim();
                                      hasParsedContent = true;
                                    }

                                    // Extract patient name
                                    const patientBlock = xml.match(/<(?:invoice:)?patient[^>]*>([\s\S]*?)<\/(?:invoice:)?patient>/i);
                                    if (patientBlock) {
                                      const pb = patientBlock[1];
                                      const famMatch = pb.match(/<(?:invoice:)?familyname>([\s\S]*?)<\/(?:invoice:)?familyname>/i);
                                      const givMatch = pb.match(/<(?:invoice:)?givenname>([\s\S]*?)<\/(?:invoice:)?givenname>/i);
                                      if (famMatch || givMatch) {
                                        parsed.patientName = [givMatch?.[1]?.trim(), famMatch?.[1]?.trim()].filter(Boolean).join(" ");
                                      }
                                    }

                                    // Extract treatment dates
                                    const treatMatch = xml.match(/<(?:invoice:)?treatment[^>]*date_begin="([^"]*)"[^>]*date_end="([^"]*)"[^>]*/i);
                                    if (treatMatch) {
                                      parsed.treatmentDates = treatMatch[1] === treatMatch[2] ? treatMatch[1] : `${treatMatch[1]} – ${treatMatch[2]}`;
                                    }

                                    // Check allowModification
                                    const modMatch = xml.match(/allowModification="([^"]*)"/i);
                                    if (modMatch) parsed.allowModification = modMatch[1] === "true";
                                  }

                                  return (
                                    <div key={resp.id} className={idx > 0 ? `mt-3 pt-3 border-t ${dividerColor}` : ""}>
                                      <div className="flex flex-wrap items-center gap-2 mb-2">
                                        {resp.response_type && (
                                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                            isRejected ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                                          }`}>
                                            {resp.response_type}
                                          </span>
                                        )}
                                        {resp.status_out && (
                                          <span className={`text-xs font-semibold ${textColor}`}>
                                            {resp.status_in ? `${resp.status_in} → ${resp.status_out}` : resp.status_out}
                                          </span>
                                        )}
                                        {parsed.insurerName && (
                                          <span className="text-[10px] font-medium text-slate-600">
                                            from {parsed.insurerName}
                                          </span>
                                        )}
                                        {parsed.allowModification === false && (
                                          <span className="inline-flex items-center rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                            No modification allowed
                                          </span>
                                        )}
                                      </div>

                                      {/* Parsed rejection errors — the actual reasons */}
                                      {parsed.errors.length > 0 && (
                                        <div className="mb-3 space-y-1.5">
                                          {parsed.errors.map((err, ei) => (
                                            <div key={ei} className={`flex items-start gap-2 rounded-md ${isRejected ? "bg-red-100/60" : "bg-blue-100/60"} p-2`}>
                                              <span className={`mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                                isRejected ? "bg-red-200 text-red-900" : "bg-blue-200 text-blue-900"
                                              }`}>
                                                Code {err.code}
                                              </span>
                                              <p className={`text-xs ${subTextColor} leading-relaxed flex-1`}>{err.text}</p>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Parsed XML explanations (if different from resp.explanation) */}
                                      {parsed.explanations.length > 0 && parsed.errors.length === 0 && (
                                        <div className="mb-2">
                                          {parsed.explanations.map((expl, ei) => (
                                            <p key={ei} className={`text-xs ${subTextColor} leading-relaxed`}>{expl}</p>
                                          ))}
                                        </div>
                                      )}

                                      {/* Fallback: show resp.explanation if nothing was parsed */}
                                      {!hasParsedContent && resp.explanation && (
                                        <p className={`text-xs ${subTextColor} leading-relaxed mb-2`}>
                                          {resp.explanation}
                                        </p>
                                      )}

                                      {/* Patient & treatment info */}
                                      {(parsed.patientName || parsed.treatmentDates) && (
                                        <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-slate-600">
                                          {parsed.patientName && (
                                            <span>Patient: <strong>{parsed.patientName}</strong></span>
                                          )}
                                          {parsed.treatmentDates && (
                                            <span>Treatment: <strong>{parsed.treatmentDates}</strong></span>
                                          )}
                                        </div>
                                      )}

                                      {/* Insurer contact info */}
                                      {(parsed.contactName || parsed.contactPhone || parsed.contactEmail) && (
                                        <div className={`rounded-md ${isRejected ? "bg-red-100/40" : "bg-blue-100/40"} p-2 mb-2`}>
                                          <span className={`text-[10px] font-bold uppercase tracking-wide ${textColor}`}>Insurer Contact</span>
                                          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-700">
                                            {parsed.contactName && parsed.contactName !== "." && (
                                              <span>{parsed.contactName}</span>
                                            )}
                                            {parsed.contactPhone && (
                                              <a href={`tel:${parsed.contactPhone}`} className="text-sky-600 hover:underline">{parsed.contactPhone}</a>
                                            )}
                                            {parsed.contactEmail && (
                                              <a href={`mailto:${parsed.contactEmail}`} className="text-sky-600 hover:underline">{parsed.contactEmail}</a>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      <p className={`text-[10px] ${dateColor} mt-1`}>
                                        {new Date(resp.created_at).toLocaleString("fr-CH")}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Details grid */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-xs text-slate-400">Transmission Reference</span>
                          <p className="font-mono text-xs text-slate-700">
                            {sub.medidata_message_id || "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400">Transmission Date</span>
                          <p className="text-xs text-slate-700">
                            {sub.medidata_transmission_date
                              ? new Date(sub.medidata_transmission_date).toLocaleString("fr-CH")
                              : "—"}
                          </p>
                        </div>
                        {sub.billing_type === "TP" && sub.patient_copy_ref && (
                          <div className="col-span-2">
                            <span className="text-xs text-slate-400">Patient Copy Reference (LAMal Art. 42)</span>
                            <p className="font-mono text-xs text-emerald-700 flex items-center gap-1.5">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {sub.patient_copy_ref}
                            </p>
                          </div>
                        )}
                        <div>
                          <span className="text-xs text-slate-400">Response Code</span>
                          <p className="font-mono text-xs text-slate-700">
                            {sub.medidata_response_code || "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400">Response Message</span>
                          <p className="text-xs text-slate-700">
                            {sub.medidata_response_message || "—"}
                          </p>
                        </div>
                      </div>

                      {/* Check status button */}
                      <div className="flex flex-wrap items-center gap-2">
                        {sub.medidata_message_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCheckStatus(sub);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Check MediData Status
                          </button>
                        )}

                        {sub.invoice?.pdf_path && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openStorageFile(sub.invoice?.pdf_path);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Open Invoice PDF
                          </button>
                        )}
                      </div>

                      {/* Status timeline */}
                      {sub.history && sub.history.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-xs font-medium text-slate-500">Status History</h4>
                          <InvoiceStatusTimeline
                            history={sub.history.map((h) => ({
                              ...h,
                              response_message: h.notes || h.response_message || null,
                            }))}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Responses (DB-backed) ── */}
      {tab === "responses" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Insurer Responses</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePollMediData}
                disabled={pollStatus === "Polling..."}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                Poll MediData
              </button>
              <button
                onClick={fetchResponses}
                disabled={respLoading}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
              >
                {respLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          {responses.length === 0 && !respLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <p className="text-sm text-slate-400">No responses stored yet</p>
              <p className="mt-1 text-xs text-slate-300">
                Send test invoices, wait ~30s, then click &quot;Poll MediData&quot; to fetch responses
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {responses.map((resp) => (
                <div
                  key={resp.id}
                  className={`rounded-xl border bg-white shadow-sm ${
                    resp.response_type === "accepted"
                      ? "border-emerald-200"
                      : resp.response_type === "rejected"
                        ? "border-red-200"
                        : resp.response_type === "pending"
                          ? "border-amber-200"
                          : "border-slate-200"
                  }`}
                >
                  <div
                    className="flex cursor-pointer items-center justify-between p-4 hover:bg-slate-50/50"
                    onClick={() => setExpandedResp(expandedResp === resp.id ? null : resp.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          resp.response_type === "accepted"
                            ? "bg-emerald-100 text-emerald-700"
                            : resp.response_type === "rejected"
                              ? "bg-red-100 text-red-700"
                              : resp.response_type === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {resp.response_type || "unknown"}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {resp.status_out ? `Status: ${resp.status_out}` : "Insurer Response"}
                        </p>
                        {resp.explanation && (
                          <p className="text-xs text-slate-500">{resp.explanation.slice(0, 100)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {resp.confirmed_at && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                          Confirmed
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {new Date(resp.created_at).toLocaleString("fr-CH")}
                      </span>
                      <svg
                        className={`h-4 w-4 text-slate-400 transition-transform ${expandedResp === resp.id ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {expandedResp === resp.id && (
                    <div className="border-t border-slate-100 p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-xs text-slate-400">Transmission Reference</span>
                          <p className="font-mono text-xs text-slate-700">{resp.medidata_message_id || "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400">Correlation Reference</span>
                          <p className="font-mono text-xs text-slate-700">{resp.correlation_reference || "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400">Sender GLN</span>
                          <p className="font-mono text-xs text-slate-700">{resp.sender_gln || "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400">Received</span>
                          <p className="text-xs text-slate-700">
                            {resp.received_at ? new Date(resp.received_at).toLocaleString("fr-CH") : "—"}
                          </p>
                        </div>
                      </div>
                      {resp.content && (
                        <pre className="max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] leading-relaxed text-emerald-300 font-mono">
                          {resp.content.slice(0, 8000)}
                        </pre>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {resp.content && (
                          <button
                            onClick={() => handleRenderResponsePdf(resp.id)}
                            disabled={renderingPdf === resp.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            {renderingPdf === resp.id ? "Generating PDF..." : "Render as PDF"}
                          </button>
                        )}
                        {resp.document_path && (
                          <button
                            onClick={() => openStorageFile(resp.document_path)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Open Response XML
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Participants ── */}
      {tab === "participants" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">MediData Participants</h2>
            <button
              onClick={fetchParticipants}
              disabled={partLoading}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
            >
              {partLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
              placeholder="Search by name..."
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <select
              value={partLawFilter ?? ""}
              onChange={(e) => setPartLawFilter(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="">All Law Types</option>
              <option value="1">KVG</option>
              <option value="2">UVG</option>
              <option value="3">IVG</option>
              <option value="4">MVG</option>
              <option value="5">VVG</option>
            </select>
            <button
              onClick={fetchParticipants}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Search
            </button>
          </div>

          {/* Results count */}
          <p className="text-xs text-slate-400">{participants.length} participants found</p>

          {/* Table */}
          {partLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <p className="text-sm text-slate-400">Loading participants...</p>
            </div>
          ) : participants.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <p className="text-sm text-slate-400">No participants found</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">GLN</th>
                    <th className="px-4 py-3 text-left font-medium">Receiver GLN</th>
                    <th className="px-4 py-3 text-left font-medium">Law Types</th>
                    <th className="px-4 py-3 text-left font-medium">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {participants.map((p, i) => (
                    <tr key={`${p.glnParticipant}-${i}`} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.glnParticipant}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {p.glnReceiver !== p.glnParticipant ? p.glnReceiver : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.lawTypes.map((lt) => (
                            <span
                              key={lt}
                              className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                            >
                              {LAW_TYPE_MAP[lt] || lt}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {[p.zipCode, p.town].filter(Boolean).join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Notifications (DB-backed) ── */}
      {tab === "notifications" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">MediData Notifications</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePollMediData}
                disabled={pollStatus === "Polling..."}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                Poll MediData
              </button>
              <button
                onClick={fetchNotifications}
                disabled={notifLoading}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
              >
                {notifLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            MediData sends notifications for transmission errors and delivery issues. Successful transmissions appear in the Submissions and Responses tabs.
          </p>

          {notifications.length === 0 && !notifLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-3 text-sm font-medium text-slate-500">No notifications</p>
              <p className="mt-1 text-xs text-slate-400">
                All clear — click &quot;Poll MediData&quot; to check for new notifications
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((n) => {
                // Parse the structured message into sections
                const parsed = parseNotificationMessage(n.message);
                const severityConfig = {
                  ERROR: { border: "border-red-300", bg: "bg-red-50", badge: "bg-red-100 text-red-800", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z", iconColor: "text-red-500" },
                  WARNING: { border: "border-amber-300", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-800", icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z", iconColor: "text-amber-500" },
                  INFO: { border: "border-blue-200", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-700", icon: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z", iconColor: "text-blue-500" },
                };
                const sev = severityConfig[n.severity as keyof typeof severityConfig] || severityConfig.INFO;

                return (
                  <div key={n.id} className={`rounded-xl border ${sev.border} ${sev.bg} shadow-sm overflow-hidden`}>
                    {/* Header */}
                    <div className="flex items-start gap-3 p-4 pb-3">
                      <svg className={`mt-0.5 h-5 w-5 flex-shrink-0 ${sev.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={sev.icon} />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sev.badge}`}>
                            {n.severity || "INFO"}
                          </span>
                          {parsed.errorCode && (
                            <code className="rounded bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                              {parsed.errorCode}
                            </code>
                          )}
                          {n.confirmed_at && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                              Confirmed
                            </span>
                          )}
                          <span className="ml-auto text-[11px] text-slate-500">
                            {n.medidata_created_at
                              ? new Date(n.medidata_created_at).toLocaleString("fr-CH")
                              : new Date(n.created_at).toLocaleString("fr-CH")}
                          </span>
                        </div>

                        {/* Main description */}
                        {parsed.description && (
                          <p className="mt-2 text-sm font-medium text-slate-800">
                            {parsed.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Structured details */}
                    {(parsed.references.length > 0 || parsed.communication) && (
                      <div className="border-t border-white/50 bg-white/40 px-4 py-3 space-y-3">
                        {/* References grid */}
                        {parsed.references.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">References</p>
                            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                              {parsed.references.map((refItem: { label: string; value: string }, idx: number) => (
                                <div key={idx} className="flex items-baseline gap-2 rounded-lg bg-white/60 px-3 py-1.5">
                                  <span className="text-[11px] text-slate-500 whitespace-nowrap">{refItem.label}:</span>
                                  <span className="font-mono text-[11px] font-medium text-slate-800 break-all">{refItem.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Cause / Action */}
                        {(parsed.cause || parsed.action) && (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {parsed.cause && (
                              <div className="rounded-lg bg-white/60 px-3 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cause</p>
                                <p className="mt-0.5 text-xs text-slate-700">{parsed.cause}</p>
                              </div>
                            )}
                            {parsed.action && (
                              <div className="rounded-lg bg-white/60 px-3 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Action</p>
                                <p className="mt-0.5 text-xs text-slate-700">{parsed.action}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Communication / Technical details */}
                        {parsed.communication && (
                          <div className="rounded-lg bg-white/60 px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Technical Details</p>
                            <p className="mt-0.5 font-mono text-[11px] text-slate-700 break-all">{parsed.communication}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center gap-4 border-t border-white/50 bg-white/20 px-4 py-2 text-[10px] text-slate-500">
                      {n.medidata_notification_id && (
                        <span>MediData ID: <span className="font-mono">{n.medidata_notification_id}</span></span>
                      )}
                      {n.transmission_reference && (
                        <span>Transmission: <span className="font-mono">{n.transmission_reference}</span></span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
