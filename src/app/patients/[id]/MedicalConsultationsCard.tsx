"use client";

import { FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabaseClient } from "@/lib/supabaseClient";
import { liveblocksClient } from "@/lib/liveblocksClient";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Link from "@tiptap/extension-link";
import * as Y from "yjs";
import {
  TARDOC_MEDICINES,
  TARDOC_TARIFF_ITEMS,
  DEFAULT_CANTON,
  CANTON_TAX_POINT_VALUES,
  calculateTardocPrice,
  formatChf,
  ACF_TARIFF_CODE,
  ACF_TARIFF_TYPE_DISPLAY,
  type TardocMedicine,
  type SwissCanton,
} from "@/lib/tardoc";
import InsuranceBillingModal from "@/components/InsuranceBillingModal";
import InvoiceStatusBadge from "@/components/InvoiceStatusBadge";
import { useInsuranceSubmissionNotifications } from "@/components/InsuranceSubmissionNotificationsContext";
import TardocAccordionTree from "@/components/TardocAccordionTree";
import AcfAccordionTree from "@/components/AcfAccordionTree";
import { type MediDataInvoiceStatus } from "@/lib/medidata";
import { usePatientRealtime } from "./PatientRealtimeContext";
import { usePDFJobNotifications } from "@/components/PDFJobNotificationsContext";

type TaskPriority = "low" | "medium" | "high";

type TaskType = "todo" | "call" | "email" | "other";

type ConsultationRecordType =
  | "notes"
  | "prescription"
  | "invoice"
  | "file"
  | "photo"
  | "3d"
  | "patient_information"
  | "documents"
  | "form_photos"
  | "medication";

type SortOrder = "desc" | "asc";

type InvoiceStatus =
  | "OPEN"
  | "PAID"
  | "CANCELLED"
  | "OVERPAID"
  | "PARTIAL_LOSS"
  | "PARTIAL_PAID";

const INVOICE_STATUS_DISPLAY: Record<InvoiceStatus, { label: string; color: string; bgColor: string; borderColor: string }> = {
  OPEN: { label: "Open", color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  PAID: { label: "Paid", color: "text-emerald-700", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" },
  CANCELLED: { label: "Cancelled", color: "text-slate-500", bgColor: "bg-slate-50", borderColor: "border-slate-200" },
  OVERPAID: { label: "Overpaid", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  PARTIAL_LOSS: { label: "Partial Loss", color: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200" },
  PARTIAL_PAID: { label: "Partial Paid", color: "text-cyan-700", bgColor: "bg-cyan-50", borderColor: "border-cyan-200" },
};

type ConsultationRow = {
  id: string;
  patient_id: string;
  consultation_id: string;
  title: string;
  content: string | null;
  record_type: ConsultationRecordType;
  doctor_user_id: string | null;
  doctor_name: string | null;
  scheduled_at: string;
  payment_method: string | null;
  duration_seconds: number | null;
  invoice_id: string | null;
  invoice_total_amount: number | null;
  invoice_is_complimentary: boolean;
  invoice_is_paid: boolean | null;
  invoice_status: InvoiceStatus | null;
  invoice_paid_amount: number | null;
  cash_receipt_path: string | null;
  invoice_pdf_path: string | null;
  invoice_pdf_path_tg: string | null;
  invoice_pdf_path_tp: string | null;
  invoice_pdf_path_reminder: string | null;
  invoice_pdf_path_receipt: string | null;
  invoice_consultation_id?: string | null;
  invoice_due_date: string | null;
  invoice_reminder_level: number;
  invoice_reminder_1_sent_at: string | null;
  invoice_reminder_2_sent_at: string | null;
  invoice_reminder_3_sent_at: string | null;
  payment_link_token: string | null;
  payrexx_payment_link: string | null;
  payrexx_payment_status: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  is_archived: boolean;
  archived_at: string | null;
  reference_number: string | null;
  // Consultation-specific diagnosis fields (set by doctor)
  diagnosis_code: string | null;
  ref_icd10: string | null;
  // Linked invoice info (for non-invoice consultation records)
  linked_invoice_id: string | null;
  linked_invoice_status: InvoiceStatus | null;
  linked_invoice_number: string | null;
  // Insurance/MediData status (for invoice records OR consultations with linked invoices)
  medidata_status: string | null;
  collab_room_id?: string | null;
  is_draft?: boolean | null;
};

function compareConsultationRows(a: ConsultationRow, b: ConsultationRow, direction: SortOrder = "desc") {
  const aTime = new Date(a.scheduled_at).getTime();
  const bTime = new Date(b.scheduled_at).getTime();

  if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
    return direction === "desc" ? bTime - aTime : aTime - bTime;
  }

  const aNumber = Number.parseInt(String(a.consultation_id ?? "").replace(/\D/g, ""), 10);
  const bNumber = Number.parseInt(String(b.consultation_id ?? "").replace(/\D/g, ""), 10);
  if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber) && aNumber !== bNumber) {
    return direction === "desc" ? bNumber - aNumber : aNumber - bNumber;
  }

  return direction === "desc" ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
}

type EditorHistoryCommand = "undo" | "redo";

function canRunEditorHistoryCommand(editor: Editor | null | undefined, command: EditorHistoryCommand) {
  if (!editor || typeof editor.commands?.[command] !== "function") return false;
  const commandChecker = editor.can()[command];
  return typeof commandChecker === "function" ? commandChecker() : false;
}

function runEditorHistoryCommand(editor: Editor | null | undefined, command: EditorHistoryCommand) {
  if (!editor || typeof editor.commands?.[command] !== "function") return;
  const chainCommand = editor.chain().focus()[command];
  if (typeof chainCommand === "function") {
    chainCommand().run();
  }
}

type PendingCreateConsultationNote = {
  id: string;
  sourceDraftId?: string | null;
  date: string;
  hour: string;
  minute: string;
  doctorId: string;
  title: string;
  diagnosisCode: string;
  refIcd10: string;
  contentHtml: string;
};

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  provider_id: string | null;
};

type Provider = {
  id: string;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  gln: string | null;
  zsr: string | null;
  canton: string | null;
  iban: string | null;
  role?: string | null;
  billing_type?: "medical" | "aesthetic" | null;
  invoice_method?: "tardoc_insurer" | "direct_patient" | null;
  vat_enabled?: boolean | null;
  vat_rate?: number | null;
  doctor_id?: string | null;
};

type PrescriptionLine = {
  medicineId: string;
  dosageId: string;
};

type InvoiceServiceLine = {
  serviceId: string;
  quantity: number;
  unitPrice: number | null;
  groupId: string | null;
  discountPercent: number | null;
  customName: string | null;
  // ACF pricing variables
  acfSideType?: number; // 0=none, 1=left, 2=right, 3=bilateral
  acfExternalFactor?: number; // multiplier (default 1.0)
  acfRefCode?: string; // ICD-10 reference code
  acfBaseTP?: number; // original catalog TP before any modifications
  // TARDOC pricing variables (stored when code is added)
  tardocTpMT?: number; // medical tax points
  tardocTpTT?: number; // technical tax points
  tardocRecordId?: number | null;
  tardocSection?: string | null;
  tardocSideType?: number; // 0=none, 1=left, 2=right, 3=both
  tardocExternalFactor?: number; // multiplier (default 1.0)
  tardocRefCode?: string | null; // ICD-10 reference code
};

type InvoiceService = {
  id: string;
  name: string;
  code: string | null;
  base_price: number | null;
  category_id: string | null;
  vat_status: "voll" | "befreit" | null;
  vat_rate_pct: number | null;
};

type InvoiceServiceGroup = {
  id: string;
  name: string;
  discount_percent: number | null;
};

type InvoiceServiceCategory = {
  id: string;
  name: string;
  color: string | null;
};

type InvoiceGroupServiceLink = {
  group_id: string;
  service_id: string;
  discount_percent: number | null;
};

type InvoicePaymentTerm = "full" | "installment";

type InvoiceExtraOption = "complimentary" | null;

function generateSwissReference(invoiceId: string): string {
  let numericPart = invoiceId.replace(/\D/g, "");
  if (numericPart.length === 0) {
    let hash = "";
    for (let i = 0; i < invoiceId.length; i++) {
      hash += invoiceId.charCodeAt(i).toString().padStart(3, "0");
    }
    numericPart = hash;
  }
  const padded = numericPart.length > 26 ? numericPart.slice(-26) : numericPart.padStart(26, "0");
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const ch of padded) carry = table[(carry + parseInt(ch, 10)) % 10];
  return padded + ((10 - carry) % 10).toString();
}

type InvoiceInstallment = {
  id: string;
  percent: number;
  dueDate: string;
};

type DbInstallment = {
  id: string;
  invoice_id: string;
  installment_number: number;
  amount: number;
  due_date: string | null;
  payment_method: string | null;
  status: "PENDING" | "PAID" | "CANCELLED";
  paid_amount: number;
  paid_at: string | null;
  invoice_number: string | null;
  reference_number: string | null;
  notes: string | null;
  payrexx_gateway_id: number | null;
  payrexx_gateway_hash: string | null;
  payrexx_payment_link: string | null;
  payrexx_payment_status: string | null;
  payrexx_transaction_id: string | null;
  payrexx_paid_at: string | null;
  created_at: string;
};

// TARDOC-compliant medicines for Swiss healthcare billing
// Transformed from TARDOC_MEDICINES for UI compatibility
const CLINIC_MEDICINES = TARDOC_MEDICINES.filter(med => med.isActive).map(med => ({
  id: med.id,
  name: med.name,
  nameFr: med.nameFr,
  atcCode: med.atcCode,
  swissmedicNumber: med.swissmedicNumber,
  pharmacode: med.pharmacode,
  requiresPrescription: med.requiresPrescription,
  dosages: [
    {
      id: `${med.id}_standard`,
      label: `${med.unitSize} - Standard dose`,
      price: med.pricePublic
    },
    {
      id: `${med.id}_double`,
      label: `${med.unitSize} x2 - Double quantity`,
      price: med.pricePublic * 2
    },
  ],
}));

// Legacy alias for backward compatibility
const TEST_MEDICINES = CLINIC_MEDICINES;

function formatLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds =
    Number.isFinite(totalSeconds) && totalSeconds > 0
      ? Math.floor(totalSeconds)
      : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

type AxenitaPdfDocument = {
  folderName: string;
  fileName: string;
  fileType: "ap" | "af" | "notes" | "consultation";
  content: string;
  firstName: string | null;
  lastName: string | null;
};

type MedProduct = {
  id: string;
  productName: string;
  searchQuery: string;
  searchResults: { label: string; productNumber: number }[];
  searchLoading: boolean;
  dropdownOpen: boolean;
  productType: "MEDICATION" | "CONSUMABLE";
  intakeKind: "ACUTE" | "FIXED";
  amountMorning: string;
  amountNoon: string;
  amountEvening: string;
  amountNight: string;
  quantity: number | "";
  intakeNote: string;
  intakeFromDate: string;
};

type CollaborativeTextOperation = {
  id: string;
  start: number;
  deleteCount: number;
  insertText: string;
};

type ConsultationEditSyncPayload = {
  senderClientId?: string;
  consultationId: string;
  title: string;
  contentHtml: string;
  textOp?: CollaborativeTextOperation | null;
  doctorId: string;
  date: string;
  hour: string;
  minute: string;
  diagnosisCode: string;
  refIcd10: string;
};

type ConsultationNoteEvent = {
  id: string;
  patient_id: string;
  consultation_id: string | null;
  collab_room_id: string | null;
  event_type: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  client_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function stripContentEditableCaretMarkers(html: string): string {
  return html.replace(/<span[^>]*data-caret-marker="[^"]+"[^>]*>\uFEFF<\/span>/g, "");
}

function getContentEditableHtmlWithCaretMarker(element: HTMLElement): { html: string; markerId: string | null } {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { html: element.innerHTML, markerId: null };
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) {
    return { html: element.innerHTML, markerId: null };
  }

  const markerId = `caret-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const marker = document.createElement("span");
  marker.setAttribute("data-caret-marker", markerId);
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.overflow = "hidden";
  marker.textContent = "\uFEFF";

  const originalRange = range.cloneRange();
  const markerRange = range.cloneRange();
  markerRange.collapse(true);
  markerRange.insertNode(marker);
  const html = element.innerHTML;

  marker.remove();
  selection.removeAllRanges();
  selection.addRange(originalRange);

  return { html, markerId };
}

function restoreContentEditableCaretMarker(element: HTMLElement, markerId: string | null) {
  if (!markerId) return;

  const marker = element.querySelector(`[data-caret-marker="${markerId}"]`);
  if (!marker) return;

  const range = document.createRange();
  const selection = window.getSelection();
  range.setStartBefore(marker);
  range.collapse(true);
  marker.remove();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function getContentEditableCaretOffset(element: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return null;

  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return preCaretRange.toString().length;
}

function restoreContentEditableCaretOffset(element: HTMLElement, offset: number | null) {
  if (offset === null) return;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();

  while (node) {
    const textLength = node.textContent?.length ?? 0;
    if (remaining <= textLength) {
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(node, remaining);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= textLength;
    node = walker.nextNode();
  }

  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function htmlToCaretText(html: string): string {
  if (typeof document === "undefined") {
    return stripContentEditableCaretMarkers(html).replace(/<[^>]+>/g, "");
  }

  const element = document.createElement("div");
  element.innerHTML = stripContentEditableCaretMarkers(html);
  return element.innerText || element.textContent || "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToNotesHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

const CONSULTATION_NOTES_STARTING_LINES = 2;

function buildBlankConsultationNotesDoc() {
  return {
    type: "doc",
    content: Array.from({ length: CONSULTATION_NOTES_STARTING_LINES }, () => ({
      type: "paragraph",
    })),
  };
}

function buildBlankConsultationNotesHtml() {
  return Array.from({ length: CONSULTATION_NOTES_STARTING_LINES }, () => "<p></p>").join("");
}

function isBlankNotesHtml(value: string | null | undefined): boolean {
  if (!value) return true;
  return value
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/p>\s*<p>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim() === "";
}

function isConsultationYjsFragmentEmpty(ydoc: Y.Doc | null, field = "notes_tiptap"): boolean {
  if (!ydoc) return true;
  const fragment = ydoc.getXmlFragment(field);
  const textContent = fragment.toString().replace(/<[^>]*>/g, "").trim();
  return fragment.length === 0 || textContent.length === 0;
}

function clearConsultationYjsFragment(ydoc: Y.Doc | null, field = "notes_tiptap") {
  if (!ydoc) return;
  const fragment = ydoc.getXmlFragment(field);
  if (fragment.length === 0) return;
  ydoc.transact(() => {
    fragment.delete(0, fragment.length);
  });
}

function getEditorPlainText(element: HTMLElement): string {
  return (element.innerText || element.textContent || "").replace(/\uFEFF/g, "");
}

function setEditorPlainText(element: HTMLElement, value: string) {
  element.textContent = value;
}

function buildTextOperation(before: string, after: string): CollaborativeTextOperation | null {
  if (before === after) return null;

  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > start &&
    afterEnd > start &&
    before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    start,
    deleteCount: beforeEnd - start,
    insertText: after.slice(start, afterEnd),
  };
}

function applyTextOperation(value: string, operation: CollaborativeTextOperation): string {
  return (
    value.slice(0, operation.start) +
    operation.insertText +
    value.slice(operation.start + operation.deleteCount)
  );
}

function transformCaretOffsetForTextOperation(
  caretOffset: number | null,
  operation: CollaborativeTextOperation,
): number | null {
  if (caretOffset === null) return null;
  if (operation.start >= caretOffset) return caretOffset;

  const operationEnd = operation.start + operation.deleteCount;
  if (caretOffset <= operationEnd) {
    return operation.start + operation.insertText.length;
  }

  return Math.max(
    0,
    caretOffset + operation.insertText.length - operation.deleteCount,
  );
}

function transformCaretOffsetForRemoteHtml(
  baseHtml: string,
  remoteHtml: string,
  caretOffset: number | null,
): number | null {
  if (caretOffset === null) return null;

  const baseText = htmlToCaretText(baseHtml);
  const remoteText = htmlToCaretText(remoteHtml);
  if (baseText === remoteText) return caretOffset;

  let start = 0;
  while (
    start < baseText.length &&
    start < remoteText.length &&
    baseText[start] === remoteText[start]
  ) {
    start += 1;
  }

  let baseEnd = baseText.length;
  let remoteEnd = remoteText.length;
  while (
    baseEnd > start &&
    remoteEnd > start &&
    baseText[baseEnd - 1] === remoteText[remoteEnd - 1]
  ) {
    baseEnd -= 1;
    remoteEnd -= 1;
  }

  if (start > caretOffset) return caretOffset;

  const removedLength = baseEnd - start;
  const insertedLength = remoteEnd - start;
  if (caretOffset <= baseEnd) {
    return start + insertedLength;
  }

  return Math.max(0, caretOffset + insertedLength - removedLength);
}

function mergeConcurrentHtml(base: string, local: string, remote: string): string {
  if (local === remote || local === base) return remote;
  if (remote === base) return local;
  if (local.includes(remote)) return local;
  if (remote.includes(local)) return remote;
  if (local.startsWith(base) && remote.startsWith(base)) {
    return `${base}${local.slice(base.length)}${remote.slice(base.length)}`;
  }
  return remote;
}

function createEmptyMedProduct(): MedProduct {
  return {
    id: crypto.randomUUID(),
    productName: "",
    searchQuery: "",
    searchResults: [],
    searchLoading: false,
    dropdownOpen: false,
    productType: "MEDICATION",
    intakeKind: "FIXED",
    amountMorning: "",
    amountNoon: "",
    amountEvening: "",
    amountNight: "",
    quantity: 1,
    intakeNote: "",
    intakeFromDate: formatLocalDateInputValue(new Date()),
  };
}

function ServiceSearchPicker({
  services,
  categories,
  selectedCategoryId,
  onCategoryChange,
  selectedServiceId,
  onServiceChange,
}: {
  services: { id: string; name: string; code: string | null; base_price: number | null; category_id: string | null }[];
  categories: { id: string; name: string; color: string | null }[];
  selectedCategoryId: string;
  onCategoryChange: (id: string) => void;
  selectedServiceId: string;
  onServiceChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [catQuery, setCatQuery] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Extract a CSS color from Tailwind class string like "bg-yellow-300/70"
  const tailwindToHex: Record<string, string> = {
    yellow: "#fde047", lime: "#bef264", green: "#86efac", cyan: "#67e8f9",
    pink: "#f9a8d4", violet: "#c4b5fd", orange: "#fdba74", amber: "#fcd34d",
    emerald: "#6ee7b7", slate: "#cbd5e1", rose: "#fca5a5", sky: "#7dd3fc",
    blue: "#93c5fd", red: "#fca5a5", purple: "#d8b4fe",
  };
  const getCatColor = (color: string | null) => {
    if (!color) return "#e2e8f0";
    const match = color.match(/bg-(\w+)-/);
    return match ? (tailwindToHex[match[1]] ?? "#e2e8f0") : "#e2e8f0";
  };

  const filteredCats = catQuery.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(catQuery.toLowerCase()))
    : categories;

  const filtered = services.filter((s) => {
    const matchCat = !selectedCategoryId || s.category_id === selectedCategoryId;
    const q = query.trim().toLowerCase();
    const matchQ = !q || s.name.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const selected = services.find((s) => s.id === selectedServiceId);
  const selectedCat = categories.find((c) => c.id === (selected?.category_id ?? selectedCategoryId));
  const activeCat = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="space-y-1.5">
      {/* Category searchable dropdown */}
      <div ref={catRef} className="relative">
        <button
          type="button"
          onClick={() => setCatOpen(o => !o)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white hover:border-sky-300 outline-none text-left"
        >
          {activeCat ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getCatColor(activeCat.color) }} />
              <span className="flex-1 truncate font-medium text-slate-800">{activeCat.name}</span>
            </>
          ) : (
            <span className="flex-1 text-slate-400">Toutes les catÃ©gories</span>
          )}
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {catOpen && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <input autoFocus type="text" value={catQuery} onChange={e => setCatQuery(e.target.value)}
                placeholder="Rechercher catÃ©gorie..." className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-sky-400" />
            </div>
            <div className="max-h-48 overflow-y-auto">
              <button type="button" onClick={() => { onCategoryChange(""); onServiceChange(""); setCatOpen(false); setCatQuery(""); }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-slate-50 ${!selectedCategoryId ? "bg-sky-50 font-medium text-sky-700" : "text-slate-600"}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 shrink-0" />
                Toutes les catÃ©gories
              </button>
              {filteredCats.map(c => (
                <button key={c.id} type="button"
                  onClick={() => { onCategoryChange(c.id); onServiceChange(""); setCatOpen(false); setCatQuery(""); }}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-slate-50 ${selectedCategoryId === c.id ? "bg-sky-50 font-medium text-sky-700" : "text-slate-700"}`}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getCatColor(c.color) }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Searchable service picker */}
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white hover:border-sky-300 focus:ring-1 focus:ring-sky-400 outline-none text-left"
        >
          {selected ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                {selectedCat && (
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getCatColor(selectedCat.color) }} />
                )}
                {selected.code && (
                  <span className="shrink-0 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">{selected.code}</span>
                )}
                <span className="truncate font-medium text-slate-800">{selected.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {selectedCat && <span className="text-[10px] text-sky-600">{selectedCat.name}</span>}
                {selected.base_price != null && (
                  <span className="text-[10px] text-slate-500">CHF {selected.base_price}</span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-slate-400 flex-1">â€” sÃ©lectionner un service â€”</span>
          )}
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden" style={{ minWidth: 280 }}>
            <div className="p-2 border-b border-slate-100">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher par nom ou code..."
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {selectedServiceId && (
                <button
                  type="button"
                  onClick={() => { onServiceChange(""); setOpen(false); setQuery(""); }}
                  className="w-full px-3 py-1.5 text-left text-[10px] text-red-500 hover:bg-red-50 border-b border-slate-100"
                >
                  âœ• Effacer la sÃ©lection
                </button>
              )}
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-xs text-slate-400 text-center">Aucun service trouvÃ©</div>
              ) : (
                filtered.map((s) => {
                  const cat = categories.find((c) => c.id === s.category_id);
                  const isSelected = s.id === selectedServiceId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { onServiceChange(s.id); setOpen(false); setQuery(""); }}
                      className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-sky-50 transition-colors ${isSelected ? "bg-sky-50" : ""}`}
                    >
                      {isSelected ? (
                        <svg className="w-3 h-3 text-sky-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : <div className="w-3 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {s.code && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-mono">{s.code}</span>
                          )}
                          <span className="text-xs font-medium text-slate-800 truncate">{s.name}</span>
                        </div>
                        {cat && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getCatColor(cat.color) }} />
                            <span className="text-[10px] text-sky-600">{cat.name}</span>
                          </div>
                        )}
                      </div>
                      {s.base_price != null && (
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-semibold text-slate-700">CHF {s.base_price}</div>
                          {s.code === "10001" && (
                            <div className="text-[10px] text-red-500">-15% auto</div>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PendingCreateConsultationNoteEditor({
  note,
  patientId,
  medicalStaffOptions,
  onRemove,
  onFinalized,
  onError,
}: {
  note: PendingCreateConsultationNote;
  patientId: string;
  medicalStaffOptions: Provider[];
  onRemove: (id: string) => void;
  onFinalized: (row: ConsultationRow) => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(note.title || "Consultation Note");
  const [date, setDate] = useState(note.date);
  const [hour, setHour] = useState(note.hour);
  const [minute, setMinute] = useState(note.minute);
  const [doctorId, setDoctorId] = useState(note.doctorId);
  const [diagnosisCode, setDiagnosisCode] = useState(note.diagnosisCode);
  const [refIcd10, setRefIcd10] = useState(note.refIcd10);
  const [locking, setLocking] = useState(false);
  const pendingToolbarButtonClass = (active = false) =>
    `inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-2 text-[11px] font-medium transition-colors ${
      active
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
    }`;

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ link: false }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: { class: "text-sky-700 underline underline-offset-2" },
        }),
      ],
      content: note.contentHtml || buildBlankConsultationNotesDoc(),
      editable: !locking,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "min-h-[250px] cursor-text text-[13px] leading-6 text-slate-900 outline-none [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
        },
      },
    },
    [note.id],
  );

  async function lockNote() {
    if (locking || !editor) return;
    const html = editor.getHTML();
    if (isBlankNotesHtml(html)) {
      onError("Please enter note content before locking.");
      return;
    }

    try {
      setLocking(true);
      const dateToUse = date || formatLocalDateInputValue(new Date());
      const h = hour || "00";
      const m = minute || "00";
      const scheduledAt = new Date(`${dateToUse}T${h}:${m}:00`).toISOString();
      const doctor = doctorId ? medicalStaffOptions.find((staff) => staff.id === doctorId) : null;
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      const response = await fetch("/api/consultation-drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          patientId,
          roomId: `patient:${patientId}:consultation:${note.id}`,
          title: title.trim() || "Consultation Note",
          contentHtml: html,
          recordType: "notes",
          doctorId,
          doctorName: doctor?.name || null,
          scheduledAt,
          diagnosisCode,
          refIcd10,
          locked: true,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.draft) {
        onError(result?.error ?? "Failed to lock consultation note.");
        setLocking(false);
        return;
      }

      onFinalized({
        ...(result.draft as any),
        invoice_id: null,
        reference_number: null,
        linked_invoice_id: null,
        linked_invoice_status: null,
        linked_invoice_number: null,
        medidata_status: null,
        invoice_pdf_path_tg: null,
        invoice_pdf_path_tp: null,
        invoice_pdf_path_reminder: null,
        invoice_pdf_path_receipt: null,
        invoice_due_date: null,
        invoice_reminder_level: 0,
        invoice_reminder_1_sent_at: null,
        invoice_reminder_2_sent_at: null,
        invoice_reminder_3_sent_at: null,
      });
    } catch {
      onError("Failed to lock consultation note.");
      setLocking(false);
    }
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs shadow-sm">
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.4fr)] gap-2">
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700">Date</label>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700">Time</label>
          <div className="flex items-center gap-1">
            <input value={hour} maxLength={2} onChange={(event) => setHour(event.target.value.replace(/[^0-9]/g, ""))} className="w-10 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
            <span className="text-xs text-slate-500">:</span>
            <input value={minute} maxLength={2} onChange={(event) => setMinute(event.target.value.replace(/[^0-9]/g, ""))} className="w-10 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700">Doctor</label>
          <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
            <option value="">No doctor</option>
            {medicalStaffOptions.map((staff) => (
              <option key={staff.id} value={staff.id}>{staff.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)] gap-2">
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700">Title</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Consultation ID:" className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700">Record type</label>
          <select value="notes" disabled className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm disabled:bg-slate-50">
            <option value="notes">Notes</option>
          </select>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700">Diagnosis Code</label>
          <input value={diagnosisCode} onChange={(event) => setDiagnosisCode(event.target.value)} placeholder="e.g. L91.0" className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700">Ref ICD-10</label>
          <input value={refIcd10} onChange={(event) => setRefIcd10(event.target.value)} placeholder="e.g. Z42.1" className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </div>
      </div>

      <div className="mt-2 space-y-1">
        <label className="block text-[11px] font-medium text-slate-700">Notes</label>
        <div className="overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-slate-900">{title.trim() || "Consultation Note"}</div>
                <div className="text-[10px] text-slate-500">Created: {date || "Today"} {hour || "--"}:{minute || "--"}</div>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-[10px] font-medium text-slate-600">1 user editing</span>
              <div className="hidden h-7 w-px bg-slate-200 md:block" />
              <button type="button" onClick={lockNote} disabled={locking} className="inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
                {locking ? "Locking" : "Lock"}
              </button>
              <div className="leading-tight">
                <div className="text-[11px] font-semibold text-emerald-700">Open</div>
                <div className="text-[9px] text-slate-500">Editable for all</div>
              </div>
              <button type="button" onClick={() => onRemove(note.id)} disabled={locking} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60" aria-label="Close note">
                x
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
            <button type="button" onClick={() => runEditorHistoryCommand(editor, "undo")} disabled={!canRunEditorHistoryCommand(editor, "undo")} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40" title="Undo">↶</button>
            <button type="button" onClick={() => runEditorHistoryCommand(editor, "redo")} disabled={!canRunEditorHistoryCommand(editor, "redo")} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40" title="Redo">↷</button>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={pendingToolbarButtonClass(!!editor?.isActive("bold"))}>B</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={pendingToolbarButtonClass(!!editor?.isActive("italic"))}>I</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleStrike().run()} className={pendingToolbarButtonClass(!!editor?.isActive("strike"))}>S</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleCode().run()} className={pendingToolbarButtonClass(!!editor?.isActive("code"))}>{"</>"}</button>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={pendingToolbarButtonClass(!!editor?.isActive("bulletList"))}>•</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={pendingToolbarButtonClass(!!editor?.isActive("orderedList"))}>1.</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={pendingToolbarButtonClass(!!editor?.isActive("blockquote"))}>?</button>
            <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className={pendingToolbarButtonClass()}>—</button>
          </div>

          <div className="relative max-h-[420px] min-h-[250px] overflow-y-auto bg-white px-4 py-4">
            <EditorContent editor={editor} className="min-h-[250px] [&_.ProseMirror]:min-h-[250px] [&_.ProseMirror]:outline-none" />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[10px]">
            <div className="flex min-w-0 items-center gap-1 text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Live</span>
            </div>
            <div className="shrink-0 text-slate-500">Unsaved new note</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollaborativeUnlockedNoteEditor({
  row,
  patientId,
  currentUserEmail,
  currentUserName,
  medicalStaffOptions,
  onDraftUpdated,
  onFinalized,
  onCreateInvoice,
  onError,
}: {
  row: ConsultationRow;
  patientId: string;
  currentUserEmail: string | null;
  currentUserName: string | null;
  medicalStaffOptions: Provider[];
  onDraftUpdated: (row: ConsultationRow) => void;
  onFinalized: (row: ConsultationRow) => void;
  onCreateInvoice: (row: ConsultationRow) => void;
  onError: (message: string) => void;
}) {
  const roomId = useMemo(
    () => row.collab_room_id || `patient:${patientId}:consultation:${row.id}`,
    [patientId, row.collab_room_id, row.id],
  );
  const scheduled = row.scheduled_at ? new Date(row.scheduled_at) : new Date();
  const scheduledValid = !Number.isNaN(scheduled.getTime());
  const [title, setTitle] = useState(row.title === "Draft" ? "" : row.title || "");
  const [date, setDate] = useState(scheduledValid ? formatLocalDateInputValue(scheduled) : formatLocalDateInputValue(new Date()));
  const [hour, setHour] = useState(scheduledValid ? scheduled.getHours().toString().padStart(2, "0") : "00");
  const [minute, setMinute] = useState(scheduledValid ? scheduled.getMinutes().toString().padStart(2, "0") : "00");
  const [doctorId, setDoctorId] = useState(row.doctor_user_id || "");
  const [diagnosisCode, setDiagnosisCode] = useState(row.diagnosis_code || "");
  const [refIcd10, setRefIcd10] = useState(row.ref_icd10 || "");
  const [contentHtml, setContentHtml] = useState(row.content || "");
  const contentHtmlRef = useRef(row.content || "");
  const [savingState, setSavingState] = useState<"idle" | "pending" | "saving" | "saved">("idle");
  const [locking, setLocking] = useState(false);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<any | null>(null);
  const [providerSynced, setProviderSynced] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<{ id: string; name: string; email: string | null }[]>([]);
  const yfieldsRef = useRef<Y.Map<string> | null>(null);
  const applyingRemoteRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const initialContentReadyRef = useRef(false);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ link: false, undoRedo: false }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            class: "text-sky-700 underline underline-offset-2",
          },
        }),
        ...(ydoc
          ? [
              Collaboration.configure({
                document: ydoc,
                field: "notes_tiptap",
              }),
            ]
          : []),
        ...(provider
          ? [
              CollaborationCaret.configure({
                provider,
                user: {
                  name: currentUserName || currentUserEmail || "User",
                  color: "#0284c7",
                },
              }),
            ]
          : []),
      ],
      editable: !locking,
      editorProps: {
        attributes: {
          class:
            "min-h-[56px] cursor-text px-3 py-2 text-xs leading-5 text-slate-900 focus:outline-none [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:my-1 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
        },
      },
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        if (!initialContentReadyRef.current) return;
        const html = editor.getHTML();
        contentHtmlRef.current = isBlankNotesHtml(html) ? "" : html;
        triggerSave();
      },
    },
    [currentUserEmail, currentUserName, provider, ydoc],
  );

  useEffect(() => {
    const { room, leave } = liveblocksClient.enterRoom(roomId, {
      initialPresence: {
        name: currentUserName || currentUserEmail || "User",
        email: currentUserEmail,
      },
    });
    const nextProvider = getYjsProviderForRoom(room);
    const nextYdoc = nextProvider.getYDoc();
    const yfields = nextYdoc.getMap<string>("fields");

    setYdoc(nextYdoc);
    setProvider(nextProvider);
    setProviderSynced(Boolean(nextProvider.synced));
    yfieldsRef.current = yfields;

    const handleSync = (synced: boolean) => setProviderSynced(synced);
    nextProvider.on("sync", handleSync);

    room.updatePresence({
      name: currentUserName || currentUserEmail || "User",
      email: currentUserEmail,
    });

    if (!yfields.get("date")) yfields.set("date", date);
    if (!yfields.get("hour")) yfields.set("hour", hour);
    if (!yfields.get("minute")) yfields.set("minute", minute);
    if (!yfields.get("doctorId")) yfields.set("doctorId", doctorId);
    if (!yfields.get("title")) yfields.set("title", title);
    if (!yfields.get("diagnosisCode")) yfields.set("diagnosisCode", diagnosisCode);
    if (!yfields.get("refIcd10")) yfields.set("refIcd10", refIcd10);

    const applyFields = () => {
      applyingRemoteRef.current = true;
      setDate(yfields.get("date") ?? "");
      setHour(yfields.get("hour") ?? "");
      setMinute(yfields.get("minute") ?? "");
      setDoctorId(yfields.get("doctorId") ?? "");
      setTitle(yfields.get("title") ?? "");
      setDiagnosisCode(yfields.get("diagnosisCode") ?? "");
      setRefIcd10(yfields.get("refIcd10") ?? "");
      applyingRemoteRef.current = false;
    };

    applyFields();

    yfields.observe(applyFields);
    const unsubscribeOthers = room.subscribe("others", (others) => {
      setRemoteUsers(
        Array.from((others as any).values ? (others as any).values() : others as any[])
          .map((other: any) => ({
            id: String(other.connectionId ?? other.id ?? ""),
            name: other.presence?.name || other.info?.name || "User",
            email: other.presence?.email || other.info?.email || null,
          }))
          .filter((user) => user.id),
      );
    });

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      nextProvider.off("sync", handleSync);
      yfields.unobserve(applyFields);
      unsubscribeOthers();
      nextProvider.destroy();
      leave();
      yfieldsRef.current = null;
      setRemoteUsers([]);
    };
  }, [roomId]);

  useEffect(() => {
    if (!providerSynced || !ydoc || !editor) return;

    if (
      isConsultationYjsFragmentEmpty(ydoc) &&
      row.content &&
      !isBlankNotesHtml(row.content)
    ) {
      editor.commands.setContent(row.content, { emitUpdate: false });
      contentHtmlRef.current = row.content;
      setContentHtml(row.content);
    } else if (isConsultationYjsFragmentEmpty(ydoc) && isBlankNotesHtml(row.content)) {
      editor.commands.setContent(buildBlankConsultationNotesDoc(), { emitUpdate: false });
      editor.commands.focus("start");
      const blankHtml = buildBlankConsultationNotesHtml();
      contentHtmlRef.current = blankHtml;
      setContentHtml(blankHtml);
    } else {
      const html = editor.getHTML();
      const nextHtml = isBlankNotesHtml(html) ? row.content || "" : html;
      contentHtmlRef.current = nextHtml;
      setContentHtml(nextHtml);
    }

    initialContentReadyRef.current = true;
  }, [editor, providerSynced, row.content, ydoc]);

  useEffect(() => {
    if (applyingRemoteRef.current) return;
    const fields = yfieldsRef.current;
    if (!fields) return;
    fields.doc?.transact(() => {
      fields.set("date", date);
      fields.set("hour", hour);
      fields.set("minute", minute);
      fields.set("doctorId", doctorId);
      fields.set("title", title);
      fields.set("diagnosisCode", diagnosisCode);
      fields.set("refIcd10", refIcd10);
    });
    if (!initialContentReadyRef.current) return;
    triggerSave();
  }, [date, diagnosisCode, doctorId, hour, minute, refIcd10, title]);

  async function saveDraft(options: { locked?: boolean; force?: boolean } = {}) {
    if (!initialContentReadyRef.current) return null;
    if (saveInFlightRef.current && !options.force) return null;
    saveInFlightRef.current = true;
    setSavingState("saving");

    try {
      const dateToUse = date || formatLocalDateInputValue(new Date());
      const h = hour || "00";
      const m = minute || "00";
      const scheduledAt = new Date(`${dateToUse}T${h}:${m}:00`).toISOString();
      const doctor = doctorId ? medicalStaffOptions.find((staff) => staff.id === doctorId) : null;
      const doctorName = doctor?.name || row.doctor_name || null;
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const html = editor ? editor.getHTML() : contentHtmlRef.current || contentHtml;

      const response = await fetch("/api/consultation-drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          patientId,
          roomId,
          draftId: row.id,
          title: title.trim() || "Consultation Note",
          contentHtml: html,
          recordType: "notes",
          doctorId,
          doctorName,
          scheduledAt,
          diagnosisCode,
          refIcd10,
          locked: options.locked === true,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.draft) {
        onError(result?.error ?? "Failed to save consultation note.");
        setSavingState("idle");
        return null;
      }

      const savedRow: ConsultationRow = {
        ...(result.draft as any),
        invoice_id: null,
        reference_number: row.reference_number ?? null,
        linked_invoice_id: row.linked_invoice_id ?? null,
        linked_invoice_status: row.linked_invoice_status ?? null,
        linked_invoice_number: row.linked_invoice_number ?? null,
        medidata_status: row.medidata_status ?? null,
        invoice_pdf_path_tg: null,
        invoice_pdf_path_tp: null,
        invoice_pdf_path_reminder: null,
        invoice_pdf_path_receipt: null,
        invoice_due_date: null,
        invoice_reminder_level: 0,
        invoice_reminder_1_sent_at: null,
        invoice_reminder_2_sent_at: null,
        invoice_reminder_3_sent_at: null,
      };

      setSavingState("saved");
      setTimeout(() => setSavingState("idle"), 1600);
      if (savedRow.is_draft === false) {
        onFinalized(savedRow);
      } else {
        onDraftUpdated({
          ...savedRow,
          content: row.content,
        });
      }
      return savedRow;
    } catch {
      onError("Failed to save consultation note.");
      setSavingState("idle");
      return null;
    } finally {
      saveInFlightRef.current = false;
    }
  }

  function triggerSave() {
    if (locking) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSavingState("pending");
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveDraft();
    }, 1000);
  }

  async function lockNote() {
    if (locking) return;
    setLocking(true);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const saved = await saveDraft({ locked: true, force: true });
    if (!saved) setLocking(false);
  }

  const toolbarButtonClass =
    "inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100";

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-3 text-xs shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Unlocked note</div>
          <div className="text-[10px] text-slate-500">Record ID: {row.consultation_id}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">
            {remoteUsers.length + 1} {remoteUsers.length === 0 ? "user" : "users"} editing
          </span>
          <button
            type="button"
            onClick={() => onCreateInvoice(row)}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
          >
            Create Invoice
          </button>
          <button
            type="button"
            onClick={() => {
              void lockNote();
            }}
            disabled={locking}
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="8" width="10" height="8" rx="1.5" />
              <path d="M7.5 8V5.8a2.5 2.5 0 0 1 5 0V8" />
            </svg>
            {locking ? "Locking" : "Lock"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_420px]">
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-700">Title</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-700">Doctor</span>
          <select
            value={doctorId}
            onChange={(event) => setDoctorId(event.target.value)}
            className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">No doctor</option>
            {medicalStaffOptions.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-[1fr_52px_52px_1fr_1fr]">
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-700">Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-700">Hour</span>
          <input type="text" value={hour} maxLength={2} onChange={(event) => setHour(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))} className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-700">Min</span>
          <input type="text" value={minute} maxLength={2} onChange={(event) => setMinute(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))} className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-700">Diagnosis Code</span>
          <input type="text" value={diagnosisCode} onChange={(event) => setDiagnosisCode(event.target.value)} className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-slate-700">Ref ICD-10</span>
          <input type="text" value={refIcd10} onChange={(event) => setRefIcd10(event.target.value)} className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
        </label>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
          <button type="button" onClick={() => runEditorHistoryCommand(editor, "undo")} disabled={!canRunEditorHistoryCommand(editor, "undo")} className={toolbarButtonClass} title="Undo">↶</button>
          <button type="button" onClick={() => runEditorHistoryCommand(editor, "redo")} disabled={!canRunEditorHistoryCommand(editor, "redo")} className={toolbarButtonClass} title="Redo">↷</button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={toolbarButtonClass}>B</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={toolbarButtonClass}>I</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={toolbarButtonClass}>•</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={toolbarButtonClass}>1.</button>
          <span className="ml-auto text-[10px]">
            {savingState === "pending" ? "Unsaved changes..." : savingState === "saving" ? "Saving..." : savingState === "saved" ? "Saved" : "Live"}
          </span>
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default function MedicalConsultationsCard({
  patientId,
  recordTypeFilter,
  patientFirstName,
  patientLastName,
  patientEmail,
}: {
  patientId: string;
  recordTypeFilter?: ConsultationRecordType;
  patientFirstName?: string;
  patientLastName?: string;
  patientEmail?: string | null;
}) {
  const router = useRouter();
  const tc = useTranslations("patient.consultationsCard");
  const tf = useTranslations("patient.form");
  const pdfNotifications = usePDFJobNotifications();
  const insuranceNotifications = useInsuranceSubmissionNotifications();
  const {
    consultationsRevision,
    billingRevision,
    medicationRevision,
    forcedConsultationsRevision,
  } = usePatientRealtime();
  const pendingRealtimeReloadRef = useRef(false);
  const lastForcedConsultationsRevisionRef = useRef(0);
  const consultationsRefreshSignatureRef = useRef<string | null>(null);
  const consultationsRefreshCheckInFlightRef = useRef(false);
  const silentConsultationsReloadRef = useRef(false);
  const [realtimeReloadToken, setRealtimeReloadToken] = useState(0);

  function broadcastPatientRealtimeRefresh(options?: { force?: boolean }) {
    const payload = {
      keys: ["consultationsRevision", "billingRevision"],
      force: options?.force ?? false,
    };

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(`patient-realtime-${patientId}`);
      channel.postMessage({
        type: "patient-realtime-refresh",
        ...payload,
      });
      channel.close();
    }

    const realtimeChannel = supabaseClient.channel(`patient-realtime-broadcast-${patientId}`);
    realtimeChannel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;

      void realtimeChannel
        .send({
          type: "broadcast",
          event: "patient-realtime-refresh",
          payload,
        })
        .finally(() => {
          void supabaseClient.removeChannel(realtimeChannel);
        });
    });
  }

  // Tab state for switching between Consultations and Medical Records
  const [activeMainTab, setActiveMainTab] = useState<"consultations" | "medical_records">("consultations");

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskContent, setTaskContent] = useState("");
  const [taskActivityDate, setTaskActivityDate] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("todo");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskAssignedUserId, setTaskAssignedUserId] = useState<string>("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskSaveError, setTaskSaveError] = useState<string | null>(null);
  const [userOptions, setUserOptions] = useState<PlatformUser[]>([]);
  const [providerOptions, setProviderOptions] = useState<Provider[]>([]);
  const [billingEntityOptions, setBillingEntityOptions] = useState<Provider[]>([]);
  const [medicalStaffOptions, setMedicalStaffOptions] = useState<Provider[]>([]);

  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState<string | null>(null);
  const [newConsultationOpen, setNewConsultationOpen] = useState(false);
  const [pendingCreateConsultationNotes, setPendingCreateConsultationNotes] = useState<
    PendingCreateConsultationNote[]
  >([]);
  const [consultationDate, setConsultationDate] = useState(
    formatLocalDateInputValue(new Date()),
  );
  const [consultationHour, setConsultationHour] = useState("");
  const [consultationMinute, setConsultationMinute] = useState("");
  const [consultationDoctorId, setConsultationDoctorId] = useState<string>("");
  const [consultationSaving, setConsultationSaving] = useState(false);
  const [consultationError, setConsultationError] = useState<string | null>(
    null,
  );
  const [consultationTitle, setConsultationTitle] = useState("");
  const [consultationRecordType, setConsultationRecordType] =
    useState<ConsultationRecordType>(recordTypeFilter === "invoice" ? "invoice" : "notes");
  const [consultationContentHtml, setConsultationContentHtml] = useState("");
  const consultationContentHtmlRef = useRef("");
  const [consultationDiagnosisCode, setConsultationDiagnosisCode] = useState("");
  const [consultationRefIcd10, setConsultationRefIcd10] = useState("");
  // When creating invoice from an existing consultation, store the source consultation ID
  const [invoiceFromConsultationId, setInvoiceFromConsultationId] = useState<string | null>(null);
  const [consultationMentionActive, setConsultationMentionActive] = useState(false);
  const [consultationMentionQuery, setConsultationMentionQuery] = useState("");
  const [consultationMentionUserIds, setConsultationMentionUserIds] = useState<string[]>([]);
  const [prescriptionLines, setPrescriptionLines] = useState<PrescriptionLine[]>(
    [],
  );
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState("");
  const [invoiceProviderId, setInvoiceProviderId] = useState<string>("");

  // Appointment linking for deposit invoices â€” hidden unless staff explicitly enables it
  const [invoiceApptLinkEnabled, setInvoiceApptLinkEnabled] = useState(false);
  const [invoiceAppointmentId, setInvoiceAppointmentId] = useState<string>("");
  const [invoicePatientAppointments, setInvoicePatientAppointments] = useState<{ id: string; start_time: string; reason: string | null; title: string | null }[]>([]);
  const [invoiceMode, setInvoiceMode] = useState<"group" | "individual" | "tardoc" | "flatrate">(
    "individual", // default to Individual Services
  );
  const [selectedTardocCode, setSelectedTardocCode] = useState("");
  const [invoiceCanton, setInvoiceCanton] = useState<SwissCanton>(DEFAULT_CANTON);
  const [invoiceLawType, setInvoiceLawType] = useState("KVG");
  const [invoiceAccidentDate, setInvoiceAccidentDate] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceDiagnosisCodes, setInvoiceDiagnosisCodes] = useState<string[]>([]);
  const [invoiceDiagnosisInput, setInvoiceDiagnosisInput] = useState("");
  const [tardocSearchQuery, setTardocSearchQuery] = useState("");
  const [tardocSearchResults, setTardocSearchResults] = useState<any[]>([]);
  const [tardocSearchLoading, setTardocSearchLoading] = useState(false);
  const [tardocChapters, setTardocChapters] = useState<{code:string;name:string}[]>([]);
  const [tardocSelectedChapter, setTardocSelectedChapter] = useState("");
  const [tardocDbInfo, setTardocDbInfo] = useState<{dbVersion:string;dbVersionDate:string}|null>(null);
  const [tardocGroups, setTardocGroups] = useState<any[]>([]);
  const [tardocGroupsLoaded, setTardocGroupsLoaded] = useState(false);
  const [tardocGroupSearch, setTardocGroupSearch] = useState("");
  const [tardocGroupDropdownOpen, setTardocGroupDropdownOpen] = useState(false);
  const [skipSumexValidation, setSkipSumexValidation] = useState(true);
  const [rerunGrouperLoading, setRerunGrouperLoading] = useState(false);
  const [invoiceGroupId, setInvoiceGroupId] = useState("");
  const [invoicePaymentTerm, setInvoicePaymentTerm] =
    useState<InvoicePaymentTerm>("full");
  const [invoiceExtraOption, setInvoiceExtraOption] =
    useState<InvoiceExtraOption>(null);
  const [invoiceInstallments, setInvoiceInstallments] = useState<
    InvoiceInstallment[]
  >([]);
  const [invoiceServiceLines, setInvoiceServiceLines] = useState<
    InvoiceServiceLine[]
  >([]);
  const [invoiceServiceGroups, setInvoiceServiceGroups] = useState<
    InvoiceServiceGroup[]
  >([]);
  const [invoiceServices, setInvoiceServices] = useState<InvoiceService[]>([]);
  const [invoiceServiceCategories, setInvoiceServiceCategories] = useState<
    InvoiceServiceCategory[]
  >([]);
  const [invoiceGroupServices, setInvoiceGroupServices] = useState<
    InvoiceGroupServiceLink[]
  >([]);
  const [invoiceSelectedCategoryId, setInvoiceSelectedCategoryId] =
    useState("");
  const [invoiceSelectedServiceId, setInvoiceSelectedServiceId] =
    useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [sendingConsultationsEmail, setSendingConsultationsEmail] = useState(false);
  const [sendConsultationsEmailError, setSendConsultationsEmailError] = useState<string | null>(null);
  const [sendConsultationsEmailSuccess, setSendConsultationsEmailSuccess] = useState(false);

  function buildConsultationsRefreshSignature(rows: ConsultationRow[]) {
    const consultationRows = rows.filter((row) => row.record_type !== "invoice");
    const invoiceRows = rows.filter((row) => row.record_type === "invoice");
    const consultationSignature = consultationRows
      .map((row) =>
        [
          "consultation",
          row.id,
          row.scheduled_at,
          row.title,
          row.content ?? "",
          row.doctor_user_id ?? "",
          row.doctor_name ?? "",
          row.diagnosis_code ?? "",
          row.ref_icd10 ?? "",
        ].join(":"),
      )
      .sort()
      .join("|");
    const invoiceSignature = invoiceRows
      .map((row) =>
        [
          "invoice",
          row.id,
          row.scheduled_at,
          row.title,
          row.content ?? "",
          row.invoice_status ?? "",
          row.invoice_paid_amount ?? "",
          row.invoice_total_amount ?? "",
        ].join(":"),
      )
      .sort()
      .join("|");

    return [
      `consultations:${consultationRows.length}:${consultationSignature}`,
      `invoices:${invoiceRows.length}:${invoiceSignature}`,
    ].join("::");
  }

  async function fetchConsultationsRefreshSignature() {
    const [
      { data: consultationRows, count: consultationCount },
      { data: invoiceRows, count: invoiceCount },
    ] = await Promise.all([
      supabaseClient
        .from("consultations")
        .select("id, scheduled_at, title, content, record_type, doctor_user_id, doctor_name, diagnosis_code, ref_icd10, is_archived", { count: "exact" })
        .eq("patient_id", patientId)
        .eq("is_archived", showArchived)
        .neq("record_type", "invoice")
        .order("scheduled_at", { ascending: false })
        .limit(20),
      supabaseClient
        .from("invoices")
        .select("id, invoice_date, treatment_date, status, paid_amount, total_amount, is_archived, title, consultation_id", { count: "exact" })
        .eq("patient_id", patientId)
        .eq("is_archived", showArchived)
        .order("invoice_date", { ascending: false })
        .limit(20),
    ]);

    const linkedConsultationIds = (invoiceRows ?? [])
      .map((row: any) => row.consultation_id)
      .filter(Boolean) as string[];
    const { data: linkedConsultationRows } =
      linkedConsultationIds.length > 0
        ? await supabaseClient
            .from("consultations")
            .select("id, title, content")
            .in("id", linkedConsultationIds)
        : { data: [] as any[] };
    const linkedConsultationById = new Map(
      (linkedConsultationRows ?? []).map((row: any) => [row.id, row]),
    );

    const consultationSignature = (consultationRows ?? [])
      .map((row: any) =>
        [
          "consultation",
          row.id,
          row.scheduled_at,
          row.title,
          row.content ?? "",
          row.doctor_user_id ?? "",
          row.doctor_name ?? "",
          row.diagnosis_code ?? "",
          row.ref_icd10 ?? "",
        ].join(":"),
      )
      .sort()
      .join("|");
    const invoiceSignature = (invoiceRows ?? [])
      .map((row: any) => {
        const linked = row.consultation_id
          ? linkedConsultationById.get(row.consultation_id)
          : null;
        return [
          "invoice",
          row.id,
          row.treatment_date ?? row.invoice_date ?? "",
          row.title,
          linked?.content ?? "",
          row.status ?? "",
          row.paid_amount ?? "",
          row.total_amount ?? "",
        ].join(":");
      })
      .sort()
      .join("|");

    return [
      `consultations:${consultationCount ?? 0}:${consultationSignature}`,
      `invoices:${invoiceCount ?? 0}:${invoiceSignature}`,
    ].join("::");
  }

  // ACF validation dialog state
  const [acfValidationDialog, setAcfValidationDialog] = useState<{
    originalCount: number;
    validatedCount: number;
    added: number;
    modified: number;
    deleted: number;
    validatedServices: any[];
    totalAmount: number;
  } | null>(null);
  const acfValidationResolveRef = useRef<((accept: boolean) => void) | null>(null);
  const creationFormRef = useRef<HTMLDivElement>(null);

  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [consultationsLoading, setConsultationsLoading] = useState(false);
  const [consultationsError, setConsultationsError] = useState<string | null>(
    null,
  );
  const [showArchived, setShowArchived] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [dateFrom, setDateFrom] = useState<string | "">("");
  const [dateTo, setDateTo] = useState<string | "">("");
  const [consultationDurationSeconds, setConsultationDurationSeconds] =
    useState<number>(0);
  const [
    consultationStopwatchStartedAt,
    setConsultationStopwatchStartedAt,
  ] = useState<number | null>(null);
  const [
    consultationStopwatchNow,
    setConsultationStopwatchNow,
  ] = useState<number>(Date.now());

  const [cashReceiptModalOpen, setCashReceiptModalOpen] = useState(false);
  const [cashReceiptTarget, setCashReceiptTarget] =
    useState<ConsultationRow | null>(null);
  const [cashReceiptFile, setCashReceiptFile] = useState<File | null>(null);
  const [cashReceiptUploading, setCashReceiptUploading] = useState(false);
  const [cashReceiptError, setCashReceiptError] = useState<string | null>(null);

  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [pdfDropdownOpen, setPdfDropdownOpen] = useState<string | null>(null);
  const [emailDropdownOpen, setEmailDropdownOpen] = useState<string | null>(null);
  const [viewPdfDropdownOpen, setViewPdfDropdownOpen] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<{ message: string; details?: string; abortInfo?: string } | null>(null);
  const [pdfSuccessToast, setPdfSuccessToast] = useState<{ invoiceNumber: string | null; type: string; message: string } | null>(null);
  const [generatedPaymentLink, setGeneratedPaymentLink] = useState<{ consultationId: string; url: string } | null>(null);
  const [paymentLinkCopied, setPaymentLinkCopied] = useState(false);

  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);

  const [editInvoiceModalOpen, setEditInvoiceModalOpen] = useState(false);
  const [editInvoiceTarget, setEditInvoiceTarget] = useState<ConsultationRow | null>(null);
  const [editInvoiceTitle, setEditInvoiceTitle] = useState("");
  const [editInvoiceRefNumber, setEditInvoiceRefNumber] = useState("");
  const [editInvoiceSaving, setEditInvoiceSaving] = useState(false);
  const [installmentsModalOpen, setInstallmentsModalOpen] = useState(false);
  const [installmentsTarget, setInstallmentsTarget] = useState<ConsultationRow | null>(null);
  const [installments, setInstallments] = useState<DbInstallment[]>([]);
  const [installmentsLoading, setInstallmentsLoading] = useState(false);
  const [installmentPdfGenerating, setInstallmentPdfGenerating] = useState<string | null>(null);
  const [installmentsSaving, setInstallmentsSaving] = useState(false);

  // Installment summaries for outside UI display (keyed by invoice_id)
  const [installmentSummaries, setInstallmentSummaries] = useState<Record<string, { total: number; paid: number; count: number; paidCount: number }>>({});

  const [paymentStatusModalOpen, setPaymentStatusModalOpen] = useState(false);
  const [paymentStatusTarget, setPaymentStatusTarget] = useState<ConsultationRow | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split("T")[0]);

  const [insuranceBillingModalOpen, setInsuranceBillingModalOpen] = useState(false);
  const [insuranceBillingTarget, setInsuranceBillingTarget] = useState<ConsultationRow | null>(null);
  const [insuranceBillingReminderOverride, setInsuranceBillingReminderOverride] = useState<number | null>(null);
  const [reminderPopupInvoiceId, setReminderPopupInvoiceId] = useState<string | null>(null);

  const invoiceModalOpen =
    paymentStatusModalOpen ||
    installmentsModalOpen ||
    editInvoiceModalOpen ||
    insuranceBillingModalOpen;

  const [checkingXmlId, setCheckingXmlId] = useState<string | null>(null);
  const [xmlPreviewContent, setXmlPreviewContent] = useState<string | null>(null);
  const [xmlPreviewError, setXmlPreviewError] = useState<string | null>(null);

  const [editConsultationModalOpen, setEditConsultationModalOpen] = useState(false);
  const [editConsultationTarget, setEditConsultationTarget] = useState<ConsultationRow | null>(null);
  const [editConsultationTitle, setEditConsultationTitle] = useState("");
  const [editConsultationContent, setEditConsultationContent] = useState("");
  const editConsultationContentRef = useRef<HTMLDivElement>(null);
  const editConsultationSyncChannelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);
  const editConsultationSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editConsultationLastSyncedHtmlRef = useRef("");
  const editConsultationLocalTextRef = useRef("");
  const editConsultationLastBroadcastTextRef = useRef("");
  const editConsultationPendingTextOpRef = useRef<CollaborativeTextOperation | null>(null);
  const editConsultationRemoteApplyRef = useRef(false);
  const [editConsultationDoctorId, setEditConsultationDoctorId] = useState("");
  const [editConsultationDate, setEditConsultationDate] = useState("");
  const [editConsultationHour, setEditConsultationHour] = useState("");
  const [editConsultationMinute, setEditConsultationMinute] = useState("");
  const [editConsultationDiagnosisCode, setEditConsultationDiagnosisCode] = useState("");
  const [editConsultationRefIcd10, setEditConsultationRefIcd10] = useState("");
  const [editConsultationSaving, setEditConsultationSaving] = useState(false);
  const [editConsultationAutosaveStatus, setEditConsultationAutosaveStatus] = useState<"idle" | "pending" | "saving" | "saved">("idle");
  const editConsultationAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [invoiceFromConsultationSuccess, setInvoiceFromConsultationSuccess] = useState<string | null>(null);
  const [noteEventsModal, setNoteEventsModal] = useState<{
    row: ConsultationRow;
    events: ConsultationNoteEvent[];
    loading: boolean;
    error: string | null;
  } | null>(null);

  // NEW CONSULTATION AUTOSAVE - Draft system like Notion/Google Docs
  const [newConsultationDraftId, setNewConsultationDraftId] = useState<string | null>(null);
  const [suppressedCreateDraftId, setSuppressedCreateDraftId] = useState<string | null>(null);
  const [consultationLocked, setConsultationLocked] = useState(false);
  const [consultationNoteMenuOpen, setConsultationNoteMenuOpen] = useState(false);
  const [unlockingConsultationId, setUnlockingConsultationId] = useState<string | null>(null);
  const [newConsultationAutosaveStatus, setNewConsultationAutosaveStatus] = useState<"idle" | "pending" | "saving" | "saved">("idle");
  const newConsultationAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consultationLockSavingRef = useRef(false);
  const finalizedCreateDraftIdsRef = useRef<Set<string>>(new Set());
  const createRoomOpenAllowedRef = useRef(false);
  // Used to ignore Yjs-driven closes immediately after the user clicked the + button.
  const lastLocalOpenAtRef = useRef<number>(0);
  const suppressNewConsultationAutosaveRef = useRef(false);
  const newConsultationAutosaveSeqRef = useRef(0);
  const newConsultationAutosaveInFlightRef = useRef<Promise<ConsultationRow | null> | null>(null);
  const newConsultationDraftIdRef = useRef<string | null>(null);
  const newConsultationOpenRef = useRef(false);
  const consultationCollabRoomId = useMemo(
    () => `patient:${patientId}:consultation-create`,
    [patientId],
  );
  const collaborativeConsultationNotesEnabled =
    !recordTypeFilter || recordTypeFilter === "notes";
  const pendingCreateConsultationSourceDraftIds = useMemo(
    () =>
      new Set(
        pendingCreateConsultationNotes
          .map((note) => note.sourceDraftId)
          .filter((id): id is string => Boolean(id)),
      ),
    [pendingCreateConsultationNotes],
  );
  const activeCollaborativeConsultation = useMemo(
    () =>
      collaborativeConsultationNotesEnabled
        ? consultations.find(
            (row) =>
              row.record_type === "notes" &&
              row.collab_room_id === consultationCollabRoomId &&
              row.is_draft === true &&
              !row.is_archived &&
              !pendingCreateConsultationSourceDraftIds.has(row.id) &&
              row.id !== suppressedCreateDraftId,
          ) ?? null
        : null,
    [
      collaborativeConsultationNotesEnabled,
      consultationCollabRoomId,
      consultations,
      pendingCreateConsultationSourceDraftIds,
      suppressedCreateDraftId,
    ],
  );
  const [consultationYDoc, setConsultationYDoc] = useState<Y.Doc | null>(null);
  const [consultationYProvider, setConsultationYProvider] = useState<any | null>(null);
  const [consultationYProviderSynced, setConsultationYProviderSynced] = useState(false);
  const consultationYFieldsRef = useRef<Y.Map<string> | null>(null);
  const consultationYApplyingRemoteRef = useRef(false);
  const [consultationRemoteUsers, setConsultationRemoteUsers] = useState<
    { id: string; name: string; email: string | null }[]
  >([]);
  const consultationDraftClientIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );

  const [axenitaPdfDocs, setAxenitaPdfDocs] = useState<AxenitaPdfDocument[]>([]);
  const [axenitaPdfLoading, setAxenitaPdfLoading] = useState(false);
  const [axenitaPdfError, setAxenitaPdfError] = useState<string | null>(null);

  const [exportingConsultationsPdf, setExportingConsultationsPdf] = useState(false);

  const [externalLabs, setExternalLabs] = useState<{ id: string; name: string; url: string; username: string; password: string; type: string }[]>([]);
  const [labDropdownOpen, setLabDropdownOpen] = useState(false);
  const [patientDetails, setPatientDetails] = useState<{ dob: string | null; gender: string | null; street_address: string | null; postal_code: string | null; town: string | null; nationality: string | null } | null>(null);

  const consultationNotesEditor = useEditor(
    {
      extensions: [
        StarterKit.configure({ link: false, undoRedo: false }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            class: "text-sky-700 underline underline-offset-2",
          },
        }),
        ...(consultationYDoc
          ? [
              Collaboration.configure({
                document: consultationYDoc,
                field: "notes_tiptap",
              }),
            ]
          : []),
        ...(consultationYProvider
          ? [
              CollaborationCaret.configure({
                provider: consultationYProvider,
                user: {
                  name: currentUserName || currentUserEmail || "User",
                  color: "#0284c7",
                },
              }),
            ]
          : []),
      ],
      editable: consultationRecordType === "notes" && newConsultationOpen && !consultationLocked,
      editorProps: {
        attributes: {
          class:
            "min-h-[220px] cursor-text px-3 py-2 text-xs leading-5 text-slate-900 focus:outline-none [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:my-1 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
        },
      },
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        if (suppressNewConsultationAutosaveRef.current) return;
        if (!newConsultationOpenRef.current || consultationLockSavingRef.current) return;
        const html = editor.getHTML();
        consultationContentHtmlRef.current = isBlankNotesHtml(html) ? "" : html;
        const text = editor.getText();
        const match = text.match(/@([^\s@]{0,50})$/);
        if (match) {
          setConsultationMentionActive(true);
          setConsultationMentionQuery(match[1].toLowerCase());
        } else {
          setConsultationMentionActive(false);
          setConsultationMentionQuery("");
        }
        triggerNewConsultationAutosave();
      },
    },
    [consultationYDoc, consultationYProvider, currentUserEmail, currentUserName],
  );

  function resetNewConsultationNotesEditor() {
    if (newConsultationAutosaveTimerRef.current) {
      clearTimeout(newConsultationAutosaveTimerRef.current);
      newConsultationAutosaveTimerRef.current = null;
    }

    setConsultationContentHtml("");
    consultationContentHtmlRef.current = "";
    setConsultationMentionActive(false);
    setConsultationMentionQuery("");
    setConsultationMentionUserIds([]);
    setConsultationLocked(false);
    updateNewConsultationDraftId(null);
    setNewConsultationAutosaveStatus("idle");

    const fields = consultationYFieldsRef.current;
    fields?.doc?.transact(() => {
      fields.set("open", "false");
      fields.delete("draftId");
      fields.set("locked", "false");
    });
    suppressNewConsultationAutosaveRef.current = true;
    try {
      clearConsultationYjsFragment(consultationYDoc);
      consultationNotesEditor?.commands.clearContent(false);
    } finally {
      window.setTimeout(() => {
        suppressNewConsultationAutosaveRef.current = false;
      }, 0);
    }
  }

  function updateNewConsultationDraftId(draftId: string | null) {
    newConsultationDraftIdRef.current = draftId;
    setNewConsultationDraftId(draftId);
  }

  useEffect(() => {
    newConsultationOpenRef.current = newConsultationOpen;
  }, [newConsultationOpen]);

  useEffect(() => {
    newConsultationDraftIdRef.current = newConsultationDraftId;
  }, [newConsultationDraftId]);

  // Medication form state - supports multiple products
  const [medProducts, setMedProducts] = useState<MedProduct[]>([createEmptyMedProduct()]);
  const medSearchTimeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const [medIntakeNote, setMedIntakeNote] = useState("");
  const [medIntakeFromDate, setMedIntakeFromDate] = useState(formatLocalDateInputValue(new Date()));
  const [medDecisionSummary, setMedDecisionSummary] = useState("");
  const [medShowInMediplan, setMedShowInMediplan] = useState(true);
  const [medIsPrescription, setMedIsPrescription] = useState(true);

  // Medication template state
  const [medTemplates, setMedTemplates] = useState<{
    id: string;
    name: string;
    service_id: string | null;
    service_name: string | null;
    medication_template_items: {
      product_name: string;
      product_number: number | null;
      product_type: string;
      intake_kind: string;
      amount_morning: string | null;
      amount_noon: string | null;
      amount_evening: string | null;
      amount_night: string | null;
      quantity: number;
      intake_note: string | null;
    }[];
  }[]>([]);
  const [medTemplatesLoaded, setMedTemplatesLoaded] = useState(false);
  const [medSelectedTemplateId, setMedSelectedTemplateId] = useState<string>("");
  const [medTemplateFilter, setMedTemplateFilter] = useState<"all" | "service">("all");
  const [medTemplateServiceFilter, setMedTemplateServiceFilter] = useState<string>("");

  // Medication creation success modal state
  const [medCreationSuccessModal, setMedCreationSuccessModal] = useState<{
    open: boolean;
    prescriptionSheetId: string | null;
    isMedication: boolean; // true = medicine tab type, false = prescription tab type
  }>({ open: false, prescriptionSheetId: null, isMedication: true });
  const [medPdfGenerating, setMedPdfGenerating] = useState(false);
  const [medEmailSending, setMedEmailSending] = useState(false);

  const realtimeReloadBlocked =
    newConsultationOpen ||
    consultationSaving ||
    editConsultationModalOpen ||
    editConsultationSaving ||
    invoiceModalOpen ||
    editInvoiceSaving ||
    installmentsSaving ||
    markingPaid ||
    taskModalOpen ||
    taskSaving ||
    medCreationSuccessModal.open ||
    medPdfGenerating ||
    medEmailSending;

  const updateMedProduct = (id: string, updates: Partial<MedProduct>) => {
    setMedProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };
  const addMedProduct = () => {
    setMedProducts((prev) => [...prev, createEmptyMedProduct()]);
  };
  const removeMedProduct = (id: string) => {
    setMedProducts((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  };

  // Handler for generating eMediplan PDF from success modal
  async function handleMedSuccessGeneratePdf() {
    try {
      setMedPdfGenerating(true);
      const tabType = medCreationSuccessModal.isMedication ? "medicine" : "prescription";
      const prescriptionSheetId = medCreationSuccessModal.prescriptionSheetId;

      const response = await fetch("/api/emediplan/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          patientId, 
          tabType, 
          prescriptionSheetId: tabType === "prescription" ? prescriptionSheetId : undefined 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate eMediplan PDF");
      }

      // Download the PDF
      const pdfBlob = new Blob(
        [Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0))],
        { type: "application/pdf" }
      );
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename || "emediplan.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating eMediplan PDF:", error);
      alert(error instanceof Error ? error.message : "Failed to generate eMediplan PDF");
    } finally {
      setMedPdfGenerating(false);
    }
  }

  // Handler for sending eMediplan email from success modal
  async function handleMedSuccessSendEmail() {
    if (!patientEmail) {
      alert("Patient does not have an email address");
      return;
    }

    try {
      setMedEmailSending(true);
      const tabType = medCreationSuccessModal.isMedication ? "medicine" : "prescription";
      const prescriptionSheetId = medCreationSuccessModal.prescriptionSheetId;

      // First generate the PDF
      const pdfResponse = await fetch("/api/emediplan/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          patientId, 
          tabType, 
          prescriptionSheetId: tabType === "prescription" ? prescriptionSheetId : undefined 
        }),
      });

      const pdfData = await pdfResponse.json();

      if (!pdfResponse.ok) {
        throw new Error(pdfData.error || "Failed to generate eMediplan PDF");
      }

      // Send email with attachment
      const emailResponse = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          to: patientEmail,
          subject: `Your Medication Plan`,
          html: `<p>Hello,</p><p>Please find attached your medication plan (eMediplan).</p><p>Best regards,<br/>Your Medical Team</p>`,
          inlineAttachments: [{
            filename: pdfData.filename,
            content: pdfData.pdf,
            encoding: "base64",
            contentType: "application/pdf",
          }],
        }),
      });

      const emailData = await emailResponse.json();

      if (!emailResponse.ok) {
        throw new Error(emailData.error || "Failed to send email");
      }

      // Update last_emailed_at for the medications that were sent
      const now = new Date().toISOString();
      if (tabType === "prescription" && prescriptionSheetId) {
        await supabaseClient
          .from("patient_prescriptions")
          .update({ last_emailed_at: now })
          .eq("prescription_sheet_id", prescriptionSheetId);
      } else if (tabType === "medicine") {
        // Update all medicine-type medications for this patient
        await supabaseClient
          .from("patient_prescriptions")
          .update({ last_emailed_at: now })
          .eq("patient_id", patientId)
          .eq("active", true)
          .is("prescription_sheet_id", null);
      }

      alert("Email sent successfully to " + patientEmail);
      setMedCreationSuccessModal({ open: false, prescriptionSheetId: null, isMedication: true });
    } catch (error) {
      console.error("Error sending eMediplan email:", error);
      alert(error instanceof Error ? error.message : "Failed to send eMediplan email");
    } finally {
      setMedEmailSending(false);
    }
  }

  const consultationRecordTypeOptions: {
    value: ConsultationRecordType;
    label: string;
  }[] = [
      { value: "notes", label: tf("recordNotes") },
      { value: "invoice", label: tf("recordInvoice") },
      { value: "file", label: tf("recordFile") },
      { value: "photo", label: tf("recordPhoto") },
      { value: "3d", label: tf("record3d") },
      { value: "patient_information", label: tf("recordPatientInfo") },
      { value: "documents", label: tf("recordDocuments") },
      { value: "form_photos", label: tf("recordFormPhotos") },
      { value: "medication", label: tf("recordMedication") },
    ];
  const otherConsultationRecordTypeOptions = consultationRecordTypeOptions.filter(
    (option) => option.value !== "notes",
  );

  const filteredSortedConsultations = useMemo(() => {
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo) : null;

    const filtered = consultations.filter((row) => {
      const scheduled = row.scheduled_at ? new Date(row.scheduled_at) : null;
      if (!scheduled || Number.isNaN(scheduled.getTime())) return false;
      if (row.record_type === "notes" && row.is_draft === true) return false;

      if (recordTypeFilter) {
        if (row.record_type !== recordTypeFilter) return false;
      } else {
        // In the default consultations tab, hide invoice records.
        // Linked invoices are rendered under their parent consultation.
        if (row.record_type === "invoice") return false;
      }

      if (fromDate && scheduled < fromDate) return false;
      if (toDate) {
        const toInclusive = new Date(toDate);
        toInclusive.setHours(23, 59, 59, 999);
        if (scheduled > toInclusive) return false;
      }

      return true;
    });

    return filtered
      .slice()
      .sort((a, b) => compareConsultationRows(a, b, sortOrder));
  }, [consultations, dateFrom, dateTo, sortOrder, recordTypeFilter]);

  const unlockedDraftConsultations = useMemo(
    () =>
      consultations
        .filter(
          (row) =>
            row.record_type === "notes" &&
            row.is_draft === true &&
            row.collab_room_id?.startsWith(`patient:${patientId}:consultation:`),
        )
        .sort((a, b) => compareConsultationRows(a, b, "desc")),
    [consultations, patientId],
  );

  const currentMedicalStaffProvider = useMemo(() => {
    if (!currentUserId && !currentUserEmail) return null;

    const currentUser = currentUserId
      ? userOptions.find((user) => user.id === currentUserId)
      : null;
    const mappedProviderId = currentUser?.provider_id ?? null;

    if (mappedProviderId) {
      const mappedProvider = medicalStaffOptions.find((staff) => staff.id === mappedProviderId);
      if (mappedProvider) return mappedProvider;
    }

    const normalizedEmail = currentUserEmail?.trim().toLowerCase();
    if (!normalizedEmail) return null;

    return (
      medicalStaffOptions.find(
        (staff) => staff.email?.trim().toLowerCase() === normalizedEmail,
      ) ?? null
    );
  }, [currentUserEmail, currentUserId, medicalStaffOptions, userOptions]);

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      try {
        const response = await fetch("/api/users/list");
        if (!response.ok) return;
        const json = (await response.json()) as PlatformUser[];
        if (!isMounted) return;
        setUserOptions(json);
      } catch {
      }
    }

    async function loadProviders() {
      try {
        const { data } = await supabaseClient
          .from("providers")
          .select("id, name, specialty, email, phone, gln, zsr, canton, role, iban, billing_type, invoice_method, vat_enabled, vat_rate, doctor_id")
          .order("name");
        if (!isMounted) return;
        if (data) {
          setProviderOptions(data as Provider[]);
          // Filter billing entities (clinics)
          setBillingEntityOptions(data.filter((p: any) => p.role === 'billing_entity') as Provider[]);
          // Filter medical staff (doctors and nurses)
          setMedicalStaffOptions(data.filter((p: any) => p.role === 'doctor' || p.role === 'nurse' || p.role === 'technician') as Provider[]);
        }
      } catch {}
    }

    async function loadExternalLabs() {
      try {
        const res = await fetch("/api/settings/external-labs");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setExternalLabs(data.labs || []);
        }
      } catch {}
    }

    async function loadPatientDetails() {
      try {
        const { data } = await supabaseClient
          .from("patients")
          .select("dob, gender, street_address, postal_code, town, nationality")
          .eq("id", patientId)
          .single();
        if (isMounted && data) setPatientDetails(data);
      } catch {}
    }

    async function loadMedTemplates() {
      try {
        const res = await fetch("/api/medication-templates");
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.success) {
            setMedTemplates(json.data || []);
            setMedTemplatesLoaded(true);
          }
        }
      } catch {}
    }

    void loadUsers();
    void loadProviders();
    void loadExternalLabs();
    void loadPatientDetails();
    void loadMedTemplates();

    return () => {
      isMounted = false;
    };
  }, []);


  // Auto-prefill billing entity based on selected doctor + payment method + invoice mode.
  // Rule:
  //   - For Dr Miles, Dr Nordback, Dr Koltunova, Dr Plakalo, Dr Guarino, Dr Benani: NO auto-assignment (entity is mandatory, user must choose)
  //   - For others: Payment Method = "Insurance" OR Invoice Mode = "tardoc" -> medical entity (e.g. "Dr X")
  //     Anything else (Cash/Card/Online/Bank, Individual/Group/Flatrate) -> aesthetic entity (e.g. "Soins X")
  // If the doctor has only one billing entity, use it regardless.
  // The dropdown is always enabled — user can always change the selection manually.
  useEffect(() => {
    if (consultationRecordType !== "invoice") return;
    if (!consultationDoctorId) return;
    if (billingEntityOptions.length === 0) return;

    // Skip auto-assignment for these doctors â€” entity must be chosen manually
    const selectedDoctor = medicalStaffOptions.find((d) => d.id === consultationDoctorId);
    const noAutoAssignDoctors = ["miles", "nordback", "koltunova", "plakalo", "guarino", "benani"];
    if (selectedDoctor) {
      const nameLC = (selectedDoctor.name || "").toLowerCase();
      if (noAutoAssignDoctors.some((n) => nameLC.includes(n))) {
        return;
      }
    }

    const doctorEntities = billingEntityOptions.filter(
      (be) => be.doctor_id === consultationDoctorId,
    );
    if (doctorEntities.length === 0) return;

    const isMedical =
      invoicePaymentMethod === "Insurance" || invoiceMode === "tardoc";
    const targetType: "medical" | "aesthetic" = isMedical
      ? "medical"
      : "aesthetic";

    const match = doctorEntities.find((be) => be.billing_type === targetType);
    const chosen = match ?? doctorEntities[0];

    if (chosen && chosen.id !== invoiceProviderId) {
      setInvoiceProviderId(chosen.id);
    }
  }, [
    consultationRecordType,
    consultationDoctorId,
    invoicePaymentMethod,
    invoiceMode,
    billingEntityOptions,
    invoiceProviderId,
    medicalStaffOptions,
  ]);

  useEffect(() => {
    if (!consultationStopwatchStartedAt) return;

    const intervalId = window.setInterval(() => {
      setConsultationStopwatchNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [consultationStopwatchStartedAt]);

  useEffect(() => {
    let isMounted = true;

    async function loadConsultations() {
      const isSilentReload = silentConsultationsReloadRef.current;
      silentConsultationsReloadRef.current = false;

      try {
        if (!isSilentReload) setConsultationsLoading(true);
        setConsultationsError(null);

        // 1) Load non-invoice records from consultations table
        const { data: consultData, error: consultError } = await supabaseClient
          .from("consultations")
          .select(
            "id, patient_id, consultation_id, title, content, record_type, doctor_user_id, doctor_name, scheduled_at, payment_method, duration_seconds, invoice_total_amount, invoice_is_complimentary, invoice_is_paid, invoice_status, invoice_paid_amount, cash_receipt_path, invoice_pdf_path, payment_link_token, payrexx_payment_link, payrexx_payment_status, created_by_user_id, created_by_name, is_archived, archived_at, diagnosis_code, ref_icd10, collab_room_id, is_draft",
          )
          .eq("patient_id", patientId)
          .eq("is_archived", showArchived ? true : false)
          .neq("record_type", "invoice")
          .order("scheduled_at", { ascending: false });

        if (!isMounted) return;

        if (consultError) {
          setConsultationsError(consultError.message ?? "Failed to load consultations.");
          setConsultations([]);
          setConsultationsLoading(false);
          return;
        }

        const nonInvoiceRows: ConsultationRow[] = (consultData ?? []).map((r: any) => ({
          ...r,
          invoice_id: null,
          reference_number: null,
          diagnosis_code: r.diagnosis_code ?? null,
          ref_icd10: r.ref_icd10 ?? null,
          linked_invoice_id: null,
          linked_invoice_status: null,
          linked_invoice_number: null,
          medidata_status: null,
          collab_room_id: r.collab_room_id ?? null,
          is_draft: r.is_draft ?? null,
        }));

        // 2) Load invoice records directly from invoices table
        const { data: invoiceData, error: invoiceError } = await supabaseClient
          .from("invoices")
          .select(
            "id, patient_id, consultation_id, invoice_number, invoice_date, due_date, treatment_date, doctor_user_id, doctor_name, provider_name, payment_method, total_amount, subtotal, paid_amount, status, is_complimentary, cash_receipt_path, pdf_path, pdf_path_tg, pdf_path_tp, pdf_path_reminder, pdf_path_receipt, payment_link_token, payrexx_payment_link, payrexx_payment_status, created_by_user_id, created_by_name, is_archived, title, reference_number, reminder_level, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at",
          )
          .eq("patient_id", patientId)
          .eq("is_archived", showArchived ? true : false)
          .order("invoice_date", { ascending: false });

        if (!isMounted) return;

        if (invoiceError) {
          console.error("Failed to load invoices:", invoiceError);
        }

        // 3) Convert invoice rows to ConsultationRow shape
        const invoiceRows: ConsultationRow[] = (invoiceData ?? []).map((inv: any) => {
          return {
            id: inv.id,
            patient_id: inv.patient_id ?? patientId,
            consultation_id: inv.invoice_number ?? inv.id,
            title: inv.title,
            content: null,
            record_type: "invoice" as ConsultationRecordType,
            doctor_user_id: inv.doctor_user_id ?? null,
            doctor_name: inv.provider_name || inv.doctor_name || null,
            scheduled_at: inv.treatment_date || inv.invoice_date || new Date().toISOString(),
            payment_method: inv.payment_method ?? null,
            duration_seconds: null,
            invoice_id: inv.id,
            invoice_total_amount: inv.total_amount ?? null,
            invoice_is_complimentary: inv.is_complimentary ?? false,
            invoice_is_paid: inv.status === "PAID" || inv.status === "OVERPAID" || inv.status === "PARTIAL_PAID",
            invoice_status: (inv.status as InvoiceStatus) ?? null,
            invoice_paid_amount: inv.paid_amount ?? null,
            cash_receipt_path: inv.cash_receipt_path ?? null,
            invoice_pdf_path: inv.pdf_path ?? null,
            invoice_pdf_path_tg: inv.pdf_path_tg ?? null,
            invoice_pdf_path_tp: inv.pdf_path_tp ?? null,
            invoice_pdf_path_reminder: inv.pdf_path_reminder ?? null,
            invoice_pdf_path_receipt: inv.pdf_path_receipt ?? null,
            invoice_consultation_id: inv.consultation_id ?? null,
            invoice_due_date: inv.due_date ?? null,
            invoice_reminder_level: inv.reminder_level ?? 0,
            invoice_reminder_1_sent_at: inv.reminder_1_sent_at ?? null,
            invoice_reminder_2_sent_at: inv.reminder_2_sent_at ?? null,
            invoice_reminder_3_sent_at: inv.reminder_3_sent_at ?? null,
            payment_link_token: inv.payment_link_token ?? null,
            payrexx_payment_link: inv.payrexx_payment_link ?? null,
            payrexx_payment_status: inv.payrexx_payment_status ?? null,
            created_by_user_id: inv.created_by_user_id ?? null,
            created_by_name: inv.created_by_name ?? null,
            is_archived: inv.is_archived ?? false,
            archived_at: null,
            reference_number: inv.reference_number ?? null,
            diagnosis_code: null,
            ref_icd10: null,
            linked_invoice_id: null,
            linked_invoice_status: null,
            linked_invoice_number: null,
            medidata_status: null,
          };
        });

        // 4a) Link consultations to their invoices (invoices.consultation_id â†’ consultations.id)
        const consultationIdsForLinking = nonInvoiceRows.map((r) => r.id);
        if (consultationIdsForLinking.length > 0 && invoiceData && invoiceData.length > 0) {
          const invoiceByConsultId = new Map<string, { id: string; status: string; invoice_number: string }>();
          for (const inv of invoiceData as any[]) {
            if (inv.consultation_id) {
              invoiceByConsultId.set(inv.consultation_id, {
                id: inv.id,
                status: inv.status || "OPEN",
                invoice_number: inv.invoice_number || inv.id,
              });
            }
          }
          for (const row of nonInvoiceRows) {
            const linked = invoiceByConsultId.get(row.id);
            if (linked) {
              row.linked_invoice_id = linked.id;
              row.linked_invoice_status = linked.status as InvoiceStatus;
              row.linked_invoice_number = linked.invoice_number;
            }
          }
        }

        // 4a2) Fetch medidata submission status for all invoices
        const allInvoiceIds = invoiceRows.map((r) => r.invoice_id).filter(Boolean) as string[];
        const linkedInvoiceIds = nonInvoiceRows.map((r) => r.linked_invoice_id).filter(Boolean) as string[];
        const allMedidataInvoiceIds = [...new Set([...allInvoiceIds, ...linkedInvoiceIds])];
        if (allMedidataInvoiceIds.length > 0) {
          const { data: medidataData } = await supabaseClient
            .from("medidata_submissions")
            .select("invoice_id, status")
            .in("invoice_id", allMedidataInvoiceIds)
            .order("created_at", { ascending: false });
          if (medidataData && medidataData.length > 0) {
            // Use latest submission status per invoice
            const statusByInvoice = new Map<string, string>();
            for (const ms of medidataData as any[]) {
              if (ms.invoice_id && !statusByInvoice.has(ms.invoice_id)) {
                statusByInvoice.set(ms.invoice_id, ms.status);
              }
            }
            for (const row of invoiceRows) {
              if (row.invoice_id && statusByInvoice.has(row.invoice_id)) {
                row.medidata_status = statusByInvoice.get(row.invoice_id) || null;
              }
            }
            for (const row of nonInvoiceRows) {
              if (row.linked_invoice_id && statusByInvoice.has(row.linked_invoice_id)) {
                row.medidata_status = statusByInvoice.get(row.linked_invoice_id) || null;
              }
            }
          }
        }

        // 4b) Fetch line items for all invoices and generate HTML breakdown
        const invoicesWithIds = invoiceRows.filter((r) => r.invoice_id);
        if (invoicesWithIds.length > 0) {
          const invoiceIds = invoicesWithIds.map((r) => r.invoice_id!);
          const { data: allLineItems } = await supabaseClient
            .from("invoice_line_items")
            .select("invoice_id, name, code, tardoc_code, quantity, unit_price, total_price, tariff_code, catalog_name, tp_al, tp_tl, tp_al_value, side_type, external_factor_mt, ref_code")
            .in("invoice_id", invoiceIds)
            .order("sort_order", { ascending: true });

          if (allLineItems && allLineItems.length > 0) {
            const lineItemsByInvoice = new Map<string, typeof allLineItems>();
            for (const li of allLineItems) {
              const existing = lineItemsByInvoice.get(li.invoice_id) || [];
              existing.push(li);
              lineItemsByInvoice.set(li.invoice_id, existing);
            }

            for (const row of invoicesWithIds) {
              const items = lineItemsByInvoice.get(row.invoice_id!);
              if (!items || items.length === 0) continue;

              let totalAmount = 0;
              const itemsHtml = items
                .map((item) => {
                  const lineTotal = item.total_price || (item.unit_price || 0) * (item.quantity || 1);
                  totalAmount += lineTotal;
                  const isTardoc = item.tariff_code === 7 || item.catalog_name === "TARDOC";
                  const badge = isTardoc
                    ? `<span class="ml-1 inline-flex rounded bg-red-50 px-1 text-[8px] font-medium text-red-600">TARDOC</span>`
                    : item.tariff_code === 5 || item.tariff_code === 590 || item.catalog_name === "ACF" || item.catalog_name === "SURGERY_FLAT_RATE"
                    ? `<span class="ml-1 inline-flex rounded bg-violet-50 px-1 text-[8px] font-medium text-violet-600">ACF</span>`
                    : "";
                  const sideLabel = item.side_type === 1 ? "Left" : item.side_type === 2 ? "Right" : item.side_type === 3 ? "Both" : "None";
                  const tardocDetails = isTardoc
                    ? `<tr class="border-b border-slate-50 bg-slate-50/50"><td colspan="5" class="px-2 py-0.5 text-[9px] text-slate-400">TP MT: <span class="font-mono font-medium text-slate-600">${(item.tp_al || 0).toFixed(2)}</span> &nbsp; TP TT: <span class="font-mono font-medium text-slate-600">${(item.tp_tl || 0).toFixed(2)}</span> &nbsp; TPV: <span class="font-mono font-medium text-slate-600">${(item.tp_al_value || 0).toFixed(2)}</span> &nbsp; Side: <span class="font-medium text-slate-600">${sideLabel}</span> &nbsp; Ext.F: <span class="font-mono font-medium text-slate-600">${(item.external_factor_mt ?? 1).toFixed(2)}</span>${item.ref_code ? ` &nbsp; Ref: <span class="font-medium text-slate-600">${item.ref_code}</span>` : ""}</td></tr>`
                    : "";
                  return `<tr class="border-b border-slate-100"><td class="px-2 py-1">${item.tardoc_code || item.code || "-"}${badge}</td><td class="px-2 py-1">${item.name || "Service"}</td><td class="px-2 py-1 text-right">${item.quantity || 1}</td><td class="px-2 py-1 text-right">CHF ${(item.unit_price || 0).toFixed(2)}</td><td class="px-2 py-1 text-right">CHF ${lineTotal.toFixed(2)}</td></tr>${tardocDetails}`;
                })
                .join("");

              const lineItemsHtml = `<div class="mt-1"><table class="w-full border-collapse text-[11px]"><thead><tr class="bg-slate-50 text-slate-600"><th class="px-2 py-1 text-left font-semibold">Code</th><th class="px-2 py-1 text-left font-semibold">Service</th><th class="px-2 py-1 text-right font-semibold">Qty</th><th class="px-2 py-1 text-right font-semibold">Unit Price</th><th class="px-2 py-1 text-right font-semibold">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table><p class="mt-1 text-[11px] text-slate-700"><strong>Total:</strong> CHF ${totalAmount.toFixed(2)}</p></div>`;
              // Append line items after any existing consultation content
              row.content = row.content ? `${row.content}${lineItemsHtml}` : lineItemsHtml;
            }
          }
        }

        // 5) Merge and sort newest first, using the record number as a stable tie-breaker.
        const allRows = [...nonInvoiceRows, ...invoiceRows].sort((a, b) =>
          compareConsultationRows(a, b, "desc"),
        );

        if (!isMounted) return;
        consultationsRefreshSignatureRef.current = buildConsultationsRefreshSignature(allRows);
        setConsultations(allRows);
        setConsultationsLoading(false);

        // Load installment summaries for all invoices
        const invoiceIdsForInstallments = invoiceRows.map((r) => r.invoice_id).filter(Boolean) as string[];
        if (invoiceIdsForInstallments.length > 0) {
          const { data: allInstData } = await supabaseClient
            .from("invoice_installments")
            .select("invoice_id, amount, status")
            .in("invoice_id", invoiceIdsForInstallments);
          if (allInstData && allInstData.length > 0) {
            const summaries: Record<string, { total: number; paid: number; count: number; paidCount: number }> = {};
            for (const inst of allInstData) {
              if (!summaries[inst.invoice_id]) {
                summaries[inst.invoice_id] = { total: 0, paid: 0, count: 0, paidCount: 0 };
              }
              summaries[inst.invoice_id].count++;
              summaries[inst.invoice_id].total += Number(inst.amount || 0);
              if (inst.status === "PAID") {
                summaries[inst.invoice_id].paidCount++;
                summaries[inst.invoice_id].paid += Number(inst.amount || 0);
              }
            }
            if (isMounted) setInstallmentSummaries(summaries);
          }
        }
      } catch {
        if (!isMounted) return;
        setConsultationsError("Failed to load consultations.");
        setConsultations([]);
        setConsultationsLoading(false);
      }
    }

    void loadConsultations();

    return () => {
      isMounted = false;
    };
  }, [patientId, showArchived, realtimeReloadToken]);

  useEffect(() => {
    if (
      forcedConsultationsRevision > 0 &&
      forcedConsultationsRevision !== lastForcedConsultationsRevisionRef.current
    ) {
      lastForcedConsultationsRevisionRef.current = forcedConsultationsRevision;
      pendingRealtimeReloadRef.current = false;
      silentConsultationsReloadRef.current = true;
      setRealtimeReloadToken((value) => value + 1);
      return;
    }

    const hasRealtimeChange =
      consultationsRevision > 0 || billingRevision > 0 || medicationRevision > 0;
    if (!hasRealtimeChange) return;

    if (realtimeReloadBlocked) {
      pendingRealtimeReloadRef.current = true;
      return;
    }

    silentConsultationsReloadRef.current = true;
    setRealtimeReloadToken((value) => value + 1);
  }, [
    consultationsRevision,
    billingRevision,
    forcedConsultationsRevision,
    medicationRevision,
    realtimeReloadBlocked,
  ]);

  useEffect(() => {
    if (!pendingRealtimeReloadRef.current || realtimeReloadBlocked) return;
    pendingRealtimeReloadRef.current = false;
    silentConsultationsReloadRef.current = true;
    setRealtimeReloadToken((value) => value + 1);
  }, [realtimeReloadBlocked]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      if (consultationsRefreshCheckInFlightRef.current) return;

      if (realtimeReloadBlocked) {
        pendingRealtimeReloadRef.current = true;
        return;
      }

      consultationsRefreshCheckInFlightRef.current = true;
      void fetchConsultationsRefreshSignature()
        .then((nextSignature) => {
          if (!consultationsRefreshSignatureRef.current) {
            consultationsRefreshSignatureRef.current = nextSignature;
            return;
          }

          if (nextSignature !== consultationsRefreshSignatureRef.current) {
            consultationsRefreshSignatureRef.current = nextSignature;
            silentConsultationsReloadRef.current = true;
            setRealtimeReloadToken((value) => value + 1);
          }
        })
        .finally(() => {
          consultationsRefreshCheckInFlightRef.current = false;
        });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [realtimeReloadBlocked]);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      try {
        const { data } = await supabaseClient.auth.getUser();
        if (!isMounted) return;
        const user = data?.user ?? null;
        if (user) {
          setCurrentUserId(user.id);
          setCurrentUserEmail(user.email ?? null);
          const meta = user.user_metadata ?? {};
          const name = meta.full_name ||
            [meta.first_name, meta.last_name].filter(Boolean).join(" ") ||
            user.email ||
            null;
          setCurrentUserName(name);
        } else {
          setCurrentUserId(null);
          setCurrentUserEmail(null);
          setCurrentUserName(null);
        }
      } catch {
        if (!isMounted) return;
        setCurrentUserId(null);
      }
    }

    void loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!collaborativeConsultationNotesEnabled) {
      setConsultationYDoc(null);
      setConsultationYProvider(null);
      setConsultationYProviderSynced(false);
      consultationYFieldsRef.current = null;
      setConsultationRemoteUsers([]);
      return;
    }

    const { room, leave } = liveblocksClient.enterRoom(consultationCollabRoomId, {
      initialPresence: {
        name: currentUserName || currentUserEmail || "User",
        email: currentUserEmail,
      },
    });
    const provider = getYjsProviderForRoom(room);
    const ydoc = provider.getYDoc();
    const yfields = ydoc.getMap<string>("fields");

    setConsultationYDoc(ydoc);
    setConsultationYProvider(provider);
    setConsultationYProviderSynced(Boolean(provider.synced));
    consultationYFieldsRef.current = yfields;

    const handleProviderSync = (synced: boolean) => {
      setConsultationYProviderSynced(synced);
    };
    provider.on("sync", handleProviderSync);

    room.updatePresence({
      name: currentUserName || currentUserEmail || "User",
      email: currentUserEmail,
    });

    if (!yfields.get("open")) yfields.set("open", "false");
    if (!yfields.get("date")) yfields.set("date", consultationDate);
    if (!yfields.get("hour")) yfields.set("hour", consultationHour);
    if (!yfields.get("minute")) yfields.set("minute", consultationMinute);
    if (!yfields.get("doctorId")) yfields.set("doctorId", consultationDoctorId);
    if (!yfields.get("title")) yfields.set("title", consultationTitle);
    if (!yfields.get("recordType")) yfields.set("recordType", consultationRecordType);
    if (!yfields.get("diagnosisCode")) yfields.set("diagnosisCode", consultationDiagnosisCode);
    if (!yfields.get("refIcd10")) yfields.set("refIcd10", consultationRefIcd10);

    const applyYFields = () => {
      const shouldOpen = yfields.get("open") === "true";
      const locked = yfields.get("locked") === "true";
      const draftId = yfields.get("draftId") ?? null;
      const recordType = (yfields.get("recordType") as ConsultationRecordType) || "notes";
      const justOpenedLocally = Date.now() - lastLocalOpenAtRef.current < 2000;

      if (!shouldOpen && justOpenedLocally) {
        console.warn("[Consultations] Ignoring stale Yjs close immediately after local + button click");
        return;
      }

      if (
        shouldOpen &&
        recordType === "notes" &&
        ((draftId && finalizedCreateDraftIdsRef.current.has(draftId)) ||
          (!draftId && !createRoomOpenAllowedRef.current))
      ) {
        // If the user just clicked the + button locally, ignore the Yjs-driven close
        // briefly to avoid a race condition where remote sync closes the form.
        if (justOpenedLocally) {
          console.warn("[Consultations] Ignoring Yjs-driven close immediately after local + button click");
          return;
        }
        createRoomOpenAllowedRef.current = false;
        yfields.doc?.transact(() => {
          yfields.set("open", "false");
          yfields.set("locked", "false");
          yfields.delete("draftId");
        });
        suppressNewConsultationAutosaveRef.current = true;
        try {
          clearConsultationYjsFragment(ydoc);
          consultationNotesEditor?.commands.clearContent(false);
        } finally {
          window.setTimeout(() => {
            suppressNewConsultationAutosaveRef.current = false;
          }, 0);
        }
        return;
      }

      consultationYApplyingRemoteRef.current = true;
      setNewConsultationOpen(shouldOpen);
      setConsultationLocked(locked);
      setConsultationDate(yfields.get("date") ?? "");
      setConsultationHour(yfields.get("hour") ?? "");
      setConsultationMinute(yfields.get("minute") ?? "");
      setConsultationDoctorId(yfields.get("doctorId") ?? "");
      setConsultationTitle(yfields.get("title") ?? "");
      setConsultationRecordType(recordType);
      setConsultationDiagnosisCode(yfields.get("diagnosisCode") ?? "");
      setConsultationRefIcd10(yfields.get("refIcd10") ?? "");
      updateNewConsultationDraftId(draftId);
      consultationYApplyingRemoteRef.current = false;
    };

    applyYFields();

    yfields.observe(applyYFields);
    const unsubscribeOthers = room.subscribe("others", (others) => {
      setConsultationRemoteUsers(
        Array.from((others as any).values ? (others as any).values() : others as any[])
          .map((other: any) => ({
            id: String(other.connectionId ?? other.id ?? ""),
            name: other.presence?.name || other.info?.name || "User",
            email: other.presence?.email || other.info?.email || null,
          }))
          .filter((user) => user.id),
      );
    });

    return () => {
      provider.off("sync", handleProviderSync);
      yfields.unobserve(applyYFields);
      unsubscribeOthers();
      provider.destroy();
      leave();
      setConsultationYDoc(null);
      setConsultationYProvider(null);
      setConsultationYProviderSynced(false);
      consultationYFieldsRef.current = null;
      setConsultationRemoteUsers([]);
    };
  }, [
    collaborativeConsultationNotesEnabled,
    consultationCollabRoomId,
    currentUserEmail,
    currentUserName,
  ]);

  async function logConsultationNoteEvent(
    row: Pick<ConsultationRow, "id" | "patient_id" | "collab_room_id"> | null,
    eventType: string,
    metadata: Record<string, unknown> = {},
  ) {
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session?.access_token) return;

      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await fetch("/api/consultation-note-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          patientId: row?.patient_id ?? patientId,
          consultationId: row?.id ?? null,
          collabRoomId: row?.collab_room_id ?? null,
          eventType,
          clientId: consultationDraftClientIdRef.current,
          requestId,
          metadata,
        }),
      });
      console.info("[consultation-note-event]", { requestId, eventType, metadata });
    } catch (error) {
      console.warn("[consultation-note-event] failed", eventType, error);
    }
  }

  async function openConsultationNoteEvents(row: ConsultationRow) {
    setNoteEventsModal({ row, events: [], loading: true, error: null });
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        setNoteEventsModal({ row, events: [], loading: false, error: "Missing Supabase session." });
        return;
      }

      const params = new URLSearchParams({
        patientId,
        consultationId: row.id,
      });
      const response = await fetch(`/api/consultation-note-events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setNoteEventsModal({
          row,
          events: [],
          loading: false,
          error: data?.error ?? "Failed to load note logs.",
        });
        return;
      }
      setNoteEventsModal({
        row,
        events: (data?.events ?? []) as ConsultationNoteEvent[],
        loading: false,
        error: null,
      });
    } catch {
      setNoteEventsModal({ row, events: [], loading: false, error: "Failed to load note logs." });
    }
  }

  useEffect(() => {
    consultationNotesEditor?.setEditable(
      collaborativeConsultationNotesEnabled &&
        consultationRecordType === "notes" &&
        newConsultationOpen &&
        !consultationLocked,
    );
  }, [
    collaborativeConsultationNotesEnabled,
    consultationLocked,
    consultationNotesEditor,
    consultationRecordType,
    newConsultationOpen,
  ]);

  useEffect(() => {
    if (!collaborativeConsultationNotesEnabled) return;
    if (!activeCollaborativeConsultation || !consultationYDoc) return;
    if (activeCollaborativeConsultation.id === suppressedCreateDraftId) return;
    const fields = consultationYFieldsRef.current;
    if (!fields) return;
    if (fields.get("open") === "true") return;

    const scheduled = activeCollaborativeConsultation.scheduled_at
      ? new Date(activeCollaborativeConsultation.scheduled_at)
      : null;
    const locked = activeCollaborativeConsultation.is_draft === false;

    fields.doc?.transact(() => {
      fields.set("open", "true");
      fields.set("locked", locked ? "true" : "false");
      fields.set("draftId", activeCollaborativeConsultation.id);
      fields.set(
        "date",
        scheduled && !Number.isNaN(scheduled.getTime())
          ? scheduled.toISOString().split("T")[0]
          : consultationDate,
      );
      fields.set(
        "hour",
        scheduled && !Number.isNaN(scheduled.getTime())
          ? scheduled.getHours().toString().padStart(2, "0")
          : consultationHour,
      );
      fields.set(
        "minute",
        scheduled && !Number.isNaN(scheduled.getTime())
          ? scheduled.getMinutes().toString().padStart(2, "0")
          : consultationMinute,
      );
      fields.set("doctorId", activeCollaborativeConsultation.doctor_user_id ?? "");
      fields.set("title", activeCollaborativeConsultation.title === "Draft" ? "" : activeCollaborativeConsultation.title);
      fields.set("recordType", "notes");
      fields.set("diagnosisCode", activeCollaborativeConsultation.diagnosis_code ?? "");
      fields.set("refIcd10", activeCollaborativeConsultation.ref_icd10 ?? "");
    });

    if (
      consultationYProviderSynced &&
      isConsultationYjsFragmentEmpty(consultationYDoc) &&
      consultationNotesEditor &&
      consultationNotesEditor.isEmpty &&
      activeCollaborativeConsultation.content &&
      !isBlankNotesHtml(activeCollaborativeConsultation.content)
    ) {
      consultationNotesEditor.commands.setContent(activeCollaborativeConsultation.content, {
        emitUpdate: false,
      });
    }
  }, [
    activeCollaborativeConsultation,
    collaborativeConsultationNotesEnabled,
    consultationDate,
    consultationHour,
    consultationMinute,
    consultationNotesEditor,
    consultationYDoc,
    consultationYProviderSynced,
    suppressedCreateDraftId,
  ]);

  const notesToolbarButtonClass = (active = false) =>
    "inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-2 text-[11px] font-medium transition-colors " +
    (active
      ? "border-sky-200 bg-sky-100 text-sky-800"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100");

  function setConsultationNotesLink() {
    if (!consultationNotesEditor) return;
    const previousUrl = consultationNotesEditor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl ?? "https://");
    if (url === null) return;

    const trimmed = url.trim();
    if (!trimmed) {
      consultationNotesEditor.chain().focus().unsetLink().run();
      return;
    }

    consultationNotesEditor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: trimmed })
      .run();
  }

  async function toggleConsultationLock() {
    if (consultationRecordType !== "notes") return;
    if (consultationLockSavingRef.current) return;
    const nextLocked = !consultationLocked;
    consultationLockSavingRef.current = true;

    if (newConsultationAutosaveTimerRef.current) {
      clearTimeout(newConsultationAutosaveTimerRef.current);
      newConsultationAutosaveTimerRef.current = null;
    }

    setConsultationLocked(nextLocked);
    const fields = consultationYFieldsRef.current;
    fields?.set("locked", nextLocked ? "true" : "false");
    try {
      const savedRow = await handleNewConsultationAutosave({ force: true, locked: nextLocked });

      if (nextLocked) {
        if (!savedRow) {
          setConsultationLocked(false);
          fields?.set("locked", "false");
          return;
        }

        finalizedCreateDraftIdsRef.current.add(savedRow.id);
        createRoomOpenAllowedRef.current = false;
        fields?.doc?.transact(() => {
          fields.set("open", "false");
          fields.set("locked", "false");
          fields.delete("draftId");
        });
        suppressNewConsultationAutosaveRef.current = true;
        try {
          clearConsultationYjsFragment(consultationYDoc);
          consultationNotesEditor?.commands.clearContent(false);
        } finally {
          window.setTimeout(() => {
            suppressNewConsultationAutosaveRef.current = false;
          }, 0);
        }
        setConsultationContentHtml("");
        consultationContentHtmlRef.current = "";
        setConsultationNoteMenuOpen(false);
        updateNewConsultationDraftId(null);
        setNewConsultationOpen(false);
        setConsultations((prev) => {
          const withoutDuplicateDraft = prev.filter(
            (row) =>
              row.id === savedRow.id ||
              row.collab_room_id !== consultationCollabRoomId ||
              row.is_draft !== true,
          );
          return withoutDuplicateDraft.some((row) => row.id === savedRow.id)
            ? withoutDuplicateDraft.map((row) => (row.id === savedRow.id ? savedRow : row))
            : [savedRow, ...withoutDuplicateDraft];
        });
      }
    } finally {
      consultationLockSavingRef.current = false;
    }
  }

  function handleConsultationNotesCanvasMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (!consultationNotesEditor) return;
    if (consultationLocked) return;

    const editorElement = event.currentTarget.querySelector(".ProseMirror") as HTMLElement | null;
    if (!editorElement) return;

    const targetNode = event.target as Node | null;
    const targetElement =
      targetNode instanceof HTMLElement ? targetNode : targetNode?.parentElement ?? null;
    const clickedEditorContent = !!targetElement && editorElement.contains(targetElement);

    if (clickedEditorContent && targetElement !== editorElement) {
      return;
    }

    const contentNodes = Array.from(editorElement.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        !child.classList.contains("collaboration-cursor__caret") &&
        !child.classList.contains("collaboration-cursor__label"),
    );
    const lastContentNode = contentNodes[contentNodes.length - 1] ?? null;
    const editorTop = editorElement.getBoundingClientRect().top;
    const lastContentBottom = lastContentNode?.getBoundingClientRect().bottom ?? editorTop;
    const clickedBelowContent = event.clientY >= lastContentBottom - 2;
    const clickedEditorCanvas = targetElement === editorElement || event.target === event.currentTarget;

    if (consultationNotesEditor.isEmpty || clickedEditorCanvas || clickedBelowContent) {
      event.preventDefault();
      consultationNotesEditor.chain().focus("end").run();
    }
  }

  useEffect(() => {
    const channel = supabaseClient.channel(`patient-consultation-edit-${patientId}`);
    editConsultationSyncChannelRef.current = channel;

    channel
      .on("broadcast", { event: "consultation-edit-sync" }, (event) => {
        const payload = event.payload as ConsultationEditSyncPayload | null;
        if (!payload || payload.senderClientId === consultationDraftClientIdRef.current) {
          return;
        }

        setConsultations((prev) =>
          prev.map((row) =>
            row.id === payload.consultationId
              ? {
                  ...row,
                  title: payload.title,
                  content: payload.contentHtml,
                  doctor_user_id: payload.doctorId || null,
                  diagnosis_code: payload.diagnosisCode || null,
                  ref_icd10: payload.refIcd10 || null,
                }
              : row,
          ),
        );

        if (!editConsultationModalOpen || editConsultationTarget?.id !== payload.consultationId) {
          return;
        }

        editConsultationRemoteApplyRef.current = true;
        setEditConsultationTitle(payload.title);
        setEditConsultationDoctorId(payload.doctorId);
        setEditConsultationDate(payload.date);
        setEditConsultationHour(payload.hour);
        setEditConsultationMinute(payload.minute);
        setEditConsultationDiagnosisCode(payload.diagnosisCode);
        setEditConsultationRefIcd10(payload.refIcd10);

        const editor = editConsultationContentRef.current;
        const hadFocus = document.activeElement === editor;
        const caretOffset = editor && hadFocus ? getContentEditableCaretOffset(editor) : null;

        if (payload.textOp) {
          const currentText = editor
            ? getEditorPlainText(editor)
            : editConsultationLocalTextRef.current || htmlToCaretText(editConsultationContent);
          const nextText = applyTextOperation(currentText, payload.textOp);
          const nextHtml = textToNotesHtml(nextText);
          const transformedCaretOffset = transformCaretOffsetForTextOperation(
            caretOffset,
            payload.textOp,
          );

          editConsultationLocalTextRef.current = nextText;
          editConsultationLastBroadcastTextRef.current = nextText;
          editConsultationLastSyncedHtmlRef.current = nextHtml;
          setEditConsultationContent(nextHtml);

          if (editor) {
            setEditorPlainText(editor, nextText);
            if (hadFocus) {
              editor.focus();
              restoreContentEditableCaretOffset(editor, transformedCaretOffset);
            }
          }

          if (nextHtml !== payload.contentHtml) {
            triggerEditConsultationAutosave();
          }
          return;
        }

        const mergedHtml = stripContentEditableCaretMarkers(payload.contentHtml);
        editConsultationLastSyncedHtmlRef.current = mergedHtml;
        editConsultationLocalTextRef.current = htmlToCaretText(mergedHtml);
        editConsultationLastBroadcastTextRef.current = editConsultationLocalTextRef.current;
        setEditConsultationContent(mergedHtml);

        if (editor && document.activeElement !== editor && editor.innerHTML !== mergedHtml) {
          editor.innerHTML = mergedHtml;
        }

        if (mergedHtml !== payload.contentHtml) {
          triggerEditConsultationAutosave();
        }
      })
      .subscribe();

    return () => {
      if (editConsultationSyncTimerRef.current) {
        clearTimeout(editConsultationSyncTimerRef.current);
        editConsultationSyncTimerRef.current = null;
      }
      editConsultationSyncChannelRef.current = null;
      void supabaseClient.removeChannel(channel);
    };
  }, [editConsultationModalOpen, editConsultationTarget?.id, patientId]);

  useEffect(() => {
    if (!collaborativeConsultationNotesEnabled) return;
    if (!newConsultationOpen || consultationRecordType !== "notes") return;
    if (consultationYApplyingRemoteRef.current) return;

    const fields = consultationYFieldsRef.current;
    if (!fields) return;

    fields.doc?.transact(() => {
      fields.set("date", consultationDate);
      fields.set("hour", consultationHour);
      fields.set("minute", consultationMinute);
      fields.set("doctorId", consultationDoctorId);
      fields.set("title", consultationTitle);
      fields.set("recordType", consultationRecordType);
      fields.set("diagnosisCode", consultationDiagnosisCode);
      fields.set("refIcd10", consultationRefIcd10);
      fields.set("locked", consultationLocked ? "true" : "false");
      if (newConsultationDraftId) fields.set("draftId", newConsultationDraftId);
    });
  }, [
    consultationDate,
    consultationDiagnosisCode,
    consultationDoctorId,
    consultationHour,
    consultationLocked,
    consultationMinute,
    consultationRecordType,
    consultationRefIcd10,
    consultationTitle,
    collaborativeConsultationNotesEnabled,
    newConsultationDraftId,
    newConsultationOpen,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function loadAxenitaPdfDocuments() {
      if (!patientFirstName || !patientLastName) return;

      try {
        setAxenitaPdfLoading(true);
        setAxenitaPdfError(null);

        const response = await fetch("/api/patient-docs/parse-pdfs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: patientFirstName,
            lastName: patientLastName,
            patientId,
          }),
        });

        if (!isMounted) return;

        if (!response.ok) {
          const errorData = await response.json();
          setAxenitaPdfError(errorData.error || "Failed to load PDF documents");
          setAxenitaPdfDocs([]);
          setAxenitaPdfLoading(false);
          return;
        }

        const data = await response.json();
        setAxenitaPdfDocs(data.documents || []);
        setAxenitaPdfLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        setAxenitaPdfError(err.message || "Failed to load PDF documents");
        setAxenitaPdfDocs([]);
        setAxenitaPdfLoading(false);
      }
    }

    void loadAxenitaPdfDocuments();

    return () => {
      isMounted = false;
    };
  }, [patientFirstName, patientLastName, patientId]);

  useEffect(() => {
    if (!invoiceModalOpen || typeof document === "undefined") return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [invoiceModalOpen]);

  // Fetch upcoming appointments for appointment-link toggle
  useEffect(() => {
    if (!invoiceApptLinkEnabled || invoicePatientAppointments.length > 0) return;
    fetch(`/api/patients/${patientId}/appointments?status=scheduled&upcoming=true`)
      .then(r => r.json())
      .then(d => setInvoicePatientAppointments(d.appointments || []))
      .catch(() => {});
  }, [invoiceApptLinkEnabled, patientId, invoicePatientAppointments.length]);

  useEffect(() => {
    let isMounted = true;

    async function loadInvoiceOptions() {
      try {
        const [
          { data: groupData },
          { data: serviceData },
          { data: categoryData },
          { data: groupServiceData },
        ] = await Promise.all([
          supabaseClient
            .from("service_groups")
            .select("id, name, discount_percent")
            .order("name", { ascending: true }),
          supabaseClient
            .from("services")
            .select("id, name, code, base_price, category_id, vat_status, vat_rate_pct")
            .order("name", { ascending: true }),
          supabaseClient
            .from("service_categories")
            .select("id, name, color")
            .order("name", { ascending: true }),
          supabaseClient
            .from("service_group_services")
            .select("group_id, service_id, discount_percent"),
        ]);

        if (!isMounted) return;

        if (groupData) {
          setInvoiceServiceGroups(groupData as InvoiceServiceGroup[]);
        } else {
          setInvoiceServiceGroups([]);
        }

        if (serviceData) {
          const normalized = (serviceData as any[]).map((row) => ({
            id: row.id as string,
            name: row.name as string,
            code: (row.code as string | null) ?? null,
            base_price:
              row.base_price !== null && row.base_price !== undefined
                ? Number(row.base_price)
                : 0,
            category_id:
              (row.category_id as string | null | undefined) ?? null,
            vat_status:
              (row.vat_status as "voll" | "befreit" | null | undefined) ?? null,
            vat_rate_pct:
              row.vat_rate_pct !== null && row.vat_rate_pct !== undefined
                ? Number(row.vat_rate_pct)
                : null,
          }));
          setInvoiceServices(normalized as InvoiceService[]);
        } else {
          setInvoiceServices([]);
        }

        if (categoryData) {
          setInvoiceServiceCategories(categoryData as InvoiceServiceCategory[]);
        } else {
          setInvoiceServiceCategories([]);
        }

        if (groupServiceData) {
          setInvoiceGroupServices(groupServiceData as InvoiceGroupServiceLink[]);
        } else {
          setInvoiceGroupServices([]);
        }
      } catch {
        if (!isMounted) return;
        setInvoiceServiceGroups([]);
        setInvoiceServices([]);
        setInvoiceServiceCategories([]);
        setInvoiceGroupServices([]);
      }
    }

    void loadInvoiceOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = taskName.trim();
    const content = taskContent.trim();

    if (!name) {
      setTaskSaveError("Task name is required.");
      return;
    }

    try {
      setTaskSaving(true);
      setTaskSaveError(null);

      const { data: authData } = await supabaseClient.auth.getUser();
      const authUser = authData?.user ?? null;

      let createdByUserId: string | null = null;
      let createdBy: string | null = null;

      if (authUser) {
        const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
        const first = (meta["first_name"] as string) || "";
        const last = (meta["last_name"] as string) || "";
        const fullName =
          [first, last].filter(Boolean).join(" ") || authUser.email || null;

        createdByUserId = authUser.id;
        createdBy = fullName;
      }

      const activityDateIso = taskActivityDate
        ? new Date(taskActivityDate).toISOString()
        : null;

      const assignedUserId = taskAssignedUserId || null;
      let assignedUserName: string | null = null;
      if (assignedUserId) {
        const assignedUser = userOptions.find((user) => user.id === assignedUserId);
        assignedUserName =
          (assignedUser?.full_name || assignedUser?.email || null) as
          | string
          | null;
      }

      const { error } = await supabaseClient.from("tasks").insert({
        patient_id: patientId,
        name,
        content: content || null,
        status: "not_started",
        priority: taskPriority,
        type: taskType,
        activity_date: activityDateIso,
        created_by_user_id: createdByUserId,
        created_by_name: createdBy,
        assigned_user_id: assignedUserId,
        assigned_user_name: assignedUserName,
      });

      if (error) {
        setTaskSaveError(error.message ?? "Failed to create task.");
        setTaskSaving(false);
        return;
      }

      setTaskName("");
      setTaskContent("");
      setTaskActivityDate("");
      setTaskAssignedUserId("");
      setTaskPriority("medium");
      setTaskType("todo");
      setTaskSaving(false);
      setTaskSaveError(null);
      setTaskModalOpen(false);
    } catch {
      setTaskSaveError("Unexpected error saving task.");
      setTaskSaving(false);
    }
  }

  async function handleArchiveConsultation(rowId: string) {
    if (!rowId) return false;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Archive this record? It will be moved to the archive and can be permanently deleted from there.",
      );
      if (!confirmed) return false;
    }

    try {
      setConsultationsError(null);

      // Determine if this is an invoice row or a consultation row
      const target = consultations.find(c => c.id === rowId);
      const table = target?.invoice_id ? "invoices" : "consultations";

      const { error } = await supabaseClient
        .from(table)
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
        })
        .eq("id", rowId);

      if (error) {
        setConsultationsError(
          error.message ?? "Failed to archive record.",
        );
        return false;
      }

      setConsultations((prev) =>
        prev.filter((row) => row.id !== rowId),
      );
      broadcastPatientRealtimeRefresh({ force: true });
      return true;
    } catch {
      setConsultationsError("Failed to archive record.");
      return false;
    }
  }

  async function handleDeleteConsultation(rowId: string) {
    if (!rowId) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Permanently delete this record? This cannot be undone.",
      );
      if (!confirmed) return;
    }

    try {
      setConsultationsError(null);

      // Determine if this is an invoice row or a consultation row
      const target = consultations.find(c => c.id === rowId);
      const table = target?.invoice_id ? "invoices" : "consultations";

      const { error } = await supabaseClient
        .from(table)
        .delete()
        .eq("id", rowId);

      if (error) {
        setConsultationsError(
          error.message ?? "Failed to delete consultation.",
        );
        return;
      }

      setConsultations((prev) =>
        prev.filter((row) => row.id !== rowId),
      );
      broadcastPatientRealtimeRefresh({ force: true });
    } catch {
      setConsultationsError("Failed to delete consultation.");
    }
  }

  function handleOpenEditConsultation(row: ConsultationRow) {
    setEditConsultationTarget(row);
    setEditConsultationTitle(row.title || "");
    setEditConsultationContent(row.content || "");
    editConsultationLastSyncedHtmlRef.current = row.content || "";
    editConsultationLocalTextRef.current = htmlToCaretText(row.content || "");
    editConsultationLastBroadcastTextRef.current = editConsultationLocalTextRef.current;
    editConsultationPendingTextOpRef.current = null;
    setEditConsultationDoctorId(row.doctor_user_id || "");
    setEditConsultationDiagnosisCode(row.diagnosis_code || "");
    setEditConsultationRefIcd10(row.ref_icd10 || "");
    if (row.scheduled_at) {
      const d = new Date(row.scheduled_at);
      if (!isNaN(d.getTime())) {
        setEditConsultationDate(d.toISOString().split("T")[0]);
        setEditConsultationHour(d.getHours().toString().padStart(2, "0"));
        setEditConsultationMinute(d.getMinutes().toString().padStart(2, "0"));
      }
    } else {
      setEditConsultationDate("");
      setEditConsultationHour("");
      setEditConsultationMinute("");
    }
    setEditConsultationModalOpen(true);
  }

  async function handleUnlockConsultationNote(row: ConsultationRow) {
    if (!row.id || row.record_type !== "notes") return;
    if (unlockingConsultationId || consultationLockSavingRef.current) return;

    if (newConsultationAutosaveTimerRef.current) {
      clearTimeout(newConsultationAutosaveTimerRef.current);
      newConsultationAutosaveTimerRef.current = null;
    }

    try {
      setUnlockingConsultationId(row.id);
      setConsultationsError(null);

      const contentHtml = row.content || "";
      const roomId = row.collab_room_id || `patient:${patientId}:consultation:${row.id}`;

      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      const response = await fetch("/api/consultation-drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          patientId,
          roomId,
          draftId: row.id,
          title: row.title || "Consultation Note",
          contentHtml,
          recordType: "notes",
          doctorId: row.doctor_user_id || "",
          doctorName: row.doctor_name || null,
          scheduledAt: row.scheduled_at || new Date().toISOString(),
          diagnosisCode: row.diagnosis_code || "",
          refIcd10: row.ref_icd10 || "",
          locked: false,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.draft) {
        setConsultationsError(result?.error ?? "Failed to unlock consultation note.");
        return;
      }

      const draftRow: ConsultationRow = {
        ...(result.draft as any),
        invoice_id: null,
        reference_number: null,
        linked_invoice_id: row.linked_invoice_id ?? null,
        linked_invoice_status: row.linked_invoice_status ?? null,
        linked_invoice_number: row.linked_invoice_number ?? null,
        medidata_status: row.medidata_status ?? null,
        invoice_pdf_path_tg: null,
        invoice_pdf_path_tp: null,
        invoice_pdf_path_reminder: null,
        invoice_pdf_path_receipt: null,
        invoice_due_date: null,
        invoice_reminder_level: 0,
        invoice_reminder_1_sent_at: null,
        invoice_reminder_2_sent_at: null,
        invoice_reminder_3_sent_at: null,
      };

      setConsultations((prev) =>
        prev.map((item) => (item.id === row.id ? draftRow : item)),
      );
      broadcastPatientRealtimeRefresh({ force: true });
    } catch {
      setConsultationsError("Failed to unlock consultation note.");
    } finally {
      setUnlockingConsultationId(null);
    }
  }

  async function openInvoiceFormFromConsultation(row: ConsultationRow) {
    setInvoiceFromConsultationId(row.id);
    setConsultationRecordType("invoice");
    setConsultationTitle(row.title || "");
    setConsultationDoctorId("");
    setInvoiceProviderId("");
    setConsultationDiagnosisCode(row.diagnosis_code || "");
    setConsultationRefIcd10(row.ref_icd10 || "");

    const now = new Date();
    setConsultationDate(formatLocalDateInputValue(now));
    setConsultationHour(now.getHours().toString().padStart(2, "0"));
    setConsultationMinute(now.getMinutes().toString().padStart(2, "0"));
    setInvoicePaymentMethod("");
    setInvoiceMode("individual");
    setInvoiceGroupId("");
    setInvoicePaymentTerm("full");
    setInvoiceExtraOption(null);
    setInvoiceInstallments([]);
    setInvoiceServiceLines([]);
    setInvoiceSelectedCategoryId("");
    setInvoiceSelectedServiceId("");
    setInvoiceDiagnosisCodes([]);
    setInvoiceDiagnosisInput("");

    if (row.doctor_user_id) {
      let mappedProviderId =
        userOptions.find((u) => u.id === row.doctor_user_id)?.provider_id ?? null;

      if (!mappedProviderId) {
        const { data: userRow } = await supabaseClient
          .from("users")
          .select("provider_id")
          .eq("id", row.doctor_user_id)
          .maybeSingle();
        mappedProviderId = userRow?.provider_id ?? null;
      }

      if (mappedProviderId) {
        if (medicalStaffOptions.some((staff) => staff.id === mappedProviderId)) {
          setConsultationDoctorId(mappedProviderId);
        }

        let billingProviderId = mappedProviderId;
        if (!billingEntityOptions.some((provider) => provider.id === billingProviderId)) {
          const sourceProvider = providerOptions.find((provider) => provider.id === mappedProviderId);
          if (sourceProvider?.gln) {
            const billingByGln = billingEntityOptions.find(
              (provider) => provider.gln === sourceProvider.gln,
            );
            if (billingByGln) billingProviderId = billingByGln.id;
          }
        }

        if (billingEntityOptions.some((provider) => provider.id === billingProviderId)) {
          setInvoiceProviderId(billingProviderId);
        }
      }
    }

    setNewConsultationOpen(true);
    void logConsultationNoteEvent(row, "invoice_form_opened", { source: "consultation_note" });
    setTimeout(() => {
      creationFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function openOtherRecordForm() {
    if (consultationSaving) return;
    lastLocalOpenAtRef.current = Date.now();
    const preservedExistingNote = preserveOpenCreateConsultationNote();
    const now = new Date();
    const datePart = formatLocalDateInputValue(now);
    const hourPart = now
      .getHours()
      .toString()
      .padStart(2, "0");
    const minutePart = now
      .getMinutes()
      .toString()
      .padStart(2, "0");
    const nextRecordType: ConsultationRecordType =
      recordTypeFilter && recordTypeFilter !== "notes" ? recordTypeFilter : "invoice";

    createRoomOpenAllowedRef.current = false;
    setConsultationDate(datePart);
    setConsultationHour(hourPart);
    setConsultationMinute(minutePart);
    setConsultationDoctorId("");
    setConsultationError(null);
    setConsultationTitle("");
    setConsultationDiagnosisCode("");
    setConsultationRefIcd10("");
    setInvoiceFromConsultationId(null);
    setConsultationRecordType(nextRecordType);
    setConsultationContentHtml("");
    consultationContentHtmlRef.current = "";
    setConsultationDurationSeconds(0);
    setConsultationStopwatchStartedAt(null);
    setConsultationStopwatchNow(Date.now());
    updateNewConsultationDraftId(null);
    setConsultationLocked(false);
    setNewConsultationAutosaveStatus("idle");
    setPrescriptionLines([]);
    setInvoicePaymentMethod("");
    setInvoiceMode("individual");
    setInvoiceGroupId("");
    setInvoicePaymentTerm("full");
    setInvoiceExtraOption(null);
    setInvoiceInstallments([]);
    setInvoiceServiceLines([]);
    setInvoiceSelectedCategoryId("");
    setInvoiceSelectedServiceId("");
    setInvoiceDiagnosisCodes([]);
    setInvoiceDiagnosisInput("");
    setMedProducts([createEmptyMedProduct()]);
    setMedIntakeNote("");
    setMedIntakeFromDate(formatLocalDateInputValue(new Date()));
    setMedDecisionSummary("");
    setMedShowInMediplan(true);
    setMedIsPrescription(true);
    setMedSelectedTemplateId("");
    setMedTemplateServiceFilter("");
    setMedTemplateFilter("all");
    if (currentUserId && nextRecordType !== "invoice") {
      setConsultationDoctorId(currentUserId);
    }
    const yfields = consultationYFieldsRef.current;
    consultationYDoc?.transact(() => {
      consultationNotesEditor?.commands.clearContent(false);
      yfields?.set("open", "true");
      yfields?.set("locked", "false");
      yfields?.set("date", datePart);
      yfields?.set("hour", hourPart);
      yfields?.set("minute", minutePart);
      yfields?.set("doctorId", currentUserId && nextRecordType !== "invoice" ? currentUserId : "");
      yfields?.set("title", "");
      yfields?.set("recordType", nextRecordType);
      yfields?.set("diagnosisCode", "");
      yfields?.set("refIcd10", "");
      yfields?.delete("draftId");
    });
    setNewConsultationOpen(true);
    setTimeout(() => {
      if (!preservedExistingNote) {
        creationFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  }

  // Sync edit consultation content to contentEditable div
  useEffect(() => {
    if (
      editConsultationModalOpen &&
      editConsultationContentRef.current &&
      document.activeElement !== editConsultationContentRef.current
    ) {
      editConsultationContentRef.current.innerHTML = editConsultationContent;
    }
  }, [editConsultationModalOpen, editConsultationTarget?.id]);

  function broadcastEditConsultationSync() {
    const channel = editConsultationSyncChannelRef.current;
    if (!channel || !editConsultationTarget) return;
    if (editConsultationRemoteApplyRef.current) {
      editConsultationRemoteApplyRef.current = false;
      return;
    }

    if (editConsultationSyncTimerRef.current) {
      clearTimeout(editConsultationSyncTimerRef.current);
    }

    const currentEditText = editConsultationContentRef.current
      ? getEditorPlainText(editConsultationContentRef.current)
      : editConsultationLocalTextRef.current;
    const currentEditHtml = textToNotesHtml(currentEditText);
    const editTextOp = buildTextOperation(
      editConsultationLastBroadcastTextRef.current,
      currentEditText,
    );

    const payload: ConsultationEditSyncPayload = {
      senderClientId: consultationDraftClientIdRef.current,
      consultationId: editConsultationTarget.id,
      title: editConsultationTitle,
      contentHtml: currentEditHtml || editConsultationContent,
      textOp: editTextOp,
      doctorId: editConsultationDoctorId,
      date: editConsultationDate,
      hour: editConsultationHour,
      minute: editConsultationMinute,
      diagnosisCode: editConsultationDiagnosisCode,
      refIcd10: editConsultationRefIcd10,
    };

    editConsultationSyncTimerRef.current = setTimeout(() => {
      editConsultationLastSyncedHtmlRef.current = payload.contentHtml;
      editConsultationLastBroadcastTextRef.current = currentEditText;
      void channel.send({
        type: "broadcast",
        event: "consultation-edit-sync",
        payload,
      });
      editConsultationPendingTextOpRef.current = null;
    }, 80);
  }

  useEffect(() => {
    if (!editConsultationModalOpen || !editConsultationTarget) return;
    broadcastEditConsultationSync();
  }, [
    editConsultationContent,
    editConsultationDate,
    editConsultationDiagnosisCode,
    editConsultationDoctorId,
    editConsultationHour,
    editConsultationMinute,
    editConsultationModalOpen,
    editConsultationRefIcd10,
    editConsultationTarget,
    editConsultationTitle,
  ]);

  // Cleanup autosave timer when modal closes
  useEffect(() => {
    if (!editConsultationModalOpen && editConsultationAutosaveTimerRef.current) {
      clearTimeout(editConsultationAutosaveTimerRef.current);
      editConsultationAutosaveTimerRef.current = null;
      setEditConsultationAutosaveStatus("idle");
    }
  }, [editConsultationModalOpen]);

  async function handleSaveEditInvoice() {
    if (!editInvoiceTarget) return;

    setEditInvoiceSaving(true);
    try {
      const { error } = await supabaseClient
        .from("invoices")
        .update({ title: editInvoiceTitle || null })
        .eq("id", editInvoiceTarget.invoice_id);

      if (error) {
        alert(error.message ?? "Failed to update invoice.");
        return;
      }

      setConsultations((prev) =>
        prev.map((row) =>
          row.invoice_id === editInvoiceTarget.invoice_id
            ? { ...row, title: editInvoiceTitle }
            : row
        )
      );
      broadcastPatientRealtimeRefresh({ force: true });

      setEditInvoiceModalOpen(false);
      setEditInvoiceTarget(null);
    } catch (err) {
      console.error("Error updating invoice:", err);
      alert("Failed to update invoice.");
    } finally {
      setEditInvoiceSaving(false);
    }
  }

  async function handleOpenInstallments(invoice: ConsultationRow) {
    if (!invoice.invoice_id) return;
    setInstallmentsTarget(invoice);
    setInstallmentsModalOpen(true);
    setInstallmentsLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from("invoice_installments")
        .select("*")
        .eq("invoice_id", invoice.invoice_id)
        .order("installment_number", { ascending: true });
      if (error) {
        console.error("Failed to load installments:", error);
        setInstallments([]);
      } else {
        setInstallments((data ?? []) as DbInstallment[]);
      }
    } catch (err) {
      console.error("Error loading installments:", err);
      setInstallments([]);
    } finally {
      setInstallmentsLoading(false);
    }
  }

  function handleAddInstallment() {
    if (!installmentsTarget) return;
    const totalAmount = installmentsTarget.invoice_total_amount ?? 0;
    const allocated = installments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
    const remaining = Math.max(0, totalAmount - allocated);
    const nextNumber = installments.length > 0
      ? Math.max(...installments.map(i => i.installment_number)) + 1
      : 1;
    setInstallments((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        invoice_id: installmentsTarget.invoice_id!,
        installment_number: nextNumber,
        amount: Math.round(remaining * 100) / 100,
        due_date: null,
        payment_method: null,
        status: "PENDING",
        paid_amount: 0,
        paid_at: null,
        invoice_number: null,
        reference_number: null,
        notes: null,
        payrexx_gateway_id: null,
        payrexx_gateway_hash: null,
        payrexx_payment_link: null,
        payrexx_payment_status: null,
        payrexx_transaction_id: null,
        payrexx_paid_at: null,
        created_at: new Date().toISOString(),
      },
    ]);
  }

  function handleRemoveInstallment(index: number) {
    setInstallments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateInstallment(index: number, updates: Partial<DbInstallment>) {
    setInstallments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }

  async function handleSaveInstallments() {
    if (!installmentsTarget?.invoice_id) return;
    setInstallmentsSaving(true);
    try {
      // Delete all existing installments for this invoice
      const { error: deleteError } = await supabaseClient
        .from("invoice_installments")
        .delete()
        .eq("invoice_id", installmentsTarget.invoice_id);
      if (deleteError) {
        alert("Failed to save installments: " + deleteError.message);
        return;
      }

      // Get parent invoice number for generating installment invoice numbers
      const { data: parentInvoiceData } = await supabaseClient
        .from("invoices")
        .select("invoice_number")
        .eq("id", installmentsTarget.invoice_id)
        .single();
      const parentInvoiceNumber = parentInvoiceData?.invoice_number || installmentsTarget.consultation_id;

      // Insert all current installments
      let savedInstallments: DbInstallment[] = [];
      if (installments.length > 0) {
        const rows = installments.map((inst, idx) => {
          const instNumber = idx + 1;
          const instInvoiceNumber = `${parentInvoiceNumber}${instNumber.toString().padStart(4, '0')}`;
          const instReference = generateSwissReference(instInvoiceNumber);
          return {
            invoice_id: installmentsTarget.invoice_id,
            installment_number: instNumber,
            amount: inst.amount,
            due_date: inst.due_date || null,
            payment_method: inst.payment_method || null,
            status: inst.status,
            paid_amount: inst.paid_amount || 0,
            paid_at: inst.paid_at || null,
            invoice_number: instInvoiceNumber,
            reference_number: instReference,
            notes: inst.notes || null,
            payrexx_gateway_id: inst.payrexx_gateway_id || null,
            payrexx_gateway_hash: inst.payrexx_gateway_hash || null,
            payrexx_payment_link: inst.payrexx_payment_link || null,
            payrexx_payment_status: inst.payrexx_payment_status || null,
            payrexx_transaction_id: inst.payrexx_transaction_id || null,
            payrexx_paid_at: inst.payrexx_paid_at || null,
          };
        });

        const { data: inserted, error: insertError } = await supabaseClient
          .from("invoice_installments")
          .insert(rows)
          .select("*");

        if (insertError) {
          alert("Failed to save installments: " + insertError.message);
          return;
        }
        savedInstallments = (inserted ?? []) as DbInstallment[];
        setInstallments(savedInstallments);
      }

      // Update invoice payment_method to "Installment" if installments exist
      if (installments.length > 0) {
        await supabaseClient
          .from("invoices")
          .update({ payment_method: "Installment" })
          .eq("id", installmentsTarget.invoice_id);
      }

      // Create Payrexx gateways for Online/Card/Cash installments that don't have one yet
      for (const inst of savedInstallments) {
        const pm = (inst.payment_method || "").toLowerCase();
        if ((pm.includes("online") || pm.includes("card") || pm.includes("cash")) && !inst.payrexx_payment_link && inst.status !== "PAID") {
          try {
            const res = await fetch("/api/payments/create-installment-gateway", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ installmentId: inst.id }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.paymentLink) {
                // Update local state with the new payment link
                setInstallments((prev) =>
                  prev.map((i) =>
                    i.id === inst.id
                      ? { ...i, payrexx_payment_link: data.paymentLink, payrexx_gateway_id: data.gatewayId, payrexx_payment_status: "waiting" }
                      : i
                  )
                );
              }
            }
          } catch (err) {
            console.error("Failed to create Payrexx gateway for installment:", inst.id, err);
          }
        }
      }

      // Update installment summaries for outside UI
      if (installmentsTarget.invoice_id) {
        const latestInstallments = savedInstallments.length > 0 ? savedInstallments : [];
        const totalAllocated = latestInstallments.reduce((s, i) => s + Number(i.amount || 0), 0);
        const totalPaidAmt = latestInstallments.filter((i) => i.status === "PAID").reduce((s, i) => s + Number(i.amount || 0), 0);
        const paidCount = latestInstallments.filter((i) => i.status === "PAID").length;
        setInstallmentSummaries((prev) => ({
          ...prev,
          [installmentsTarget.invoice_id!]: { total: totalAllocated, paid: totalPaidAmt, count: latestInstallments.length, paidCount },
        }));
      }

      alert("Installments saved successfully.");
    } catch (err) {
      console.error("Error saving installments:", err);
      alert("Failed to save installments.");
    } finally {
      setInstallmentsSaving(false);
    }
  }

  async function handleMarkInstallmentPaid(index: number) {
    const inst = installments[index];
    if (!inst || !installmentsTarget?.invoice_id) return;
    const newStatus = inst.status === "PAID" ? "PENDING" : "PAID";
    const paidAt = newStatus === "PAID" ? new Date().toISOString() : null;
    const paidAmount = newStatus === "PAID" ? inst.amount : 0;

    // Update local installment state
    const updatedInstallments = installments.map((i, idx) =>
      idx === index ? { ...i, status: newStatus as "PAID" | "PENDING", paid_amount: paidAmount, paid_at: paidAt } : i
    );
    setInstallments(updatedInstallments);

    // Persist installment status to DB (if it's a saved installment, not a new one)
    if (!inst.id.startsWith("new-")) {
      await supabaseClient
        .from("invoice_installments")
        .update({ status: newStatus, paid_amount: paidAmount, paid_at: paidAt })
        .eq("id", inst.id);
    }

    // Recalculate master invoice paid_amount and status
    const totalPaid = updatedInstallments
      .filter((i) => i.status === "PAID")
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const invoiceTotal = installmentsTarget.invoice_total_amount ?? 0;

    let invoiceStatus: InvoiceStatus = "OPEN";
    if (totalPaid >= invoiceTotal - 0.01 && invoiceTotal > 0) {
      invoiceStatus = "PAID";
    } else if (totalPaid > 0) {
      invoiceStatus = "PARTIAL_PAID";
    }

    // Update master invoice in DB
    const invoiceUpdate: Record<string, unknown> = {
      paid_amount: totalPaid,
      status: invoiceStatus,
    };
    if (invoiceStatus === "PAID") {
      invoiceUpdate.paid_at = paidAt;
    }
    await supabaseClient
      .from("invoices")
      .update(invoiceUpdate)
      .eq("id", installmentsTarget.invoice_id);

    // Update local consultations state
    setConsultations((prev) =>
      prev.map((row) =>
        row.invoice_id === installmentsTarget.invoice_id
          ? {
              ...row,
              invoice_paid_amount: totalPaid,
              invoice_status: invoiceStatus,
              invoice_is_paid: invoiceStatus === "PAID",
            }
          : row
      )
    );

    // Update installmentsTarget to reflect new status
    setInstallmentsTarget((prev) =>
      prev ? { ...prev, invoice_paid_amount: totalPaid, invoice_status: invoiceStatus, invoice_is_paid: invoiceStatus === "PAID" } : prev
    );

    // Update installment summaries for outside UI
    const paidCount = updatedInstallments.filter((i) => i.status === "PAID").length;
    setInstallmentSummaries((prev) => ({
      ...prev,
      [installmentsTarget.invoice_id!]: {
        total: updatedInstallments.reduce((s, i) => s + Number(i.amount || 0), 0),
        paid: totalPaid,
        count: updatedInstallments.length,
        paidCount,
      },
    }));
  }

  async function handleGenerateInstallmentInvoice(inst: DbInstallment) {
    if (!installmentsTarget?.invoice_id || inst.id.startsWith("new-")) {
      alert("Please save installments first before generating an invoice.");
      return;
    }

    setInstallmentPdfGenerating(inst.id);

    // Check if sub-invoice already exists for this installment
    const { data: existing } = await supabaseClient
      .from("invoices")
      .select("id, invoice_number")
      .eq("installment_id", inst.id)
      .maybeSingle();

    if (existing) {
      // Already exists - generate/regenerate PDF
      try {
        const res = await fetch("/api/invoices/generate-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: existing.id }),
        });
        const data = await res.json();
        if (data.pdfUrl) {
          window.open(data.pdfUrl, "_blank");
        } else {
          alert("Failed to generate PDF: " + (data.error || "Unknown error"));
        }
      } catch (err) {
        console.error("Error generating installment PDF:", err);
        alert("Failed to generate installment invoice PDF.");
      } finally {
        setInstallmentPdfGenerating(null);
      }
      return;
    }

    // Fetch parent invoice data to clone
    const { data: parentInvoice, error: parentError } = await supabaseClient
      .from("invoices")
      .select("*")
      .eq("id", installmentsTarget.invoice_id)
      .single();

    if (parentError || !parentInvoice) {
      alert("Failed to fetch parent invoice data.");
      return;
    }

    // Create sub-invoice number: master invoice + 4-digit installment number (e.g., 10000010001, 10000010002)
    // This ensures pure numeric format for Sumex1 Swiss QR reference compatibility
    const subInvoiceNumber = `${parentInvoice.invoice_number}${inst.installment_number.toString().padStart(4, '0')}`;

    // For online payment, use existing Payrexx data from installment record
    let payrexxData: any = {};
    const instPaymentMethod = inst.payment_method || parentInvoice.payment_method;
    const isPayrexxPayment = instPaymentMethod === "Online Payment" || instPaymentMethod === "Online" || instPaymentMethod === "Card";
    console.log(`[Installment Invoice] Payment method: "${instPaymentMethod}", isPayrexxPayment: ${isPayrexxPayment}`);
    
    if (isPayrexxPayment && inst.payrexx_payment_link) {
      // Use existing Payrexx data from the installment record
      payrexxData = {
        payrexx_gateway_id: inst.payrexx_gateway_id,
        payrexx_gateway_hash: inst.payrexx_gateway_hash,
        payrexx_payment_link: inst.payrexx_payment_link,
        payrexx_payment_status: inst.payrexx_payment_status || "waiting",
      };
      console.log(`[Installment Invoice] Using existing Payrexx link from installment: ${inst.payrexx_payment_link}`);
    }

    // Create sub-invoice
    const { data: subInvoice, error: subError } = await supabaseClient
      .from("invoices")
      .insert({
        patient_id: parentInvoice.patient_id,
        invoice_number: subInvoiceNumber,
        title: `${parentInvoice.title || parentInvoice.invoice_number} - Installment ${inst.installment_number}`,
        invoice_date: inst.due_date || parentInvoice.invoice_date,
        treatment_date: parentInvoice.treatment_date,
        doctor_user_id: parentInvoice.doctor_user_id,
        doctor_name: parentInvoice.doctor_name,
        provider_id: parentInvoice.provider_id,
        provider_name: parentInvoice.provider_name,
        provider_gln: parentInvoice.provider_gln,
        provider_zsr: parentInvoice.provider_zsr,
        provider_iban: parentInvoice.provider_iban,
        doctor_gln: parentInvoice.doctor_gln,
        doctor_zsr: parentInvoice.doctor_zsr,
        doctor_canton: parentInvoice.doctor_canton,
        subtotal: inst.amount,
        vat_amount: Math.round(
          ((Number(parentInvoice.vat_amount) || 0) *
            inst.amount) /
            (Number(parentInvoice.total_amount) || 1) *
            100,
        ) / 100,
        total_amount: inst.amount,
        status: inst.status === "PAID" ? "PAID" : "OPEN",
        paid_amount: inst.status === "PAID" ? inst.amount : 0,
        is_complimentary: false,
        payment_method: inst.payment_method || parentInvoice.payment_method,
        created_by_user_id: parentInvoice.created_by_user_id,
        created_by_name: parentInvoice.created_by_name,
        is_archived: false,
        reference_number: generateSwissReference(subInvoiceNumber),
        parent_invoice_id: installmentsTarget.invoice_id,
        installment_id: inst.id,
        treatment_canton: parentInvoice.treatment_canton,
        billing_type: parentInvoice.billing_type || "TG",
        health_insurance_law: parentInvoice.health_insurance_law,
        ...payrexxData,
      })
      .select("id")
      .single();

    if (subError || !subInvoice) {
      alert("Failed to create installment invoice: " + (subError?.message || "Unknown error"));
      setInstallmentPdfGenerating(null);
      return;
    }

    // Copy line items from parent, scaling amounts proportionally
    const { data: parentLineItems } = await supabaseClient
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", installmentsTarget.invoice_id)
      .order("sort_order", { ascending: true });

    if (parentLineItems && parentLineItems.length > 0) {
      const parentTotal = Number(parentInvoice.total_amount) || 1;
      const ratio = inst.amount / parentTotal;

      const scaledItems = parentLineItems.map((item: Record<string, unknown>, idx: number) => ({
        invoice_id: subInvoice.id,
        name: item.name,
        code: item.code,
        quantity: item.quantity,
        unit_price: Math.round(Number(item.unit_price || 0) * ratio * 100) / 100,
        total_price: Math.round(Number(item.total_price || 0) * ratio * 100) / 100,
        vat_rate: item.vat_rate ?? "FREE",
        vat_rate_value: Number(item.vat_rate_value) || 0,
        vat_amount: Math.round(Number(item.vat_amount || 0) * ratio * 100) / 100,
        sort_order: idx,
        tariff_code: item.tariff_code,
        catalog_name: item.catalog_name,
        provider_gln: item.provider_gln,
        responsible_gln: item.responsible_gln,
        date_begin: item.date_begin,
      }));

      await supabaseClient.from("invoice_line_items").insert(scaledItems);
    }

    // Generate PDF
    try {
      const res = await fetch("/api/invoices/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: subInvoice.id }),
      });
      const data = await res.json();
      if (data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
      } else {
        alert("Installment invoice created but PDF generation failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Error generating installment PDF:", err);
      alert("Installment invoice created. PDF generation failed.");
    } finally {
      setInstallmentPdfGenerating(null);
    }
  }

  async function handleSaveEditConsultation() {
    if (!editConsultationTarget) return;

    setEditConsultationSaving(true);
    try {
      // Build scheduled_at from date/hour/minute
      let scheduledAt: string | null = editConsultationTarget.scheduled_at;
      if (editConsultationDate) {
        const h = editConsultationHour || "00";
        const m = editConsultationMinute || "00";
        scheduledAt = new Date(`${editConsultationDate}T${h}:${m}:00`).toISOString();
      }

      // Find doctor name from userOptions
      let doctorName: string | null = editConsultationTarget.doctor_name;
      if (editConsultationDoctorId) {
        const doctor = userOptions.find((u) => u.id === editConsultationDoctorId);
        if (doctor) {
          doctorName = (doctor.full_name || doctor.email || "Doctor") as string;
        }
      } else {
        doctorName = null;
      }

      // Get HTML content from contentEditable div
      const htmlContent = editConsultationContentRef.current
        ? textToNotesHtml(getEditorPlainText(editConsultationContentRef.current))
        : editConsultationContent;

      const { error } = await supabaseClient
        .from("consultations")
        .update({
          title: editConsultationTitle,
          content: htmlContent,
          doctor_user_id: editConsultationDoctorId || null,
          doctor_name: doctorName,
          scheduled_at: scheduledAt,
          diagnosis_code: editConsultationDiagnosisCode.trim() || null,
          ref_icd10: editConsultationRefIcd10.trim() || null,
        })
        .eq("id", editConsultationTarget.id);

      if (error) {
        setConsultationsError(error.message ?? "Failed to update consultation.");
        return;
      }

      setConsultations((prev) =>
        prev.map((row) =>
          row.id === editConsultationTarget.id
            ? {
                ...row,
                title: editConsultationTitle,
                content: htmlContent,
                doctor_user_id: editConsultationDoctorId || null,
                doctor_name: doctorName,
                scheduled_at: scheduledAt || row.scheduled_at,
                diagnosis_code: editConsultationDiagnosisCode.trim() || null,
                ref_icd10: editConsultationRefIcd10.trim() || null,
              }
            : row
        )
      );
      editConsultationLastSyncedHtmlRef.current = htmlContent;
      broadcastPatientRealtimeRefresh({ force: true });

      setEditConsultationModalOpen(false);
      setEditConsultationTarget(null);
      setEditConsultationAutosaveStatus("idle");
    } catch {
      setConsultationsError("Failed to update consultation.");
    } finally {
      setEditConsultationSaving(false);
    }
  }

  // Autosave function - saves without closing modal
  async function handleAutosaveEditConsultation() {
    if (!editConsultationTarget || editConsultationSaving) return;

    setEditConsultationAutosaveStatus("saving");
    try {
      // Build scheduled_at from date/hour/minute
      let scheduledAt: string | null = editConsultationTarget.scheduled_at;
      if (editConsultationDate) {
        const h = editConsultationHour || "00";
        const m = editConsultationMinute || "00";
        scheduledAt = new Date(`${editConsultationDate}T${h}:${m}:00`).toISOString();
      }

      // Find doctor name from userOptions
      let doctorName: string | null = editConsultationTarget.doctor_name;
      if (editConsultationDoctorId) {
        const doctor = userOptions.find((u) => u.id === editConsultationDoctorId);
        if (doctor) {
          doctorName = (doctor.full_name || doctor.email || "Doctor") as string;
        }
      } else {
        doctorName = null;
      }

      // Get HTML content from contentEditable div
      const htmlContent = editConsultationContentRef.current
        ? textToNotesHtml(getEditorPlainText(editConsultationContentRef.current))
        : editConsultationContent;

      const { error } = await supabaseClient
        .from("consultations")
        .update({
          title: editConsultationTitle,
          content: htmlContent,
          doctor_user_id: editConsultationDoctorId || null,
          doctor_name: doctorName,
          scheduled_at: scheduledAt,
          diagnosis_code: editConsultationDiagnosisCode.trim() || null,
          ref_icd10: editConsultationRefIcd10.trim() || null,
        })
        .eq("id", editConsultationTarget.id);

      if (error) {
        console.error("Autosave failed:", error.message);
        setEditConsultationAutosaveStatus("idle");
        return;
      }

      // Update local state silently
      setConsultations((prev) =>
        prev.map((row) =>
          row.id === editConsultationTarget.id
            ? {
                ...row,
                title: editConsultationTitle,
                content: htmlContent,
                doctor_user_id: editConsultationDoctorId || null,
                doctor_name: doctorName,
                scheduled_at: scheduledAt || row.scheduled_at,
                diagnosis_code: editConsultationDiagnosisCode.trim() || null,
                ref_icd10: editConsultationRefIcd10.trim() || null,
              }
            : row
        )
      );
      editConsultationLastSyncedHtmlRef.current = htmlContent;

      setEditConsultationAutosaveStatus("saved");
      // Reset to idle after 2 seconds
      setTimeout(() => setEditConsultationAutosaveStatus("idle"), 2000);
    } catch {
      console.error("Autosave failed");
      setEditConsultationAutosaveStatus("idle");
    }
  }

  // Trigger autosave when edit fields change (debounced)
  function triggerEditConsultationAutosave() {
    if (!editConsultationTarget) return;
    
    // Clear existing timer
    if (editConsultationAutosaveTimerRef.current) {
      clearTimeout(editConsultationAutosaveTimerRef.current);
    }
    
    setEditConsultationAutosaveStatus("pending");
    
    // Set new timer for 1 second
    editConsultationAutosaveTimerRef.current = setTimeout(() => {
      void handleAutosaveEditConsultation();
    }, 1000);
  }

  // ========== NEW CONSULTATION AUTOSAVE ==========
  // Creates a draft consultation on first input, then auto-saves after 1 second of inactivity

  async function createCollaborativeConsultationNote() {
    if (consultationSaving) return;

    try {
      setConsultationSaving(true);
      setConsultationsError(null);
      setConsultationError(null);

      const now = new Date();
      const datePart = formatLocalDateInputValue(now);
      const hourPart = now.getHours().toString().padStart(2, "0");
      const minutePart = now.getMinutes().toString().padStart(2, "0");
      const secondPart = now.getSeconds().toString().padStart(2, "0");
      const scheduledAt = new Date(`${datePart}T${hourPart}:${minutePart}:${secondPart}`).toISOString();
      const roomUuid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}00000000`.slice(0, 8) + "-0000-4000-8000-000000000000";
      const roomId = `patient:${patientId}:consultation:${roomUuid}`;
      const doctor = currentMedicalStaffProvider;

      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const response = await fetch("/api/consultation-drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          patientId,
          roomId,
          title: "Consultation Note",
          contentHtml: buildBlankConsultationNotesHtml(),
          recordType: "notes",
          doctorId: doctor?.id ?? "",
          doctorName: doctor?.name || doctor?.email || null,
          scheduledAt,
          diagnosisCode: "",
          refIcd10: "",
          locked: false,
          requestId,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.draft) {
        const message = result?.error ?? "Failed to create consultation note.";
        setConsultationsError(message);
        return;
      }

      const newRow: ConsultationRow = {
        ...(result.draft as any),
        invoice_id: null,
        reference_number: null,
        linked_invoice_id: null,
        linked_invoice_status: null,
        linked_invoice_number: null,
        medidata_status: null,
        invoice_pdf_path_tg: null,
        invoice_pdf_path_tp: null,
        invoice_pdf_path_reminder: null,
        invoice_pdf_path_receipt: null,
        invoice_due_date: null,
        invoice_reminder_level: 0,
        invoice_reminder_1_sent_at: null,
        invoice_reminder_2_sent_at: null,
        invoice_reminder_3_sent_at: null,
      };

      setConsultations((prev) =>
        prev.some((row) => row.id === newRow.id) ? prev : [newRow, ...prev],
      );
      broadcastPatientRealtimeRefresh({ force: true });
      window.setTimeout(() => {
        document.getElementById(`consultation-note-${newRow.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (error) {
      console.error("Failed to create collaborative consultation note:", error);
      setConsultationsError("Failed to create consultation note.");
    } finally {
      setConsultationSaving(false);
    }
  }
  
  async function handleNewConsultationAutosave(options: { force?: boolean; locked?: boolean } = {}) {
    if (consultationRecordType !== "notes") return;
    if (suppressNewConsultationAutosaveRef.current) return null;
    if (!options.force && !newConsultationOpenRef.current) return null;

    if (options.locked === true && newConsultationAutosaveInFlightRef.current) {
      await newConsultationAutosaveInFlightRef.current.catch(() => null);
    }

    const runAutosave = (async () => {
    const autosaveSeq = ++newConsultationAutosaveSeqRef.current;

    const htmlContent = consultationNotesEditor
      ? consultationNotesEditor.getHTML()
      : consultationContentHtmlRef.current || consultationContentHtml;

    if (!options.force && !consultationTitle.trim() && isBlankNotesHtml(htmlContent)) return null;

    setNewConsultationAutosaveStatus("saving");

    try {
      const dateToUse = consultationDate || new Date().toISOString().split("T")[0];
      const h = consultationHour || "00";
      const m = consultationMinute || "00";
      const scheduledAt = new Date(`${dateToUse}T${h}:${m}:00`).toISOString();
      const doctor = consultationDoctorId
        ? medicalStaffOptions.find((u) => u.id === consultationDoctorId)
        : null;
      const doctorName = doctor?.name || null;

      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      const response = await fetch("/api/consultation-drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          patientId,
          roomId: consultationCollabRoomId,
          draftId: newConsultationDraftIdRef.current,
          title: consultationTitle.trim() || "Consultation Note",
          contentHtml: htmlContent,
          recordType: "notes",
          doctorId: consultationDoctorId,
          doctorName,
          scheduledAt,
          diagnosisCode: consultationDiagnosisCode,
          refIcd10: consultationRefIcd10,
          locked: options.locked ?? consultationLocked,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.draft) {
        if (autosaveSeq !== newConsultationAutosaveSeqRef.current) return null;
        console.error("Autosave failed:", result?.error ?? response.statusText);
        setNewConsultationAutosaveStatus("idle");
        return null;
      }

      if (autosaveSeq !== newConsultationAutosaveSeqRef.current) {
        return null;
      }

      const data = result.draft;
      if (data.is_draft === false) {
        updateNewConsultationDraftId(null);
        consultationYFieldsRef.current?.delete("draftId");
      } else {
        updateNewConsultationDraftId(data.id);
        consultationYFieldsRef.current?.set("draftId", data.id);
      }
      const newRow: ConsultationRow = {
        ...data,
        invoice_id: null,
        reference_number: null,
        linked_invoice_id: null,
        linked_invoice_status: null,
        linked_invoice_number: null,
        medidata_status: null,
        invoice_pdf_path_tg: null,
        invoice_pdf_path_tp: null,
        invoice_pdf_path_reminder: null,
        invoice_pdf_path_receipt: null,
        invoice_due_date: null,
        invoice_reminder_level: 0,
        invoice_reminder_1_sent_at: null,
        invoice_reminder_2_sent_at: null,
        invoice_reminder_3_sent_at: null,
      };
      let shouldBroadcastDraftChange = false;
      setConsultations((prev) => {
        const exists = prev.some((row) => row.id === data.id);
        if (!exists) {
          shouldBroadcastDraftChange = true;
          return [newRow, ...prev];
        }

        return prev.map((row) => {
          if (row.id !== data.id) return row;
          const metadataChanged =
            row.title !== newRow.title ||
            row.doctor_user_id !== newRow.doctor_user_id ||
            row.doctor_name !== newRow.doctor_name ||
            row.scheduled_at !== newRow.scheduled_at ||
            row.diagnosis_code !== newRow.diagnosis_code ||
            row.ref_icd10 !== newRow.ref_icd10 ||
            row.is_draft !== newRow.is_draft;

          return metadataChanged ? { ...newRow, content: row.content } : row;
        });
      });
      if (data.is_draft === false || shouldBroadcastDraftChange) {
        broadcastPatientRealtimeRefresh({ force: data.is_draft === false });
      }

      setNewConsultationAutosaveStatus("saved");
      setTimeout(() => setNewConsultationAutosaveStatus("idle"), 2000);
      return newRow;
    } catch (err) {
      console.error("Autosave failed:", err);
      setNewConsultationAutosaveStatus("idle");
      return null;
    }
    })();

    newConsultationAutosaveInFlightRef.current = runAutosave;
    try {
      return await runAutosave;
    } finally {
      if (newConsultationAutosaveInFlightRef.current === runAutosave) {
        newConsultationAutosaveInFlightRef.current = null;
      }
    }
  }

  function preserveOpenCreateConsultationNote(sourceDraftId = newConsultationDraftIdRef.current) {
    if (!newConsultationOpenRef.current || consultationRecordType !== "notes" || consultationLocked) {
      return false;
    }

    const html = consultationNotesEditor?.getHTML() ?? (consultationContentHtmlRef.current || consultationContentHtml);
    if (!consultationTitle.trim() && isBlankNotesHtml(html)) return false;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

    setPendingCreateConsultationNotes((prev) => {
      if (
        sourceDraftId &&
        prev.some((item) => item.sourceDraftId === sourceDraftId)
      ) {
        return prev;
      }

      return [
        {
          id,
          sourceDraftId,
          date: consultationDate,
          hour: consultationHour,
          minute: consultationMinute,
          doctorId: consultationDoctorId,
          title: consultationTitle,
          diagnosisCode: consultationDiagnosisCode,
          refIcd10: consultationRefIcd10,
          contentHtml: html,
        },
        ...prev,
      ];
    });

    return true;
  }

  async function preserveAndCloseOpenCreateNoteForInvoice() {
    if (!newConsultationOpenRef.current || consultationRecordType !== "notes" || consultationLocked) {
      return null;
    }

    if (newConsultationAutosaveTimerRef.current) {
      clearTimeout(newConsultationAutosaveTimerRef.current);
      newConsultationAutosaveTimerRef.current = null;
    }

    const inFlightRow = await newConsultationAutosaveInFlightRef.current?.catch(() => null);
    const savedRow = await handleNewConsultationAutosave({ force: true });
    const sourceDraftId =
      savedRow?.id ??
      inFlightRow?.id ??
      newConsultationDraftIdRef.current;

    const preserved = preserveOpenCreateConsultationNote(sourceDraftId);
    setSuppressedCreateDraftId(sourceDraftId);
    consultationYFieldsRef.current?.set("open", "false");
    return sourceDraftId && preserved !== false ? sourceDraftId : null;
  }

  function triggerNewConsultationAutosave(
    options: { immediate?: boolean; force?: boolean; locked?: boolean } = {},
  ) {
    // Only for notes type
    if (consultationRecordType !== "notes") return;
    
    // Clear existing timer
    if (newConsultationAutosaveTimerRef.current) {
      clearTimeout(newConsultationAutosaveTimerRef.current);
      newConsultationAutosaveTimerRef.current = null;
    }
    
    setNewConsultationAutosaveStatus("pending");

    if (options.immediate) {
      void handleNewConsultationAutosave({ force: options.force, locked: options.locked });
      return;
    }
    
    // Set new timer for 1 second
    newConsultationAutosaveTimerRef.current = setTimeout(() => {
      newConsultationAutosaveTimerRef.current = null;
      if (consultationLockSavingRef.current) return;
      void handleNewConsultationAutosave({ force: options.force, locked: options.locked });
    }, 1000);
  }
  
  // Cleanup autosave timer when form closes
  useEffect(() => {
    if (!newConsultationOpen) {
      if (newConsultationAutosaveTimerRef.current) {
        clearTimeout(newConsultationAutosaveTimerRef.current);
        newConsultationAutosaveTimerRef.current = null;
      }
      setNewConsultationAutosaveStatus("idle");
      // Reset draft ID when form closes (draft becomes a real record or was discarded)
      setNewConsultationDraftId(null);
    }
  }, [newConsultationOpen]);

  async function handleToggleInvoicePaid(
    invoiceId: string,
    currentPaid: boolean,
  ) {
    if (!invoiceId) return;

    try {
      setConsultationsError(null);
      const nextPaid = !currentPaid;

      const newStatus = nextPaid ? "PAID" : "OPEN";
      const target = consultations.find(c => c.id === invoiceId);
      const { error } = await supabaseClient
        .from("invoices")
        .update({
          status: newStatus,
          paid_amount: nextPaid ? (target?.invoice_total_amount || 0) : null,
          paid_at: nextPaid ? new Date().toISOString() : null,
        })
        .eq("id", invoiceId);

      if (error) {
        setConsultationsError(
          error.message ?? "Failed to update invoice status.",
        );
        return;
      }

      setConsultations((prev) =>
        prev.map((row) =>
          row.id === invoiceId ? { ...row, invoice_is_paid: nextPaid, invoice_status: newStatus as InvoiceStatus } : row,
        ),
      );
      broadcastPatientRealtimeRefresh({ force: true });

      router.refresh();
    } catch {
      setConsultationsError("Failed to update invoice status.");
    }
  }

  function openCashReceiptModal(target: ConsultationRow) {
    setCashReceiptTarget(target);
    setCashReceiptFile(null);
    setCashReceiptError(null);
    setCashReceiptModalOpen(true);
  }

  async function handleCashReceiptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cashReceiptTarget || !cashReceiptFile) {
      setCashReceiptError("Please choose a receipt file to upload.");
      return;
    }

    try {
      setCashReceiptUploading(true);
      setCashReceiptError(null);

      const ext = cashReceiptFile.name.split(".").pop() || "bin";
      const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "bin";
      const path = `${cashReceiptTarget.patient_id}/${cashReceiptTarget.consultation_id}-${Date.now()}.${safeExt}`;

      const { error: uploadError } = await supabaseClient.storage
        .from("cash-receipts")
        .upload(path, cashReceiptFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: cashReceiptFile.type || undefined,
        });

      if (uploadError) {
        setCashReceiptError(
          uploadError.message ?? "Failed to upload receipt.",
        );
        setCashReceiptUploading(false);
        return;
      }

      // Get current user for audit trail
      const { data: authData } = await supabaseClient.auth.getUser();
      const userId = authData?.user?.id || null;
      const paidAt = new Date().toISOString();

      const { error } = await supabaseClient
        .from("invoices")
        .update({
          status: "PAID",
          paid_amount: cashReceiptTarget.invoice_total_amount || 0,
          cash_receipt_path: path,
          paid_at: paidAt,
          paid_by_user_id: userId,
        })
        .eq("id", cashReceiptTarget.id);

      if (error) {
        setCashReceiptError(error.message ?? "Failed to update invoice.");
        setCashReceiptUploading(false);
        return;
      }

      setConsultations((prev) =>
        prev.map((row) =>
          row.id === cashReceiptTarget.id
            ? { ...row, invoice_is_paid: true, cash_receipt_path: path }
            : row,
        ),
      );
      broadcastPatientRealtimeRefresh({ force: true });

      setCashReceiptUploading(false);
      setCashReceiptModalOpen(false);
      setCashReceiptTarget(null);
      setCashReceiptFile(null);

      router.refresh();
    } catch {
      setCashReceiptError("Unexpected error uploading receipt.");
      setCashReceiptUploading(false);
    }
  }

  function handleViewCashReceipt(path: string | null) {
    if (!path) return;
    try {
      const { data } = supabaseClient.storage
        .from("cash-receipts")
        .getPublicUrl(path);
      const url = data?.publicUrl;
      if (url && typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setConsultationsError("Failed to open receipt.");
    }
  }

  async function handleCheckXml(invoiceId: string) {
    setCheckingXmlId(invoiceId);
    setXmlPreviewError(null);
    setXmlPreviewContent(null);
    try {
      const res = await fetch("/api/sumex/check-xml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, patientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.abortInfo ? `${data.error}: ${data.abortInfo}` : data.details || data.error || "XML generation failed");
      }
      setXmlPreviewContent(data.xmlContent);
    } catch (err) {
      setXmlPreviewError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setCheckingXmlId(null);
    }
  }

  async function handleGenerateInvoicePdf(invoiceId: string, invoiceType: "tg" | "tp" | "reminder" | "receipt" = "tp", reminderLevel = 1) {
    try {
      // Guard against double-queueing if the context already knows about this job
      if (invoicePdfJobStatus(invoiceId, invoiceType, reminderLevel)) {
        setPdfSuccessToast({
          invoiceNumber: null,
          type: invoiceType,
          message: "Already queued â€” watch the notification bell for updates",
        });
        return;
      }

      console.log("Queueing PDF for invoice ID:", invoiceId, "type:", invoiceType);
      setGeneratingPdf(invoiceId);
      setPdfError(null);

      const { data: sessionData } = await supabaseClient.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const userId = sessionData?.session?.user?.id;
      if (!accessToken) {
        setPdfError({ message: "You must be signed in to queue PDF generation" });
        setGeneratingPdf(null);
        return;
      }

      const response = await fetch("/api/invoices/queue-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          invoiceId,
          invoiceType,
          reminderLevel,
          createdByUserId: userId,
        }),
      });

      const data = await response.json();

      if (!response.ok || (!data.success && !data.jobId)) {
        setPdfError({
          message: data.error || "Failed to queue PDF",
          details: data.details || undefined,
        });
        setGeneratingPdf(null);
        return;
      }

      const row = consultations.find(r => r.id === invoiceId || r.invoice_id === invoiceId);
      const invoiceNumber = row?.consultation_id || row?.linked_invoice_number || null;
      setPdfSuccessToast({
        invoiceNumber,
        type: invoiceType,
        message: data.message === "A job for this invoice/type is already queued"
          ? "Already queued â€” watch the notification bell for updates"
          : "Queued for PDF generation â€” check the notification bell",
      });
      setTimeout(() => setPdfSuccessToast(null), 4000);

      // Refresh jobs so the in-progress badge appears immediately
      void pdfNotifications.refreshJobs();
      setGeneratingPdf(null);
    } catch (error) {
      console.error("Error queueing PDF:", error);
      setPdfError({ message: error instanceof Error ? error.message : "Failed to queue PDF" });
      setGeneratingPdf(null);
    }
  }

  async function handleCancelPdfJob(invoiceId: string, invoiceType: "tg" | "tp" | "reminder" | "receipt" = "tp", reminderLevel = 1) {
    try {
      const { data } = await supabaseClient
        .from("pdf_generation_jobs")
        .delete()
        .eq("invoice_id", invoiceId)
        .eq("invoice_type", invoiceType)
        .eq("reminder_level", invoiceType === "reminder" ? reminderLevel : 1)
        .in("status", ["pending", "processing"])
        .select("id");

      void pdfNotifications.refreshJobs();
      console.log(`Cancelled ${data?.length || 0} queued PDF job(s) for ${invoiceId} ${invoiceType}`);
    } catch (err) {
      console.error("Error cancelling PDF job:", err);
    }
  }

  function invoicePdfJobStatus(invoiceId: string, invoiceType: "tg" | "tp" | "reminder" | "receipt" = "tp", reminderLevel = 1): "pending" | "processing" | null {
    const job = pdfNotifications.jobs.find(
      j =>
        j.invoice_id === invoiceId &&
        j.invoice_type === invoiceType &&
        (invoiceType !== "reminder" || (j.reminder_level || 1) === reminderLevel) &&
        (j.status === "pending" || j.status === "processing"),
    );
    return job ? (job.status as "pending" | "processing") : null;
  }

  function anyInvoicePdfJobStatus(invoiceId: string): { type: string; status: "pending" | "processing" } | null {
    const job = pdfNotifications.jobs.find(
      j => j.invoice_id === invoiceId && (j.status === "pending" || j.status === "processing"),
    );
    return job ? { type: job.invoice_type, status: job.status as "pending" | "processing" } : null;
  }

  async function handleSendInvoiceEmail(invoiceId: string, pdfPath: string | null, documentType?: string) {
    if (!patientEmail) {
      alert("Patient has no email address.");
      return;
    }
    if (!pdfPath) {
      alert("Please generate the PDF first.");
      return;
    }

    setSendingEmail(invoiceId);
    try {
      const res = await fetch("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, recipientEmail: patientEmail, ...(documentType ? { documentType } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        // Update local state to reflect email_sent_at
        setConsultations((prev) =>
          prev.map((row) =>
            row.id === invoiceId
              ? { ...row, email_sent_at: new Date().toISOString() }
              : row,
          ),
        );
        const toast = document.createElement("div");
        toast.className = "fixed top-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg";
        toast.innerHTML = `<div class="flex items-center gap-2"><svg class="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>Invoice emailed to ${patientEmail}</span></div>`;
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
      setSendingEmail(null);
    }
  }

  async function handleViewPdf(pdfPath: string) {
    try {
      // Use signed URL for private bucket access (valid for 1 hour)
      const { data, error } = await supabaseClient.storage
        .from("invoice-pdfs")
        .createSignedUrl(pdfPath, 3600);
      
      if (error || !data?.signedUrl) {
        console.error("Error creating signed URL:", error);
        alert("Failed to load PDF. The file may not exist or access was denied.");
        return;
      }
      
      setPdfViewerUrl(data.signedUrl);
      setPdfViewerOpen(true);
    } catch (error) {
      console.error("Error viewing PDF:", error);
      alert("Failed to load PDF. Please try again.");
    }
  }

  async function handleEditInvoice(invoice: ConsultationRow) {
    const isOpen = !invoice.invoice_status || invoice.invoice_status === "OPEN";

    if (isOpen && invoice.invoice_id) {
      // â”€â”€ OPEN invoice: reuse the full creation form in edit mode â”€â”€
      try {
        // 1) Fetch the full invoice record
        const { data: inv, error: invErr } = await supabaseClient
          .from("invoices")
          .select("*")
          .eq("id", invoice.invoice_id)
          .single();
        if (invErr || !inv) {
          alert("Failed to load invoice data.");
          return;
        }

        // 2) Fetch line items
        const { data: lineItems } = await supabaseClient
          .from("invoice_line_items")
          .select("*")
          .eq("invoice_id", invoice.invoice_id)
          .order("sort_order", { ascending: true });

        // 3) Pre-fill form state
        setEditingInvoiceId(invoice.invoice_id);
        setEditingInvoiceNumber(inv.invoice_number || invoice.consultation_id);
        setConsultationRecordType("invoice");
        setConsultationTitle(inv.title || "");
        setConsultationDoctorId(inv.doctor_user_id || "");
        setInvoiceProviderId(inv.provider_id || "");
        setInvoicePaymentMethod(inv.payment_method || "");
        setInvoiceExtraOption(inv.is_complimentary ? "complimentary" : null);
        // Restore appointment link if one was previously saved
        if (inv.appointment_id) {
          setInvoiceApptLinkEnabled(true);
          setInvoiceAppointmentId(inv.appointment_id);
        } else {
          setInvoiceApptLinkEnabled(false);
          setInvoiceAppointmentId("");
        }
        setInvoiceCanton((inv.treatment_canton as SwissCanton) || DEFAULT_CANTON);
        setInvoiceLawType(inv.health_insurance_law || "KVG");
        setInvoiceAccidentDate(inv.accident_date || "");
        setInvoiceNotes(inv.notes || "");
        setInvoiceDiagnosisCodes(
          Array.isArray(inv.diagnosis_codes)
            ? inv.diagnosis_codes.map((d: any) => (typeof d === "string" ? d : d?.code)).filter(Boolean)
            : []
        );
        setInvoiceDiagnosisInput("");

        // Date & time
        if (inv.treatment_date || inv.invoice_date) {
          const d = new Date(inv.treatment_date || inv.invoice_date);
          setConsultationDate(formatLocalDateInputValue(d));
          setConsultationHour(d.getHours().toString().padStart(2, "0"));
          setConsultationMinute(d.getMinutes().toString().padStart(2, "0"));
        }

        // 4) Reconstruct InvoiceServiceLine[] from DB line items
        const reconstructedLines: InvoiceServiceLine[] = (lineItems || []).map((li: any) => {
          const isTardocLine = !!li.tardoc_code;
          const isAcfLine = li.catalog_name === "ACF" || li.catalog_name === "TMA";
          let serviceId: string;
          if (isTardocLine) {
            serviceId = `tardoc-${li.tardoc_code}`;
          } else if (isAcfLine && li.catalog_name === "TMA") {
            serviceId = `tma-${li.code || li.name}`;
          } else if (isAcfLine) {
            serviceId = `flatrate-${li.code || li.name}`;
          } else {
            serviceId = li.service_id || li.id;
          }

          return {
            serviceId,
            quantity: li.quantity || 1,
            unitPrice: li.unit_price ?? 0,
            groupId: null,
            discountPercent: null,
            customName: li.name || null,
            ...(isTardocLine ? {
              tardocTpMT: li.tp_al ?? 0,
              tardocTpTT: li.tp_tl ?? 0,
              tardocRecordId: li.record_id ?? null,
              tardocSection: li.section_code ?? null,
              tardocSideType: li.side_type ?? 0,
              tardocExternalFactor: li.external_factor_mt ?? 1,
              tardocRefCode: li.ref_code ?? null,
            } : {}),
            ...(isAcfLine ? {
              acfSideType: li.side_type ?? 0,
              acfExternalFactor: li.external_factor_mt ?? 1,
              acfRefCode: li.ref_code || "",
              acfBaseTP: li.tp_al ?? li.unit_price ?? 0,
            } : {}),
          };
        });

        setInvoiceServiceLines(reconstructedLines);

        // Determine invoice mode from line items
        const hasTardoc = reconstructedLines.some((l) => l.serviceId.startsWith("tardoc-"));
        const hasAcf = reconstructedLines.some((l) => l.serviceId.startsWith("flatrate-") || l.serviceId.startsWith("tma-"));
        if (hasTardoc) {
          setInvoiceMode("tardoc");
        } else if (hasAcf) {
          setInvoiceMode("flatrate");
        } else {
          setInvoiceMode("individual");
        }

        // Reset other form state
        setInvoicePaymentTerm("full");
        setInvoiceInstallments([]);
        setInvoiceSelectedCategoryId("");
        setInvoiceSelectedServiceId("");
        setConsultationError(null);
        setSkipSumexValidation(true);
        setInvoiceFromConsultationId(inv.consultation_id || null);

        // Open the creation form and scroll to it
        setNewConsultationOpen(true);
        setTimeout(() => {
          creationFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      } catch (err) {
        console.error("Failed to load invoice for editing:", err);
        alert("Failed to load invoice data for editing.");
      }
    } else {
      // â”€â”€ Non-OPEN invoice: simple title-only edit modal â”€â”€
      setEditInvoiceTarget(invoice);
      setEditInvoiceTitle(invoice.title || "");
      setEditInvoiceRefNumber(invoice.reference_number || "");
      setEditInvoiceModalOpen(true);
    }
  }

  function handleManagePaymentStatus(invoice: ConsultationRow) {
    setPaymentStatusTarget(invoice);
    // Pre-fill the date picker with today (reset every time modal opens)
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentStatusModalOpen(true);
  }

  async function handleMarkInvoicePaid(invoiceId: string, status: InvoiceStatus = "PAID", paidAmount?: number, customPaidDate?: string) {
    try {
      setMarkingPaid(true);

      // Get current user for audit trail
      const { data: authData } = await supabaseClient.auth.getUser();
      const userId = authData?.user?.id || null;

      // Use custom date if provided (from the date picker); fall back to now.
      // customPaidDate is a YYYY-MM-DD string â€” store as end-of-day in UTC so the
      // date is unambiguous across timezones.
      const paidAt = customPaidDate
        ? new Date(`${customPaidDate}T23:59:59`).toISOString()
        : new Date().toISOString();

      const invoiceUpdateData: Record<string, unknown> = {
        status,
        paid_at: (status === "OPEN" || status === "CANCELLED") ? null : paidAt,
        paid_by_user_id: userId,
      };

      // Set the paid amount
      let resolvedPaidAmount: number | null = null;
      if (paidAmount !== undefined && paidAmount >= 0) {
        invoiceUpdateData.paid_amount = paidAmount;
        resolvedPaidAmount = paidAmount;
      } else if (status === "PAID") {
        const target = consultations.find(c => c.id === invoiceId);
        if (target?.invoice_total_amount) {
          invoiceUpdateData.paid_amount = target.invoice_total_amount;
          resolvedPaidAmount = target.invoice_total_amount;
        }
      } else if (status === "OPEN" || status === "CANCELLED") {
        invoiceUpdateData.paid_amount = null;
      }

      // If this is a deposit invoice (has a payment_link_token, meaning it was
      // created via the "Acompte 50%" flow), also sync deposit_status so the
      // cockpit widget updates — manual payment doesn't go through the Stripe
      // webhook which is the only other place that sets deposit_status.
      if (status === "PAID") {
        const target = consultations.find(c => c.id === invoiceId);
        if (target?.payment_link_token) {
          invoiceUpdateData.deposit_status = "paid";
        }
      } else if (status === "OPEN" || status === "CANCELLED") {
        // If reverting a deposit invoice back to unpaid, reset deposit_status too
        const target = consultations.find(c => c.id === invoiceId);
        if (target?.payment_link_token) {
          invoiceUpdateData.deposit_status = "requested";
        }
      }

      const { error } = await supabaseClient
        .from("invoices")
        .update(invoiceUpdateData)
        .eq("id", invoiceId);

      if (error) throw error;

      setConsultations(prev =>
        prev.map(c =>
          c.id === invoiceId ? {
            ...c,
            invoice_is_paid: status === "PAID" || status === "OVERPAID" || status === "PARTIAL_PAID",
            invoice_status: status,
            invoice_paid_amount: resolvedPaidAmount,
          } : c
        )
      );
      setPaymentStatusModalOpen(false);
      setMarkingPaid(false);
    } catch (error) {
      console.error("Error marking invoice paid:", error);
      alert("Failed to update payment status. Please try again.");
      setMarkingPaid(false);
    }
  }

  const formBaseSeconds = consultationDurationSeconds;
  const formRunningSeconds = consultationStopwatchStartedAt
    ? formBaseSeconds +
    Math.max(
      0,
      Math.floor(
        (consultationStopwatchNow - consultationStopwatchStartedAt) / 1000,
      ),
    )
    : formBaseSeconds;
  const formDisplayDuration = formatDuration(formRunningSeconds);
  const formStopwatchRunning = consultationStopwatchStartedAt !== null;

  const invoiceTotal = invoiceServiceLines.reduce((sum, line) => {
    if (!line.serviceId) return sum;
    const quantity = line.quantity > 0 ? line.quantity : 1;

    const unit = (() => {
      if (line.unitPrice !== null && Number.isFinite(line.unitPrice)) {
        return line.unitPrice;
      }
      const service = invoiceServices.find(
        (s) => s.id === line.serviceId,
      );
      const base =
        service?.base_price !== null && service?.base_price !== undefined
          ? Number(service.base_price)
          : 0;
      return Number.isFinite(base) && base > 0 ? base : 0;
    })();

    return sum + unit * quantity;
  }, 0);

  // Total VAT (extracted from gross totals). TARDOC invoices and TARDOC/ACF lines are always VAT-free.
  const invoiceVatTotal = (() => {
    if (invoiceMode === "tardoc") return 0;
    return invoiceServiceLines.reduce((sum, line) => {
      if (!line.serviceId) return sum;
      // TARDOC and ACF lines are always VAT-free
      if (
        line.serviceId.startsWith("tardoc-") ||
        line.serviceId.startsWith("flatrate-") ||
        line.serviceId.startsWith("tma-")
      ) {
        return sum;
      }
      const service = invoiceServices.find((s) => s.id === line.serviceId);
      const ratePct = Number(service?.vat_rate_pct ?? 0);
      if (!ratePct) return sum;
      const quantity = line.quantity > 0 ? line.quantity : 1;
      const unit = line.unitPrice !== null && Number.isFinite(line.unitPrice)
        ? line.unitPrice
        : Number(service?.base_price ?? 0) || 0;
      const lineTotal = unit * quantity;
      return sum + (lineTotal * ratePct) / (100 + ratePct);
    }, 0);
  })();
  const invoiceNetTotal = invoiceTotal - invoiceVatTotal;

  const invoiceInstallmentsTotalPercent = invoiceInstallments.reduce(
    (sum, installment) =>
      sum +
      (Number.isFinite(installment.percent) ? Math.max(0, installment.percent) : 0),
    0,
  );
  const invoiceInstallmentsTotalPercentRounded = Number.isFinite(
    invoiceInstallmentsTotalPercent,
  )
    ? Math.round(invoiceInstallmentsTotalPercent * 100) / 100
    : 0;
  const invoiceInstallmentsPlanComplete =
    invoiceInstallmentsTotalPercentRounded === 100;

  async function buildConsultationsPdfBlob(): Promise<{ blob: Blob; fileName: string }> {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const patientName = `${patientFirstName ?? ""} ${patientLastName ?? ""}`.trim();
    const now = new Date().toLocaleDateString("en-GB");
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginLeft = 14;
    const marginRight = 14;
    const contentWidth = pageW - marginLeft - marginRight;
    let y = 16;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(`Consultations \u2013 ${patientName}`, marginLeft, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text(`Exported on ${now}  \u00b7  ${filteredSortedConsultations.length} record(s)`, marginLeft, y);
    y += 5;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginLeft, y, pageW - marginRight, y);
    y += 7;

    if (filteredSortedConsultations.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text("No consultations found.", marginLeft, y);
    }

    for (const row of filteredSortedConsultations) {
      if (y > pageH - 35) {
        doc.addPage();
        y = 16;
      }

      const scheduledDate = row.scheduled_at
        ? new Date(row.scheduled_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
        : "\u2014";

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text(`[${(row.record_type ?? "").toUpperCase()}]  ${scheduledDate}`, marginLeft, y);
      y += 5;

      if (row.doctor_name) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(110, 110, 110);
        doc.text(`Doctor: ${row.doctor_name}`, marginLeft, y);
        y += 4.5;
      }

      if (row.title) {
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 20);
        const titleLines = doc.splitTextToSize(row.title, contentWidth);
        if (y + titleLines.length * 5 > pageH - 20) { doc.addPage(); y = 16; }
        doc.text(titleLines, marginLeft, y);
        y += titleLines.length * 5;
      }

      if (row.content) {
        const plain = row.content
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim();
        if (plain) {
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(60, 60, 60);
          const contentLines = doc.splitTextToSize(plain, contentWidth);
          if (y + contentLines.length * 4.5 > pageH - 20) { doc.addPage(); y = 16; }
          doc.text(contentLines, marginLeft, y);
          y += contentLines.length * 4.5;
        }
      }

      y += 3;
      doc.setDrawColor(220, 220, 220);
      doc.line(marginLeft, y, pageW - marginRight, y);
      y += 6;
    }

    const safeName = patientName.replace(/\s+/g, "_");
    const safeDate = now.replace(/\//g, "-");
    const fileName = `consultations_${safeName}_${safeDate}.pdf`;
    const blob = doc.output("blob");
    return { blob, fileName };
  }

  async function exportConsultationsToPdf() {
    if (exportingConsultationsPdf) return;
    setExportingConsultationsPdf(true);
    try {
      const { blob, fileName } = await buildConsultationsPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingConsultationsPdf(false);
    }
  }

  async function sendConsultationsToEmail() {
    if (sendingConsultationsEmail) return;
    if (!patientEmail) {
      setSendConsultationsEmailError("No email address on file for this patient.");
      return;
    }
    setSendingConsultationsEmail(true);
    setSendConsultationsEmailError(null);
    setSendConsultationsEmailSuccess(false);
    try {
      const patientName = `${patientFirstName ?? ""} ${patientLastName ?? ""}`.trim();
      const { blob, fileName } = await buildConsultationsPdfBlob();

      const subject = `Consultation Records \u2013 ${patientName}`;
      const htmlBody = `<p>Dear ${patientName},</p><p>Please find attached your consultation records.</p><p>This document contains <strong>${filteredSortedConsultations.length} record(s)</strong> exported on ${new Date().toLocaleDateString("en-GB")}.</p><p>Best regards,<br/>Aesthetic Clinic</p>`;

      const { data: inserted, error: insertError } = await supabaseClient
        .from("emails")
        .insert({
          patient_id: patientId,
          to_address: patientEmail,
          from_address: currentUserEmail,
          subject,
          body: htmlBody,
          direction: "outbound",
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        setSendConsultationsEmailError(insertError?.message ?? "Failed to create email record.");
        return;
      }

      const emailId = (inserted as any).id as string;

      const storagePath = `${patientId}/${emailId}/${fileName}`;
      const { error: uploadError } = await supabaseClient.storage
        .from("email-attachments")
        .upload(storagePath, blob, { contentType: "application/pdf", upsert: true });

      if (uploadError) {
        setSendConsultationsEmailError(uploadError.message ?? "Failed to upload PDF.");
        return;
      }

      await supabaseClient.from("email_attachments").insert({
        email_id: emailId,
        file_name: fileName,
        storage_path: storagePath,
        mime_type: "application/pdf",
        file_size: blob.size,
      });

      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: patientEmail,
          subject,
          html: htmlBody,
          fromUserEmail: currentUserEmail,
          fromUserName: currentUserName,
          emailId,
          patientId,
        }),
      });

      if (!res.ok) {
        setSendConsultationsEmailError("Email saved but failed to deliver. Check activity log.");
        return;
      }

      setSendConsultationsEmailSuccess(true);
      setTimeout(() => setSendConsultationsEmailSuccess(false), 4000);
    } catch (err: any) {
      setSendConsultationsEmailError((err as any)?.message ?? tc("failedSendEmail"));
    } finally {
      setSendingConsultationsEmail(false);
    }
  }

  function getLinkedInvoiceForConsultation(row: ConsultationRow) {
    if (row.record_type === "invoice") return null;

    return consultations.find(
      (candidate) =>
        candidate.record_type === "invoice" &&
        (
          (row.linked_invoice_id && candidate.invoice_id === row.linked_invoice_id) ||
          candidate.invoice_consultation_id === row.id
        ),
    ) ?? null;
  }

  function renderDraftLinkedInvoiceCard(row: ConsultationRow) {
    if (recordTypeFilter || row.record_type === "invoice") return null;

    const linkedInvoice = getLinkedInvoiceForConsultation(row);
    if (!linkedInvoice) return null;

    const effectiveStatus: InvoiceStatus =
      linkedInvoice.invoice_status ||
      (linkedInvoice.invoice_is_paid ? "PAID" : "OPEN");
    const statusDisplay = INVOICE_STATUS_DISPLAY[effectiveStatus];
    const totalAmount = linkedInvoice.invoice_total_amount ?? 0;
    const paidAmount = linkedInvoice.invoice_paid_amount ?? 0;
    const isCash = typeof linkedInvoice.payment_method === "string" && linkedInvoice.payment_method === "Cash";

    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="truncate text-[11px] font-semibold text-emerald-800">
              Linked Invoice #{linkedInvoice.consultation_id}
            </span>
            {linkedInvoice.title ? (
              <span className="truncate text-[10px] text-slate-600">{linkedInvoice.title}</span>
            ) : null}
          </div>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${statusDisplay.bgColor} ${statusDisplay.color} ${statusDisplay.borderColor}`}>
            {statusDisplay.label}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-100 bg-white/80 px-3 py-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold text-slate-900">CHF {totalAmount.toFixed(2)}</span>
          </div>
          {paidAmount > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Paid</span>
              <span className="font-semibold text-emerald-700">CHF {paidAmount.toFixed(2)}</span>
            </div>
          ) : null}
          {linkedInvoice.payment_method ? (
            <div className="flex items-center gap-1.5 sm:ml-auto">
              <span className="text-slate-400">via</span>
              <span className="font-medium text-slate-600">{linkedInvoice.payment_method}</span>
            </div>
          ) : null}
        </div>

        {linkedInvoice.content ? (
          <div
            className="mt-2 rounded-md border border-slate-100 bg-white/80 px-3 py-2 text-[11px] text-slate-700 [&_table]:w-full [&_table]:text-[10px] [&_th]:pb-1 [&_th]:text-left [&_th]:font-medium [&_th]:text-slate-500 [&_td]:py-0.5 [&_td]:pr-2"
            dangerouslySetInnerHTML={{ __html: linkedInvoice.content }}
          />
        ) : null}

        {linkedInvoice.invoice_id && installmentSummaries[linkedInvoice.invoice_id] ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-violet-100 bg-violet-50/60 px-3 py-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="font-medium text-violet-700">
                Installments: {installmentSummaries[linkedInvoice.invoice_id].paidCount}/{installmentSummaries[linkedInvoice.invoice_id].count} paid
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {linkedInvoice.invoice_pdf_path ? (
            <button type="button" onClick={() => handleViewPdf(linkedInvoice.invoice_pdf_path!)} className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100">
              View PDF
            </button>
          ) : null}
          {(() => {
            const linkedQueued = anyInvoicePdfJobStatus(linkedInvoice.id);
            return (
              <button
                type="button"
                onClick={() => linkedQueued ? handleCancelPdfJob(linkedInvoice.id, "tg") : handleGenerateInvoicePdf(linkedInvoice.id)}
                disabled={generatingPdf === linkedInvoice.id}
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
              >
                {generatingPdf === linkedInvoice.id ? "Queueing..." : linkedQueued ? `${linkedQueued.status === "processing" ? "Processing" : "Queued"} - Cancel` : linkedInvoice.invoice_pdf_path ? "Regenerate PDF" : "Generate PDF"}
              </button>
            );
          })()}
          <button type="button" onClick={() => handleEditInvoice(linkedInvoice)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50">
            Edit Invoice
          </button>
          <button type="button" onClick={() => handleManagePaymentStatus(linkedInvoice)} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100">
            Payment Status
          </button>
          <button type="button" onClick={() => handleOpenInstallments(linkedInvoice)} className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100">
            Installments
          </button>
          <button type="button" onClick={() => handleCheckXml(linkedInvoice.id)} disabled={checkingXmlId === linkedInvoice.id} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">
            {checkingXmlId === linkedInvoice.id ? "Checking..." : "Check XML"}
          </button>
          {(() => {
            const insurancePending = insuranceNotifications.hasPendingJob(linkedInvoice.id);
            return (
              <button
                type="button"
                disabled={insurancePending}
                onClick={() => { setInsuranceBillingTarget(linkedInvoice); setInsuranceBillingModalOpen(true); }}
                className={`inline-flex items-center gap-1 rounded-md border border-teal-200 px-2 py-1 text-[10px] font-medium ${insurancePending ? "cursor-not-allowed bg-teal-100 text-teal-800" : "bg-teal-50 text-teal-700 hover:bg-teal-100"}`}
              >
                {insurancePending ? "Insurance pending" : "Insurance"}
              </button>
            );
          })()}
          {isCash && linkedInvoice.invoice_is_paid && linkedInvoice.cash_receipt_path ? (
            <button type="button" onClick={() => handleViewCashReceipt(linkedInvoice.cash_receipt_path)} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100">
              View Receipt
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {showArchived ? tc("archivedTitle") : tc("title")}
            </h3>
            {/* Tab switcher */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setActiveMainTab("consultations")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  activeMainTab === "consultations"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Consultations
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sky-700">
            {!showArchived ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    if (consultationSaving) return;
                    const preservedExistingNote = preserveOpenCreateConsultationNote();
                    const now = new Date();
                    const datePart = formatLocalDateInputValue(now);
                    const hourPart = now
                      .getHours()
                      .toString()
                      .padStart(2, "0");
                    const minutePart = now
                      .getMinutes()
                      .toString()
                      .padStart(2, "0");
                    setConsultationDate(datePart);
                    setConsultationHour(hourPart);
                    setConsultationMinute(minutePart);
                    setConsultationDoctorId("");
                    setConsultationError(null);
                    setConsultationTitle("");
                    setConsultationDiagnosisCode("");
                    setConsultationRefIcd10("");
                    setInvoiceFromConsultationId(null);
                    setConsultationRecordType("prescription");
                    setConsultationContentHtml("");
                    consultationContentHtmlRef.current = "";
                    setConsultationDurationSeconds(0);
                    setConsultationStopwatchStartedAt(null);
                    setConsultationStopwatchNow(Date.now());
                    setNewConsultationDraftId(null); // Reset draft ID when starting fresh
                    setNewConsultationAutosaveStatus("idle");
                    setPrescriptionLines([
                      { medicineId: "", dosageId: "" },
                    ]);
                    setInvoicePaymentMethod("");
                    setInvoiceMode("individual");
                    setInvoiceGroupId("");
                    setInvoicePaymentTerm("full");
                    setInvoiceExtraOption(null);
                    setInvoiceInstallments([]);
                    setInvoiceServiceLines([]);
                    setInvoiceSelectedCategoryId("");
                    setInvoiceSelectedServiceId("");
                    if (currentUserId) {
                      setConsultationDoctorId(currentUserId);
                    }
                    setNewConsultationOpen(true);
                    setTimeout(() => {
                      if (!preservedExistingNote) {
                        creationFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }, 100);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm hover:bg-sky-100 hover:text-sky-800"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                  >
                    <path
                      d="M7 3.5h6M9 3.5v3.17L6.3 13.7A1.5 1.5 0 0 0 7.7 15.5h4.6a1.5 1.5 0 0 0 1.4-1.8L11 6.67V3.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (taskSaving) return;
                    setTaskModalOpen(true);
                    setTaskSaveError(null);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm hover:bg-sky-100 hover:text-sky-800"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                  >
                    <rect
                      x="4"
                      y="4"
                      width="12"
                      height="12"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M7.5 10.5 9.5 12.5 13 8.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setLabDropdownOpen((prev) => !prev)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm hover:bg-sky-100 hover:text-sky-800"
                    title="External Labs"
                  >
                    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                      <path d="M8 2v5l-3 7a1.5 1.5 0 0 0 1.4 2h7.2a1.5 1.5 0 0 0 1.4-2l-3-7V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 2h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <path d="M6.5 12h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
                    </svg>
                  </button>
                  {labDropdownOpen && (
                    <div className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-slate-200/80 bg-white py-1 text-xs shadow-lg">
                      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        External Laboratories
                      </div>
                      {externalLabs.length === 0 ? (
                        <div className="px-3 py-3 text-center text-slate-400">No labs configured.</div>
                      ) : (
                        externalLabs.map((lab) => (
                          <button
                            key={lab.id}
                            type="button"
                            onClick={() => {
                              setLabDropdownOpen(false);
                              if (lab.type === "medisupport_fr") {
                                const formatDob = (dob: string | null | undefined): string => {
                                  if (!dob) return "";
                                  const d = new Date(dob);
                                  if (isNaN(d.getTime())) return "";
                                  const y = d.getFullYear();
                                  const m = String(d.getMonth() + 1).padStart(2, "0");
                                  const day = String(d.getDate()).padStart(2, "0");
                                  return `${y}${m}${day}`;
                                };
                                const genderCode = patientDetails?.gender?.toLowerCase() === "female" ? "F" : patientDetails?.gender?.toLowerCase() === "male" ? "M" : "";
                                const params = new URLSearchParams({
                                  Class: "Patient",
                                  Method: "CreateOrder",
                                  LoginName: lab.username,
                                  Password: lab.password,
                                  OnClose: "Login.jsp",
                                  Application: "HTML_MED_PROD_SAISIEDEM",
                                  treatmentCode: patientId,
                                  PatLastName: patientLastName || "",
                                  PatFirstName: patientFirstName || "",
                                  PatBirthDate: formatDob(patientDetails?.dob),
                                  PatSex: genderCode,
                                  PatStreet: patientDetails?.street_address || "",
                                  PatMunicipalityCode: patientDetails?.postal_code || "",
                                  PatMunicipality: patientDetails?.town || "",
                                  PatCountry: patientDetails?.nationality || "CH",
                                });
                                const baseUrl = lab.url.endsWith("/") ? lab.url : lab.url + "/";
                                window.open(`${baseUrl}?${params.toString()}`, "_blank", "noopener,noreferrer");
                              } else {
                                window.open(lab.url, "_blank", "noopener,noreferrer");
                              }
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
                          >
                            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0 text-slate-400">
                              <path d="M6.5 1.5v4l-2.5 6a1 1 0 0 0 .9 1.5h6.2a1 1 0 0 0 .9-1.5l-2.5-6v-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M5 1.5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                            <span className="truncate">{lab.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <span className="h-5 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={async () => {
                    if (consultationSaving) return;
                    await createCollaborativeConsultationNote();
                  }}
                  title="Create consultation note"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm hover:bg-sky-100 hover:text-sky-800"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                  >
                    <path
                      d="M10 4v12M4 10h12"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={openOtherRecordForm}
                  title="Create invoice, file, photo, or other record"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                  >
                    <path
                      d="M6 3.5h5.5L15 7v9.5H6V3.5Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11.5 3.5V7H15M8 10h5M8 12.5h5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="hidden sm:inline">Other</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void exportConsultationsToPdf()}
              disabled={exportingConsultationsPdf}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 11.5v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1.5" />
                <path d="M8 2v8M5 7.5l3 3 3-3" />
              </svg>
              {exportingConsultationsPdf ? tc("exportingPdf") : tc("exportToPdf")}
            </button>
            <button
              type="button"
              onClick={() => void sendConsultationsToEmail()}
              disabled={sendingConsultationsEmail || !patientEmail}
              title={!patientEmail ? tc("noEmailTitle") : tc("sendEmailTitle")}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="3.5" width="13" height="9" rx="1" />
                <path d="M1.5 4.5l6.5 4.5 6.5-4.5" />
              </svg>
              {sendingConsultationsEmail ? tc("sending") : sendConsultationsEmailSuccess ? tc("sent") : tc("sendToEmail")}
            </button>
            {sendConsultationsEmailError && (
              <span className="text-[10px] text-red-500">{sendConsultationsEmailError}</span>
            )}
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {showArchived ? tc("backToActive") : tc("viewArchive")}
            </button>
          </div>
        </div>

        {/* Consultations Tab Content */}
        {activeMainTab === "consultations" && (
        <>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 px-1 py-0.5">
            <span className="hidden sm:inline px-2 text-slate-500">{tc("sort")}</span>
            <button
              type="button"
              onClick={() => setSortOrder("desc")}
              className={
                "rounded-full px-2 py-0.5 text-[11px] " +
                (sortOrder === "desc"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900")
              }
            >
              {tc("newest")}
            </button>
            <button
              type="button"
              onClick={() => setSortOrder("asc")}
              className={
                "rounded-full px-2 py-0.5 text-[11px] " +
                (sortOrder === "asc"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900")
              }
            >
              {tc("oldest")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span>{tc("from")}</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div className="flex items-center gap-1">
              <span>{tc("to")}</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 shadow-sm hover:bg-slate-50"
            >
              {tc("clear")}
            </button>
          </div>
        </div>
        {!recordTypeFilter && unlockedDraftConsultations.length > 0 ? (
          <div className="mb-3 space-y-3">
            {unlockedDraftConsultations.map((row) => (
              <div key={row.id} id={`consultation-note-${row.id}`}>
                <CollaborativeUnlockedNoteEditor
                  row={row}
                  patientId={patientId}
                  currentUserEmail={currentUserEmail}
                  currentUserName={currentUserName}
                  medicalStaffOptions={medicalStaffOptions}
                  onDraftUpdated={(updatedRow) => {
                    setConsultations((prev) =>
                      prev.map((item) => (item.id === updatedRow.id ? updatedRow : item)),
                    );
                  }}
                  onFinalized={(finalizedRow) => {
                    setConsultations((prev) =>
                      prev.map((item) => (item.id === finalizedRow.id ? finalizedRow : item)),
                    );
                    broadcastPatientRealtimeRefresh({ force: true });
                  }}
                  onCreateInvoice={(row) => {
                    void openInvoiceFormFromConsultation(row);
                  }}
                  onError={(message) => setConsultationsError(message)}
                />
                <div className="-mt-2 mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      void openConsultationNoteEvents(row);
                    }}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                  >
                    Logs
                  </button>
                </div>
                {renderDraftLinkedInvoiceCard(row)}
              </div>
            ))}
          </div>
        ) : null}
        {newConsultationOpen ? (
          <div ref={creationFormRef} className="mb-3 rounded-lg border border-sky-200/70 bg-sky-50/60 p-3 text-xs">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const hour = consultationHour.trim();
                const minute = consultationMinute.trim();
                if (!consultationDate || !hour || !minute || !consultationDoctorId) {
                  setConsultationError(
                    tf("errSelectDateTimeDoctor"),
                  );
                  return;
                }

                const hourNumber = Number.parseInt(hour, 10);
                const minuteNumber = Number.parseInt(minute, 10);
                if (
                  Number.isNaN(hourNumber) ||
                  Number.isNaN(minuteNumber) ||
                  hourNumber < 0 ||
                  hourNumber > 23 ||
                  minuteNumber < 0 ||
                  minuteNumber > 59
                ) {
                  setConsultationError(tf("errValidTime"));
                  return;
                }

                const scheduledAtLocal = new Date(
                  `${consultationDate}T${hourNumber
                    .toString()
                    .padStart(2, "0")}:${minuteNumber
                      .toString()
                      .padStart(2, "0")}:00`,
                );
                if (Number.isNaN(scheduledAtLocal.getTime())) {
                  setConsultationError(tf("errValidDateTime"));
                  return;
                }

                const scheduledAtIso = scheduledAtLocal.toISOString();

                if (
                  consultationRecordType === "notes" &&
                  isBlankNotesHtml(consultationNotesEditor?.getHTML() ?? consultationContentHtml)
                ) {
                  setConsultationError(
                    tf("errNoteContent"),
                  );
                  return;
                }

                if (consultationRecordType === "prescription") {
                  const hasValidLine = prescriptionLines.some(
                    (line) => line.medicineId && line.dosageId,
                  );
                  if (!hasValidLine) {
                    setConsultationError(
                      tf("errPrescriptionLine"),
                    );
                    return;
                  }
                }

                if (consultationRecordType === "invoice") {
                  if (!invoicePaymentMethod.trim()) {
                    setConsultationError(
                      tf("errPaymentMethod"),
                    );
                    return;
                  }

                  // Billing entity is mandatory for Dr Miles, Dr Nordback, Dr Koltunova, Dr Plakalo, Dr Guarino, Dr Benani
                  if (!invoiceProviderId) {
                    const doc = medicalStaffOptions.find((d) => d.id === consultationDoctorId);
                    const nameLC = (doc?.name || "").toLowerCase();
                    if (["miles", "nordback", "koltunova", "plakalo", "guarino", "benani"].some((n) => nameLC.includes(n))) {
                      setConsultationError("Billing entity is required for this doctor. Please select one.");
                      return;
                    }
                  }

                  const hasService = invoiceServiceLines.some(
                    (line) => line.serviceId,
                  );
                  if (!hasService) {
                    setConsultationError(
                      tf("errAddService"),
                    );
                    return;
                  }

                  // ICD-10 required for TARDOC, ACF and insurance invoices (CHM/Sumex standard)
                  const needsDiagnosis =
                    invoicePaymentMethod === "Insurance" ||
                    invoiceServiceLines.some((l) =>
                      l.serviceId.startsWith("tardoc-") ||
                      l.serviceId.startsWith("flatrate-") ||
                      l.serviceId.startsWith("tma-")
                    );
                  if (needsDiagnosis && invoiceDiagnosisCodes.length === 0) {
                    setConsultationError(
                      "Code ICD-10 requis \u2014 veuillez saisir au moins un code diagnostic (ex. Z00.0) pour cette facture."
                    );
                    return;
                  }

                  if (invoicePaymentTerm === "installment") {
                    const validInstallments = invoiceInstallments.filter(
                      (installment) =>
                        Number.isFinite(installment.percent) &&
                        installment.percent > 0,
                    );

                    if (validInstallments.length === 0) {
                      setConsultationError(
                        tf("errAddInstallment"),
                      );
                      return;
                    }

                    if (!invoiceInstallmentsPlanComplete) {
                      setConsultationError(
                        tf("errInstallmentTotal"),
                      );
                      return;
                    }
                  }
                }

                if (consultationRecordType === "medication") {
                  const validProducts = medProducts.filter((p) => p.productName.trim());
                  if (validProducts.length === 0) {
                    setConsultationError(
                      tf("errMedicationProduct"),
                    );
                    return;
                  }
                }

                void (async () => {
                  try {
                    setConsultationSaving(true);
                    setConsultationError(null);

                    // When editing, reuse existing invoice number; otherwise generate new
                    let consultationId: string;
                    if (editingInvoiceId && editingInvoiceNumber) {
                      consultationId = editingInvoiceNumber;
                    } else {
                      const { data: invoiceNumberData, error: invoiceNumberError } = await supabaseClient
                        .rpc('generate_invoice_number');
                      
                      if (invoiceNumberError || !invoiceNumberData) {
                        setConsultationError(tf('errGenerateInvoice'));
                        setConsultationSaving(false);
                        return;
                      }
                      consultationId = invoiceNumberData as string;
                    }
                    const effectiveTitle =
                      consultationTitle.trim() || `Invoice ${consultationId}`;

                    const { data: authData } =
                      await supabaseClient.auth.getUser();
                    const authUser = authData?.user ?? null;

                    let createdByUserId: string | null = null;
                    let createdByName: string | null = null;
                    if (authUser) {
                      const meta = (authUser.user_metadata || {}) as Record<
                        string,
                        unknown
                      >;
                      const first = (meta["first_name"] as string) || "";
                      const last = (meta["last_name"] as string) || "";
                      const fullName =
                        [first, last].filter(Boolean).join(" ") ||
                        authUser.email ||
                        null;

                      createdByUserId = authUser.id;
                      createdByName = fullName;
                    }

                    let doctorName: string | null = null;
                    let selectedProviderId: string | null = null;
                    let selectedProviderName: string | null = null;
                    let selectedProviderGln: string | null = null;
                    let selectedProviderZsr: string | null = null;
                    let selectedProviderCanton: string | null = null;

                    // For invoices: use medical staff from providers table
                    // For regular consultations: use users table
                    if (consultationRecordType === "invoice") {
                      const staff = medicalStaffOptions.find(
                        (s) => s.id === consultationDoctorId,
                      );
                      if (staff) {
                        doctorName = staff.name || "Doctor";
                      }
                    } else {
                      const doctor = userOptions.find(
                        (user) => user.id === consultationDoctorId,
                      );
                      if (doctor) {
                        doctorName = (doctor.full_name || doctor.email || "Doctor") as string;
                      }
                    }

                    if (consultationRecordType === "invoice") {
                      // Provider (billing entity) is from the providers dropdown
                      const provider = providerOptions.find(
                        (p) => p.id === invoiceProviderId,
                      );
                      if (provider) {
                        selectedProviderId = provider.id;
                        selectedProviderName = provider.name;
                        selectedProviderGln = provider.gln ?? null;
                        selectedProviderZsr = provider.zsr ?? null;
                        selectedProviderCanton = provider.canton ?? null;
                      }
                    }

                    let durationSeconds = consultationDurationSeconds;
                    if (consultationStopwatchStartedAt) {
                      const elapsedSeconds = Math.max(
                        0,
                        Math.floor(
                          (Date.now() - consultationStopwatchStartedAt) / 1000,
                        ),
                      );
                      durationSeconds += elapsedSeconds;
                    }

                    let contentHtml: string | null = null;
                    let invoiceTotalAmountForInsert: number | null = null;
                    let invoiceIsComplimentaryForInsert = false;
                    let invoiceIsPaidForInsert = false;
                    if (consultationRecordType === "notes") {
                      contentHtml = consultationNotesEditor?.getHTML() ?? consultationContentHtml;
                    } else if (consultationRecordType === "prescription") {
                      const lines = prescriptionLines.filter(
                        (line) => line.medicineId && line.dosageId,
                      );
                      const totalPrice = lines.reduce((sum, line) => {
                        const med = TEST_MEDICINES.find(
                          (m) => m.id === line.medicineId,
                        );
                        const dosage = med?.dosages.find(
                          (d) => d.id === line.dosageId,
                        );
                        return sum + (dosage?.price ?? 0);
                      }, 0);

                      const itemsHtml = lines
                        .map((line, index) => {
                          const med = TEST_MEDICINES.find(
                            (m) => m.id === line.medicineId,
                          );
                          if (!med) return "";
                          const dosage = med.dosages.find(
                            (d) => d.id === line.dosageId,
                          );
                          if (!dosage) return "";
                          const code = (index + 1).toString().padStart(4, "0");
                          const description = `${med.name} â€” ${dosage.label}`;
                          return `<tr><td class="px-2 py-1 border-t border-slate-100 align-top text-slate-500">${code}</td><td class="px-2 py-1 border-t border-slate-100 align-top">${description}</td><td class="px-2 py-1 border-t border-slate-100 text-right align-top">1</td><td class="px-2 py-1 border-t border-slate-100 text-left align-top">Stk</td><td class="px-2 py-1 border-t border-slate-100 text-right align-top">CHF ${dosage.price.toFixed(
                            2,
                          )}</td></tr>`;
                        })
                        .join("");

                      if (itemsHtml) {
                        contentHtml = `<div class="mt-1"><p class="mb-1 text-[11px]"><strong>Prescription</strong></p><table class="w-full border-collapse text-[11px]"><thead><tr class="bg-slate-50 text-slate-600"><th class="px-2 py-1 text-left font-semibold">Code</th><th class="px-2 py-1 text-left font-semibold">Item</th><th class="px-2 py-1 text-right font-semibold">Qty</th><th class="px-2 py-1 text-left font-semibold">Unit</th><th class="px-2 py-1 text-right font-semibold">Price</th></tr></thead><tbody>${itemsHtml}</tbody></table><p class="mt-1 text-[11px] text-slate-700"><strong>Estimated total:</strong> CHF ${totalPrice.toFixed(
                          2,
                        )}</p></div>`;
                      }
                    } else if (consultationRecordType === "invoice") {
                      const invoiceLines = invoiceServiceLines
                        .filter((line) => line.serviceId)
                        .map((line) => {
                          const service = invoiceServices.find(
                            (s) => s.id === line.serviceId,
                          );
                          const quantity = line.quantity > 0 ? line.quantity : 1;
                          const resolvedUnitPrice = (() => {
                            if (
                              line.unitPrice !== null &&
                              Number.isFinite(line.unitPrice)
                            ) {
                              return line.unitPrice;
                            }
                            const base =
                              service?.base_price !== null &&
                                service?.base_price !== undefined
                                ? Number(service.base_price)
                                : 0;
                            return Number.isFinite(base) && base > 0 ? base : 0;
                          })();

                          return {
                            label: line.customName || service?.name || "Service",
                            code: (service as any)?.code ?? null,
                            quantity,
                            unitPrice: resolvedUnitPrice,
                          };
                        });

                      let totalAmount = 0;

                      const itemsHtml = invoiceLines
                        .map((line, index) => {
                          const code = line.code || (index + 1).toString().padStart(4, "0");
                          const qtyLabel = line.quantity.toString();
                          const unitLabel = `CHF ${line.unitPrice.toFixed(2)}`;
                          const lineTotal = line.unitPrice * line.quantity;
                          totalAmount += lineTotal;
                          const lineTotalLabel = `CHF ${lineTotal.toFixed(2)}`;
                          return `<tr><td class="px-2 py-1 border-t border-slate-100 align-top text-slate-500">${code}</td><td class="px-2 py-1 border-t border-slate-100 align-top">${line.label}</td><td class="px-2 py-1 border-t border-slate-100 text-right align-top">${qtyLabel}</td><td class="px-2 py-1 border-t border-slate-100 text-right align-top">${unitLabel}</td><td class="px-2 py-1 border-t border-slate-100 text-right align-top">${lineTotalLabel}</td></tr>`;
                        })
                        .join("");

                      const paymentTermLabel =
                        invoicePaymentTerm === "installment"
                          ? "Installment"
                          : "Full payment";

                      const extraOptionLabel =
                        invoiceExtraOption === "complimentary"
                          ? "Complimentary service"
                          : null;

                      invoiceTotalAmountForInsert = totalAmount;
                      invoiceIsComplimentaryForInsert =
                        invoiceExtraOption === "complimentary";
                      invoiceIsPaidForInsert = false;

                      const paymentMethodLabel = invoicePaymentMethod.trim();

                      const invoiceIdLabel = consultationId;

                      let headerHtml = `<p class="mb-1 text-[11px]"><strong>Invoice #${invoiceIdLabel}</strong></p><p class="mb-0.5 text-[11px] text-slate-700"><strong>Payment method:</strong> ${paymentMethodLabel}</p><p class="mb-0.5 text-[11px] text-slate-700"><strong>Payment terms:</strong> ${paymentTermLabel}</p>`;

                      if (extraOptionLabel) {
                        headerHtml += `<p class="mb-0.5 text-[11px] text-slate-700"><strong>Extra option:</strong> ${extraOptionLabel}</p>`;
                      }

                      let installmentHtml = "";
                      if (
                        invoicePaymentTerm === "installment" &&
                        invoiceInstallments.length > 0 &&
                        totalAmount > 0
                      ) {
                        const rows = invoiceInstallments
                          .filter(
                            (installment) =>
                              Number.isFinite(installment.percent) &&
                              installment.percent > 0,
                          )
                          .map((installment, index) => {
                            const safePercent = Math.max(
                              0,
                              Math.min(100, installment.percent),
                            );
                            const amount = (totalAmount * safePercent) / 100;
                            let dueLabel = "â€”";
                            if (installment.dueDate) {
                              const dueDateObj = new Date(installment.dueDate);
                              if (!Number.isNaN(dueDateObj.getTime())) {
                                dueLabel = dueDateObj.toLocaleDateString();
                              }
                            }
                            const indexLabel = (index + 1)
                              .toString()
                              .padStart(2, "0");
                            return `<tr><td class="px-2 py-1 border-t border-slate-100 align-top text-slate-500">${indexLabel}</td><td class="px-2 py-1 border-t border-slate-100 align-top">${safePercent.toFixed(
                              2,
                            )}%</td><td class="px-2 py-1 border-t border-slate-100 align-top">${dueLabel}</td><td class="px-2 py-1 border-t border-slate-100 text-right align-top">CHF ${amount.toFixed(
                              2,
                            )}</td></tr>`;
                          })
                          .join("");

                        if (rows) {
                          const totalPercentLabel =
                            invoiceInstallmentsTotalPercentRounded.toFixed(2);
                          installmentHtml = `<p class="mt-2 text-[11px] text-slate-700"><strong>Installment plan</strong> (total ${totalPercentLabel}%)</p><table class="mt-1 w-full border-collapse text-[11px]"><thead><tr class="bg-slate-50 text-slate-600"><th class="px-2 py-1 text-left font-semibold">#</th><th class="px-2 py-1 text-left font-semibold">% of total</th><th class="px-2 py-1 text-left font-semibold">Due date</th><th class="px-2 py-1 text-right font-semibold">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
                        }
                      }

                      if (itemsHtml) {
                        contentHtml = `<div class="mt-1">${headerHtml}<table class="mt-2 w-full border-collapse text-[11px]"><thead><tr class="bg-slate-50 text-slate-600"><th class="px-2 py-1 text-left font-semibold">Code</th><th class="px-2 py-1 text-left font-semibold">Item</th><th class="px-2 py-1 text-right font-semibold">Qty</th><th class="px-2 py-1 text-right font-semibold">Unit price</th><th class="px-2 py-1 text-right font-semibold">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>`;
                        if (totalAmount > 0) {
                          contentHtml += `<p class="mt-1 text-[11px] text-slate-700"><strong>Estimated total:</strong> CHF ${totalAmount.toFixed(
                            2,
                          )}</p>`;
                        }
                        if (installmentHtml) {
                          contentHtml += installmentHtml;
                        }
                        contentHtml += "</div>";
                      } else {
                        contentHtml = `<div class="mt-1">${headerHtml}`;
                        if (installmentHtml) {
                          contentHtml += installmentHtml;
                        }
                        contentHtml += "</div>";
                      }
                    }
                    // Handle medication record type separately - insert into patient_prescriptions
                    if (consultationRecordType === "medication") {
                      const validProducts = medProducts.filter((p) => p.productName.trim());
                      const sharedTherapyId = crypto.randomUUID();
                      const sharedPrescriptionSheetId = medIsPrescription ? crypto.randomUUID() : null;
                      const mandatorId = consultationDoctorId || crypto.randomUUID();

                      const medPayloads = validProducts.map((product) => ({
                        patient_id: patientId,
                        journal_entry_id: crypto.randomUUID(),
                        mandator_id: mandatorId,
                        therapy_id: sharedTherapyId,
                        product_name: product.productName.trim(),
                        product_type: product.productType,
                        intake_kind: product.intakeKind,
                        amount_morning: product.amountMorning.trim() || null,
                        amount_noon: product.amountNoon.trim() || null,
                        amount_evening: product.amountEvening.trim() || null,
                        amount_night: product.amountNight.trim() || null,
                        intake_note: product.intakeNote.trim() || null,
                        intake_from_date: product.intakeFromDate || null,
                        decision_summary: medDecisionSummary.trim() || null,
                        quantity: typeof product.quantity === "number" ? product.quantity : 1,
                        show_in_mediplan: medShowInMediplan,
                        prescription_sheet_id: sharedPrescriptionSheetId,
                        active: true,
                      }));

                      const { error: medError } = await supabaseClient
                        .from("patient_prescriptions")
                        .insert(medPayloads);

                      if (medError) {
                        setConsultationError(
                          medError.message ?? "Failed to create medication.",
                        );
                        setConsultationSaving(false);
                        return;
                      }

                      // Also create a consultation record so it appears in cockpit/consultations list
                      const productNames = validProducts.map((p) => p.productName.trim()).join(", ");
                      const consultationTitle = medIsPrescription 
                        ? `Prescription: ${productNames}`
                        : `Medication: ${productNames}`;
                      
                      const consultationContent = `<div class="space-y-2">
                        <p><strong>${medIsPrescription ? "Prescription" : "Medication"}</strong></p>
                        <ul class="list-disc pl-4">
                          ${validProducts.map((p) => `<li>${p.productName.trim()}${p.quantity ? ` (Qty: ${p.quantity})` : ""}</li>`).join("")}
                        </ul>
                        ${medDecisionSummary.trim() ? `<p><strong>Notes:</strong> ${medDecisionSummary.trim()}</p>` : ""}
                      </div>`;

                      const consultationPayload = {
                        patient_id: patientId,
                        consultation_id: sharedPrescriptionSheetId || sharedTherapyId,
                        title: consultationTitle,
                        content: consultationContent,
                        record_type: "medication",
                        doctor_user_id: consultationDoctorId || null,
                        doctor_name: doctorName || null,
                        scheduled_at: scheduledAtIso,
                        is_archived: false,
                      };

                      const { error: consultError } = await supabaseClient
                        .from("consultations")
                        .insert(consultationPayload);

                      if (consultError) {
                        console.error("Failed to create consultation record for medication:", consultError);
                        // Don't block - medication was created successfully
                      }

                      // Store data for success modal before resetting form
                      const createdPrescriptionSheetId = sharedPrescriptionSheetId;
                      const wasPrescription = medIsPrescription;

                      // Reset medication form state
                      setMedProducts([createEmptyMedProduct()]);
                      setMedIntakeNote("");
                      setMedIntakeFromDate(formatLocalDateInputValue(new Date()));
                      setMedDecisionSummary("");
                      setMedSelectedTemplateId("");
                      setMedTemplateServiceFilter("");
                      setMedTemplateFilter("all");
                      setMedShowInMediplan(true);
                      setMedIsPrescription(true);

                      setConsultationSaving(false);
                      setNewConsultationOpen(false);
                      
                      // Show success modal with PDF/Email options
                      setMedCreationSuccessModal({
                        open: true,
                        prescriptionSheetId: createdPrescriptionSheetId,
                        isMedication: !wasPrescription, // if NOT prescription, it's medication type
                      });
                      
                      router.refresh();
                      return;
                    }

                    let paymentMethod: string | null = null;
                    if (consultationRecordType === "invoice") {
                      paymentMethod = invoicePaymentMethod.trim()
                        ? invoicePaymentMethod.trim()
                        : null;
                    }

                    if (consultationRecordType === "invoice") {
                      // â”€â”€ Invoice: insert ONLY into invoices + invoice_line_items â”€â”€
                      try {
                        const hasAcfLines = invoiceServiceLines.some((l) => l.serviceId.startsWith("flatrate-") || l.serviceId.startsWith("tma-"));
                        const hasTardocLines = invoiceServiceLines.some((l) => l.serviceId.startsWith("tardoc-"));
                        const isTardocInvoice = hasTardocLines;
                        const taxPointValue = CANTON_TAX_POINT_VALUES[invoiceCanton] ?? 0.96;

                        // â”€â”€ ACF Validation: validate flat rate services before saving â”€â”€
                        let workingServiceLines = [...invoiceServiceLines];
                        if (hasAcfLines) {
                          const acfLines = workingServiceLines.filter(
                            (l) => l.serviceId.startsWith("flatrate-"),
                          );

                          if (acfLines.length > 0) {
                            // Build validation request from ACF lines
                            const acfServicesToValidate = acfLines.map((line, i) => ({
                              code: line.serviceId.replace("flatrate-", ""),
                              tp: line.acfBaseTP ?? line.unitPrice ?? 0,
                              date: scheduledAtIso || new Date().toISOString(),
                              side: (line.acfSideType ?? 0) as 0 | 1 | 2 | 3,
                              externalFactor: line.acfExternalFactor ?? 1.0,
                              quantity: line.quantity > 0 ? line.quantity : 1,
                              sessionNumber: i + 1,
                              referenceCode: line.acfRefCode || "",
                            }));

                            try {
                              const validateRes = await fetch("/api/acf/sumex", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ services: acfServicesToValidate }),
                              });
                              const validateJson = await validateRes.json();

                              if (validateJson.success) {
                                const { addResults, finalize, validatedServices } = validateJson.data;

                                // Check for rejected services
                                const rejected = (addResults || []).filter((r: any) => !r.success);
                                const hasChanges =
                                  rejected.length > 0 ||
                                  (finalize.addedServiceCount ?? 0) > 0 ||
                                  (finalize.modifiedServiceCount ?? 0) > 0 ||
                                  (finalize.deletedServiceCount ?? 0) > 0;

                                // If all services were rejected, show error
                                if (validatedServices.length === 0 && rejected.length > 0) {
                                  const rejectedInfo = rejected
                                    .map((r: any) => `${r.code}: ${r.abortInfo || "rejected"}`)
                                    .join("\n");
                                  setConsultationError(
                                    `ACF validation rejected all services:\n${rejectedInfo}`,
                                  );
                                  setConsultationSaving(false);
                                  return;
                                }

                                // Show dialog if validator changed anything or rejected some services
                                if (hasChanges && validatedServices.length > 0) {
                                  const userAccepted = await new Promise<boolean>((resolve) => {
                                    acfValidationResolveRef.current = resolve;
                                    setAcfValidationDialog({
                                      originalCount: acfLines.length,
                                      validatedCount: validatedServices.length,
                                      added: finalize.addedServiceCount ?? 0,
                                      modified: finalize.modifiedServiceCount ?? 0,
                                      deleted: (finalize.deletedServiceCount ?? 0) + rejected.length,
                                      validatedServices,
                                      totalAmount: finalize.totalAmount ||
                                        validatedServices.reduce((s: number, v: any) => s + (v.amount ?? 0), 0),
                                    });
                                  });

                                  setAcfValidationDialog(null);
                                  acfValidationResolveRef.current = null;

                                  if (!userAccepted) {
                                    setConsultationSaving(false);
                                    return;
                                  }
                                }

                                // Replace ACF lines with validated services
                                if (validatedServices.length > 0) {
                                  const nonAcfLines = workingServiceLines.filter(
                                    (l) => !l.serviceId.startsWith("flatrate-"),
                                  );
                                  const validatedLines: InvoiceServiceLine[] =
                                    validatedServices.map((vs: any) => {
                                      const ef = vs.externalFactor ?? 1.0;
                                      const sideLabel =
                                        vs.side === 1 ? " [L]" : vs.side === 2 ? " [R]" : vs.side === 3 ? " [B]" : "";
                                      const factorLabel = ef !== 1.0 ? ` x${ef}` : "";
                                      return {
                                        serviceId: `flatrate-${vs.code}`,
                                        quantity: vs.quantity ?? 1,
                                        unitPrice: vs.amount ?? vs.tp * ef,
                                        groupId: null,
                                        discountPercent: null,
                                        customName: `${vs.code}${sideLabel}${factorLabel} - ${(vs.name || "").substring(0, 70)}`,
                                        acfSideType: vs.side ?? 0,
                                        acfExternalFactor: ef,
                                        acfRefCode: vs.referenceCode || "",
                                        acfBaseTP: vs.tp ?? 0,
                                      };
                                    });

                                  workingServiceLines = [...nonAcfLines, ...validatedLines];
                                }
                              } else {
                                console.warn("ACF validation failed:", validateJson.error);
                                // Continue without validation â€” user can still save
                              }
                            } catch (valErr) {
                              console.warn("ACF validation request failed:", valErr);
                              // Continue without validation â€” don't block saving
                            }
                          }
                        }

                        const invoiceLines = workingServiceLines
                          .filter((line) => line.serviceId)
                          .map((line, idx) => {
                            const isTardocLine = line.serviceId.startsWith("tardoc-");
                            const isFlatRateLine = line.serviceId.startsWith("flatrate-");
                            const isTmaLine = line.serviceId.startsWith("tma-");
                            const isAcfRelated = isFlatRateLine || isTmaLine;
                            const tardocCode = isTardocLine ? line.serviceId.replace("tardoc-", "") : null;
                            const flatRateCode = isFlatRateLine ? line.serviceId.replace("flatrate-", "") : null;
                            const tmaCode = isTmaLine ? line.serviceId.replace("tma-", "") : null;
                            const service = (isTardocLine || isAcfRelated) ? null : invoiceServices.find((s) => s.id === line.serviceId);
                            const quantity = line.quantity > 0 ? line.quantity : 1;
                            const resolvedUnitPrice = (() => {
                              if (line.unitPrice !== null && Number.isFinite(line.unitPrice)) return line.unitPrice;
                              const base = service?.base_price !== null && service?.base_price !== undefined ? Number(service.base_price) : 0;
                              return Number.isFinite(base) && base > 0 ? base : 0;
                            })();

                            // Use TARDOC TP data stored on the line itself (populated when code was added)
                            // Fall back to search results only for legacy compatibility
                            const tardocTpMT = isTardocLine ? (line.tardocTpMT ?? tardocSearchResults.find((r: any) => r.code === tardocCode)?.tpMT ?? 0) : 0;
                            const tardocTpTT = isTardocLine ? (line.tardocTpTT ?? tardocSearchResults.find((r: any) => r.code === tardocCode)?.tpTT ?? 0) : 0;
                            const tardocRecordId = isTardocLine ? (line.tardocRecordId ?? tardocSearchResults.find((r: any) => r.code === tardocCode)?.recordId ?? null) : null;
                            const tardocSection = isTardocLine ? (line.tardocSection ?? tardocSearchResults.find((r: any) => r.code === tardocCode)?.section ?? null) : null;

                            // Determine tariff code: 7=TARDOC, 5=ACF Flat Rate / TMA, null=regular
                            const tariffCode = isTardocLine ? 7 : isAcfRelated ? ACF_TARIFF_CODE : null;
                            // Derive tariff type string from tariff code (zero-padded to 3 digits)
                            const tariffType = tariffCode != null ? String(tariffCode).padStart(3, "0") : null;

                            // â”€â”€ VAT computation (Rule 4: TARDOC/insurer invoices are always VAT-exempt) â”€â”€
                            // Otherwise use the service's vat_status/vat_rate_pct.
                            // Prices stored on services are GROSS (VAT-inclusive), so we extract VAT.
                            const lineTotal = resolvedUnitPrice * quantity;
                            const isInsurerInvoice = isTardocInvoice;
                            const serviceVatPct = service?.vat_rate_pct ?? 0;
                            const lineVatRatePct = isInsurerInvoice
                              ? 0
                              : isTardocLine || isAcfRelated
                                ? 0 // TARDOC/ACF lines are always VAT-free
                                : Number(serviceVatPct) || 0;
                            const lineVatRateLabel: "FREE" | "NORMAL" =
                              lineVatRatePct > 0 ? "NORMAL" : "FREE";
                            const lineVatAmount = lineVatRatePct > 0
                              ? Math.round((lineTotal * lineVatRatePct) / (100 + lineVatRatePct) * 100) / 100
                              : 0;

                            return {
                              name: line.customName || service?.name || (tardocCode ? `TARDOC ${tardocCode}` : flatRateCode ? `Flat Rate ${flatRateCode}` : tmaCode ? `TMA ${tmaCode}` : "Service"),
                              code: isTardocLine ? tardocCode : isFlatRateLine ? flatRateCode : isTmaLine ? tmaCode : (service as any)?.code || String(idx + 1).padStart(3, '0'),
                              service_id: (isTardocLine || isAcfRelated) ? null : line.serviceId,
                              quantity,
                              unit_price: resolvedUnitPrice,
                              total_price: resolvedUnitPrice * quantity,
                              vat_rate: lineVatRateLabel,
                              vat_rate_value: lineVatRatePct,
                              vat_amount: lineVatAmount,
                              tariff_code: tariffCode,
                              tariff_type: tariffType,
                              tardoc_code: tardocCode,
                              tp_al: isAcfRelated ? (line.acfBaseTP ?? resolvedUnitPrice) : tardocTpMT,
                              tp_tl: tardocTpTT,
                              tp_al_value: isTardocLine ? taxPointValue : 1,
                              tp_tl_value: isTardocLine ? taxPointValue : 1,
                              tp_al_scale_factor: 1,
                              tp_tl_scale_factor: 1,
                              external_factor_mt: isAcfRelated ? (line.acfExternalFactor ?? 1) : isTardocLine ? (line.tardocExternalFactor ?? 1) : 1,
                              external_factor_tt: 1,
                              price_al: isTardocLine ? Math.round(tardocTpMT * taxPointValue * 100) / 100 : 0,
                              price_tl: isTardocLine ? Math.round(tardocTpTT * taxPointValue * 100) / 100 : 0,
                              provider_gln: (isTardocLine || isAcfRelated) ? selectedProviderGln : null,
                              responsible_gln: (isTardocLine || isAcfRelated) ? selectedProviderGln : null,
                              billing_role: (isTardocLine || isAcfRelated) ? "both" : null,
                              record_id: tardocRecordId,
                              ref_code: isAcfRelated ? (line.acfRefCode || null) : isTardocLine ? (line.tardocRefCode || null) : (null as string | null),
                              section_code: tardocSection,
                              session_number: 1,
                              service_attributes: 0,
                              side_type: isAcfRelated ? (line.acfSideType ?? 0) : isTardocLine ? (line.tardocSideType ?? 0) : 0,
                              date_begin: scheduledAtIso || null,
                              catalog_name: isTardocLine ? "TARDOC" : isFlatRateLine ? "ACF" : isTmaLine ? "TMA" : null,
                              catalog_nature: (isTardocLine || isAcfRelated) ? "TARIFF_CATALOG" : null,
                            };
                          });

                        // For TARDOC: derive correct ref_codes using the Sumex TARDOC
                        // validator catalog (ISearch::MasterCode + SearchAdditionalService).
                        // This replaces the old naive fallback that blindly set every
                        // secondary code's ref_code to the first TARDOC code, which caused
                        // Sumex [817] errors (e.g. AA.00.0020 wrongly referencing AA.00.0070).
                        if (isTardocInvoice) {
                          const tardocOnlyLines = invoiceLines.filter((l) => !!l.tardoc_code);
                          if (tardocOnlyLines.length > 1) {
                            try {
                              const suggestRes = await fetch("/api/tardoc/suggest-refs", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  codes: tardocOnlyLines.map((l) => l.tardoc_code),
                                  lang: 2,
                                }),
                              });
                              if (suggestRes.ok) {
                                const suggestData = await suggestRes.json();
                                if (suggestData.success && Array.isArray(suggestData.data)) {
                                  for (const suggestion of suggestData.data) {
                                    const line = tardocOnlyLines.find((l) => l.tardoc_code === suggestion.code);
                                    // Only set if the user hasn't already provided one
                                    if (line && !line.ref_code) {
                                      line.ref_code = suggestion.suggestedRef || null;
                                    }
                                  }
                                }
                              }
                            } catch (err) {
                              console.warn("[MedicalConsultationsCard] suggest-refs failed, skipping ref_code autofill:", err);
                            }
                          }
                        }

                        // Validate TARDOC services with Sumex before creating invoice
                        if (isTardocInvoice && !skipSumexValidation) {
                          const tardocItems = invoiceLines.filter((l) => l.tariff_type === "007");
                          if (tardocItems.length > 0) {
                            try {
                              const valRes = await fetch("/api/tardoc/groups/validate", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  items: tardocItems.map((l) => ({
                                    tardoc_code: l.tardoc_code || l.code,
                                    quantity: l.quantity,
                                    ref_code: l.ref_code || "",
                                    side_type: l.side_type ?? 0,
                                    tp_mt: l.tp_al ?? 0,
                                    tp_tt: l.tp_tl ?? 0,
                                    external_factor_mt: l.external_factor_mt ?? 1,
                                    external_factor_tt: l.external_factor_tt ?? 1,
                                  })),
                                  canton: invoiceCanton,
                                  law_type: invoiceLawType,
                                }),
                              });
                              const valJson = await valRes.json();
                              if (!valJson.valid) {
                                const errors = (valJson.services || [])
                                  .filter((s: any) => !s.accepted)
                                  .map((s: any) => `${s.code}: ${s.errorMessage}`)
                                  .join("\n");
                                setConsultationError(
                                  `Sumex TARDOC validation failed:\n${errors || valJson.error || "Unknown validation error"}`,
                                );
                                setConsultationSaving(false);
                                return;
                              }
                            } catch (valErr) {
                              console.warn("TARDOC validation request failed:", valErr);
                              setConsultationError(
                                "TARDOC validation failed â€” could not reach Sumex server. Please try again.",
                              );
                              setConsultationSaving(false);
                              return;
                            }
                          }
                        }

                        // Fetch billing entity (clinic) data to get IBAN
                        let providerIban = null;
                        if (selectedProviderId) {
                          const { data: billingEntity } = await supabaseClient
                            .from("providers")
                            .select("iban")
                            .eq("id", selectedProviderId)
                            .single();
                          providerIban = billingEntity?.iban || null;
                        }

                        // Fetch medical staff (doctor/nurse) data to get GLN/ZSR/Canton
                        let doctorGln = null;
                        let doctorZsr = null;
                        let doctorCanton = null;
                        if (consultationDoctorId) {
                          const { data: staffData } = await supabaseClient
                            .from("providers")
                            .select("gln, zsr, canton, role")
                            .eq("id", consultationDoctorId)
                            .single();
                          
                          // Only populate GLN/ZSR if staff is a doctor (not nurse/technician)
                          if (staffData?.role === "doctor") {
                            doctorGln = staffData.gln || null;
                            doctorZsr = staffData.zsr || null;
                          }
                          doctorCanton = staffData?.canton || null;
                        }

                        // Auto-select first billing entity if none selected (required for Sumex1 PDF generation)
                        // Skip for doctors who must choose manually (Miles, Nordback, Koltunova, Plakalo, Guarino, Benani)
                        let finalProviderId = selectedProviderId;
                        let finalProviderName = selectedProviderName;
                        let finalProviderGln = selectedProviderGln;
                        let finalProviderZsr = selectedProviderZsr;
                        let finalProviderIban = providerIban;
                        
                        if (!finalProviderId && billingEntityOptions.length > 0) {
                          const docForFallback = medicalStaffOptions.find((d) => d.id === consultationDoctorId);
                          const docNameLC = (docForFallback?.name || "").toLowerCase();
                          const skipFallback = ["miles", "nordback", "koltunova", "plakalo", "guarino", "benani"].some((n) => docNameLC.includes(n));
                          if (!skipFallback) {
                            const defaultEntity = billingEntityOptions[0];
                            finalProviderId = defaultEntity.id;
                            finalProviderName = defaultEntity.name;
                            finalProviderGln = defaultEntity.gln || null;
                            finalProviderZsr = defaultEntity.zsr || null;
                            finalProviderIban = defaultEntity.iban || null;
                          }
                        }

                        // Build invoice payload (shared between insert and update)
                        const invoicePayload: Record<string, unknown> = {
                            title: consultationTitle.trim() || consultationId,
                            invoice_date: consultationDate,
                            treatment_date: scheduledAtIso,
                            doctor_user_id: consultationDoctorId || null,
                            doctor_name: doctorName,
                            provider_id: finalProviderId,
                            provider_name: "TOA SA",
                            provider_gln: finalProviderGln,
                            provider_zsr: finalProviderZsr,
                            provider_iban: finalProviderIban,
                            doctor_gln: doctorGln,
                            doctor_zsr: doctorZsr,
                            doctor_canton: doctorCanton,
                            subtotal: invoiceTotalAmountForInsert || 0,
                            vat_amount: invoiceLines.reduce(
                              (sum, l) => sum + (Number(l.vat_amount) || 0),
                              0,
                            ),
                            total_amount: invoiceTotalAmountForInsert || 0,
                            is_complimentary: invoiceIsComplimentaryForInsert,
                            payment_method: paymentMethod,
                            appointment_id: invoiceApptLinkEnabled && invoiceAppointmentId ? invoiceAppointmentId : null,
                            notes: invoiceNotes.trim() || null,
                        };

                        // Add TARDOC-specific invoice fields
                        if (isTardocInvoice) {
                          invoicePayload.treatment_canton = invoiceCanton;
                          invoicePayload.treatment_reason = invoiceLawType === "UVG" ? "accident" : "disease";
                          invoicePayload.treatment_date_end = scheduledAtIso;
                          invoicePayload.billing_type = "TP";
                          invoicePayload.health_insurance_law = invoiceLawType;
                          if (invoiceLawType === "UVG" && invoiceAccidentDate) {
                            invoicePayload.accident_date = invoiceAccidentDate;
                          }
                          invoicePayload.diagnosis_codes = invoiceDiagnosisCodes.length > 0
                            ? invoiceDiagnosisCodes.map((c) => ({ code: c, type: "ICD" }))
                            : undefined;
                        }

                        // Add ACF/TARDOC-specific invoice fields (when ACF or TARDOC lines present)
                        if (hasAcfLines || hasTardocLines) {
                          invoicePayload.treatment_canton = invoiceCanton;
                          invoicePayload.treatment_reason = invoiceLawType === "UVG" ? "accident" : "disease";
                          invoicePayload.treatment_date_end = scheduledAtIso;
                          invoicePayload.billing_type = "TP";
                          invoicePayload.health_insurance_law = invoiceLawType;
                          if (invoiceLawType === "UVG" && invoiceAccidentDate) {
                            invoicePayload.accident_date = invoiceAccidentDate;
                          }
                          invoicePayload.diagnosis_codes = invoiceDiagnosisCodes.length > 0
                            ? invoiceDiagnosisCodes.map((c) => ({ code: c, type: "ICD" }))
                            : undefined;
                        }

                        // Build line items payload (shared between insert and update)
                        const buildLineItemsPayload = (targetInvoiceId: string) =>
                          invoiceLines.map((line, idx) => ({
                            invoice_id: targetInvoiceId,
                            sort_order: idx + 1,
                            code: line.code,
                            service_id: line.service_id,
                            name: line.name,
                            quantity: line.quantity,
                            unit_price: line.unit_price,
                            total_price: line.total_price,
                            vat_rate: line.vat_rate,
                            vat_rate_value: line.vat_rate_value,
                            vat_amount: line.vat_amount,
                            tariff_code: line.tariff_code,
                            tardoc_code: line.tardoc_code,
                            tp_al: line.tp_al,
                            tp_tl: line.tp_tl,
                            tp_al_value: line.tp_al_value,
                            tp_tl_value: line.tp_tl_value,
                            tp_al_scale_factor: line.tp_al_scale_factor,
                            tp_tl_scale_factor: line.tp_tl_scale_factor,
                            external_factor_mt: line.external_factor_mt,
                            external_factor_tt: line.external_factor_tt,
                            price_al: line.price_al,
                            price_tl: line.price_tl,
                            provider_gln: line.provider_gln,
                            responsible_gln: line.responsible_gln,
                            billing_role: line.billing_role,
                            record_id: line.record_id,
                            ref_code: line.ref_code,
                            section_code: line.section_code,
                            session_number: line.session_number,
                            service_attributes: line.service_attributes,
                            side_type: line.side_type ?? 0,
                            date_begin: line.date_begin,
                            catalog_name: line.catalog_name,
                            catalog_nature: line.catalog_nature,
                          }));

                        let invoiceRowId: string;

                        if (editingInvoiceId) {
                          // â”€â”€ EDIT MODE: Update existing invoice â”€â”€
                          const { error: invoiceUpdateError } = await supabaseClient
                            .from("invoices")
                            .update(invoicePayload)
                            .eq("id", editingInvoiceId);

                          if (invoiceUpdateError) {
                            setConsultationError(
                              invoiceUpdateError.message ?? "Failed to update invoice.",
                            );
                            setConsultationSaving(false);
                            return;
                          }

                          invoiceRowId = editingInvoiceId;

                          // Delete old line items and re-insert
                          await supabaseClient
                            .from("invoice_line_items")
                            .delete()
                            .eq("invoice_id", editingInvoiceId);

                          if (invoiceLines.length > 0) {
                            const { error: lineItemsError } = await supabaseClient
                              .from("invoice_line_items")
                              .insert(buildLineItemsPayload(editingInvoiceId));
                            if (lineItemsError) {
                              console.error("Failed to update invoice line items:", lineItemsError);
                            }
                          }

                          // Update local state
                          setConsultations((prev) =>
                            prev.map((row) =>
                              row.invoice_id === editingInvoiceId
                                ? {
                                    ...row,
                                    title: effectiveTitle,
                                    doctor_user_id: consultationDoctorId || null,
                                    doctor_name: doctorName,
                                    scheduled_at: scheduledAtIso,
                                    payment_method: paymentMethod,
                                    invoice_total_amount: invoiceTotalAmountForInsert,
                                    invoice_is_complimentary: invoiceIsComplimentaryForInsert,
                                  }
                                : row
                            )
                          );

                          // Reset editing state + close form
                          setEditingInvoiceId(null);
                          setEditingInvoiceNumber(null);
                          setConsultationSaving(false);
                          setNewConsultationOpen(false);
                          setInvoicePaymentMethod("");
                          setInvoiceProviderId("");
                          setInvoiceMode("individual");
                          setInvoiceApptLinkEnabled(false);
                          setInvoiceAppointmentId("");
                          setInvoiceGroupId("");
                          setInvoicePaymentTerm("full");
                          setInvoiceExtraOption(null);
                          setInvoiceInstallments([]);
                          setInvoiceServiceLines([]);
                          setInvoiceSelectedCategoryId("");
                          setInvoiceSelectedServiceId("");
                          setInvoiceDiagnosisCodes([]);
                          setInvoiceDiagnosisInput("");
                          setConsultationDiagnosisCode("");
                          setConsultationRefIcd10("");
                          setInvoiceFromConsultationId(null);
                          router.refresh();
                          return; // Skip the rest of the creation flow
                        }

                        // â”€â”€ CREATE MODE: Insert new invoice â”€â”€
                        const isCashOrCard = ["cash", "card"].includes((paymentMethod || "").toLowerCase());
                        const nowIso = new Date().toISOString();
                        const invoiceInsertPayload: Record<string, unknown> = {
                          ...invoicePayload,
                          patient_id: patientId,
                          consultation_id: invoiceFromConsultationId || null,
                          invoice_number: consultationId,
                          status: isCashOrCard ? "PAID" : "OPEN",
                          paid_amount: isCashOrCard ? (invoiceTotalAmountForInsert || 0) : 0,
                          paid_at: isCashOrCard ? nowIso : null,
                          paid_by_user_id: isCashOrCard ? (createdByUserId || null) : null,
                          created_by_user_id: createdByUserId,
                          created_by_name: createdByName,
                          is_archived: false,
                          reference_number: generateSwissReference(consultationId),
                          is_demo: false,
                        };

                        const { data: invoiceRow, error: invoiceInsertError } = await supabaseClient
                          .from("invoices")
                          .insert(invoiceInsertPayload)
                          .select("id")
                          .single();

                        if (invoiceInsertError || !invoiceRow) {
                          setConsultationError(
                            invoiceInsertError?.message ?? "Failed to create invoice.",
                          );
                          setConsultationSaving(false);
                          return;
                        }

                        invoiceRowId = invoiceRow.id;

                        // Insert line items
                        if (invoiceLines.length > 0) {
                          const { error: lineItemsError } = await supabaseClient
                            .from("invoice_line_items")
                            .insert(buildLineItemsPayload(invoiceRow.id));

                          if (lineItemsError) {
                            console.error("Failed to insert invoice line items:", lineItemsError);
                          }
                        }

                        // â”€â”€ Auto-queue patient (TG) PDF generation in background â”€â”€
                        // The Railway worker will pick this up and generate the PDF async.
                        fetch("/api/invoices/queue-pdf", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            invoiceId: invoiceRow.id,
                            invoiceType: "tg",
                            createdByUserId,
                          }),
                        }).catch(err => console.error("[AutoQueuePDF] Failed to queue TG PDF:", err));

                        // Save installments to DB if payment term is installment
                        if (invoicePaymentTerm === "installment" && invoiceInstallments.length > 0) {
                          const totalAmount = invoiceTotalAmountForInsert || 0;
                          const isOnlinePayment = paymentMethod?.toLowerCase().includes("online") || paymentMethod?.toLowerCase() === "card";
                          
                          // Create Payrexx gateways for each installment if payment method is Online
                          const installmentRowsWithPayrexx = await Promise.all(
                            invoiceInstallments
                              .filter((inst) => Number.isFinite(inst.percent) && inst.percent > 0)
                              .map(async (inst, idx) => {
                                const installmentAmount = Math.round((totalAmount * Math.min(100, inst.percent)) / 100 * 100) / 100;
                                const installmentNumber = idx + 1;
                                
                                let payrexxData: any = {};
                                if (isOnlinePayment) {
                                  try {
                                    const payrexxRes = await fetch("/api/payrexx/create-gateway", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        amount: installmentAmount,
                                        currency: "CHF",
                                        purpose: `Installment ${installmentNumber} - Invoice ${consultationId}`,
                                        referenceId: `${consultationId}-I${installmentNumber}`,
                                      }),
                                    });
                                    const payrexxJson = await payrexxRes.json();
                                    if (payrexxJson.success) {
                                      payrexxData = {
                                        payrexx_gateway_id: payrexxJson.gatewayId,
                                        payrexx_gateway_hash: payrexxJson.hash,
                                        payrexx_payment_link: payrexxJson.link,
                                        payrexx_payment_status: "waiting",
                                      };
                                      console.log(`[Installment ${installmentNumber}] Payrexx link created: ${payrexxJson.link}`);
                                    }
                                  } catch (payrexxErr) {
                                    console.error(`[Installment ${installmentNumber}] Failed to create Payrexx link:`, payrexxErr);
                                  }
                                }
                                
                                // Generate invoice number and reference for this installment
                                const installmentInvoiceNumber = `${consultationId}${installmentNumber.toString().padStart(4, '0')}`;
                                const installmentReference = generateSwissReference(installmentInvoiceNumber);
                                
                                return {
                                  invoice_id: invoiceRow.id,
                                  installment_number: installmentNumber,
                                  amount: installmentAmount,
                                  due_date: inst.dueDate || null,
                                  payment_method: paymentMethod || null,
                                  status: "PENDING",
                                  paid_amount: 0,
                                  invoice_number: installmentInvoiceNumber,
                                  reference_number: installmentReference,
                                  ...payrexxData,
                                };
                              })
                          );
                          
                          if (installmentRowsWithPayrexx.length > 0) {
                            const { error: instError } = await supabaseClient
                              .from("invoice_installments")
                              .insert(installmentRowsWithPayrexx);
                            if (instError) {
                              console.error("Failed to insert installments:", instError);
                            }
                          }
                        }

                        // Create Payrexx payment gateway if applicable
                        const pmLower = paymentMethod?.toLowerCase() || "";
                        if (pmLower.includes("cash") || pmLower.includes("online") || pmLower.includes("card")) {
                          try {
                            const payrexxResponse = await fetch("/api/payments/create-payrexx-gateway", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ invoiceId: invoiceRow.id }),
                            });

                            if (!payrexxResponse.ok) {
                              console.error("Failed to create Payrexx payment gateway");
                            }
                          } catch (payrexxError) {
                            console.error("Error creating Payrexx gateway:", payrexxError);
                          }
                        }

                        // Build ConsultationRow from the invoice for local state
                        const inserted: ConsultationRow = {
                          id: invoiceRow.id,
                          patient_id: patientId,
                          consultation_id: consultationId,
                          title: effectiveTitle,
                          content: contentHtml,
                          record_type: "invoice",
                          doctor_user_id: consultationDoctorId || null,
                          doctor_name: doctorName,
                          scheduled_at: scheduledAtIso,
                          payment_method: paymentMethod,
                          duration_seconds: null,
                          invoice_id: invoiceRow.id,
                          invoice_total_amount: invoiceTotalAmountForInsert,
                          invoice_is_complimentary: invoiceIsComplimentaryForInsert,
                          invoice_is_paid: isCashOrCard,
                          invoice_status: isCashOrCard ? "PAID" : "OPEN",
                          invoice_paid_amount: isCashOrCard ? (invoiceTotalAmountForInsert || 0) : null,
                          cash_receipt_path: null,
                          invoice_pdf_path: null,
                          invoice_pdf_path_tg: null,
                          invoice_pdf_path_tp: null,
                          invoice_pdf_path_reminder: null,
                          invoice_pdf_path_receipt: null,
                          invoice_due_date: null,
                          invoice_reminder_level: 0,
                          invoice_reminder_1_sent_at: null,
                          invoice_reminder_2_sent_at: null,
                          invoice_reminder_3_sent_at: null,
                          payment_link_token: null,
                          payrexx_payment_link: null,
                          payrexx_payment_status: null,
                          created_by_user_id: createdByUserId,
                          created_by_name: createdByName,
                          is_archived: false,
                          archived_at: null,
                          reference_number: generateSwissReference(consultationId),
                          diagnosis_code: null,
                          ref_icd10: null,
                          linked_invoice_id: null,
                          linked_invoice_status: null,
                          linked_invoice_number: null,
                          medidata_status: null,
                        };

                        setConsultations((prev) => {
                          // Add the new invoice row
                          const updated = [inserted, ...prev];
                          // If this invoice was created from a consultation, update that consultation's linked fields
                          if (invoiceFromConsultationId) {
                            return updated.map((row) =>
                              row.id === invoiceFromConsultationId
                                ? {
                                    ...row,
                                    linked_invoice_id: invoiceRow.id,
                                    linked_invoice_status: "OPEN" as InvoiceStatus,
                                    linked_invoice_number: consultationId,
                                  }
                                : row
                            );
                          }
                          return updated;
                        });

                        // Show success message when invoice created from consultation
                        if (invoiceFromConsultationId) {
                          setInvoiceFromConsultationSuccess(
                            `Invoice #${consultationId} created successfully! Switch to the Invoice tab to view it.`
                          );
                          const sourceRow = consultations.find((row) => row.id === invoiceFromConsultationId) ?? null;
                          void logConsultationNoteEvent(sourceRow, "invoice_linked", {
                            invoiceId: invoiceRow.id,
                            invoiceNumber: consultationId,
                          });
                          // Auto-dismiss after 8 seconds
                          setTimeout(() => setInvoiceFromConsultationSuccess(null), 8000);
                        }
                      } catch (invoiceErr) {
                        console.error("Error creating invoice:", invoiceErr);
                        setConsultationError("Failed to create invoice.");
                        setConsultationSaving(false);
                        return;
                      }
                    } else {
                      // â”€â”€ Non-invoice: insert or update consultations table â”€â”€
                      const consultationPayload: Record<string, unknown> = {
                        patient_id: patientId,
                        consultation_id: consultationId,
                        title: effectiveTitle,
                        content: contentHtml,
                        record_type: consultationRecordType,
                        doctor_user_id: consultationDoctorId,
                        doctor_name: doctorName,
                        scheduled_at: scheduledAtIso,
                        payment_method: paymentMethod,
                        duration_seconds: durationSeconds || 0,
                        created_by_user_id: createdByUserId,
                        created_by_name: createdByName,
                        is_archived: false,
                        archived_at: null,
                        diagnosis_code: consultationDiagnosisCode.trim() || null,
                        ref_icd10: consultationRefIcd10.trim() || null,
                      };

                      let data: Record<string, unknown> | null = null;
                      let error: { message: string } | null = null;

                      // If we have a draft from autosave, update it instead of creating new
                      if (newConsultationDraftId) {
                        const {
                          data: { session },
                        } = await supabaseClient.auth.getSession();
                        const finalizeResponse = await fetch("/api/consultation-drafts/finalize", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            ...(session?.access_token
                              ? { Authorization: `Bearer ${session.access_token}` }
                              : {}),
                          },
                          body: JSON.stringify({
                            draftId: newConsultationDraftId,
                            patientId,
                            title: effectiveTitle,
                            contentHtml,
                            recordType: consultationRecordType,
                            doctorId: consultationDoctorId,
                            doctorName,
                            scheduledAt: scheduledAtIso,
                            paymentMethod,
                            durationSeconds: durationSeconds || 0,
                            diagnosisCode: consultationDiagnosisCode,
                            refIcd10: consultationRefIcd10,
                          }),
                        });
                        const finalizeResult = await finalizeResponse.json().catch(() => null);
                        if (!finalizeResponse.ok || !finalizeResult?.consultation) {
                          error = {
                            message:
                              finalizeResult?.error ??
                              "Failed to finalize consultation draft.",
                          };
                        } else {
                          data = finalizeResult.consultation;
                        }
                      } else {
                        const result = await supabaseClient
                          .from("consultations")
                          .insert(consultationPayload)
                          .select(
                            "id, patient_id, consultation_id, title, content, record_type, doctor_user_id, doctor_name, scheduled_at, payment_method, duration_seconds, invoice_total_amount, invoice_is_complimentary, invoice_is_paid, invoice_status, invoice_paid_amount, cash_receipt_path, invoice_pdf_path, payment_link_token, payrexx_payment_link, payrexx_payment_status, created_by_user_id, created_by_name, is_archived, archived_at, diagnosis_code, ref_icd10",
                          )
                          .single();
                        data = result.data;
                        error = result.error;
                      }

                      if (error || !data) {
                        setConsultationError(
                          error?.message ?? "Failed to create consultation.",
                        );
                        setConsultationSaving(false);
                        return;
                      }

                      const savedRow: ConsultationRow = {
                        ...(data as any),
                        invoice_id: null,
                        reference_number: null,
                        diagnosis_code: (data as any).diagnosis_code ?? null,
                        ref_icd10: (data as any).ref_icd10 ?? null,
                        linked_invoice_id: null,
                        linked_invoice_status: null,
                        linked_invoice_number: null,
                        medidata_status: null,
                      };
                      
                      // If we updated a draft, update in place; otherwise add to top
                      if (newConsultationDraftId) {
                        setConsultations((prev) =>
                          prev.map((row) =>
                            row.id === newConsultationDraftId ? savedRow : row
                          )
                        );
                        setNewConsultationDraftId(null);
                        consultationYFieldsRef.current?.delete("draftId");
                      } else {
                        setConsultations((prev) => [savedRow, ...prev]);
                      }

                      broadcastPatientRealtimeRefresh();
                    }

                    setConsultationSaving(false);
                    consultationYFieldsRef.current?.set("open", "false");
                    setNewConsultationOpen(false);
                    setEditingInvoiceId(null);
                    setEditingInvoiceNumber(null);
                    setConsultationDurationSeconds(0);
                    setConsultationStopwatchStartedAt(null);
                    setConsultationStopwatchNow(Date.now());
                    setInvoicePaymentMethod("");
                    setInvoiceProviderId("");
                    setInvoiceMode("individual");
                    setInvoiceApptLinkEnabled(false);
                    setInvoiceAppointmentId("");
                    setInvoiceGroupId("");
                    setInvoicePaymentTerm("full");
                    setInvoiceExtraOption(null);
                    setInvoiceInstallments([]);
                    setInvoiceServiceLines([]);
                    setInvoiceSelectedCategoryId("");
                    setInvoiceSelectedServiceId("");
                    setInvoiceDiagnosisCodes([]);
                    setInvoiceDiagnosisInput("");
                    setConsultationDiagnosisCode("");
                    setConsultationRefIcd10("");
                    setInvoiceFromConsultationId(null);
                  } catch {
                    setConsultationError(tf("errUnexpected"));
                    setConsultationSaving(false);
                  }
                })();
              }}
              className="space-y-3"
            >
              {editingInvoiceId && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 flex items-center gap-2">
                  <svg className="h-4 w-4 text-sky-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  <p className="text-[11px] text-sky-800">
                    <strong>{tf("editingInvoice", { number: editingInvoiceNumber ?? "" })}</strong> â€” {tf("editingInvoiceDesc")}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.4fr)] gap-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    {tf("date")}
                  </label>
                  <input
                    type="date"
                    value={consultationDate}
                    disabled={consultationRecordType === "notes" && consultationLocked}
                    onChange={(event) => setConsultationDate(event.target.value)}
                    className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    {tf("time")}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={consultationHour}
                      disabled={consultationRecordType === "notes" && consultationLocked}
                      onChange={(event) =>
                        setConsultationHour(event.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="21"
                      className="w-10 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    <span className="text-xs text-slate-500">:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={consultationMinute}
                      disabled={consultationRecordType === "notes" && consultationLocked}
                      onChange={(event) =>
                        setConsultationMinute(
                          event.target.value.replace(/[^0-9]/g, ""),
                        )
                      }
                      placeholder="52"
                      className="w-10 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    {consultationRecordType === "invoice" ? tf("medicalStaff") : tf("doctor")}
                  </label>
                  <select
                    value={consultationDoctorId}
                    disabled={consultationRecordType === "notes" && consultationLocked}
                    onChange={(event) => {
                      setConsultationDoctorId(event.target.value);
                    }}
                    className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="">{consultationRecordType === "invoice" ? tf("selectStaff") : tf("selectDoctor")}</option>
                    {consultationRecordType === "invoice" 
                      ? medicalStaffOptions
                          .filter((staff) => !(staff.name || "").toLowerCase().includes("boursault"))
                          .map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.name}{staff.specialty ? ` (${staff.specialty})` : ""}{staff.gln ? ` - GLN: ${staff.gln}` : ""}
                          </option>
                        ))
                      : userOptions.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.full_name || user.email}
                          </option>
                        ))
                    }
                  </select>
                </div>
              </div>


              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)] gap-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    {tf("title")}
                  </label>
                  <input
                    type="text"
                    value={consultationTitle}
                    disabled={consultationRecordType === "notes" && consultationLocked}
                    onChange={(event) => { setConsultationTitle(event.target.value); triggerNewConsultationAutosave(); }}
                    placeholder="Consultation ID:"
                    className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    {tf("recordType")}
                  </label>
                  <select
                    value={consultationRecordType}
                    disabled={!!editingInvoiceId || (consultationRecordType === "notes" && consultationLocked)}
                    onChange={(event) => {
                      const nextType =
                        event.target.value as ConsultationRecordType;
                      const wasInvoice = consultationRecordType === "invoice";
                      const isInvoice = nextType === "invoice";
                      setConsultationRecordType(nextType);
                      // Clear doctor/provider selection when switching between invoice and non-invoice
                      if (wasInvoice !== isInvoice) {
                        setConsultationDoctorId("");
                      }
                      if (nextType === "prescription") {
                        setPrescriptionLines((prev) =>
                          prev.length > 0 ? prev : [{ medicineId: "", dosageId: "" }],
                        );
                      }
                    }
                    }
                    className={`block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${editingInvoiceId ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {otherConsultationRecordTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Diagnosis fields â€” shown for notes and prescription record types */}
              {(consultationRecordType === "notes" || consultationRecordType === "prescription") && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      {tf("diagnosisCode")}
                    </label>
                    <input
                      type="text"
                      value={consultationDiagnosisCode}
                      disabled={consultationRecordType === "notes" && consultationLocked}
                      onChange={(e) => { setConsultationDiagnosisCode(e.target.value); triggerNewConsultationAutosave(); }}
                      placeholder="e.g. L91.0"
                      className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      {tf("refIcd10")}
                    </label>
                    <input
                      type="text"
                      value={consultationRefIcd10}
                      disabled={consultationRecordType === "notes" && consultationLocked}
                      onChange={(e) => { setConsultationRefIcd10(e.target.value); triggerNewConsultationAutosave(); }}
                      placeholder="e.g. Z42.1"
                      className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>
                </div>
              )}

              {consultationRecordType === "notes" ? (
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    {tf("notesLabel")}
                  </label>
                  <div
                    className={`overflow-visible rounded-lg border shadow-sm transition-colors ${
                      consultationLocked
                        ? "border-slate-300 bg-slate-100"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-slate-900">
                            {consultationTitle.trim() || `Consultation Note${newConsultationDraftId ? ` #${newConsultationDraftId.slice(0, 6)}` : ""}`}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Created: {consultationDate || "Today"} {consultationHour || "--"}:{consultationMinute || "--"}
                          </div>
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="hidden items-center gap-1.5 md:flex">
                          {[
                            { id: currentUserId ?? "current", name: currentUserName || currentUserEmail || "You" },
                            ...consultationRemoteUsers,
                          ].slice(0, 3).map((user, index) => (
                            <span
                              key={`${user.id}-${index}`}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white shadow-sm ${
                                index === 0 ? "bg-violet-500" : index === 1 ? "bg-emerald-500" : "bg-sky-500"
                              }`}
                              title={user.name}
                            >
                              {user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U"}
                            </span>
                          ))}
                          {consultationRemoteUsers.length > 2 ? (
                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[9px] font-semibold text-white">
                              +{consultationRemoteUsers.length - 2}
                            </span>
                          ) : null}
                          <span className="ml-1 text-[10px] font-medium text-slate-600">
                            {consultationRemoteUsers.length + 1} {consultationRemoteUsers.length === 0 ? "user" : "users"} editing
                          </span>
                        </div>
                        <div className="hidden h-7 w-px bg-slate-200 md:block" />
                        {!consultationLocked ? (
                          <button
                            type="button"
                            onClick={async () => {
                              if (consultationSaving) return;
                              const sourceConsultationId = newConsultationDraftIdRef.current;
                              const sourceRow = sourceConsultationId
                                ? consultations.find((row) => row.id === sourceConsultationId) ?? null
                                : null;
                              if (sourceRow) {
                                await openInvoiceFormFromConsultation(sourceRow);
                                return;
                              }
                              const now = new Date();
                              setInvoiceFromConsultationId(sourceConsultationId);
                              setConsultationRecordType("invoice");
                              setConsultationTitle("");
                              setConsultationDoctorId("");
                              setInvoiceProviderId("");
                              setConsultationDiagnosisCode("");
                              setConsultationRefIcd10("");
                              setConsultationDate(formatLocalDateInputValue(now));
                              setConsultationHour(now.getHours().toString().padStart(2, "0"));
                              setConsultationMinute(now.getMinutes().toString().padStart(2, "0"));
                              setInvoicePaymentMethod("");
                              setInvoiceMode("individual");
                              setInvoiceGroupId("");
                              setInvoicePaymentTerm("full");
                              setInvoiceExtraOption(null);
                              setInvoiceInstallments([]);
                              setInvoiceServiceLines([]);
                              setInvoiceSelectedCategoryId("");
                              setInvoiceSelectedServiceId("");
                              setConsultationError(null);
                              setNewConsultationOpen(true);
                              setTimeout(() => {
                                creationFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }, 100);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
                            title="Create an invoice while keeping this note open"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414A1 1 0 0 1 19 9.414V19a2 2 0 0 1-2 2z" />
                            </svg>
                            Create Invoice
                          </button>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void toggleConsultationLock();
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                            title={consultationLocked ? "Reopen note for everyone" : "Close note as read-only for everyone"}
                          >
                            {consultationLocked ? (
                              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="5" y="8" width="10" height="8" rx="1.5" />
                                <path d="M12.5 8V5.8a2.5 2.5 0 0 0-4.65-1.28" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="5" y="8" width="10" height="8" rx="1.5" />
                                <path d="M7.5 8V5.8a2.5 2.5 0 0 1 5 0V8" />
                              </svg>
                            )}
                          </button>
                          <div className="leading-tight">
                            <div className={`text-[11px] font-semibold ${consultationLocked ? "text-amber-700" : "text-emerald-700"}`}>
                              {consultationLocked ? "Closed" : "Open"}
                            </div>
                            <div className="text-[9px] text-slate-500">
                              {consultationLocked ? "Read-only for all" : "Editable for all"}
                            </div>
                          </div>
                        </div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setConsultationNoteMenuOpen((open) => !open)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                            title="Note actions"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5.5h.01M12 12h.01M12 18.5h.01" />
                            </svg>
                          </button>
                          {consultationNoteMenuOpen ? (
                            <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-[11px] shadow-lg">
                              <button
                                type="button"
                                onClick={() => {
                                  setConsultationNoteMenuOpen(false);
                                  void toggleConsultationLock();
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                              >
                                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="5" y="8" width="10" height="8" rx="1.5" />
                                  <path d={consultationLocked ? "M12.5 8V5.8a2.5 2.5 0 0 0-4.65-1.28" : "M7.5 8V5.8a2.5 2.5 0 0 1 5 0V8"} />
                                </svg>
                                {consultationLocked ? "Reopen note (editable for all)" : "Close note (read-only for all)"}
                              </button>
                              {activeCollaborativeConsultation?.id ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setConsultationNoteMenuOpen(false);
                                    const archived = await handleArchiveConsultation(activeCollaborativeConsultation.id);
                                    if (!archived) return;
                                    consultationYFieldsRef.current?.set("open", "false");
                                    setNewConsultationOpen(false);
                                    setNewConsultationDraftId(null);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M7 7v12h10V7M9 7V5h6v2" />
                                  </svg>
                                  Archive note
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className={`flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500 ${
                      consultationLocked ? "pointer-events-none opacity-55" : ""
                    }`}>
                      <button
                        type="button"
                        onClick={() => runEditorHistoryCommand(consultationNotesEditor, "undo")}
                        disabled={!canRunEditorHistoryCommand(consultationNotesEditor, "undo")}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-white text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Undo"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-1" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => runEditorHistoryCommand(consultationNotesEditor, "redo")}
                        disabled={!canRunEditorHistoryCommand(consultationNotesEditor, "redo")}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-white text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Redo"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h1" />
                        </svg>
                      </button>
                      <span className="mx-1 h-5 w-px bg-slate-200" />
                      <select
                        value={
                          consultationNotesEditor?.isActive("heading", { level: 2 })
                            ? "h2"
                            : consultationNotesEditor?.isActive("heading", { level: 3 })
                              ? "h3"
                              : "paragraph"
                        }
                        onChange={(event) => {
                          const chain = consultationNotesEditor?.chain().focus();
                          if (!chain) return;
                          if (event.target.value === "h2") {
                            chain.toggleHeading({ level: 2 }).run();
                          } else if (event.target.value === "h3") {
                            chain.toggleHeading({ level: 3 }).run();
                          } else {
                            chain.setParagraph().run();
                          }
                        }}
                        className="h-7 rounded-md border border-transparent bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      >
                        <option value="paragraph">Normal</option>
                        <option value="h2">Heading</option>
                        <option value="h3">Subheading</option>
                      </select>
                      <span className="mx-1 h-5 w-px bg-slate-200" />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          consultationNotesEditor?.chain().focus().toggleBold().run();
                        }}
                        className={notesToolbarButtonClass(!!consultationNotesEditor?.isActive("bold"))}
                        title="Bold"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          consultationNotesEditor?.chain().focus().toggleItalic().run();
                        }}
                        className={notesToolbarButtonClass(!!consultationNotesEditor?.isActive("italic"))}
                        title="Italic"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          consultationNotesEditor?.chain().focus().toggleStrike().run();
                        }}
                        className={notesToolbarButtonClass(!!consultationNotesEditor?.isActive("strike"))}
                        title="Strikethrough"
                      >
                        S
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          consultationNotesEditor?.chain().focus().toggleCode().run();
                        }}
                        className={notesToolbarButtonClass(!!consultationNotesEditor?.isActive("code"))}
                        title="Code"
                      >
                        {"</>"}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setConsultationNotesLink();
                        }}
                        className={notesToolbarButtonClass(!!consultationNotesEditor?.isActive("link"))}
                        title="Link"
                      >
                        Link
                      </button>
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md border border-transparent bg-white text-slate-300"
                        title="Image support is not enabled yet"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4 16 5-5 4 4 2-2 5 5" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 8h.01" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md border border-transparent bg-white text-slate-300"
                        title="Table support is not enabled yet"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4zM4 11h16M10 5v14" />
                        </svg>
                      </button>
                      <span className="mx-1 h-5 w-px bg-slate-200" />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          consultationNotesEditor?.chain().focus().toggleBulletList().run();
                        }}
                        className={notesToolbarButtonClass(!!consultationNotesEditor?.isActive("bulletList"))}
                        title="Bullet list"
                      >
                        •
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          consultationNotesEditor?.chain().focus().toggleOrderedList().run();
                        }}
                        className={notesToolbarButtonClass(!!consultationNotesEditor?.isActive("orderedList"))}
                        title="Numbered list"
                      >
                        1.
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          consultationNotesEditor?.chain().focus().toggleBlockquote().run();
                        }}
                        className={notesToolbarButtonClass(!!consultationNotesEditor?.isActive("blockquote"))}
                        title="Quote"
                      >
                        ?
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          consultationNotesEditor?.chain().focus().setHorizontalRule().run();
                        }}
                        className={notesToolbarButtonClass()}
                        title="Divider"
                      >
                        —
                      </button>
                    </div>
                    <div
                      className={`relative max-h-[420px] min-h-[250px] overflow-y-auto bg-white px-4 py-4 ${
                        consultationLocked ? "cursor-default" : "cursor-text"
                      }`}
                      onMouseDown={handleConsultationNotesCanvasMouseDown}
                    >
                      <EditorContent
                        editor={consultationNotesEditor}
                        className={`min-h-[250px] [&_.ProseMirror]:min-h-[250px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:text-[13px] [&_.ProseMirror]:leading-6 [&_.ProseMirror]:text-slate-900 [&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 ${
                          consultationLocked ? "[&_.ProseMirror]:cursor-default" : "[&_.ProseMirror]:cursor-text"
                        }`}
                      />
                      {consultationMentionActive && (() => {
                        const mentionQuery = consultationMentionQuery.trim();
                        const mentionOptions = (Array.isArray(userOptions) ? userOptions : [])
                          .filter((u) => {
                            const hay = (u.full_name || u.email || "").toLowerCase();
                            return hay.includes(mentionQuery);
                          })
                          .slice(0, 6);

                        if (mentionOptions.length === 0) return null;

                        return (
                          <div className="absolute bottom-full left-0 mb-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow-lg z-10">
                            {mentionOptions.map((user) => {
                              const display = user.full_name || user.email || "Unnamed user";
                              return (
                                <button
                                  key={user.id}
                                  type="button"
                                  onClick={() => {
                                    const display = user.full_name || user.email || "User";
                                    consultationNotesEditor
                                      ?.chain()
                                      .focus()
                                      .insertContent(`@${display} `)
                                      .run();

                                    if (!consultationMentionUserIds.includes(user.id)) {
                                      setConsultationMentionUserIds((prev) => [...prev, user.id]);
                                    }

                                    setConsultationMentionActive(false);
                                    setConsultationMentionQuery("");
                                  }}
                                  className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                                >
                                  {display}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Autosave Status Indicator - below content editor */}
                    {consultationRecordType === "notes" && (
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[10px]">
                        <div className="flex min-w-0 items-center gap-1 text-slate-500">
                          {consultationLocked ? (
                            <>
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              <span className="truncate">Read-only for everyone</span>
                            </>
                          ) : consultationRemoteUsers.length > 0 ? (
                            <>
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              <span className="truncate">
                                Live with {consultationRemoteUsers.map((user) => user.name).join(", ")}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              <span>Live</span>
                            </>
                          )}
                        </div>
                        <div className="shrink-0 text-slate-500">
                        {newConsultationAutosaveStatus === "pending" && (
                          <span className="text-amber-600 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Unsaved changes...
                          </span>
                        )}
                        {newConsultationAutosaveStatus === "saving" && (
                          <span className="text-sky-600 flex items-center gap-1">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Saving...
                          </span>
                        )}
                        {newConsultationAutosaveStatus === "saved" && (
                          <span>All changes are saved automatically</span>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {consultationRecordType === "prescription" ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-slate-700">
                    {tf("prescription")}
                  </label>
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                    {prescriptionLines.map((line, index) => {
                      const medicine = TEST_MEDICINES.find(
                        (med) => med.id === line.medicineId,
                      );
                      const dosageOptions = medicine?.dosages ?? [];
                      const selectedDosage = dosageOptions.find(
                        (d) => d.id === line.dosageId,
                      );
                      const linePrice = selectedDosage?.price ?? 0;

                      return (
                        <div
                          key={index}
                          className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.8fr)_minmax(0,1fr)] gap-2"
                        >
                          <div className="space-y-1">
                            <span className="block text-[10px] font-medium text-slate-600">
                              {tf("medicine")}
                            </span>
                            <select
                              value={line.medicineId}
                              onChange={(event) => {
                                const value = event.target.value;
                                setPrescriptionLines((prev) => {
                                  const next = [...prev];
                                  next[index] = {
                                    medicineId: value,
                                    dosageId: "",
                                  };
                                  return next;
                                });
                              }}
                              className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            >
                              <option value="">{tf("selectMedicine")}</option>
                              {TEST_MEDICINES.map((med) => (
                                <option key={med.id} value={med.id}>
                                  {med.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <span className="block text-[10px] font-medium text-slate-600">
                              {tf("dosage")}
                            </span>
                            <select
                              value={line.dosageId}
                              onChange={(event) => {
                                const value = event.target.value;
                                setPrescriptionLines((prev) => {
                                  const next = [...prev];
                                  next[index] = {
                                    ...next[index],
                                    dosageId: value,
                                  };
                                  return next;
                                });
                              }}
                              disabled={!medicine}
                              className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                            >
                              <option value="">{tf("selectDosage")}</option>
                              {dosageOptions.map((dosage) => (
                                <option key={dosage.id} value={dosage.id}>
                                  {dosage.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col items-end justify-between gap-1 text-[10px] text-slate-600">
                            <span>
                              Price:
                              <span className="ml-1 font-semibold">
                                CHF {linePrice.toFixed(2)}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPrescriptionLines((prev) =>
                                  prev.filter((_, i) => i !== index),
                                );
                              }}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 shadow-sm hover:bg-slate-50"
                            >
                              {tf("remove")}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() =>
                        setPrescriptionLines((prev) => [
                          ...prev,
                          { medicineId: "", dosageId: "" },
                        ])
                      }
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      {tf("addMedicine")}
                    </button>

                    <div className="mt-1 text-[11px] text-slate-600">
                      {tf("estimatedTotal")}
                      <span className="ml-1 font-semibold">
                        CHF
                        {" "}
                        {prescriptionLines
                          .reduce((sum, line) => {
                            const med = TEST_MEDICINES.find(
                              (m) => m.id === line.medicineId,
                            );
                            const dosage = med?.dosages.find(
                              (d) => d.id === line.dosageId,
                            );
                            return sum + (dosage?.price ?? 0);
                          }, 0)
                          .toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {consultationRecordType === "invoice" ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[13px] font-semibold text-slate-900">
                      {tf("createInvoice")}
                    </h4>
                    {invoiceTotal > 0 ? (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-white">
                        CHF {invoiceTotal.toFixed(2)}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-700">
                          {tf("paymentMethod")}
                        </label>
                        <select
                          value={invoicePaymentMethod}
                          onChange={(event) => {
                            setInvoicePaymentMethod(event.target.value);
                          }}
                          className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          <option value="">{tf("selectPaymentMethod")}</option>
                          <option value="Cash">{tf("cash")}</option>
                          <option value="Card">{tf("card")}</option>
                          <option value="Online Payment">{tf("onlinePayment")}</option>
                          <option value="Bank transfer">{tf("bankTransfer")}</option>
                          <option value="Insurance">{tf("insurance")}</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-medium text-slate-700">
                            {tf("billingEntity")}
                            {(() => {
                              const doc = medicalStaffOptions.find((d) => d.id === consultationDoctorId);
                              const nameLC = (doc?.name || "").toLowerCase();
                              if (["miles", "nordback", "koltunova", "plakalo", "guarino", "benani"].some((n) => nameLC.includes(n))) {
                                return <span className="text-red-500 ml-0.5">*</span>;
                              }
                              return null;
                            })()}
                          </label>

                        </div>
                        {(() => {
                          const doc = medicalStaffOptions.find((d) => d.id === consultationDoctorId);
                          const nameLC = (doc?.name || "").toLowerCase();
                          const isNoAutoDoctor = ["miles", "nordback", "koltunova", "plakalo", "guarino", "benani"].some((n) => nameLC.includes(n));
                          return (
                            <select
                              value={invoiceProviderId}
                              onChange={(event) => {
                                setInvoiceProviderId(event.target.value);
                              }}
                              className={`block w-full rounded-lg border px-2 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                                isNoAutoDoctor && !invoiceProviderId
                                  ? "border-red-400 bg-white text-slate-900 focus:border-red-500 focus:ring-red-500"
                                  : "border-sky-400 bg-white text-slate-900 focus:border-sky-500"
                              }`}
                            >
                              <option value="">{tf("selectBillingEntity")}</option>
                              {billingEntityOptions.map((entity) => (
                                <option key={entity.id} value={entity.id}>
                                  {entity.name}{entity.billing_type === "aesthetic" ? " ✦" : ""}
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                        {invoiceProviderId && (() => {
                          const selProv = billingEntityOptions.find(p => p.id === invoiceProviderId);
                          if (!selProv) return null;
                          const isAesthetic = selProv.billing_type === "aesthetic";
                          return (
                            <p className={`text-[10px] ${isAesthetic ? "text-violet-600" : "text-sky-600"}`}>
                              {isAesthetic ? "VAT 8.1% applies" : "VAT exempt (Tardoc/KVG)"}
                            </p>
                          );
                        })()}
                      </div>
                    </div>

                    {/* â”€â”€ Invoice notes (printed on generated invoice) â”€â”€ */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-700">
                        Commentaire / Remarque (affichÃ© sur la facture)
                      </label>
                      <textarea
                        value={invoiceNotes}
                        onChange={(e) => setInvoiceNotes(e.target.value)}
                        placeholder="ex. facture fournie 2 semaines avant lâ€™opÃ©ration"
                        rows={2}
                        className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>

                    {/* ── ICD-10 Diagnosis Codes ── */}
                    {(() => {
                      const isInsuranceInvoice =
                        invoicePaymentMethod === "Insurance" ||
                        invoiceServiceLines.some((l) =>
                          l.serviceId.startsWith("tardoc-") ||
                          l.serviceId.startsWith("flatrate-") ||
                          l.serviceId.startsWith("tma-")
                        );
                      return (
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-700">
                        Codes ICD-10 (diagnostic)
                        {isInsuranceInvoice && <span className="ml-0.5 text-red-500">*</span>}
                        {isInsuranceInvoice && (
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                            requis pour Sumex/CHM
                          </span>
                        )}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={invoiceDiagnosisInput}
                          onChange={(e) => setInvoiceDiagnosisInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const code = invoiceDiagnosisInput.trim().toUpperCase();
                            if (code && !invoiceDiagnosisCodes.includes(code)) {
                              setInvoiceDiagnosisCodes([...invoiceDiagnosisCodes, code]);
                            }
                            setInvoiceDiagnosisInput("");
                          }}
                          placeholder={isInsuranceInvoice ? "ex. Z00.0 puis Entrée (requis)" : "ex. L91.0 puis Entrée"}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
                            isInsuranceInvoice && invoiceDiagnosisCodes.length === 0
                              ? "border-red-300 bg-red-50/30 focus:border-red-400 focus:ring-red-300"
                              : "border-slate-200 bg-white focus:border-sky-500 focus:ring-sky-500"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const code = invoiceDiagnosisInput.trim().toUpperCase();
                            if (code && !invoiceDiagnosisCodes.includes(code)) {
                              setInvoiceDiagnosisCodes([...invoiceDiagnosisCodes, code]);
                            }
                            setInvoiceDiagnosisInput("");
                          }}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
                        >
                          Ajouter
                        </button>
                      </div>
                      {invoiceDiagnosisCodes.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {invoiceDiagnosisCodes.map((code) => (
                            <span
                              key={code}
                              className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11px] text-sky-800"
                            >
                              {code}
                              <button
                                type="button"
                                onClick={() => setInvoiceDiagnosisCodes(invoiceDiagnosisCodes.filter((c) => c !== code))}
                                className="text-sky-400 hover:text-sky-700 leading-none"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                      );
                    })()}

                    {/* â”€â”€ Appointment link (optional, for deposit invoices) â”€â”€ */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={invoiceApptLinkEnabled}
                          onChange={e => {
                            setInvoiceApptLinkEnabled(e.target.checked);
                            if (!e.target.checked) setInvoiceAppointmentId("");
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                        />
                        <span className="text-[11px] font-medium text-slate-700">
                          Lier Ã  un rendez-vous
                        </span>
                        <span className="ml-auto text-[10px] text-slate-400">
                          Optionnel â€” active l'annulation auto Ã  48h si acompte 50% impayÃ©
                        </span>
                      </label>

                      {invoiceApptLinkEnabled && (
                        <div className="mt-2.5 space-y-1.5">
                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            SÃ©lectionnez le rendez-vous associÃ© Ã  cette facture. Le chrono de 48h dÃ©marrera
                            lorsque le lien de paiement sera copiÃ© ou envoyÃ© au patient. Sans paiement,
                            le rendez-vous et la facture seront annulÃ©s automatiquement.
                          </p>
                          {invoicePatientAppointments.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">
                              Aucun rendez-vous Ã  venir pour ce patient.
                            </p>
                          ) : (
                            <select
                              value={invoiceAppointmentId}
                              onChange={e => setInvoiceAppointmentId(e.target.value)}
                              className="block w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            >
                              <option value="">â€” sÃ©lectionner un rendez-vous â€”</option>
                              {invoicePatientAppointments.map(a => (
                                <option key={a.id} value={a.id}>
                                  {new Date(a.start_time).toLocaleString("fr-CH", {
                                    weekday: "short", day: "numeric", month: "short",
                                    hour: "2-digit", minute: "2-digit",
                                    timeZone: "Europe/Zurich",
                                  })}
                                  {(a.title || a.reason) ? ` â€” ${(a.title || a.reason)!.substring(0, 50)}` : ""}
                                </option>
                              ))}
                            </select>
                          )}
                          {invoiceApptLinkEnabled && invoiceAppointmentId && (
                            <p className="flex items-center gap-1 text-[10px] text-amber-600">
                              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Rendez-vous liÃ© â€” chrono 48h dÃ©marrera Ã  l'envoi du lien de paiement
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)]">
                      <div className="space-y-3">
                        <div className="rounded-lg border border-slate-200 bg-slate-50/80">
                          <div className="flex text-[11px]">
                            <button
                              type="button"
                              onClick={() => setInvoiceMode("individual")}
                              className={
                                "flex-1 px-2 py-1.5 text-center text-[10px] font-medium " +
                                (invoiceMode === "individual"
                                  ? "bg-sky-600 text-white"
                                  : "bg-transparent text-slate-600")
                              }
                            >
                              {tf("services")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setInvoiceMode("group")}
                              className={
                                "flex-1 px-2 py-1.5 text-center text-[10px] font-medium " +
                                (invoiceMode === "group"
                                  ? "bg-sky-600 text-white"
                                  : "bg-transparent text-slate-600")
                              }
                            >
                              {tf("groups")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setInvoiceMode("tardoc")}
                              className={
                                "flex-1 px-2 py-1.5 text-center text-[10px] font-medium " +
                                (invoiceMode === "tardoc"
                                  ? "bg-red-600 text-white"
                                  : "bg-transparent text-slate-600")
                              }
                            >
                              {tf("tardoc")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setInvoiceMode("flatrate")}
                              className={
                                "flex-1 px-2 py-1.5 text-center text-[10px] font-medium " +
                                (invoiceMode === "flatrate"
                                  ? "bg-violet-600 text-white"
                                  : "bg-transparent text-slate-600")
                              }
                            >
                              {tf("flatRate")}
                            </button>
                          </div>

                          {invoiceMode === "individual" ? (
                            <div className="space-y-2 px-3 py-3">
                              <ServiceSearchPicker
                                services={invoiceServices}
                                categories={invoiceServiceCategories}
                                selectedCategoryId={invoiceSelectedCategoryId}
                                onCategoryChange={setInvoiceSelectedCategoryId}
                                selectedServiceId={invoiceSelectedServiceId}
                                onServiceChange={setInvoiceSelectedServiceId}
                              />

                              <button
                                type="button"
                                onClick={() => {
                                  if (!invoiceSelectedServiceId) return;
                                  const service = invoiceServices.find(
                                    (s) => s.id === invoiceSelectedServiceId,
                                  );
                                  if (!service) return;
                                  const base =
                                    service.base_price !== null &&
                                      service.base_price !== undefined
                                      ? Number(service.base_price)
                                      : 0;

                                  // For discount service (code 10001), auto-calculate -15% of current subtotal
                                  let unitPrice: number;
                                  if (service.code === "10001") {
                                    const currentSubtotal = invoiceServiceLines.reduce((sum, l) => {
                                      const p = l.unitPrice !== null && Number.isFinite(l.unitPrice) ? l.unitPrice : 0;
                                      return sum + p * (l.quantity > 0 ? l.quantity : 1);
                                    }, 0);
                                    unitPrice = Math.round(currentSubtotal * -0.15 * 100) / 100;
                                  } else {
                                    unitPrice = Number.isFinite(base) ? base : 0;
                                  }

                                  setInvoiceServiceLines((prev) => [
                                    ...prev,
                                    {
                                      serviceId: service.id,
                                      quantity: 1,
                                      unitPrice,
                                      groupId: null,
                                      discountPercent: null,
                                      customName: null,
                                    },
                                  ]);
                                  setInvoiceSelectedServiceId("");
                                }}
                                disabled={!invoiceSelectedServiceId}
                                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {tf("addService")}
                              </button>
                            </div>
                          ) : invoiceMode === "group" ? (
                            <div className="space-y-2 px-3 py-3">
                              <div className="space-y-1">
                                <span className="block text-[10px] font-medium text-slate-600">
                                  Service Group
                                </span>
                                <select
                                  value={invoiceGroupId}
                                  onChange={(event) =>
                                    setInvoiceGroupId(event.target.value)
                                  }
                                  className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                >
                                  <option value="">
                                    Choose a group to add its services
                                  </option>
                                  {invoiceServiceGroups.map((group) => (
                                    <option key={group.id} value={group.id}>
                                      {group.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  if (!invoiceGroupId) return;
                                  const links = invoiceGroupServices.filter(
                                    (link) => link.group_id === invoiceGroupId,
                                  );
                                  if (links.length === 0) return;

                                  setInvoiceServiceLines((prev) => {
                                    const next = [...prev];
                                    const group = invoiceServiceGroups.find(
                                      (g) => g.id === invoiceGroupId,
                                    );
                                    const groupDiscountRaw =
                                      group?.discount_percent ?? null;
                                    for (const link of links) {
                                      const service = invoiceServices.find(
                                        (s) => s.id === link.service_id,
                                      );
                                      if (!service) continue;
                                      const base =
                                        service.base_price !== null &&
                                          service.base_price !== undefined
                                          ? Number(service.base_price)
                                          : 0;
                                      const discountSource =
                                        link.discount_percent !== null &&
                                          link.discount_percent !== undefined
                                          ? Number(link.discount_percent)
                                          : groupDiscountRaw !== null &&
                                            groupDiscountRaw !== undefined
                                            ? Number(groupDiscountRaw)
                                            : null;
                                      const discountPercent =
                                        discountSource !== null &&
                                          Number.isFinite(discountSource) &&
                                          discountSource > 0
                                          ? Math.min(
                                            100,
                                            Math.max(0, discountSource),
                                          )
                                          : null;
                                      const discountedBase =
                                        base > 0 && discountPercent !== null
                                          ? base * (1 - discountPercent / 100)
                                          : base;
                                      const unitPrice = Number.isFinite(
                                        discountedBase,
                                      )
                                        ? Math.max(0, discountedBase)
                                        : 0;
                                      next.push({
                                        serviceId: service.id,
                                        quantity: 1,
                                        unitPrice,
                                        groupId: invoiceGroupId,
                                        discountPercent,
                                        customName: null,
                                      });
                                    }
                                    return next;
                                  });
                                }}
                                disabled={!invoiceGroupId}
                                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                + Add group services
                              </button>
                              <p className="text-[10px] text-slate-500">
                                Adds all services from the selected group into the
                                invoice list on the right.
                              </p>
                            </div>
                          ) : invoiceMode === "tardoc" ? (
                            <div className="space-y-2 px-3 py-3">
                              {/* Canton + Law Type */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <span className="block text-[10px] font-medium text-slate-600">
                                    Canton (Tax Point Value)
                                  </span>
                                  <select
                                    value={invoiceCanton}
                                    onChange={(e) => setInvoiceCanton(e.target.value as SwissCanton)}
                                    className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  >
                                    {Object.entries(CANTON_TAX_POINT_VALUES).map(([code, value]) => (
                                      <option key={code} value={code}>
                                        {code} - CHF {value.toFixed(2)}/pt
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <span className="block text-[10px] font-medium text-slate-600">
                                    Insurance Law
                                  </span>
                                  <select
                                    value={invoiceLawType}
                                    onChange={(e) => setInvoiceLawType(e.target.value)}
                                    className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  >
                                    <option value="KVG">KVG</option>
                                    <option value="UVG">UVG</option>
                                    <option value="IVG">IVG</option>
                                    <option value="MVG">MVG</option>
                                    <option value="VVG">VVG</option>
                                  </select>
                                </div>
                              </div>

                              {/* Load TarDoc Group */}
                              <div className="space-y-1 relative">
                                <span className="block text-[10px] font-medium text-slate-600">
                                  Load TarDoc Group (Preset)
                                </span>
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={tardocGroupSearch}
                                    onChange={(e) => setTardocGroupSearch(e.target.value)}
                                    onFocus={async () => {
                                      setTardocGroupDropdownOpen(true);
                                      if (tardocGroupsLoaded) return;
                                      try {
                                        const res = await fetch("/api/tardoc/groups");
                                        const json = await res.json();
                                        if (json.success) setTardocGroups(json.data || []);
                                      } catch { /* ignore */ }
                                      setTardocGroupsLoaded(true);
                                    }}
                                    placeholder="Search TarDoc groups..."
                                    className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  />
                                  {tardocGroupDropdownOpen && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setTardocGroupDropdownOpen(false)} />
                                      <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                        {!tardocGroupsLoaded ? (
                                          <p className="px-3 py-2 text-[10px] text-slate-400">Loading groups...</p>
                                        ) : (() => {
                                          const q = tardocGroupSearch.toLowerCase();
                                          const filtered = tardocGroups.filter((g: any) =>
                                            !q || (g.name || "").toLowerCase().includes(q)
                                          );
                                          if (filtered.length === 0) return (
                                            <p className="px-3 py-2 text-[10px] text-slate-400">No groups found</p>
                                          );
                                          return filtered.map((g: any) => (
                                            <button
                                              key={g.id}
                                              type="button"
                                              className="w-full text-left px-3 py-2 text-[11px] text-slate-800 hover:bg-sky-50 border-b border-slate-100 last:border-0"
                                              onClick={() => {
                                                const tpv = CANTON_TAX_POINT_VALUES[invoiceCanton] ?? 0.96;
                                                const newLines: InvoiceServiceLine[] = (g.tardoc_group_items || []).map((item: any) => {
                                                  const rawCode: string = item.tardoc_code || "";
                                                  const isMaterial = item.tariff_type === "402" || rawCode.startsWith("mat:");
                                                  const isAcf = rawCode.startsWith("acf:");
                                                  const isTma = rawCode.startsWith("tma:");
                                                  const cleanCode = (isAcf || isTma || isMaterial) ? rawCode.slice(4) : rawCode;
                                                  const displayName = `${cleanCode} - ${(item.description || "").substring(0, 80)}`;

                                                  // Material item â€” uses service UUID as serviceId so it resolves via existing service lookup
                                                  if (isMaterial) {
                                                    const matServiceId = item.service_id || rawCode;
                                                    return {
                                                      serviceId: matServiceId,
                                                      quantity: item.quantity || 1,
                                                      unitPrice: item.unit_price ?? 0,
                                                      groupId: null,
                                                      discountPercent: null,
                                                      customName: item.description || cleanCode,
                                                    };
                                                  }

                                                  const serviceId = isAcf ? `flatrate-${cleanCode}` : isTma ? `tma-${cleanCode}` : `tardoc-${cleanCode}`;

                                                  if (isAcf || isTma) {
                                                    return {
                                                      serviceId,
                                                      quantity: item.quantity || 1,
                                                      unitPrice: item.tp_mt ?? 0,
                                                      groupId: null,
                                                      discountPercent: null,
                                                      customName: displayName,
                                                      acfSideType: item.side_type ?? 0,
                                                      acfExternalFactor: item.external_factor_mt ?? 1,
                                                      acfRefCode: item.ref_code || "",
                                                      acfBaseTP: item.tp_mt ?? 0,
                                                    };
                                                  }
                                                  return {
                                                    serviceId,
                                                    quantity: item.quantity || 1,
                                                    unitPrice: Math.round(((item.tp_mt || 0) + (item.tp_tt || 0)) * tpv * 100) / 100,
                                                    groupId: null,
                                                    discountPercent: null,
                                                    customName: displayName,
                                                    tardocTpMT: item.tp_mt ?? 0,
                                                    tardocTpTT: item.tp_tt ?? 0,
                                                    tardocRecordId: null,
                                                    tardocSection: null,
                                                    tardocSideType: item.side_type ?? 0,
                                                    tardocExternalFactor: item.external_factor_mt ?? 1,
                                                    tardocRefCode: item.ref_code || null,
                                                  };
                                                });
                                                setInvoiceServiceLines((prev) => [...prev, ...newLines]);
                                                // Inject only TARDOC items into search results cache (ACF/TMA/material don't need it)
                                                setTardocSearchResults((prev: any[]) => {
                                                  const existing = new Set(prev.map((r: any) => r.code));
                                                  const tardocOnly = (g.tardoc_group_items || []).filter((item: any) => {
                                                    const c: string = item.tardoc_code || "";
                                                    return !c.startsWith("acf:") && !c.startsWith("tma:") && !c.startsWith("mat:") && item.tariff_type !== "402";
                                                  });
                                                  const newResults = tardocOnly
                                                    .filter((item: any) => !existing.has(item.tardoc_code))
                                                    .map((item: any) => ({
                                                      code: item.tardoc_code,
                                                      name: item.description || "",
                                                      tpMT: item.tp_mt || 0,
                                                      tpTT: item.tp_tt || 0,
                                                      unitQuantity: item.quantity || 1,
                                                      internalFactorMT: item.internal_factor_mt ?? 1,
                                                      internalFactorTT: item.internal_factor_tt ?? 1,
                                                      recordId: 0,
                                                      priceCHF: Math.round(((item.tp_mt || 0) + (item.tp_tt || 0)) * tpv * 100) / 100,
                                                      section: "",
                                                    }));
                                                  return [...prev, ...newResults];
                                                });
                                                setTardocGroupSearch("");
                                                setTardocGroupDropdownOpen(false);
                                              }}
                                            >
                                              <span className="font-medium">{g.name}</span>
                                              {(() => {
                                                const items = g.tardoc_group_items || [];
                                                const matCount = items.filter((i: any) => i.tariff_type === "402" || (i.tardoc_code || "").startsWith("mat:")).length;
                                                const tardocCount = items.filter((i: any) => !(i.tardoc_code || "").startsWith("acf:") && !(i.tardoc_code || "").startsWith("tma:") && !(i.tardoc_code || "").startsWith("mat:") && i.tariff_type !== "402").length;
                                                const acfCount = items.filter((i: any) => (i.tardoc_code || "").startsWith("acf:") || (i.tardoc_code || "").startsWith("tma:")).length;
                                                const parts = [
                                                  tardocCount > 0 ? `${tardocCount} TARDOC` : "",
                                                  acfCount > 0 ? `${acfCount} ACF` : "",
                                                  matCount > 0 ? `${matCount} MAT` : "",
                                                ].filter(Boolean);
                                                return (
                                                  <span className="ml-1 text-slate-500">
                                                    ({parts.length > 0 ? parts.join(" + ") : "empty"})
                                                  </span>
                                                );
                                              })()}
                                              {g.validation_status === "valid" ? <span className="ml-1 text-emerald-600">âœ“</span> : g.validation_status === "invalid" ? <span className="ml-1 text-red-500">âœ—</span> : null}
                                            </button>
                                          ));
                                        })()}
                                      </div>
                                    </>
                                  )}
                                </div>
                                {!tardocGroupsLoaded && !tardocGroupDropdownOpen && (
                                  <p className="text-[9px] text-slate-400">Click to load available groups</p>
                                )}
                              </div>

                              {/* UVG: Accident Date */}
                              {invoiceLawType === "UVG" && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                                  <div className="flex items-center gap-1.5">
                                    <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                    </svg>
                                    <span className="text-[11px] font-semibold text-amber-700">UVG â€” Accident Date Required</span>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[10px] font-medium text-amber-700">
                                      Accident Date (Unfalldatum) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                      type="date"
                                      value={invoiceAccidentDate}
                                      onChange={(e) => setInvoiceAccidentDate(e.target.value)}
                                      className="block w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                    />
                                    <p className="text-[10px] text-amber-600">Required for UVG (accident insurance) invoices.</p>
                                  </div>
                                </div>
                              )}

                              {/* Code search */}
                              <div className="space-y-1">
                                <span className="block text-[10px] font-medium text-slate-600">
                                  Search by Code / Name
                                </span>
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    placeholder="e.g. AA.00 or consultation"
                                    value={tardocSearchQuery}
                                    onChange={(e) => setTardocSearchQuery(e.target.value)}
                                    onKeyDown={async (e) => {
                                      if (e.key !== "Enter" || !tardocSearchQuery.trim()) return;
                                      setTardocSearchLoading(true);
                                      try {
                                        const res = await fetch(`/api/tardoc/sumex?action=searchCode&code=${encodeURIComponent(tardocSearchQuery.trim())}&canton=${invoiceCanton}`);
                                        const json = await res.json();
                                        if (json.success) setTardocSearchResults(json.data || []);
                                      } catch { /* ignore */ }
                                      setTardocSearchLoading(false);
                                    }}
                                    className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!tardocSearchQuery.trim()) return;
                                      setTardocSearchLoading(true);
                                      try {
                                        const res = await fetch(`/api/tardoc/sumex?action=searchCode&code=${encodeURIComponent(tardocSearchQuery.trim())}&canton=${invoiceCanton}`);
                                        const json = await res.json();
                                        if (json.success) setTardocSearchResults(json.data || []);
                                      } catch { /* ignore */ }
                                      setTardocSearchLoading(false);
                                    }}
                                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm hover:bg-slate-50"
                                  >
                                    Search
                                  </button>
                                </div>
                              </div>

                              {/* Search results */}
                              {tardocSearchLoading && (
                                <div className="py-3 text-center text-[10px] text-slate-400">Loading...</div>
                              )}
                              {!tardocSearchLoading && tardocSearchResults.length > 0 && (
                                <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50">
                                  {/* Table header */}
                                  <div className="sticky top-0 z-10 grid grid-cols-[20px_minmax(0,1fr)_52px_52px_28px] items-center gap-0.5 border-b border-slate-200 bg-slate-100 px-1.5 py-1 text-[9px] font-semibold text-slate-500">
                                    <span />
                                    <span>CODE / DESCRIPTION</span>
                                    <span className="text-right">PT PM</span>
                                    <span className="text-right">PT PT</span>
                                    <span />
                                  </div>
                                  {tardocSearchResults.map((svc: any) => {
                                    const tpv = CANTON_TAX_POINT_VALUES[invoiceCanton] ?? 0.96;
                                    const price = svc.priceCHF ?? Math.round((svc.tpMT + svc.tpTT) * tpv * 100) / 100;
                                    return (
                                      <div
                                        key={svc.code || svc.recordId}
                                        className="grid grid-cols-[20px_minmax(0,1fr)_52px_52px_28px] items-center gap-0.5 border-b border-slate-100 px-1.5 py-1 text-[10px] hover:bg-sky-50/50"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setInvoiceServiceLines((prev) => [
                                              ...prev,
                                              {
                                                serviceId: `tardoc-${svc.code}`,
                                                quantity: 1,
                                                unitPrice: price,
                                                groupId: null,
                                                discountPercent: null,
                                                customName: `${svc.code} - ${(svc.name || "").substring(0, 80)}`,
                                                tardocTpMT: svc.tpMT ?? 0,
                                                tardocTpTT: svc.tpTT ?? 0,
                                                tardocRecordId: svc.recordId ?? null,
                                                tardocSection: svc.section ?? null,
                                              },
                                            ]);
                                          }}
                                          className="flex h-4 w-4 items-center justify-center rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                          title="Add to invoice"
                                        >
                                          <span className="text-[10px] font-bold leading-none">+</span>
                                        </button>
                                        <div className="min-w-0">
                                          <span className="font-mono text-[9px] font-semibold text-slate-700">{svc.code}</span>
                                          <span className="ml-1 text-[9px] text-slate-500 line-clamp-1">{svc.name}</span>
                                        </div>
                                        <span className="text-right font-mono text-[9px] text-slate-600">{svc.tpMT?.toFixed(2)}</span>
                                        <span className="text-right font-mono text-[9px] text-slate-600">{svc.tpTT?.toFixed(2)}</span>
                                        <span className="text-right font-mono text-[9px] font-semibold text-slate-800">{price.toFixed(0)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {!tardocSearchLoading && tardocSearchResults.length === 0 && tardocSearchQuery && (
                                <div className="py-2 text-center text-[10px] text-slate-400">No results found.</div>
                              )}

                              {/* Multi-level accordion tree */}
                              <div className="space-y-1">
                                <span className="block text-[10px] font-medium text-slate-600">
                                  Browse TARDOC Catalog
                                </span>
                                <TardocAccordionTree
                                  canton={invoiceCanton}
                                  onAddService={(svc: any) => {
                                    const tpv = CANTON_TAX_POINT_VALUES[invoiceCanton] ?? 0.96;
                                    const price = svc.priceCHF ?? Math.round(((svc.tpMT || 0) + (svc.tpTT || 0)) * tpv * 100) / 100;
                                    setInvoiceServiceLines((prev) => [
                                      ...prev,
                                      {
                                        serviceId: `tardoc-${svc.code}`,
                                        quantity: 1,
                                        unitPrice: price,
                                        groupId: null,
                                        discountPercent: null,
                                        customName: `${svc.code} - ${(svc.name || "").substring(0, 80)}`,
                                        tardocTpMT: svc.tpMT ?? 0,
                                        tardocTpTT: svc.tpTT ?? 0,
                                        tardocRecordId: svc.recordId ?? null,
                                        tardocSection: svc.section ?? null,
                                      },
                                    ]);
                                  }}
                                />
                              </div>

                              {/* DB info */}
                              <div className="flex items-center justify-between">
                                <p className="text-[9px] text-slate-400">
                                  Sumex1 TARDOC live catalog{tardocDbInfo ? ` (v${tardocDbInfo.dbVersion})` : ""}
                                </p>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const res = await fetch("/api/tardoc/sumex?action=info");
                                      const json = await res.json();
                                      if (json.success) setTardocDbInfo(json.data);
                                    } catch { /* ignore */ }
                                  }}
                                  className="text-[9px] text-sky-500 hover:text-sky-700 hover:underline"
                                >
                                  Check version
                                </button>
                              </div>
                            </div>
                          ) : invoiceMode === "flatrate" ? (
                            <div className="space-y-2 px-3 py-3">
                              <AcfAccordionTree
                                patientSex={patientDetails?.gender?.toLowerCase() === "female" ? 1 : 0}
                                patientBirthdate={patientDetails?.dob || undefined}
                                defaultIcd10={consultationRefIcd10}
                                existingTardocCodes={invoiceServiceLines
                                  .filter((l) => l.serviceId.startsWith("tardoc-"))
                                  .map((l) => ({
                                    code: l.serviceId.replace("tardoc-", ""),
                                    quantity: l.quantity > 0 ? l.quantity : 1,
                                    side: l.tardocSideType ?? 0,
                                  }))}
                                onAddService={(svc: any) => {
                                  const ef = svc.externalFactor ?? 1.0;
                                  const adjustedPrice = svc.tp * ef;
                                  const sideLabel = svc.sideType === 1 ? " [L]" : svc.sideType === 2 ? " [R]" : svc.sideType === 3 ? " [B]" : "";
                                  const factorLabel = ef !== 1.0 ? ` x${ef}` : "";
                                  const consultationIcd10 = consultationRefIcd10.trim();
                                  const isGesture = !!svc.isTmaGesture;
                                  const prefix = isGesture ? "tma" : "flatrate";
                                  const tariffTag = isGesture ? "TMA" : "ACF";
                                  setInvoiceServiceLines((prev) => [
                                    ...prev,
                                    {
                                      serviceId: `${prefix}-${svc.code}`,
                                      quantity: 1,
                                      unitPrice: adjustedPrice,
                                      groupId: null,
                                      discountPercent: null,
                                      customName: `[${tariffTag}] ${svc.code}${sideLabel}${factorLabel} - ${(svc.name || "").substring(0, 70)}`,
                                      acfSideType: svc.sideType ?? 0,
                                      acfExternalFactor: ef,
                                      acfRefCode: svc.refCode || consultationIcd10 || "",
                                      acfBaseTP: svc.tp,
                                    },
                                  ]);
                                }}
                              />
                              <p className="text-[9px] text-slate-400">
                                ACF - Ambulatory Case Flatrates (tariff {ACF_TARIFF_TYPE_DISPLAY}). Live data from Sumex1 acfValidator.
                              </p>
                            </div>
                          ) : null}
                        </div>

                        <div className="grid gap-4 pt-1 text-[11px] sm:grid-cols-2">
                          <div className="space-y-1 sm:col-span-2">
                            <p className="font-medium text-slate-700">
                              Payment Terms
                            </p>
                            <div className="flex flex-wrap gap-4">
                              <label className="inline-flex items-center gap-1 text-slate-600">
                                <input
                                  type="radio"
                                  className="h-3 w-3"
                                  checked={invoicePaymentTerm === "full"}
                                  onChange={() => setInvoicePaymentTerm("full")}
                                />
                                <span>Full Payment</span>
                              </label>
                              <label className="inline-flex items-center gap-1 text-slate-600">
                                <input
                                  type="radio"
                                  className="h-3 w-3"
                                  checked={invoicePaymentTerm === "installment"}
                                  onChange={() =>
                                    setInvoicePaymentTerm("installment")
                                  }
                                />
                                <span>Installment</span>
                              </label>
                            </div>

                            {invoicePaymentTerm === "installment" ? (
                              <div className="mt-3 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] font-medium text-slate-700">
                                    Installment Terms
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInvoiceInstallments((prev) => [
                                        ...prev,
                                        {
                                          id: `${Date.now()}-${prev.length}`,
                                          percent: 0,
                                          dueDate: "",
                                        },
                                      ]);
                                    }}
                                    className="inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm hover:bg-emerald-600"
                                  >
                                    <span className="mr-1 text-xs">+</span>
                                    <span>Add</span>
                                  </button>
                                </div>

                                {invoiceInstallments.length === 0 ? (
                                  <p className="text-[10px] text-slate-500">
                                    Define one or more installments as percentages of the
                                    invoice total.
                                  </p>
                                ) : (
                                  <div className="space-y-1">
                                    {invoiceInstallments.map((installment, index) => {
                                      const safePercent = Number.isFinite(
                                        installment.percent,
                                      )
                                        ? Math.max(0, Math.min(100, installment.percent))
                                        : 0;
                                      const amount =
                                        invoiceTotal > 0
                                          ? (invoiceTotal * safePercent) / 100
                                          : 0;

                                      return (
                                        <div
                                          key={installment.id ?? `${index}`}
                                          className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_auto] items-center gap-1 text-[10px]"
                                        >
                                          <div className="space-y-0.5">
                                            <span className="block text-[10px] font-medium text-slate-600">
                                              Percentage
                                            </span>
                                            <div className="flex items-center gap-1">
                                              <input
                                                type="number"
                                                min={0}
                                                max={100}
                                                step="0.1"
                                                value={
                                                  Number.isFinite(installment.percent)
                                                    ? installment.percent
                                                    : ""
                                                }
                                                onChange={(event) => {
                                                  const raw = event.target.value;
                                                  const value =
                                                    raw === ""
                                                      ? 0
                                                      : Number.parseFloat(raw);
                                                  setInvoiceInstallments((prev) => {
                                                    const next = [...prev];
                                                    next[index] = {
                                                      ...next[index],
                                                      percent: Number.isNaN(value)
                                                        ? 0
                                                        : value,
                                                    };
                                                    return next;
                                                  });
                                                }}
                                                className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-[10px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                              />
                                              <span className="text-[10px] text-slate-500">%</span>
                                            </div>
                                          </div>
                                          <div className="space-y-0.5">
                                            <span className="block text-[10px] font-medium text-slate-600">
                                              Due date
                                            </span>
                                            <input
                                              type="date"
                                              value={installment.dueDate}
                                              onChange={(event) => {
                                                const value = event.target.value;
                                                setInvoiceInstallments((prev) => {
                                                  const next = [...prev];
                                                  next[index] = {
                                                    ...next[index],
                                                    dueDate: value,
                                                  };
                                                  return next;
                                                });
                                              }}
                                              className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                            />
                                          </div>
                                          <div className="space-y-0.5 text-right">
                                            <span className="block text-[10px] font-medium text-slate-600">
                                              Amount
                                            </span>
                                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                              CHF {amount.toFixed(2)}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setInvoiceInstallments((prev) =>
                                                prev.filter((_, i) => i !== index),
                                              );
                                            }}
                                            className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-50 text-[11px] text-red-600 hover:bg-red-100"
                                            aria-label="Remove installment"
                                          >
                                            Ã—
                                          </button>
                                        </div>
                                      );
                                    })}

                                    <div className="mt-1 flex items-center justify-between text-[10px]">
                                      <span className="text-slate-600">
                                        Allocated:
                                        <span className="ml-1 font-semibold">
                                          {invoiceInstallmentsTotalPercentRounded.toFixed(2)}%
                                        </span>
                                      </span>
                                      {invoiceInstallmentsPlanComplete ? (
                                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                                          100% allocated
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                          Adjust installments to reach 100%
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                          <div className="space-y-1">
                            <p className="font-medium text-slate-700">
                              Extra Options (Optional)
                            </p>
                            <div className="flex flex-wrap gap-4">
                              <label className="inline-flex items-center gap-1 text-slate-600">
                                <input
                                  type="checkbox"
                                  className="h-3 w-3"
                                  checked={invoiceExtraOption === "complimentary"}
                                  onChange={(event) =>
                                    setInvoiceExtraOption(
                                      event.target.checked ? "complimentary" : null,
                                    )
                                  }
                                />
                                <span>Complimentary Service</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-medium text-slate-800">
                            To be invoiced
                          </p>
                          {invoiceTotal > 0 ? (
                            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-white">
                              CHF {invoiceTotal.toFixed(2)}
                            </span>
                          ) : null}
                        </div>

                        {invoiceTotal > 0 && invoiceVatTotal > 0 ? (
                          <div className="space-y-0.5 border-t border-slate-200 pt-2 text-[10px] text-slate-600">
                            <div className="flex items-center justify-between">
                              <span>Net (excl. VAT)</span>
                              <span className="font-mono">CHF {invoiceNetTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>VAT 8.1% (incl.)</span>
                              <span className="font-mono">CHF {invoiceVatTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        ) : invoiceTotal > 0 && invoiceMode === "tardoc" ? (
                          <div className="border-t border-slate-200 pt-2 text-[10px] text-slate-500">
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                              VAT exempt
                            </span>{" "}
                            <span>TARDOC insurer billing (Rule 4)</span>
                          </div>
                        ) : null}

                        {/* Skip Sumex Validation â€” visible for all invoice modes */}
                        <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={skipSumexValidation}
                            onChange={(e) => setSkipSumexValidation(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                          />
                          <div>
                            <span className="text-[10px] font-medium text-amber-800">Skip Sumex Validation</span>
                            <p className="text-[9px] text-amber-600">Override validation errors when creating/updating this invoice</p>
                          </div>
                        </label>

                        {/* Re-run Grouper banner: shown when ACF/TMA lines exist (with or without TARDOC) */}
                        {(() => {
                          const hasFlatRates = invoiceServiceLines.some((l) => l.serviceId.startsWith("flatrate-"));
                          const hasTma = invoiceServiceLines.some((l) => l.serviceId.startsWith("tma-"));
                          const hasTardoc = invoiceServiceLines.some((l) => l.serviceId.startsWith("tardoc-"));
                          if (hasFlatRates || hasTma) {
                            const tmaLines = invoiceServiceLines.filter((l) => l.serviceId.startsWith("tma-"));
                            const tardocLines = invoiceServiceLines.filter((l) => l.serviceId.startsWith("tardoc-"));
                            const icdCode = tmaLines.find((l) => l.acfRefCode)?.acfRefCode || "";
                            return (
                              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="text-[10px] text-amber-800">
                                    <span className="font-semibold">{hasTardoc ? "ACF + TARDOC detected:" : "ACF flat rates detected:"}</span>{" "}
                                    {hasTardoc ? `${tardocLines.length} TARDOC code${tardocLines.length > 1 ? "s" : ""} may affect which ACF flat rate applies.` : "TARDOC codes may affect flat rates."}
                                    {" "}Re-run the grouper to update flat rates.
                                  </div>
                                  <button
                                    type="button"
                                    disabled={rerunGrouperLoading || !icdCode}
                                    onClick={async () => {
                                      if (!icdCode) return;
                                      setRerunGrouperLoading(true);
                                      try {
                                        const pSex = patientDetails?.gender?.toLowerCase() === "female" ? 1 : 0;
                                        const pBirth = patientDetails?.dob || "1990-01-01";
                                        const services = [
                                          ...tmaLines.map((l) => ({
                                            code: l.serviceId.replace("tma-", ""),
                                            side: l.acfSideType ?? 0,
                                            quantity: l.quantity > 0 ? l.quantity : 1,
                                          })),
                                          ...tardocLines.map((l) => ({
                                            code: l.serviceId.replace("tardoc-", ""),
                                            side: l.tardocSideType ?? 0,
                                            quantity: l.quantity > 0 ? l.quantity : 1,
                                          })),
                                        ];
                                        const res = await fetch("/api/acf/sumex", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            action: "runGrouper",
                                            icdCode,
                                            patientSex: pSex,
                                            patientBirthdate: pBirth,
                                            law: 0,
                                            services,
                                          }),
                                        });
                                        const json = await res.json();
                                        const acfCodes: any[] = json.data?.acfCodes || [];
                                        if (acfCodes.length > 0) {
                                          setInvoiceServiceLines((prev) => {
                                            const nonFlatRate = prev.filter((l) => !l.serviceId.startsWith("flatrate-"));
                                            const newFlatRates: InvoiceServiceLine[] = acfCodes.map((acf: any) => {
                                              const sideLabel = (tmaLines[0]?.acfSideType ?? 0) === 1 ? " [L]" : (tmaLines[0]?.acfSideType ?? 0) === 2 ? " [R]" : (tmaLines[0]?.acfSideType ?? 0) === 3 ? " [B]" : "";
                                              return {
                                                serviceId: `flatrate-${acf.code}`,
                                                quantity: 1,
                                                unitPrice: acf.tp ?? 0,
                                                groupId: null,
                                                discountPercent: null,
                                                customName: `[ACF] ${acf.code}${sideLabel} - ${(acf.name || "").substring(0, 70)}`,
                                                acfSideType: tmaLines[0]?.acfSideType ?? 0,
                                                acfExternalFactor: 1.0,
                                                acfRefCode: icdCode,
                                                acfBaseTP: acf.tp ?? 0,
                                              };
                                            });
                                            return [...nonFlatRate, ...newFlatRates];
                                          });
                                        }
                                        if (json.data?.errors?.length > 0) {
                                          console.warn("Grouper re-run warnings:", json.data.errors);
                                        }
                                        if (!json.success && acfCodes.length === 0) {
                                          const errMsg = json.error || json.errors?.join("; ") || json.data?.errors?.join("; ") || "Unknown grouper error";
                                          console.error("Grouper re-run failed:", errMsg);
                                        }
                                      } catch (err) {
                                        console.error("Grouper re-run request failed:", err);
                                      }
                                      setRerunGrouperLoading(false);
                                    }}
                                    className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-[10px] font-medium text-white shadow-sm hover:bg-amber-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                  >
                                    {rerunGrouperLoading ? "Running..." : "Re-run Grouper"}
                                  </button>
                                </div>
                                {!icdCode && (
                                  <div className="text-[9px] text-amber-600">
                                    No ICD-10 code found on TMA lines. Add flat rates with an ICD-10 code first.
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {invoiceServiceLines.length === 0 ? (
                          <p className="text-[10px] text-slate-500">
                            {tf("noServicesYet")}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {invoiceServiceLines.map((line, index) => {
                              const isTardocLine = line.serviceId.startsWith("tardoc-");
                              const isFlatRateLine = line.serviceId.startsWith("flatrate-");
                              const tardocCode = isTardocLine ? line.serviceId.replace("tardoc-", "") : null;
                              const flatRateCode = isFlatRateLine ? line.serviceId.replace("flatrate-", "") : null;
                              const service = (isTardocLine || isFlatRateLine) ? null : invoiceServices.find(
                                (s) => s.id === line.serviceId,
                              );
                              const defaultLabel = service?.name || (tardocCode ? `TARDOC ${tardocCode}` : flatRateCode ? `Flat Rate ${flatRateCode}` : "Service");
                              const label = line.customName || defaultLabel;
                              const group =
                                line.groupId !== null
                                  ? invoiceServiceGroups.find(
                                    (g) => g.id === line.groupId,
                                  )
                                  : null;
                              const metaBits: string[] = [];
                              if (tardocCode) metaBits.push("TARDOC");
                              if (flatRateCode) metaBits.push("FLAT RATE");
                              if (group) metaBits.push(group.name);
                              // VAT meta: TARDOC mode + TARDOC/ACF lines = always free.
                              const isLineVatExempt =
                                invoiceMode === "tardoc" ||
                                line.serviceId.startsWith("tardoc-") ||
                                line.serviceId.startsWith("flatrate-") ||
                                line.serviceId.startsWith("tma-");
                              const lineVatPct = isLineVatExempt
                                ? 0
                                : Number(service?.vat_rate_pct ?? 0);
                              if (lineVatPct > 0) {
                                metaBits.push(`VAT ${lineVatPct}%`);
                              } else if (service && service.vat_status === "befreit") {
                                metaBits.push("VAT free");
                              }
                              if (
                                line.discountPercent !== null &&
                                Number.isFinite(line.discountPercent)
                              ) {
                                metaBits.push(
                                  `-${Math.min(
                                    100,
                                    Math.max(0, line.discountPercent),
                                  ).toFixed(0)}%`,
                                );
                              }
                              const quantity = line.quantity > 0 ? line.quantity : 1;
                              const unit =
                                line.unitPrice !== null &&
                                  Number.isFinite(line.unitPrice)
                                  ? line.unitPrice
                                  : 0;
                              const lineTotal = unit * quantity;

                              return (
                                <div
                                  key={index}
                                  className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] items-end gap-2"
                                >
                                  <div className="space-y-0.5">
                                    <span className="block text-[10px] font-medium text-slate-600">
                                      {tf("item")} {(tardocCode || flatRateCode || service?.code) && <span className="font-bold">({tardocCode || flatRateCode || service?.code})</span>}
                                    </span>
                                    <input
                                      type="text"
                                      value={label}
                                      placeholder={defaultLabel}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        setInvoiceServiceLines((prev) => {
                                          const next = [...prev];
                                          next[index] = {
                                            ...next[index],
                                            customName: value === "" || value === defaultLabel ? null : value,
                                          };
                                          return next;
                                        });
                                      }}
                                      className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                    />
                                    {metaBits.length > 0 ? (
                                      <div className="text-[10px] text-slate-500">
                                        {metaBits.join(" â€¢ ")}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="block text-[10px] font-medium text-slate-600">
                                      {tf("priceCHF")}
                                    </span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={
                                        line.unitPrice !== null &&
                                          Number.isFinite(line.unitPrice)
                                          ? line.unitPrice
                                          : ""
                                      }
                                      onChange={(event) => {
                                        const raw = event.target.value;
                                        const value =
                                          raw === ""
                                            ? null
                                            : Number.parseFloat(raw);
                                        setInvoiceServiceLines((prev) => {
                                          const next = [...prev];
                                          next[index] = {
                                            ...next[index],
                                            unitPrice:
                                              value === null || Number.isNaN(value)
                                                ? null
                                                : value,
                                          };
                                          return next;
                                        });
                                      }}
                                      className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="block text-[10px] font-medium text-slate-600">
                                      {tf("qty")}
                                    </span>
                                    <input
                                      type="number"
                                      min={0.01}
                                      step="0.01"
                                      value={quantity}
                                      onChange={(event) => {
                                        const value = Number.parseFloat(
                                          event.target.value || "1",
                                        );
                                        setInvoiceServiceLines((prev) => {
                                          const next = [...prev];
                                          next[index] = {
                                            ...next[index],
                                            quantity: Number.isNaN(value)
                                              ? 1
                                              : Math.max(0.01, value),
                                          };
                                          return next;
                                        });
                                      }}
                                      className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                    />
                                  </div>
                                  <div className="flex flex-col items-end justify-between gap-1 text-[10px] text-slate-600">
                                    <span>
                                      <span className="font-semibold">
                                        {unit > 0
                                          ? `CHF ${lineTotal.toFixed(2)}`
                                          : "-"}
                                      </span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInvoiceServiceLines((prev) =>
                                          prev.filter((_, i) => i !== index),
                                        );
                                      }}
                                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 shadow-sm hover:bg-slate-50"
                                    >
                                      {tf("remove")}
                                    </button>
                                  </div>
                                  {/* TARDOC detail row: Side, TP MT, TP TT, Point Value */}
                                  {isTardocLine && (
                                    <div className="col-span-4 flex items-center gap-3 rounded-md bg-red-50/50 px-2 py-1 mt-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-slate-400">Side:</span>
                                        <select
                                          value={line.tardocSideType ?? 0}
                                          onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setInvoiceServiceLines((prev) => {
                                              const next = [...prev];
                                              next[index] = { ...next[index], tardocSideType: val };
                                              return next;
                                            });
                                          }}
                                          className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                                        >
                                          <option value={0}>None</option>
                                          <option value={1}>Left</option>
                                          <option value={2}>Right</option>
                                          <option value={3}>Both</option>
                                        </select>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-slate-400">TP MT:</span>
                                        <span className="font-mono text-[10px] font-medium text-slate-700">{(line.tardocTpMT ?? 0).toFixed(2)}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-slate-400">TP TT:</span>
                                        <span className="font-mono text-[10px] font-medium text-slate-700">{(line.tardocTpTT ?? 0).toFixed(2)}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-slate-400">TPV:</span>
                                        <span className="font-mono text-[10px] font-medium text-slate-700">{(CANTON_TAX_POINT_VALUES[invoiceCanton] ?? 0.96).toFixed(2)}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-slate-400">Ext.F:</span>
                                        <input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          value={line.tardocExternalFactor ?? 1}
                                          onChange={(e) => {
                                            const val = Number(e.target.value) || 1;
                                            setInvoiceServiceLines((prev) => {
                                              const next = [...prev];
                                              next[index] = { ...next[index], tardocExternalFactor: val };
                                              return next;
                                            });
                                          }}
                                          className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center text-[10px] text-slate-900 focus:border-sky-400 focus:outline-none"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-slate-400">Total:</span>
                                        <span className="font-mono text-[10px] font-semibold text-slate-800">
                                          {(((line.tardocTpMT ?? 0) + (line.tardocTpTT ?? 0)) * (CANTON_TAX_POINT_VALUES[invoiceCanton] ?? 0.96) * quantity * (line.tardocExternalFactor ?? 1)).toFixed(2)}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {consultationRecordType === "medication" ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[13px] font-semibold text-slate-900">
                      {tf("newMedication")}
                    </h4>
                    <button
                      type="button"
                      onClick={addMedProduct}
                      className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      {tf("addProduct")}
                    </button>
                  </div>

                  {/* Medication Template Selector */}
                  {medTemplatesLoaded && medTemplates.length > 0 && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-2.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-emerald-800">{tf("loadFromTemplate")}</span>
                        <div className="flex items-center gap-1 rounded-full bg-white border border-emerald-200 px-0.5 py-0.5">
                          <button
                            type="button"
                            onClick={() => { setMedTemplateFilter("all"); setMedTemplateServiceFilter(""); setMedSelectedTemplateId(""); }}
                            className={"rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors " + (medTemplateFilter === "all" ? "bg-emerald-600 text-white" : "text-emerald-700 hover:bg-emerald-100")}
                          >
                            {tf("byName")}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setMedTemplateFilter("service"); setMedSelectedTemplateId(""); }}
                            className={"rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors " + (medTemplateFilter === "service" ? "bg-emerald-600 text-white" : "text-emerald-700 hover:bg-emerald-100")}
                          >
                            {tf("byService")}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {medTemplateFilter === "service" && (
                          <select
                            value={medTemplateServiceFilter}
                            onChange={(e) => { setMedTemplateServiceFilter(e.target.value); setMedSelectedTemplateId(""); }}
                            className="flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="">{tf("selectService2")}</option>
                            {(() => {
                              const serviceIds = new Set(medTemplates.filter((t) => t.service_id).map((t) => t.service_id!));
                              const uniqueServices = Array.from(serviceIds).map((sid) => {
                                const tmpl = medTemplates.find((t) => t.service_id === sid);
                                return { id: sid, name: tmpl?.service_name || sid };
                              }).sort((a, b) => a.name.localeCompare(b.name));
                              return uniqueServices.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ));
                            })()}
                          </select>
                        )}
                        <select
                          value={medSelectedTemplateId}
                          onChange={(e) => {
                            const templateId = e.target.value;
                            setMedSelectedTemplateId(templateId);
                            if (!templateId) return;
                            const template = medTemplates.find((t) => t.id === templateId);
                            if (!template || !template.medication_template_items?.length) return;
                            const newProducts: MedProduct[] = template.medication_template_items.map((item) => ({
                              id: crypto.randomUUID(),
                              productName: item.product_name,
                              searchQuery: item.product_name,
                              searchResults: [],
                              searchLoading: false,
                              dropdownOpen: false,
                              productType: "MEDICATION" as "MEDICATION" | "CONSUMABLE",
                              intakeKind: "FIXED" as "ACUTE" | "FIXED",
                              amountMorning: item.amount_morning || "",
                              amountNoon: item.amount_noon || "",
                              amountEvening: item.amount_evening || "",
                              amountNight: item.amount_night || "",
                              quantity: item.quantity || 1,
                              intakeNote: item.intake_note || "",
                              intakeFromDate: formatLocalDateInputValue(new Date()),
                            }));
                            setMedProducts(newProducts);
                          }}
                          className={"flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" + (medTemplateFilter === "service" && !medTemplateServiceFilter ? " opacity-50" : "")}
                          disabled={medTemplateFilter === "service" && !medTemplateServiceFilter}
                        >
                          <option value="">{tf("selectTemplate")}</option>
                          {medTemplates
                            .filter((t) => {
                              if (medTemplateFilter === "service") {
                                return t.service_id === medTemplateServiceFilter;
                              }
                              return true;
                            })
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}{t.service_name ? ` (${t.service_name})` : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {medProducts.map((product, index) => (
                    <div key={product.id} className="space-y-2 rounded-md border border-slate-100 bg-slate-50 p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-slate-500">Product {index + 1}</span>
                        {medProducts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMedProduct(product.id)}
                            className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-700">
                            Product Name *
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={product.searchQuery}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateMedProduct(product.id, { searchQuery: val, productName: val, dropdownOpen: true });
                                if (medSearchTimeoutRefs.current[product.id]) clearTimeout(medSearchTimeoutRefs.current[product.id]!);
                                if (val.trim().length < 2) {
                                  updateMedProduct(product.id, { searchResults: [] });
                                  return;
                                }
                                medSearchTimeoutRefs.current[product.id] = setTimeout(async () => {
                                  updateMedProduct(product.id, { searchLoading: true });
                                  try {
                                    const res = await fetch(`/api/compendium/search?q=${encodeURIComponent(val.trim())}`);
                                    const data = await res.json();
                                    updateMedProduct(product.id, { searchResults: data.products ?? [] });
                                  } catch {
                                    updateMedProduct(product.id, { searchResults: [] });
                                  } finally {
                                    updateMedProduct(product.id, { searchLoading: false });
                                  }
                                }, 300);
                              }}
                              onFocus={() => updateMedProduct(product.id, { dropdownOpen: true })}
                              onBlur={() => setTimeout(() => updateMedProduct(product.id, { dropdownOpen: false }), 150)}
                              placeholder="Type to search a medicine"
                              autoComplete="off"
                              className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 pr-7 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            />
                            {product.searchLoading ? (
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                                <svg className="h-3.5 w-3.5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                              </span>
                            ) : product.searchQuery ? (
                              <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); updateMedProduct(product.id, { searchQuery: "", productName: "", searchResults: [], dropdownOpen: false }); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              >
                                <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg>
                              </button>
                            ) : null}
                            {product.dropdownOpen && (
                              <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-xs">
                                {/* Custom text option */}
                                {product.searchQuery.trim().length >= 1 && (
                                  <li>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        updateMedProduct(product.id, { productName: product.searchQuery, dropdownOpen: false, searchResults: [] });
                                      }}
                                      className="w-full px-3 py-1.5 text-left text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-b border-slate-100"
                                    >
                                      <span className="font-medium">Use custom text:</span> "{product.searchQuery}"
                                    </button>
                                  </li>
                                )}
                                {product.searchResults.length > 0 ? (
                                  product.searchResults.map((item) => (
                                    <li key={item.productNumber}>
                                      <button
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          updateMedProduct(product.id, { productName: item.label, searchQuery: item.label, dropdownOpen: false, searchResults: [] });
                                        }}
                                        className="w-full px-3 py-1.5 text-left text-slate-800 hover:bg-sky-50 hover:text-sky-700"
                                      >
                                        {item.label}
                                      </button>
                                    </li>
                                  ))
                                ) : (
                                  <li className="px-3 py-2 text-slate-400 italic">
                                    {product.searchLoading ? "Searching..." : product.searchQuery.trim().length < 2 ? "Type at least 2 characters to search..." : "No results found"}
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-700">
                            Quantity
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={product.quantity}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateMedProduct(product.id, { quantity: v === "" ? "" : parseInt(v, 10) || 1 });
                            }}
                            className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-700">
                          Dosage (Morning - Noon - Evening - Night)
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          <input
                            type="text"
                            value={product.amountMorning}
                            onChange={(e) => updateMedProduct(product.id, { amountMorning: e.target.value })}
                            placeholder="Morning"
                            className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <input
                            type="text"
                            value={product.amountNoon}
                            onChange={(e) => updateMedProduct(product.id, { amountNoon: e.target.value })}
                            placeholder="Noon"
                            className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <input
                            type="text"
                            value={product.amountEvening}
                            onChange={(e) => updateMedProduct(product.id, { amountEvening: e.target.value })}
                            placeholder="Evening"
                            className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <input
                            type="text"
                            value={product.amountNight}
                            onChange={(e) => updateMedProduct(product.id, { amountNight: e.target.value })}
                            placeholder="Night"
                            className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-700">
                            Intake Note / Instructions
                          </label>
                          <input
                            type="text"
                            value={product.intakeNote}
                            onChange={(e) => updateMedProduct(product.id, { intakeNote: e.target.value })}
                            placeholder="e.g. Take with food"
                            className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-700">
                            Intake From Date
                          </label>
                          <input
                            type="date"
                            value={product.intakeFromDate}
                            onChange={(e) => updateMedProduct(product.id, { intakeFromDate: e.target.value })}
                            className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      {tf("decisionSummary")}
                    </label>
                    <input
                      type="text"
                      value={medDecisionSummary}
                      onChange={(e) => setMedDecisionSummary(e.target.value)}
                      placeholder="e.g. Post-operative pain management"
                      className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={medIsPrescription}
                        onChange={(e) => setMedIsPrescription(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      {tf("saveAsPrescription")}
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={medShowInMediplan}
                        onChange={(e) => setMedShowInMediplan(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      {tf("showInMediplan")}
                    </label>
                  </div>
                </div>
              ) : null}

              {consultationError ? (
                <p className="text-[11px] text-red-600">{consultationError}</p>
              ) : null}

              <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-slate-600">
                <span>{tf("timeSpent")}</span>
                <div className="flex items-center gap-1">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-700">
                    {formDisplayDuration}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (consultationStopwatchStartedAt) {
                        const elapsedSeconds = Math.max(
                          0,
                          Math.floor(
                            (Date.now() - consultationStopwatchStartedAt) / 1000,
                          ),
                        );
                        setConsultationDurationSeconds(
                          consultationDurationSeconds + elapsedSeconds,
                        );
                        setConsultationStopwatchStartedAt(null);
                        setConsultationStopwatchNow(Date.now());
                      } else {
                        const nowTs = Date.now();
                        setConsultationStopwatchStartedAt(nowTs);
                        setConsultationStopwatchNow(nowTs);
                      }
                    }}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    {formStopwatchRunning ? tf("stop") : tf("start")}
                  </button>
                  {formRunningSeconds > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConsultationDurationSeconds(0);
                        setConsultationStopwatchStartedAt(null);
                        setConsultationStopwatchNow(Date.now());
                      }}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 shadow-sm hover:bg-slate-50"
                    >
                      {tf("reset")}
                    </button>
                  ) : null}
                </div>
              </div>

              {consultationRecordType !== "notes" ? (
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (consultationSaving) return;
                      consultationYFieldsRef.current?.set("open", "false");
                      setNewConsultationOpen(false);
                      setConsultationError(null);
                      setEditingInvoiceId(null);
                      setEditingInvoiceNumber(null);
                      setConsultationDurationSeconds(0);
                      setConsultationStopwatchStartedAt(null);
                      setConsultationStopwatchNow(Date.now());
                      setInvoicePaymentMethod("");
                      setInvoiceMode("individual");
                      setInvoiceGroupId("");
                      setInvoicePaymentTerm("full");
                      setInvoiceExtraOption(null);
                      setInvoiceInstallments([]);
                      setInvoiceServiceLines([]);
                      setInvoiceSelectedCategoryId("");
                      setInvoiceSelectedServiceId("");
                      setConsultationDiagnosisCode("");
                      setConsultationRefIcd10("");
                      setInvoiceFromConsultationId(null);
                      setMedProducts([createEmptyMedProduct()]);
                      setMedIntakeNote("");
                      setMedIntakeFromDate(formatLocalDateInputValue(new Date()));
                      setMedDecisionSummary("");
                      setMedShowInMediplan(true);
                      setMedIsPrescription(true);
                      setMedSelectedTemplateId("");
                      setMedTemplateServiceFilter("");
                      setMedTemplateFilter("all");
                    }}
                    className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-200"
                  >
                    {tf("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={consultationSaving}
                    className="inline-flex items-center rounded-full border border-sky-500/80 bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {consultationSaving ? tf("saving") : editingInvoiceId ? tf("updateInvoice") : tf("create")}
                  </button>
                </div>
              ) : null}
            </form>
          </div>
        ) : null}
        {pendingCreateConsultationNotes.length > 0 ? (
          <div className="mb-3 space-y-3">
            {pendingCreateConsultationNotes.map((note) => (
              <PendingCreateConsultationNoteEditor
                key={note.id}
                note={note}
                patientId={patientId}
                medicalStaffOptions={medicalStaffOptions}
                onRemove={(id) =>
                  setPendingCreateConsultationNotes((prev) =>
                    prev.filter((item) => item.id !== id),
                  )
                }
                onFinalized={(row) => {
                  setPendingCreateConsultationNotes((prev) =>
                    prev.filter((item) => item.id !== note.id),
                  );
                  setConsultations((prev) => [row, ...prev]);
                  broadcastPatientRealtimeRefresh({ force: true });
                }}
                onError={(message) => setConsultationsError(message)}
              />
            ))}
          </div>
        ) : null}

        {/* Success banner for invoice created from consultation */}
        {invoiceFromConsultationSuccess && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
            <span>{invoiceFromConsultationSuccess}</span>
            <button
              type="button"
              onClick={() => setInvoiceFromConsultationSuccess(null)}
              className="ml-2 text-emerald-500 hover:text-emerald-700"
            >
              âœ•
            </button>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {consultationsError ? (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {consultationsError}
            </div>
          ) : consultationsLoading ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              {tc("loading")}
            </div>
          ) : filteredSortedConsultations.length === 0 ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              {tc("noConsultations")}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSortedConsultations.map((row) => {
                const scheduled = row.scheduled_at
                  ? new Date(row.scheduled_at)
                  : null;
                const scheduledLabel =
                  scheduled && !Number.isNaN(scheduled.getTime())
                    ? scheduled.toLocaleString()
                    : "";

                const isNotes = row.record_type === "notes";
                const isPrescription = row.record_type === "prescription";
                const isInvoice = row.record_type === "invoice";
                const is3d = row.record_type === "3d";
                const isLockedNote = isNotes && row.is_draft === false;

                const baseRecordTypeLabel =
                  consultationRecordTypeOptions.find(
                    (opt) => opt.value === row.record_type,
                  )?.label ?? "Unknown";

                const recordTypeLabel = baseRecordTypeLabel;

                const displayTitle = (() => {
                  const title = row.title ?? "";
                  // For invoices, show title as-is (no prefix removal)
                  if (isInvoice) {
                    return title;
                  }
                  // For consultations, remove "Consultation " prefix if present
                  const prefix = "Consultation ";
                  return title.startsWith(prefix)
                    ? title.slice(prefix.length)
                    : title;
                })();

                const isComplimentaryInvoice =
                  isInvoice &&
                  typeof row.content === "string" &&
                  (row.content.includes(
                    "Extra option:</strong> Complimentary service",
                  ) ||
                    row.content.includes(
                      "Extra option:</strong> Complimentary Service",
                    ));

                const isCashInvoice =
                  isInvoice &&
                  typeof row.payment_method === "string" &&
                  row.payment_method === "Cash";

                const cardClassName = isLockedNote
                  ? "group rounded-2xl border border-slate-300 bg-slate-100/80 px-5 py-4 text-sm text-slate-600 shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-400"
                  : "group rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-slate-300 hover:shadow-[0_14px_30px_rgba(15,23,42,0.09)]";

                const totalSeconds = row.duration_seconds ?? 0;
                const displayDuration = formatDuration(totalSeconds);

                let threeDMeta: {
                  reconstruction_type?: string | null;
                  player_id?: string | null;
                } | null = null;

                if (
                  is3d &&
                  typeof row.content === "string" &&
                  row.content.trim()
                ) {
                  try {
                    const parsed = JSON.parse(row.content) as {
                      reconstruction_type?: string | null;
                      player_id?: string | null;
                    };
                    threeDMeta = parsed;
                  } catch {
                    threeDMeta = null;
                  }
                }

                return (
                  <div key={row.id} className={cardClassName}>
                    {/* Header Section */}
                    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3.5">
                      <div className="flex-1 min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={
                              isLockedNote
                                ? "inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
                                : "inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
                            }
                          >
                            {recordTypeLabel}
                          </span>
                          {isLockedNote ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.7}>
                                <rect x="5" y="8" width="10" height="8" rx="1.5" />
                                <path d="M7.5 8V5.8a2.5 2.5 0 0 1 5 0V8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Closed
                            </span>
                          ) : null}
                          {displayDuration && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {displayDuration}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {row.doctor_name && (
                            <div className={`text-[15px] font-semibold ${isLockedNote ? "text-slate-600" : "text-slate-900"}`}>
                              {row.doctor_name}
                            </div>
                          )}
                          {scheduledLabel && (
                            <div className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${isLockedNote ? "bg-slate-200 text-slate-500" : "bg-slate-50 text-slate-500"}`}>
                              {scheduledLabel}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {is3d &&
                          threeDMeta?.player_id &&
                          threeDMeta.reconstruction_type ? (
                          <button
                            type="button"
                            onClick={() => {
                              const crType = threeDMeta?.reconstruction_type;
                              const playerId = threeDMeta?.player_id;
                              if (!crType || !playerId) return;
                              const url = `/patients/${row.patient_id}?mode=medical&m_tab=3d&show3d=1&cr_player_id=${encodeURIComponent(
                                playerId,
                              )}&cr_type=${crType}`;
                              router.push(url);
                            }}
                            className="inline-flex items-center rounded-full border border-sky-200 bg-sky-600 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm hover:bg-sky-700"
                          >
                            Open 3D
                          </button>
                        ) : null}
                        {isInvoice && !isComplimentaryInvoice ? (
                          (() => {
                            const effectiveStatus: InvoiceStatus = row.invoice_status || (row.invoice_is_paid ? "PAID" : "OPEN");
                            const statusConfig = INVOICE_STATUS_DISPLAY[effectiveStatus];
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor}`}>
                                {effectiveStatus === "PAID" && (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                                {effectiveStatus === "OPEN" && (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                                {effectiveStatus === "CANCELLED" && (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                                {effectiveStatus === "PARTIAL_PAID" && (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                                Payment: {statusConfig.label}
                              </span>
                            );
                          })()
                        ) : null}
                        {isCashInvoice && !isComplimentaryInvoice && !row.invoice_is_paid ? (
                          <button
                            type="button"
                            onClick={() => openCashReceiptModal(row)}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                          >
                            Upload receipt
                          </button>
                        ) : null}
                        {/* Linked invoice status badge on consultation records */}
                        {!isInvoice && row.linked_invoice_id && row.linked_invoice_status && (() => {
                          const linkedStatus = INVOICE_STATUS_DISPLAY[row.linked_invoice_status];
                          return (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${linkedStatus.bgColor} ${linkedStatus.color} ${linkedStatus.borderColor}`}>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Invoice: {linkedStatus.label}
                            </span>
                          );
                        })()}
                        {/* Insurance/MediData status badge */}
                        {row.medidata_status && (() => {
                          const mdStatus = row.medidata_status;
                          const mdConfig: Record<string, { bg: string; text: string; border: string; icon: string }> = {
                            draft: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300", icon: "ðŸ“" },
                            pending: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300", icon: "â³" },
                            transmitted: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300", icon: "ðŸ“¤" },
                            delivered: { bg: "bg-sky-100", text: "text-sky-800", border: "border-sky-300", icon: "âœ‰ï¸" },
                            accepted: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300", icon: "âœ…" },
                            paid: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300", icon: "ðŸ’°" },
                            partially_paid: { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300", icon: "ðŸ’µ" },
                            rejected: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300", icon: "âŒ" },
                            disputed: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300", icon: "âš ï¸" },
                            cancelled: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300", icon: "ðŸš«" },
                          };
                          const config = mdConfig[mdStatus] || mdConfig.draft;
                          const label = mdStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                          return (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${config.bg} ${config.text} ${config.border}`}>
                              <span className="text-[11px] leading-none">{config.icon}</span>
                              Insurance: {label}
                            </span>
                          );
                        })()}
                        {!showArchived ? (
                          <>
                            {isLockedNote ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleUnlockConsultationNote(row);
                                }}
                                disabled={unlockingConsultationId === row.id}
                                className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 shadow-sm hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                title="Unlock and edit this note with live collaboration"
                              >
                                <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="5" y="8" width="10" height="8" rx="1.5" />
                                  <path d="M12.5 8V5.8a2.5 2.5 0 0 0-4.65-1.28" />
                                </svg>
                                {unlockingConsultationId === row.id ? "Unlocking" : "Unlock"}
                              </button>
                            ) : null}
                            {isNotes ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void openConsultationNoteEvents(row);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                              >
                                Logs
                              </button>
                            ) : null}
                            {row.record_type !== "invoice" && !row.linked_invoice_id && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await openInvoiceFormFromConsultation(row);
                                  if (row.id === activeCollaborativeConsultation?.id) {
                                    setSuppressedCreateDraftId(row.id);
                                    consultationYFieldsRef.current?.set("open", "false");
                                  }
                                  // Open new consultation form in invoice mode, prefilled from this consultation
                                  setInvoiceFromConsultationId(row.id);
                                  setConsultationRecordType("invoice");
                                  setConsultationTitle(row.title || "");
                                  setConsultationDoctorId("");
                                  setInvoiceProviderId("");
                                  setConsultationDiagnosisCode(row.diagnosis_code || "");
                                  setConsultationRefIcd10(row.ref_icd10 || "");
                                  // Use TODAY's date for the invoice (not the consultation's old date)
                                  {
                                    const now = new Date();
                                    setConsultationDate(now.toISOString().split("T")[0]);
                                    setConsultationHour(now.getHours().toString().padStart(2, "0"));
                                    setConsultationMinute(now.getMinutes().toString().padStart(2, "0"));
                                  }
                                  // Prefill provider from doctor's provider_id mapping
                                  if (row.doctor_user_id) {
                                    let mappedProviderId =
                                      userOptions.find((u) => u.id === row.doctor_user_id)
                                        ?.provider_id ?? null;

                                    // Fallback to DB in case user options are stale/not loaded yet
                                    if (!mappedProviderId) {
                                      const { data: userRow } = await supabaseClient
                                        .from("users")
                                        .select("provider_id")
                                        .eq("id", row.doctor_user_id)
                                        .maybeSingle();
                                      mappedProviderId = userRow?.provider_id ?? null;
                                    }

                                    if (mappedProviderId) {
                                      // In invoice mode, doctor selector expects a provider (medical staff) id
                                      if (medicalStaffOptions.some((s) => s.id === mappedProviderId)) {
                                        setConsultationDoctorId(mappedProviderId);
                                      }

                                      // Billing entity selector expects billing_entity role.
                                      // If mapped provider is a doctor/nurse, resolve billing entity via shared GLN.
                                      let billingProviderId = mappedProviderId;
                                      if (!billingEntityOptions.some((p) => p.id === billingProviderId)) {
                                        const sourceProvider = providerOptions.find(
                                          (p) => p.id === mappedProviderId,
                                        );
                                        if (sourceProvider?.gln) {
                                          const billingByGln = billingEntityOptions.find(
                                            (p) => p.gln === sourceProvider.gln,
                                          );
                                          if (billingByGln) {
                                            billingProviderId = billingByGln.id;
                                          }
                                        }
                                      }

                                      if (billingEntityOptions.some((p) => p.id === billingProviderId)) {
                                        setInvoiceProviderId(billingProviderId);
                                      }
                                    }
                                  }
                                  setNewConsultationOpen(true);
                                  setTimeout(() => {
                                    creationFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                  }, 100);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
                              >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Create Invoice
                              </button>
                            )}
                            {row.record_type !== "invoice" && row.record_type !== "notes" && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditConsultation(row)}
                                className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 shadow-sm hover:bg-sky-100"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                void handleArchiveConsultation(row.id);
                              }}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                            >
                              Archive
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void handleDeleteConsultation(row.id);
                            }}
                            className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 shadow-sm hover:bg-red-100"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Content Section */}
                    <div className="mt-3.5 space-y-3">
                      {/* Title */}
                      {displayTitle && (
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h4 className={`font-semibold leading-snug ${isInvoice ? "text-slate-900 text-[14px]" : "text-slate-800 text-[13px]"}`}>
                            {displayTitle}
                          </h4>
                          {isComplimentaryInvoice && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Complimentary
                            </span>
                          )}
                        </div>
                      )}

                      {/* Metadata Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        {isInvoice && row.consultation_id && (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-700">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Consultation ID: <span className="font-mono">{row.consultation_id}</span>
                          </span>
                        )}
                        {isNotes && row.consultation_id && (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-blue-700">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                            Record ID: <span className="font-mono">{row.consultation_id}</span>
                          </span>
                        )}
                        {row.diagnosis_code && (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-medium text-purple-700">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Diagnosis: <span className="font-mono">{row.diagnosis_code}</span>
                          </span>
                        )}
                        {row.ref_icd10 && (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-medium text-indigo-700">
                            ICD-10: <span className="font-mono">{row.ref_icd10}</span>
                          </span>
                        )}
                        {row.linked_invoice_number && (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-700">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Linked Invoice: <span className="font-mono">#{row.linked_invoice_number}</span>
                          </span>
                        )}
                      </div>
                      {is3d && threeDMeta ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
                          <span>
                            Type:
                            <span className="ml-1 font-semibold capitalize">
                              {threeDMeta.reconstruction_type ?? "Unknown"}
                            </span>
                          </span>
                          {threeDMeta.player_id ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-700">
                              Player ID: {threeDMeta.player_id}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {/* Content/Notes */}
                      {isNotes && row.content ? (
                        <div
                          className={`rounded-xl border px-3.5 py-3 text-[12px] leading-relaxed [&_p]:min-h-[1.5em] [&_p]:whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ${
                            isLockedNote
                              ? "border-slate-300 bg-slate-200/70 text-slate-600"
                              : "border-slate-200 bg-slate-50/60 text-slate-700"
                          }`}
                          dangerouslySetInnerHTML={{ __html: row.content }}
                        />
                      ) : (isPrescription || isInvoice) && row.content ? (
                        <div
                          className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-[12px] leading-relaxed text-slate-700 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                          dangerouslySetInnerHTML={{ __html: row.content }}
                        />
                      ) : null}
                    </div>

                    {/* Linked Invoice (rendered under consultation in default tab) */}
                    {!recordTypeFilter && !isInvoice && row.linked_invoice_id && (() => {
                      const linkedInvoice = consultations.find((c) => c.invoice_id === row.linked_invoice_id && c.record_type === "invoice");
                      if (!linkedInvoice) return null;
                      const linkedEffectiveStatus: InvoiceStatus = linkedInvoice.invoice_status || (linkedInvoice.invoice_is_paid ? "PAID" : "OPEN");
                      const linkedStatusDisplay = INVOICE_STATUS_DISPLAY[linkedEffectiveStatus];
                      const linkedTotalAmt = linkedInvoice.invoice_total_amount ?? 0;
                      const linkedPaidAmt = linkedInvoice.invoice_paid_amount ?? 0;
                      const linkedIsCash = typeof linkedInvoice.payment_method === "string" && linkedInvoice.payment_method === "Cash";
                      return (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              <span className="text-[11px] font-semibold text-emerald-800">Linked Invoice #{linkedInvoice.consultation_id}</span>
                              {linkedInvoice.title && <span className="text-[10px] text-slate-600">â€” {linkedInvoice.title}</span>}
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${linkedStatusDisplay.bgColor} ${linkedStatusDisplay.color} ${linkedStatusDisplay.borderColor}`}>
                              {linkedStatusDisplay.label}
                            </span>
                          </div>
                          {linkedTotalAmt > 0 && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-100 bg-white/80 px-3 py-2 text-[11px] mb-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Total</span>
                                <span className="font-semibold text-slate-900">CHF {linkedTotalAmt.toFixed(2)}</span>
                              </div>
                              {linkedPaidAmt > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500">Paid</span>
                                  <span className="font-semibold text-emerald-700">CHF {linkedPaidAmt.toFixed(2)}</span>
                                </div>
                              )}
                              {linkedInvoice.payment_method && (
                                <div className="flex items-center gap-1.5 ml-auto">
                                  <span className="text-slate-400">via</span>
                                  <span className="font-medium text-slate-600">{linkedInvoice.payment_method}</span>
                                </div>
                              )}
                            </div>
                          )}
                          {linkedInvoice.content && (
                            <div
                              className="mb-2 rounded-md border border-slate-100 bg-white/80 px-3 py-2 text-[11px] text-slate-700 [&_table]:w-full [&_table]:text-[10px] [&_th]:text-left [&_th]:font-medium [&_th]:text-slate-500 [&_th]:pb-1 [&_td]:py-0.5 [&_td]:pr-2"
                              dangerouslySetInnerHTML={{ __html: linkedInvoice.content }}
                            />
                          )}
                          {/* Installments summary */}
                          {linkedInvoice.invoice_id && installmentSummaries[linkedInvoice.invoice_id] && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-violet-100 bg-violet-50/60 px-3 py-2 text-[11px] mb-2">
                              <div className="flex items-center gap-1.5">
                                <svg className="h-3.5 w-3.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                <span className="font-medium text-violet-700">
                                  Installments: {installmentSummaries[linkedInvoice.invoice_id].paidCount}/{installmentSummaries[linkedInvoice.invoice_id].count} paid
                                </span>
                              </div>
                            </div>
                          )}
                          {/* Invoice actions */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {linkedInvoice.invoice_pdf_path ? (
                              <button type="button" onClick={() => handleViewPdf(linkedInvoice.invoice_pdf_path!)} className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                View PDF
                              </button>
                            ) : null}
                            {(() => {
                              const linkedQueued = anyInvoicePdfJobStatus(linkedInvoice.id);
                              return (
                                <button
                                  type="button"
                                  onClick={() => linkedQueued ? handleCancelPdfJob(linkedInvoice.id, "tg") : handleGenerateInvoicePdf(linkedInvoice.id)}
                                  disabled={generatingPdf === linkedInvoice.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50"
                                >
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                  {generatingPdf === linkedInvoice.id ? "Queueing..." : linkedQueued ? `â³ ${linkedQueued.status === "processing" ? "Processing" : "Queued"} â€” Cancel` : linkedInvoice.invoice_pdf_path ? "Regenerate PDF" : "Generate PDF"}
                                </button>
                              );
                            })()}
                            <div className="h-4 w-px bg-slate-200" />
                            <button type="button" onClick={() => handleEditInvoice(linkedInvoice)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              Edit Invoice
                            </button>
                            <div className="h-4 w-px bg-slate-200" />
                            <button type="button" onClick={() => handleManagePaymentStatus(linkedInvoice)} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                              Payment Status
                            </button>
                            <button type="button" onClick={() => handleOpenInstallments(linkedInvoice)} className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100 transition-colors">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                              Installments
                            </button>
                            <div className="h-4 w-px bg-slate-200" />
                            <button type="button" onClick={() => handleCheckXml(linkedInvoice.id)} disabled={checkingXmlId === linkedInvoice.id} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                              {checkingXmlId === linkedInvoice.id ? "Checking..." : "Check XML"}
                            </button>
                            {(() => {
                              const insurancePending = insuranceNotifications.hasPendingJob(linkedInvoice.id);
                              return (
                                <button
                                  type="button"
                                  disabled={insurancePending}
                                  onClick={() => { setInsuranceBillingTarget(linkedInvoice); setInsuranceBillingModalOpen(true); }}
                                  className={`inline-flex items-center gap-1 rounded-md border border-teal-200 px-2 py-1 text-[10px] font-medium transition-colors ${insurancePending ? "bg-teal-100 text-teal-800 cursor-not-allowed" : "bg-teal-50 text-teal-700 hover:bg-teal-100"}`}
                                >
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                  {insurancePending ? "â³ Insurance" : "Insurance"}
                                </button>
                              );
                            })()}
                            {linkedIsCash && linkedInvoice.invoice_is_paid && linkedInvoice.cash_receipt_path && (
                              <button type="button" onClick={() => handleViewCashReceipt(linkedInvoice.cash_receipt_path)} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100 transition-colors">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" /></svg>
                                View Receipt
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Invoice footer: amount summary + actions */}
                    {isInvoice && !isComplimentaryInvoice ? (() => {
                      const effectiveStatus: InvoiceStatus = row.invoice_status || (row.invoice_is_paid ? "PAID" : "OPEN");
                      const totalAmt = row.invoice_total_amount ?? 0;
                      const paidAmt = row.invoice_paid_amount ?? 0;
                      const lossAmt = effectiveStatus === "PARTIAL_LOSS" ? totalAmt - paidAmt : 0;
                      const remainingAmt = effectiveStatus === "PARTIAL_PAID" ? totalAmt - paidAmt : 0;
                      const hasPaidInfo = paidAmt > 0 && (effectiveStatus === "PAID" || effectiveStatus === "PARTIAL_PAID" || effectiveStatus === "PARTIAL_LOSS" || effectiveStatus === "OVERPAID");
                      return (
                        <div className="mt-3 space-y-2">
                          {/* Amount summary bar */}
                          {totalAmt > 0 && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Total</span>
                                <span className="font-semibold text-slate-900">CHF {totalAmt.toFixed(2)}</span>
                              </div>
                              {hasPaidInfo && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500">Paid</span>
                                  <span className="font-semibold text-emerald-700">CHF {paidAmt.toFixed(2)}</span>
                                </div>
                              )}
                              {lossAmt > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500">Loss</span>
                                  <span className="font-semibold text-orange-600">CHF {lossAmt.toFixed(2)}</span>
                                </div>
                              )}
                              {remainingAmt > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500">Remaining</span>
                                  <span className="font-semibold text-amber-600">CHF {remainingAmt.toFixed(2)}</span>
                                </div>
                              )}
                              {row.payment_method && (
                                <div className="flex items-center gap-1.5 ml-auto">
                                  <span className="text-slate-400">via</span>
                                  <span className="font-medium text-slate-600">{row.payment_method}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Installments summary */}
                          {row.invoice_id && installmentSummaries[row.invoice_id] && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-violet-100 bg-violet-50/60 px-3 py-2 text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <svg className="h-3.5 w-3.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                <span className="font-medium text-violet-700">
                                  Installments: {installmentSummaries[row.invoice_id].paidCount}/{installmentSummaries[row.invoice_id].count} paid
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-violet-500">Paid</span>
                                <span className="font-semibold text-emerald-700">CHF {installmentSummaries[row.invoice_id].paid.toFixed(2)}</span>
                              </div>
                              {installmentSummaries[row.invoice_id].total - installmentSummaries[row.invoice_id].paid > 0.01 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-violet-500">Remaining</span>
                                  <span className="font-semibold text-amber-600">
                                    CHF {(installmentSummaries[row.invoice_id].total - installmentSummaries[row.invoice_id].paid).toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {installmentSummaries[row.invoice_id].paidCount === installmentSummaries[row.invoice_id].count && (
                                <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">All Paid</span>
                              )}
                            </div>
                          )}

                          {/* Action buttons toolbar */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Document group */}
                            {/* View PDF dropdown - always visible */}
                            <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setViewPdfDropdownOpen(null); }}>
                              <button
                                type="button"
                                onClick={() => setViewPdfDropdownOpen(viewPdfDropdownOpen === row.id ? null : row.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                View PDF
                                <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 8l4 4 4-4" /></svg>
                              </button>
                              {viewPdfDropdownOpen === row.id && (
                                <div className="absolute left-0 top-full mt-1 z-50 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                                  <button type="button" disabled={!row.invoice_pdf_path_tg} title={!row.invoice_pdf_path_tg ? "Generate this type first" : ""} className={`w-full px-3 py-1.5 text-left text-[11px] ${row.invoice_pdf_path_tg ? "text-slate-700 hover:bg-indigo-50 cursor-pointer" : "text-slate-300 cursor-not-allowed"}`} onClick={() => { if (row.invoice_pdf_path_tg) { setViewPdfDropdownOpen(null); handleViewPdf(row.invoice_pdf_path_tg); } }}>
                                    Invoice (patient)
                                  </button>
                                  <button type="button" disabled={!row.invoice_pdf_path_tp} title={!row.invoice_pdf_path_tp ? "Generate this type first" : ""} className={`w-full px-3 py-1.5 text-left text-[11px] ${row.invoice_pdf_path_tp ? "text-slate-700 hover:bg-indigo-50 cursor-pointer" : "text-slate-300 cursor-not-allowed"}`} onClick={() => { if (row.invoice_pdf_path_tp) { setViewPdfDropdownOpen(null); handleViewPdf(row.invoice_pdf_path_tp); } }}>
                                    Invoice (insurance)
                                  </button>
                                  <button type="button" disabled={!row.invoice_pdf_path_reminder} title={!row.invoice_pdf_path_reminder ? "Generate this type first" : ""} className={`w-full px-3 py-1.5 text-left text-[11px] ${row.invoice_pdf_path_reminder ? "text-slate-700 hover:bg-indigo-50 cursor-pointer" : "text-slate-300 cursor-not-allowed"}`} onClick={() => { if (row.invoice_pdf_path_reminder) { setViewPdfDropdownOpen(null); handleViewPdf(row.invoice_pdf_path_reminder); } }}>
                                    Reminder
                                  </button>
                                  <button type="button" disabled={!row.invoice_pdf_path_receipt} title={!row.invoice_pdf_path_receipt ? "Generate this type first" : ""} className={`w-full px-3 py-1.5 text-left text-[11px] ${row.invoice_pdf_path_receipt ? "text-slate-700 hover:bg-indigo-50 cursor-pointer" : "text-slate-300 cursor-not-allowed"}`} onClick={() => { if (row.invoice_pdf_path_receipt) { setViewPdfDropdownOpen(null); handleViewPdf(row.invoice_pdf_path_receipt); } }}>
                                    Patient receipt
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPdfDropdownOpen(null); }}>
                              {(() => {
                                const queued = anyInvoicePdfJobStatus(row.id);
                                return (
                                  <button
                                    type="button"
                                    onClick={() => setPdfDropdownOpen(pdfDropdownOpen === row.id ? null : row.id)}
                                    disabled={generatingPdf === row.id || !!queued}
                                    className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-70"
                                  >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    {generatingPdf === row.id ? "Queueing..." : queued ? `â³ ${queued.status === "processing" ? "Processing" : "Queued"} (${queued.type.toUpperCase()})` : "Generate PDF"}
                                    <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 8l4 4 4-4" /></svg>
                                  </button>
                                );
                              })()}
                              {pdfDropdownOpen === row.id && (
                                <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                                  {[
                                    { type: "tg", label: "Invoice (patient / TG)", reminderLevel: 1 },
                                    { type: "tp", label: "Invoice (insurance / TP)", reminderLevel: 1 },
                                    { type: "reminder", label: "Reminder (1st)", reminderLevel: 1 },
                                    { type: "reminder", label: "Reminder (2nd)", reminderLevel: 2 },
                                    { type: "reminder", label: "Reminder (3rd)", reminderLevel: 3 },
                                    { type: "receipt", label: "Patient receipt", reminderLevel: 1 },
                                  ].map(({ type, label, reminderLevel }) => {
                                    const status = invoicePdfJobStatus(row.id, type as any, reminderLevel);
                                    const isQueued = !!status;
                                    return (
                                      <button
                                        key={`${type}-${reminderLevel}`}
                                        type="button"
                                        className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] ${isQueued ? "text-amber-700 hover:bg-amber-50" : "text-slate-700 hover:bg-violet-50"}`}
                                        onClick={() => {
                                          setPdfDropdownOpen(null);
                                          if (isQueued) {
                                            handleCancelPdfJob(row.id, type as any, reminderLevel);
                                          } else {
                                            handleGenerateInvoicePdf(row.id, type as any, reminderLevel);
                                          }
                                        }}
                                      >
                                        <span>{label}</span>
                                        {isQueued && <span className="text-[10px] font-medium">{status === "processing" ? "ðŸ”„ Cancel" : "â³ Cancel"}</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Email to patient â€” dropdown of already-generated doc types */}
                            <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEmailDropdownOpen(null); }}>
                              <button
                                type="button"
                                disabled={sendingEmail === row.id}
                                title={!patientEmail ? "No email on file for this patient" : undefined}
                                onClick={() => {
                                  if (!patientEmail) return;
                                  setEmailDropdownOpen(emailDropdownOpen === row.id ? null : row.id);
                                }}
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                                  !patientEmail
                                    ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                                    : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                }`}
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                {sendingEmail === row.id ? "Sending..." : "Email to patient"}
                                {patientEmail && <svg className="h-2.5 w-2.5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
                              </button>

                              {emailDropdownOpen === row.id && patientEmail && (
                                <div className="absolute left-0 top-full z-30 mt-1 min-w-[190px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                                  {/* Show only types that have been generated */}
                                  {[
                                    { type: "tg", label: "Invoice (patient / TG)", path: row.invoice_pdf_path_tg },
                                    { type: "tp", label: "Invoice (insurance / TP)", path: row.invoice_pdf_path_tp },
                                    { type: "reminder", label: "Reminder", path: row.invoice_pdf_path_reminder },
                                    { type: "receipt", label: "Patient receipt", path: row.invoice_pdf_path_receipt },
                                  ].map(({ type, label, path }) =>
                                    path ? (
                                      <button
                                        key={type}
                                        type="button"
                                        onClick={() => {
                                          setEmailDropdownOpen(null);
                                          handleSendInvoiceEmail(row.id, path, type);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                                      >
                                        <svg className="h-3 w-3 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" /></svg>
                                        {label}
                                      </button>
                                    ) : null
                                  )}
                                  {/* If nothing generated yet */}
                                  {!row.invoice_pdf_path_tg && !row.invoice_pdf_path_tp && !row.invoice_pdf_path_reminder && !row.invoice_pdf_path_receipt && (
                                    <p className="px-3 py-2 text-[11px] text-slate-400 italic">No PDF generated yet. Use Generate PDF first.</p>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="h-4 w-px bg-slate-200" />

                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => handleEditInvoice(row)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              Edit Invoice
                            </button>

                            <div className="h-4 w-px bg-slate-200" />

                            {/* Payment group */}
                            <button
                              type="button"
                              onClick={() => handleManagePaymentStatus(row)}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                              {effectiveStatus === "PARTIAL_PAID" ? "Update Payment" : "Payment Status"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenInstallments(row)}
                              className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                              Installments
                            </button>

                            {!row.invoice_is_paid && (
                              <button
                                type="button"
                                onClick={async () => {
                                  let paymentLink = "";
                                  if (row.payment_link_token) {
                                    paymentLink = `${window.location.origin}/invoice/pay/${row.payment_link_token}`;
                                  }
                                  // If no token yet, generate one
                                  if (!paymentLink && row.invoice_id) {
                                    try {
                                      const res = await fetch("/api/invoices/generate-payment-token", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ invoiceId: row.invoice_id }),
                                      });
                                      const data = await res.json();
                                      if (data.token) {
                                        paymentLink = `${window.location.origin}/invoice/pay/${data.token}`;
                                      }
                                    } catch {}
                                  }
                                  if (!paymentLink) {
                                    alert("Unable to generate payment link.");
                                    return;
                                  }
                                  navigator.clipboard.writeText(paymentLink).then(() => alert("Payment link copied!")).catch(() => alert("Failed to copy link"));
                                  // Start 48hr deposit deadline if this invoice is linked to an appointment
                                  // and the deadline hasn't been set yet (first copy wins)
                                  if (row.invoice_id) {
                                    fetch("/api/payments/stripe/set-deposit-deadline", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ invoiceId: row.invoice_id }),
                                    }).catch(() => {});
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                Copy Payment Link
                              </button>
                            )}

                            {!row.invoice_is_paid && row.payrexx_payment_link && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const response = await fetch("/api/payments/sync-payment-status", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ consultationCode: row.consultation_id }),
                                    });
                                    const data = await response.json();
                                    if (data.isPaid) {
                                      alert("Payment confirmed! Refreshing...");
                                      window.location.reload();
                                    } else {
                                      alert(`Payment status: ${data.payrexxStatus || "waiting"}`);
                                    }
                                  } catch {
                                    alert("Failed to check payment status");
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-700 hover:bg-sky-100 transition-colors"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Sync Payment
                              </button>
                            )}

                            {isCashInvoice && row.invoice_is_paid && row.cash_receipt_path && (
                              <button
                                type="button"
                                onClick={() => handleViewCashReceipt(row.cash_receipt_path)}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" /></svg>
                                View Receipt
                              </button>
                            )}

                            <div className="h-4 w-px bg-slate-200" />

                            {/* Check XML */}
                            <button
                              type="button"
                              onClick={() => handleCheckXml(row.id)}
                              disabled={checkingXmlId === row.id}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                              {checkingXmlId === row.id ? "Checking..." : "Check XML"}
                            </button>

                            {/* Insurance */}
                            {(() => {
                              const insurancePending = insuranceNotifications.hasPendingJob(row.id);
                              return (
                                <button
                                  type="button"
                                  disabled={insurancePending}
                                  onClick={() => { setInsuranceBillingReminderOverride(null); setInsuranceBillingTarget(row); setInsuranceBillingModalOpen(true); }}
                                  className={`inline-flex items-center gap-1 rounded-md border border-teal-200 px-2 py-1 text-[10px] font-medium transition-colors ${insurancePending ? "bg-teal-100 text-teal-800 cursor-not-allowed" : "bg-teal-50 text-teal-700 hover:bg-teal-100"}`}
                                >
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                  {insurancePending ? "⏳ Insurance" : "Insurance"}
                                </button>
                              );
                            })()}

                            {/* Créer un rappel */}
                            {row.invoice_status !== "PAID" && row.invoice_status !== "CANCELLED" && row.invoice_id && (() => {
                              const rl = row.invoice_reminder_level ?? 0;
                              const nextLevel = Math.min(rl + 1, 3) as 1 | 2 | 3;
                              const levelLabel = nextLevel === 1 ? "1er rappel" : nextLevel === 2 ? "2e rappel" : "3e rappel";
                              const isOpen = reminderPopupInvoiceId === row.invoice_id;
                              return (
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setReminderPopupInvoiceId(isOpen ? null : row.invoice_id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                                    title={`Créer un rappel — ${levelLabel}`}
                                  >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                    Rappel ▾
                                  </button>
                                  {isOpen && (
                                    <>
                                      <div className="fixed inset-0 z-40" onClick={() => setReminderPopupInvoiceId(null)} />
                                      <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-amber-200 bg-white shadow-xl">
                                        <div className="flex items-center justify-between border-b border-amber-100 px-3 py-2">
                                          <div>
                                            <p className="text-[11px] font-semibold text-slate-900">Créer un rappel</p>
                                            <p className="text-[10px] text-amber-700">{levelLabel}</p>
                                          </div>
                                          <button onClick={() => setReminderPopupInvoiceId(null)} className="text-slate-400 hover:text-slate-600">
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                          </button>
                                        </div>
                                        <div className="p-2 space-y-1">
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              setReminderPopupInvoiceId(null);
                                              const res = await fetch("/api/invoices/generate-pdf", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ invoiceId: row.invoice_id, invoiceType: "reminder", reminderLevel: nextLevel }),
                                              });
                                              const json = await res.json();
                                              if (json.pdfUrl) window.open(json.pdfUrl, "_blank");
                                              else if (json.pdfPath) {
                                                const { data: u } = await supabaseClient.storage.from("invoice-pdfs").createSignedUrl(json.pdfPath, 300);
                                                if (u?.signedUrl) window.open(u.signedUrl, "_blank");
                                              }
                                              const now = new Date().toISOString();
                                              const upd: Record<string, unknown> = { reminder_level: nextLevel };
                                              if (nextLevel === 1) upd.reminder_1_sent_at = now;
                                              else if (nextLevel === 2) upd.reminder_2_sent_at = now;
                                              else upd.reminder_3_sent_at = now;
                                              await supabaseClient.from("invoices").update(upd).eq("id", row.invoice_id!);
                                            }}
                                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[11px] font-medium text-slate-700 hover:bg-amber-50 transition-colors"
                                          >
                                            <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                            Imprimer
                                          </button>
                                          <button
                                            type="button"
                                            disabled={!patientEmail}
                                            onClick={async () => {
                                              if (!patientEmail) return;
                                              setReminderPopupInvoiceId(null);
                                              await fetch("/api/invoices/generate-pdf", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ invoiceId: row.invoice_id, invoiceType: "reminder", reminderLevel: nextLevel }),
                                              });
                                              await fetch("/api/invoices/send-email", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ invoiceId: row.invoice_id, recipientEmail: patientEmail, documentType: "reminder" }),
                                              });
                                              const now = new Date().toISOString();
                                              const upd: Record<string, unknown> = { reminder_level: nextLevel };
                                              if (nextLevel === 1) upd.reminder_1_sent_at = now;
                                              else if (nextLevel === 2) upd.reminder_2_sent_at = now;
                                              else upd.reminder_3_sent_at = now;
                                              await supabaseClient.from("invoices").update(upd).eq("id", row.invoice_id!);
                                            }}
                                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[11px] font-medium text-slate-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                          >
                                            <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                            Envoyer par e-mail
                                            {!patientEmail && <span className="ml-auto text-[9px] text-slate-400">sans email</span>}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setReminderPopupInvoiceId(null);
                                              setInsuranceBillingReminderOverride(nextLevel);
                                              setInsuranceBillingTarget(row);
                                              setInsuranceBillingModalOpen(true);
                                            }}
                                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[11px] font-medium text-slate-700 hover:bg-teal-50 transition-colors"
                                          >
                                            <svg className="h-4 w-4 shrink-0 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                            Envoyer via Medidata
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })() : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {taskModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm py-6 sm:py-8">
          <div className="w-full max-w-md max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.65)]">
            <h2 className="text-sm font-semibold text-slate-900">Create Task</h2>
            <form onSubmit={handleTaskSubmit} className="mt-3 space-y-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Name
                </label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(event) => setTaskName(event.target.value)}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Enter task name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Type
                  </label>
                  <select
                    value={taskType}
                    onChange={(event) =>
                      setTaskType(event.target.value as TaskType)
                    }
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="todo">Todo</option>
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Priority
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(event) =>
                      setTaskPriority(event.target.value as TaskPriority)
                    }
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    User
                  </label>
                  <select
                    value={taskAssignedUserId}
                    onChange={(event) =>
                      setTaskAssignedUserId(event.target.value)
                    }
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">Unassigned</option>
                    {userOptions.map((user) => {
                      const label =
                        user.full_name || user.email || "Unnamed user";
                      return (
                        <option key={user.id} value={user.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Activity Date
                  </label>
                  <input
                    type="datetime-local"
                    value={taskActivityDate}
                    onChange={(event) => setTaskActivityDate(event.target.value)}
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Content
                </label>
                <textarea
                  value={taskContent}
                  onChange={(event) => setTaskContent(event.target.value)}
                  rows={3}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Enter task details..."
                />
              </div>
              {taskSaveError ? (
                <p className="text-[11px] text-red-600">{taskSaveError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (taskSaving) return;
                    setTaskModalOpen(false);
                    setTaskSaveError(null);
                  }}
                  className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={taskSaving}
                  className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {taskSaving ? "Saving..." : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {cashReceiptModalOpen && cashReceiptTarget ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm py-6 sm:py-8">
          <div className="w-full max-w-md max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.65)]">
            <h2 className="text-sm font-semibold text-slate-900">
              Upload cash receipt
            </h2>
            <p className="mt-1 text-[11px] text-slate-600">
              Attach a receipt image or PDF for this cash payment to mark the
              invoice as paid.
            </p>
            <form onSubmit={handleCashReceiptSubmit} className="mt-3 space-y-3">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-slate-700">
                  Consultation
                </p>
                <p className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-800">
                  {cashReceiptTarget.title}
                </p>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Receipt file
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setCashReceiptFile(file);
                    setCashReceiptError(null);
                  }}
                  className="block w-full text-[11px] text-slate-700 file:mr-2 file:rounded-full file:border-0 file:bg-sky-50 file:px-3 file:py-1 file:text-[11px] file:font-medium file:text-sky-700 hover:file:bg-sky-100"
                />
                <p className="text-[10px] text-slate-500">
                  Accepted formats: images (JPG, PNG, etc.) or PDF.
                </p>
              </div>
              {cashReceiptError ? (
                <p className="text-[11px] text-red-600">{cashReceiptError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (cashReceiptUploading) return;
                    setCashReceiptModalOpen(false);
                    setCashReceiptTarget(null);
                    setCashReceiptFile(null);
                    setCashReceiptError(null);
                  }}
                  className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cashReceiptUploading}
                  className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cashReceiptUploading ? "Uploading..." : "Upload & mark paid"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* PDF Viewer Modal */}
      {pdfViewerOpen && pdfViewerUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative h-full w-full max-w-5xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Invoice PDF</h3>
              <div className="flex items-center gap-2">
                <a
                  href={pdfViewerUrl}
                  download
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download
                </a>
                <button
                  onClick={() => {
                    setPdfViewerOpen(false);
                    setPdfViewerUrl(null);
                  }}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="h-[calc(100%-60px)] w-full">
              <iframe
                src={pdfViewerUrl}
                className="h-full w-full"
                title="Invoice PDF"
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Payment Status Management Modal */}
      {paymentStatusModalOpen && paymentStatusTarget && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Update Invoice Status</h3>
              <p className="mt-1 text-xs text-slate-600">
                Invoice #{paymentStatusTarget.consultation_id}
              </p>
            </div>
            <div className="space-y-4 px-6 py-4">
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Payment Method:</span>
                    <span className="font-medium text-slate-900">{paymentStatusTarget.payment_method}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Invoice Amount:</span>
                    <span className="font-medium text-slate-900">
                      {paymentStatusTarget.invoice_total_amount?.toFixed(2)} CHF
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Current Status:</span>
                    <span className={`font-medium ${INVOICE_STATUS_DISPLAY[paymentStatusTarget.invoice_status || (paymentStatusTarget.invoice_is_paid ? "PAID" : "OPEN")]?.color || "text-slate-900"}`}>
                      {INVOICE_STATUS_DISPLAY[paymentStatusTarget.invoice_status || (paymentStatusTarget.invoice_is_paid ? "PAID" : "OPEN")]?.label || "Open"}
                    </span>
                  </div>
                  {paymentStatusTarget.invoice_paid_amount != null && paymentStatusTarget.invoice_paid_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Paid Amount:</span>
                      <span className="font-medium text-emerald-700">
                        {paymentStatusTarget.invoice_paid_amount.toFixed(2)} CHF
                      </span>
                    </div>
                  )}
                  {paymentStatusTarget.invoice_paid_amount != null && paymentStatusTarget.invoice_paid_amount > 0 && paymentStatusTarget.invoice_total_amount != null && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Remaining Balance:</span>
                      <span className={`font-medium ${(paymentStatusTarget.invoice_total_amount - paymentStatusTarget.invoice_paid_amount) > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                        {Math.max(0, paymentStatusTarget.invoice_total_amount - paymentStatusTarget.invoice_paid_amount).toFixed(2)} CHF
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Date picker â€” shown for all statuses that record a payment date */}
              <div className="space-y-1">
                <label htmlFor="payment-date-input" className="block text-xs font-medium text-slate-700">
                  Payment Date
                </label>
                <input
                  id="payment-date-input"
                  type="date"
                  value={paymentDate}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
                <p className="text-[10px] text-slate-500">
                  Defaults to today. Change this if the payment was received on a different date (e.g. June payment for a May invoice).
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-700">Update Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["PAID", "OPEN", "PARTIAL_PAID", "OVERPAID", "PARTIAL_LOSS", "CANCELLED"] as InvoiceStatus[]).map((status) => {
                    const config = INVOICE_STATUS_DISPLAY[status];
                    const isCurrentStatus = (paymentStatusTarget.invoice_status || (paymentStatusTarget.invoice_is_paid ? "PAID" : "OPEN")) === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        disabled={markingPaid || isCurrentStatus}
                        onClick={() => {
                          if (status === "PARTIAL_PAID" || status === "PARTIAL_LOSS" || status === "OVERPAID") {
                            const amount = prompt(`Enter paid amount in CHF (Invoice: ${paymentStatusTarget.invoice_total_amount?.toFixed(2)} CHF):`);
                            if (amount !== null) {
                              const paidAmount = parseFloat(amount);
                              if (!isNaN(paidAmount) && paidAmount >= 0) {
                                handleMarkInvoicePaid(paymentStatusTarget.id, status, paidAmount, paymentDate);
                              } else {
                                alert("Please enter a valid amount.");
                              }
                            }
                          } else {
                            handleMarkInvoicePaid(paymentStatusTarget.id, status, status === "PAID" ? paymentStatusTarget.invoice_total_amount ?? undefined : undefined, paymentDate);
                          }
                        }}
                        className={`inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-[11px] font-medium transition-all ${isCurrentStatus
                          ? `${config.bgColor} ${config.color} ${config.borderColor} ring-2 ring-offset-1 ring-slate-300`
                          : `border-slate-200 bg-white text-slate-700 hover:${config.bgColor} hover:${config.color}`
                          } disabled:opacity-50`}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-[10px] text-blue-800">
                  <strong>Status Guide:</strong><br />
                  â€¢ <strong>Paid</strong> - Full payment received<br />
                  â€¢ <strong>Open</strong> - Awaiting payment<br />
                  â€¢ <strong>Partial Paid</strong> - Some payment received, balance pending<br />
                  â€¢ <strong>Overpaid</strong> - More than invoice amount received<br />
                  â€¢ <strong>Partial Loss</strong> - Partial payment accepted as full settlement<br />
                  â€¢ <strong>Cancelled</strong> - Invoice voided/cancelled
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                onClick={() => setPaymentStatusModalOpen(false)}
                disabled={markingPaid}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {/* Installments Modal */}
      {installmentsModalOpen && installmentsTarget && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
              <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.65)]">
                <div className="border-b border-slate-200 px-6 py-4">
                  <h3 className="text-sm font-semibold text-slate-900">Manage Installments</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Invoice #{installmentsTarget.consultation_id} â€” Total: CHF {(installmentsTarget.invoice_total_amount ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="space-y-4 px-6 py-6">
              {installmentsLoading ? (
                <p className="text-xs text-slate-500">Loading installments...</p>
              ) : (
                <>
                  {installments.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                      <p className="text-xs text-slate-600">No installments defined. Click "Add Installment" to create a payment plan.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {installments.map((inst, index) => {
                        const isPaid = inst.status === "PAID";
                        return (
                          <div
                            key={inst.id}
                            className={`rounded-lg border p-4 ${isPaid ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}
                          >
                            <div className="mb-3 flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-900">
                                Installment {index + 1}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleMarkInstallmentPaid(index)}
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isPaid
                                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                  }`}
                                >
                                  {isPaid ? "Paid" : "Pending"}
                                </button>
                                {!isPaid && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveInstallment(index)}
                                    className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-100"
                                  >
                                    Remove
                                  </button>
                                )}
                                {!inst.id.startsWith("new-") && (
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateInstallmentInvoice(inst)}
                                    disabled={installmentPdfGenerating === inst.id}
                                    className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                                  >
                                    {installmentPdfGenerating === inst.id ? (
                                      <>
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>Generating...</span>
                                      </>
                                    ) : (
                                      "Generate Invoice"
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-medium text-slate-600 mb-1">Amount (CHF)</label>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={inst.amount || ""}
                                  onChange={(e) => handleUpdateInstallment(index, { amount: parseFloat(e.target.value) || 0 })}
                                  disabled={isPaid}
                                  className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-600 mb-1">Due Date</label>
                                <input
                                  type="date"
                                  value={inst.due_date || ""}
                                  onChange={(e) => handleUpdateInstallment(index, { due_date: e.target.value || null })}
                                  disabled={isPaid}
                                  className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-600 mb-1">Payment Method</label>
                                <select
                                  value={inst.payment_method || ""}
                                  onChange={(e) => handleUpdateInstallment(index, { payment_method: e.target.value || null })}
                                  disabled={isPaid}
                                  className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
                                >
                                  <option value="">Select method</option>
                                  <option value="Cash">Cash</option>
                                  <option value="Card">Card</option>
                                  <option value="Bank Transfer">Bank Transfer</option>
                                  <option value="Online">Online</option>
                                  <option value="Insurance">Insurance</option>
                                  <option value="TWINT">TWINT</option>
                                </select>
                              </div>
                              <div className="col-span-2">
                                <label className="block text-[10px] font-medium text-slate-600 mb-1">Notes</label>
                                <input
                                  type="text"
                                  value={inst.notes || ""}
                                  onChange={(e) => handleUpdateInstallment(index, { notes: e.target.value || null })}
                                  placeholder="Optional notes"
                                  className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                />
                              </div>
                              {inst.payrexx_payment_link && (
                                <div className="col-span-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2">
                                  <svg className="h-3.5 w-3.5 flex-shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                  <span className="flex-1 truncate text-[10px] text-blue-700">{inst.payrexx_payment_link}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(inst.payrexx_payment_link!).then(() => alert("Payment link copied!")).catch(() => alert("Failed to copy"));
                                    }}
                                    className="flex-shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700"
                                  >
                                    Copy Link
                                  </button>
                                  {inst.payrexx_payment_status && (
                                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      inst.payrexx_payment_status === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                    }`}>
                                      {inst.payrexx_payment_status}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Summary */}
                  {installments.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">Allocated:</span>
                        <span className="font-semibold text-slate-900">
                          CHF {installments.reduce((s, i) => s + (i.amount || 0), 0).toFixed(2)}
                          {" / "}
                          CHF {(installmentsTarget.invoice_total_amount ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-slate-600">Remaining:</span>
                        <span className={`font-semibold ${
                          (installmentsTarget.invoice_total_amount ?? 0) - installments.reduce((s, i) => s + (i.amount || 0), 0) > 0.01
                            ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          CHF {Math.max(0, (installmentsTarget.invoice_total_amount ?? 0) - installments.reduce((s, i) => s + (i.amount || 0), 0)).toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-slate-600">Total Paid:</span>
                        <span className="font-semibold text-emerald-600">
                          CHF {installments.filter(i => i.status === "PAID").reduce((s, i) => s + (i.amount || 0), 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleAddInstallment}
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                  >
                    <span className="text-sm">+</span> Add Installment
                  </button>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                onClick={() => {
                  setInstallmentsModalOpen(false);
                  setInstallmentsTarget(null);
                  setInstallments([]);
                }}
                disabled={installmentsSaving}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveInstallments}
                disabled={installmentsSaving || installmentsLoading}
                className="inline-flex items-center rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {installmentsSaving ? "Saving..." : "Save Installments"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {/* Invoice Editing Modal (title-only, for non-OPEN invoices) */}
      {editInvoiceModalOpen && editInvoiceTarget && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Edit Invoice</h3>
              <p className="mt-1 text-xs text-slate-600">
                Invoice #{editInvoiceTarget.consultation_id}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{editInvoiceTarget.invoice_status}</span>
              </p>
            </div>
            <div className="space-y-4 px-6 py-6">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">Invoice Title</label>
                <input
                  type="text"
                  value={editInvoiceTitle}
                  onChange={(e) => setEditInvoiceTitle(e.target.value)}
                  className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Invoice title"
                />
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-slate-600">Amount:</span><span className="font-medium text-slate-900">{(editInvoiceTarget.invoice_total_amount ?? 0).toFixed(2)} CHF</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Payment Method:</span><span className="font-medium text-slate-900">{editInvoiceTarget.payment_method}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Date:</span><span className="font-medium text-slate-900">{new Date(editInvoiceTarget.scheduled_at).toLocaleDateString("en-US")}</span></div>
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] text-amber-700">
                  <strong>Note:</strong> Only the title can be edited for {editInvoiceTarget.invoice_status} invoices. To fully edit line items, the invoice must be in OPEN status.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                onClick={() => { setEditInvoiceModalOpen(false); setEditInvoiceTarget(null); }}
                disabled={editInvoiceSaving}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditInvoice}
                disabled={editInvoiceSaving}
                className="inline-flex items-center rounded-full bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {editInvoiceSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {/* Edit Consultation Modal */}
      {editConsultationModalOpen && editConsultationTarget ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm py-6 sm:py-8">
          <div className="w-full max-w-lg max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.65)]">
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Edit Consultation</h3>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {editConsultationTarget.record_type.toUpperCase()} â€¢ {editConsultationTarget.consultation_id}
              </p>
            </div>
            <div className="space-y-4 px-6 py-6">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">Title</label>
                <input
                  type="text"
                  value={editConsultationTitle}
                  onChange={(e) => { setEditConsultationTitle(e.target.value); triggerEditConsultationAutosave(); }}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Consultation title"
                />
              </div>

              {/* Doctor */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">Doctor</label>
                <select
                  value={editConsultationDoctorId}
                  onChange={(e) => { setEditConsultationDoctorId(e.target.value); triggerEditConsultationAutosave(); }}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="">Select doctor</option>
                  {userOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.email || user.id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-[1fr_0.5fr_0.5fr] gap-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    value={editConsultationDate}
                    onChange={(e) => { setEditConsultationDate(e.target.value); triggerEditConsultationAutosave(); }}
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">Hour</label>
                  <select
                    value={editConsultationHour}
                    onChange={(e) => { setEditConsultationHour(e.target.value); triggerEditConsultationAutosave(); }}
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">--</option>
                    {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0")).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">Min</label>
                  <select
                    value={editConsultationMinute}
                    onChange={(e) => { setEditConsultationMinute(e.target.value); triggerEditConsultationAutosave(); }}
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">--</option>
                    {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Diagnosis & ICD-10 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">Diagnosis Code</label>
                  <input
                    type="text"
                    value={editConsultationDiagnosisCode}
                    onChange={(e) => { setEditConsultationDiagnosisCode(e.target.value); triggerEditConsultationAutosave(); }}
                    placeholder="e.g. L91.0"
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">Ref ICD-10</label>
                  <input
                    type="text"
                    value={editConsultationRefIcd10}
                    onChange={(e) => { setEditConsultationRefIcd10(e.target.value); triggerEditConsultationAutosave(); }}
                    placeholder="e.g. Z42.1"
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">Content / Notes</label>
                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        document.execCommand("bold");
                        editConsultationContentRef.current?.focus();
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        document.execCommand("italic");
                        editConsultationContentRef.current?.focus();
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[11px] font-medium italic text-slate-700 hover:bg-slate-100"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        document.execCommand("insertUnorderedList");
                        editConsultationContentRef.current?.focus();
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[13px] text-slate-700 hover:bg-slate-100"
                    >
                      â€¢
                    </button>
                  </div>
                  <div
                    ref={editConsultationContentRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(event) => {
                      const editor = event.currentTarget as HTMLDivElement;
                      const text = getEditorPlainText(editor);
                      editConsultationLocalTextRef.current = text;
                      editConsultationPendingTextOpRef.current = buildTextOperation(
                        editConsultationLastBroadcastTextRef.current,
                        text,
                      );
                      setEditConsultationContent(textToNotesHtml(text));
                      triggerEditConsultationAutosave();
                    }}
                    className="min-h-[120px] max-h-64 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-xs text-slate-900 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                  />
                  {/* Autosave Status Indicator - below content editor */}
                  <div className="flex items-center justify-end px-3 py-1.5 border-t border-slate-100 text-[10px]">
                    {editConsultationAutosaveStatus === "pending" && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Unsaved changes...
                      </span>
                    )}
                    {editConsultationAutosaveStatus === "saving" && (
                      <span className="text-sky-600 flex items-center gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving...
                      </span>
                    )}
                    {editConsultationAutosaveStatus === "saved" && (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Saved
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  // Clear autosave timer on cancel
                  if (editConsultationAutosaveTimerRef.current) {
                    clearTimeout(editConsultationAutosaveTimerRef.current);
                    editConsultationAutosaveTimerRef.current = null;
                  }
                  setEditConsultationAutosaveStatus("idle");
                  setEditConsultationModalOpen(false);
                  setEditConsultationTarget(null);
                }}
                disabled={editConsultationSaving}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEditConsultation()}
                disabled={editConsultationSaving}
                className="inline-flex items-center rounded-full bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {editConsultationSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ACF Validation Confirmation Dialog */}
      {acfValidationDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-900">
              ACF Validation Changes
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              The Sumex1 validator adjusted your services to comply with Swiss ACF billing rules.
            </p>

            <div className="mt-3 space-y-1.5">
              {acfValidationDialog.added > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800">
                  <span className="font-bold text-emerald-600">+{acfValidationDialog.added}</span>
                  service(s) automatically added
                </div>
              )}
              {acfValidationDialog.modified > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                  <span className="font-bold text-amber-600">{acfValidationDialog.modified}</span>
                  service(s) modified (amounts adjusted)
                </div>
              )}
              {acfValidationDialog.deleted > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-1.5 text-[11px] text-red-800">
                  <span className="font-bold text-red-600">-{acfValidationDialog.deleted}</span>
                  service(s) removed (bundled or invalid)
                </div>
              )}
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                Final validated services ({acfValidationDialog.validatedCount})
              </p>
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {acfValidationDialog.validatedServices.map((svc: any, i: number) => (
                  <div key={svc.code + "-" + i} className="flex items-center justify-between rounded bg-white px-2 py-1 text-[10px]">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-700">{svc.code}</span>
                      <span className="ml-1 text-slate-500">{(svc.name || "").substring(0, 50)}</span>
                    </div>
                    <span className="shrink-0 font-mono font-semibold text-slate-900">
                      {formatChf(svc.amount ?? svc.tp)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 text-[10px] font-semibold">
                <span className="text-slate-600">Total</span>
                <span className="font-mono text-slate-900">
                  {formatChf(acfValidationDialog.totalAmount)}
                </span>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  acfValidationResolveRef.current?.(false);
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  acfValidationResolveRef.current?.(true);
                }}
                className="rounded-lg bg-violet-600 px-4 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-violet-700"
              >
                Accept & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* XML Preview Overlay */}
      {(xmlPreviewContent || xmlPreviewError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => { setXmlPreviewContent(null); setXmlPreviewError(null); }}>
          <div className="relative mx-4 w-full max-w-4xl max-h-[80vh] rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-800">
                {xmlPreviewError ? "XML Generation Error" : "Sumex1 XML Preview (v5.00)"}
              </h3>
              <button type="button" onClick={() => { setXmlPreviewContent(null); setXmlPreviewError(null); }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-auto p-4" style={{ maxHeight: "calc(80vh - 56px)" }}>
              {xmlPreviewError ? (
                <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{xmlPreviewError}</div>
              ) : (
                <pre className="rounded-lg bg-slate-900 p-4 text-[11px] leading-relaxed text-emerald-300 font-mono whitespace-pre-wrap break-all">{xmlPreviewContent}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Medication Creation Success Modal */}
      {medCreationSuccessModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {medCreationSuccessModal.isMedication ? "Medication" : "Prescription"} Created
                </h3>
                <p className="text-xs text-slate-500">
                  What would you like to do next?
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => void handleMedSuccessGeneratePdf()}
                disabled={medPdfGenerating || medEmailSending}
                className="flex w-full items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-left transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100">
                  {medPdfGenerating ? (
                    <svg className="h-4 w-4 animate-spin text-cyan-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-cyan-800">
                    {medPdfGenerating ? "Generating..." : "Download PDF"}
                  </p>
                  <p className="text-[10px] text-cyan-600">
                    Generate eMediplan PDF document
                  </p>
                </div>
              </button>

              <button
                onClick={() => void handleMedSuccessSendEmail()}
                disabled={medPdfGenerating || medEmailSending || !patientEmail}
                className="flex w-full items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                title={patientEmail ? `Send to ${patientEmail}` : "Patient has no email address"}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                  {medEmailSending ? (
                    <svg className="h-4 w-4 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-emerald-800">
                    {medEmailSending ? "Sending..." : "Send to Email"}
                  </p>
                  <p className="text-[10px] text-emerald-600">
                    {patientEmail ? `Send to ${patientEmail}` : "No email address available"}
                  </p>
                </div>
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setMedCreationSuccessModal({ open: false, prescriptionSheetId: null, isMedication: true })}
                disabled={medPdfGenerating || medEmailSending}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consultation Note Logs Modal */}
      {noteEventsModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Consultation Note Logs</h3>
                <p className="text-[11px] text-slate-500">
                  {noteEventsModal.row.title || noteEventsModal.row.consultation_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNoteEventsModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {noteEventsModal.loading ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Loading logs...
                </div>
              ) : noteEventsModal.error ? (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {noteEventsModal.error}
                </div>
              ) : noteEventsModal.events.length === 0 ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  No logs recorded for this note yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {noteEventsModal.events.map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-slate-900">{event.event_type}</div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(event.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                        <span>Actor: {event.actor_name || event.actor_email || event.actor_user_id || "Unknown"}</span>
                        {event.request_id ? <span>Request: {event.request_id}</span> : null}
                        {event.collab_room_id ? <span>Room: {event.collab_room_id}</span> : null}
                      </div>
                      {event.metadata && Object.keys(event.metadata).length > 0 ? (
                        <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-[10px] leading-relaxed text-slate-600">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Insurance Billing Modal */}
      <InsuranceBillingModal
        isOpen={insuranceBillingModalOpen}
        onClose={() => {
          setInsuranceBillingModalOpen(false);
          setInsuranceBillingTarget(null);
          setInsuranceBillingReminderOverride(null);
        }}
        consultationId={insuranceBillingTarget?.invoice_id || insuranceBillingTarget?.id || ""}
        patientId={patientId}
        patientName={insuranceBillingTarget?.title || "Patient"}
        invoiceAmount={insuranceBillingTarget?.invoice_total_amount || null}
        durationMinutes={insuranceBillingTarget?.duration_seconds ? Math.ceil(insuranceBillingTarget.duration_seconds / 60) : 15}
        initialReminderLevel={insuranceBillingReminderOverride ?? undefined}
        onSuccess={async () => {
          if (insuranceBillingReminderOverride && insuranceBillingTarget?.invoice_id) {
            const now = new Date().toISOString();
            const lvl = insuranceBillingReminderOverride as 1 | 2 | 3;
            const upd: Record<string, unknown> = { reminder_level: lvl };
            if (lvl === 1) upd.reminder_1_sent_at = now;
            else if (lvl === 2) upd.reminder_2_sent_at = now;
            else upd.reminder_3_sent_at = now;
            await supabaseClient.from("invoices").update(upd).eq("id", insuranceBillingTarget.invoice_id);
          }
          setInsuranceBillingModalOpen(false);
          setInsuranceBillingTarget(null);
          setInsuranceBillingReminderOverride(null);
        }}
      />

      {/* PDF Queued Success Toast */}
      {pdfSuccessToast && typeof document !== "undefined" && createPortal(
        <div className="fixed bottom-4 right-4 z-[9999] flex items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-xl animate-[fade-in-up_0.3s_ease-out]">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-900">
              {pdfSuccessToast.invoiceNumber ? `Invoice ${pdfSuccessToast.invoiceNumber}` : "PDF"} queued
            </p>
            <p className="text-[11px] text-emerald-700">
              {pdfSuccessToast.message}
            </p>
          </div>
          <button
            onClick={() => setPdfSuccessToast(null)}
            className="ml-2 rounded-full p-1 text-emerald-400 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>,
        document.body
      )}

      {/* PDF Generation Error Modal */}
      {pdfError && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => setPdfError(null)}>
          <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-red-100 bg-red-50 px-5 py-4 rounded-t-xl">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-red-900">PDF Generation Failed</h3>
                <p className="mt-0.5 text-xs text-red-700">{pdfError.message}</p>
              </div>
              <button onClick={() => setPdfError(null)} className="ml-2 rounded-full p-1 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              {pdfError.details && (
                <div>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Error Details</p>
                  <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 font-mono break-words">{pdfError.details}</p>
                </div>
              )}
              {pdfError.abortInfo && (
                <div>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Sumex Abort Info</p>
                  <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 font-mono break-words">{pdfError.abortInfo}</p>
                </div>
              )}
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                <p className="text-[11px] font-medium text-amber-800 mb-1">What to do</p>
                <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                  <li>Check that the invoice has valid service codes and amounts</li>
                  <li>Verify the patient has an insurance record (for TP invoices)</li>
                  <li>Contact your system administrator if the problem persists</li>
                </ul>
              </div>
            </div>
            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                onClick={() => setPdfError(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
