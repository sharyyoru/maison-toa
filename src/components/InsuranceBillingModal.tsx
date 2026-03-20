"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  INVOICE_STATUS_CONFIG,
  type SwissLawType,
  type BillingType,
  type MediDataInvoiceStatus,
} from "@/lib/medidata";
import MedidataInsurerSearch, { type MedidataParticipant } from "@/components/MedidataInsurerSearch";

type LineItem = {
  id: string;
  code: string | null;
  tardoc_code: string | null;
  tariff_code: number | null;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tp_al: number;
  tp_tl: number;
  external_factor_mt: number;
  side_type: number;
  session_number: number;
  ref_code: string | null;
  date_begin: string | null;
  provider_gln: string | null;
  catalog_name: string | null;
};

type PatientInsurance = {
  id: string;
  provider_name: string | null;
  card_number: string | null;
  insurance_type: string | null;
  insurer_id: string | null;
  insurer_gln: string | null;
  gln: string | null;
  avs_number: string | null;
  policy_number: string | null;
  law_type: string | null;
  billing_type: string | null;
  case_number: string | null;
  accident_date: string | null;
  is_primary: boolean;
  valid_from: string | null;
  valid_till: string | null;
};

type InsuranceBillingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  consultationId: string; // This is the invoice ID
  patientId: string;
  patientName: string;
  invoiceAmount: number | null;
  durationMinutes?: number;
  onSuccess?: (submission: any) => void;
};

export default function InsuranceBillingModal({
  isOpen,
  onClose,
  consultationId,
  patientId,
  patientName,
  invoiceAmount,
  durationMinutes = 15,
  onSuccess,
}: InsuranceBillingModalProps) {
  const [billingType, setBillingType] = useState<BillingType>("TG");
  const [lawType, setLawType] = useState<SwissLawType>("KVG");
  const [reminderLevel, setReminderLevel] = useState<number>(0);
  const [diagnosisCodes, setDiagnosisCodes] = useState<string[]>([]);
  const [diagnosisInput, setDiagnosisInput] = useState("");
  const [treatmentReason, setTreatmentReason] = useState("disease");
  const [selectedInsurerGln, setSelectedInsurerGln] = useState("");
  const [selectedInsurerName, setSelectedInsurerName] = useState("");
  const [avsNumber, setAvsNumber] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [accidentDate, setAccidentDate] = useState("");
  const [invoiceLanguage, setInvoiceLanguage] = useState<1 | 2 | 3>(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingXml, setIsCheckingXml] = useState(false);
  const [skipValidation, setSkipValidation] = useState(false);
  const [xmlPreview, setXmlPreview] = useState<string | null>(null);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);

  // Real invoice line items loaded from DB
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);
  const prefilledRef = useRef(false);

  // Patient insurances (multiple)
  const [patientInsurances, setPatientInsurances] = useState<PatientInsurance[]>([]);
  const [selectedInsuranceIdx, setSelectedInsuranceIdx] = useState(0);
  const [insuranceGlnWarning, setInsuranceGlnWarning] = useState<string | null>(null);
  const [updatingInsurance, setUpdatingInsurance] = useState(false);

  // Apply insurance fields from a selected patient insurance record
  const applyInsuranceFields = (ins: PatientInsurance) => {
    const gln = ins.insurer_gln || ins.gln || "";
    if (gln) setSelectedInsurerGln(gln);
    if (ins.provider_name) setSelectedInsurerName(ins.provider_name);
    if (ins.avs_number) setAvsNumber(ins.avs_number);
    if (ins.policy_number) setPolicyNumber(ins.policy_number);
    if (ins.case_number) setCaseNumber(ins.case_number);
    if (ins.law_type) setLawType(ins.law_type as SwissLawType);
    if (ins.billing_type) setBillingType(ins.billing_type as BillingType);
    if (ins.accident_date) setAccidentDate(ins.accident_date);
  };

  const LAW_TYPE_NUM_TO_STR: Record<number, SwissLawType> = { 1: "KVG", 2: "UVG", 3: "IVG", 4: "MVG", 5: "VVG" };

  // Apply law type and billing type from a MediData participant
  const applyParticipantDefaults = (participant: MedidataParticipant) => {
    // Auto-set law type: if participant supports exactly one, use it; otherwise default to KVG if available
    if (participant.lawTypes?.length === 1) {
      const lt = LAW_TYPE_NUM_TO_STR[participant.lawTypes[0]];
      if (lt) setLawType(lt);
    } else if (participant.lawTypes?.length > 1) {
      // Default to KVG if available, otherwise pick first
      if (participant.lawTypes.includes(1)) {
        setLawType("KVG");
      } else {
        const lt = LAW_TYPE_NUM_TO_STR[participant.lawTypes[0]];
        if (lt) setLawType(lt);
      }
    }
    // Auto-set billing type from tgAllowed
    if (typeof participant.tgAllowed === "boolean") {
      setBillingType(participant.tgAllowed ? "TG" : "TP");
    }
  };

  // Validate a GLN against medidata participants list and apply defaults
  const validateGlnAgainstMedidata = async (gln: string, applyDefaults = true) => {
    try {
      const res = await fetch(`/api/medidata/proxy-participants?glnparticipant=${encodeURIComponent(gln)}&limit=1`);
      const json = await res.json();
      if (json.success && Array.isArray(json.participants) && json.participants.length > 0) {
        setInsuranceGlnWarning(null);
        if (applyDefaults) {
          applyParticipantDefaults(json.participants[0] as MedidataParticipant);
        }
      } else {
        setInsuranceGlnWarning(
          `Insurance GLN "${gln}" was not found in the MediData participants list. The patient's insurance record may need updating.`
        );
      }
    } catch {
      setInsuranceGlnWarning(null); // Don't block on network errors
    }
  };

  // Handle switching between patient insurances
  const handleInsuranceSwitch = (idx: number) => {
    setSelectedInsuranceIdx(idx);
    const ins = patientInsurances[idx];
    if (ins) {
      applyInsuranceFields(ins);
      const gln = ins.insurer_gln || ins.gln || "";
      if (gln) {
        validateGlnAgainstMedidata(gln);
      } else {
        setInsuranceGlnWarning(null);
      }
    }
  };

  // Update patient insurance record when user picks a new insurer from medidata
  const handleInsurerChange = async (gln: string, name: string, participant?: MedidataParticipant) => {
    setSelectedInsurerGln(gln);
    setSelectedInsurerName(name);
    setInsuranceGlnWarning(null);

    // Auto-set law type and billing type from participant data
    if (participant) {
      applyParticipantDefaults(participant);
    }

    // Update the patient insurance record in DB if we have a selected patient insurance
    const currentIns = patientInsurances[selectedInsuranceIdx];
    if (currentIns && gln && name) {
      setUpdatingInsurance(true);
      try {
        const updatePayload: Record<string, any> = {
          insurer_gln: gln,
          provider_name: name,
        };
        // Try to find matching swiss_insurers record to keep insurer_id in sync
        const { data: swissInsurer } = await supabaseClient
          .from("swiss_insurers")
          .select("id")
          .eq("gln", gln)
          .maybeSingle();
        if (swissInsurer) {
          updatePayload.insurer_id = swissInsurer.id;
        }

        await supabaseClient
          .from("patient_insurances")
          .update(updatePayload)
          .eq("id", currentIns.id);

        // Update local state
        setPatientInsurances((prev) =>
          prev.map((ins, i) =>
            i === selectedInsuranceIdx
              ? { ...ins, insurer_gln: gln, provider_name: name, insurer_id: swissInsurer?.id || ins.insurer_id }
              : ins,
          ),
        );
      } catch (err) {
        console.error("Failed to update patient insurance:", err);
      } finally {
        setUpdatingInsurance(false);
      }
    }
  };

  // Load invoice line items and patient insurance data when modal opens
  useEffect(() => {
    if (!isOpen || !consultationId) return;
    let cancelled = false;

    async function loadData() {
      setLineItemsLoading(true);

      // Load line items from invoice_line_items
      const { data: items } = await supabaseClient
        .from("invoice_line_items")
        .select("id, code, tardoc_code, tariff_code, name, quantity, unit_price, total_price, tp_al, tp_tl, external_factor_mt, side_type, session_number, ref_code, date_begin, provider_gln, catalog_name")
        .eq("invoice_id", consultationId)
        .order("sort_order", { ascending: true });

      if (!cancelled && items) {
        setLineItems(items as LineItem[]);
      }

      // Load ALL patient insurances
      if (!prefilledRef.current) {
        const { data: insurances, error: insError } = await supabaseClient
          .from("patient_insurances")
          .select("id, insurer_id, insurer_gln, gln, provider_name, avs_number, policy_number, law_type, billing_type, case_number, card_number, insurance_type, accident_date, is_primary, valid_from, valid_till")
          .eq("patient_id", patientId)
          .order("is_primary", { ascending: false });

        if (insError) {
          console.error("[InsuranceBillingModal] Error loading patient insurances:", insError);
        }
        console.log("[InsuranceBillingModal] Patient insurances loaded:", { patientId, count: insurances?.length, insurances });

        if (!cancelled && insurances && insurances.length > 0) {
          setPatientInsurances(insurances as PatientInsurance[]);
          // Auto-select primary or first
          const primaryIdx = insurances.findIndex((i: any) => i.is_primary);
          const idx = primaryIdx >= 0 ? primaryIdx : 0;
          setSelectedInsuranceIdx(idx);
          applyInsuranceFields(insurances[idx] as PatientInsurance);
          prefilledRef.current = true;

          // Validate GLN against medidata participants
          const glnToCheck = insurances[idx].insurer_gln || insurances[idx].gln;
          if (glnToCheck) {
            validateGlnAgainstMedidata(glnToCheck);
          }
        } else {
          prefilledRef.current = true;
        }

        // Also load invoice-level data (treatment_reason, diagnosis_codes, billing_type, etc.)
        const { data: inv } = await supabaseClient
          .from("invoices")
          .select("billing_type, health_insurance_law, treatment_reason, diagnosis_codes, reminder_level, accident_date")
          .eq("id", consultationId)
          .maybeSingle();

        if (!cancelled && inv) {
          if (inv.billing_type) setBillingType(inv.billing_type as BillingType);
          if (inv.health_insurance_law) setLawType(inv.health_insurance_law as SwissLawType);
          if (inv.treatment_reason) setTreatmentReason(inv.treatment_reason);
          if (typeof inv.reminder_level === 'number') setReminderLevel(inv.reminder_level);
          if (inv.accident_date) setAccidentDate(inv.accident_date);
          if (inv.diagnosis_codes && Array.isArray(inv.diagnosis_codes)) {
            const codes = inv.diagnosis_codes.map((d: any) => d.code).filter(Boolean);
            if (codes.length > 0) setDiagnosisCodes(codes);
          }
        }
      }

      if (!cancelled) setLineItemsLoading(false);
    }

    void loadData();
    return () => { cancelled = true; };
  }, [isOpen, consultationId, patientId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      prefilledRef.current = false;
      setPatientInsurances([]);
      setSelectedInsuranceIdx(0);
      setInsuranceGlnWarning(null);
      setUpdatingInsurance(false);
    }
  }, [isOpen]);

  const lineItemsTotal = lineItems.reduce((sum, li) => sum + (li.total_price || 0), 0);
  const displayTotal = lineItems.length > 0 ? lineItemsTotal : (invoiceAmount || 0);

  const handleAddDiagnosis = () => {
    const code = diagnosisInput.trim().toUpperCase();
    if (code && !diagnosisCodes.includes(code)) {
      setDiagnosisCodes([...diagnosisCodes, code]);
      setDiagnosisInput("");
    }
  };

  const handleRemoveDiagnosis = (code: string) => {
    setDiagnosisCodes(diagnosisCodes.filter((c) => c !== code));
  };

  const handleCheckXml = async () => {
    setIsCheckingXml(true);
    setXmlError(null);
    setXmlPreview(null);

    try {
      const response = await fetch("/api/sumex/check-xml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultationId,
          patientId,
          billingType,
          lawType,
          reminderLevel,
          diagnosisCodes,
          treatmentReason: lawType === 'UVG' ? 'accident' : treatmentReason,
          insurerGln: selectedInsurerGln,
          insurerName: selectedInsurerName,
          policyNumber,
          avsNumber,
          accidentDate: lawType === 'UVG' ? accidentDate : undefined,
          skipValidation,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.abortInfo
            ? `${data.error}: ${data.abortInfo}`
            : data.details || data.error || "XML generation failed",
        );
      }

      setXmlPreview(data.xmlContent);
    } catch (err) {
      setXmlError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsCheckingXml(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedInsurerGln) {
      setError("Please select an insurance company");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/medidata/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: consultationId,
          consultationId,
          patientId,
          billingType,
          lawType,
          reminderLevel,
          diagnosisCodes,
          treatmentReason: lawType === 'UVG' ? 'accident' : treatmentReason,
          insurerGln: selectedInsurerGln,
          insurerName: selectedInsurerName,
          policyNumber,
          avsNumber,
          caseNumber,
          accidentDate: lawType === 'UVG' ? accidentDate : undefined,
          language: invoiceLanguage,
          skipValidation,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Parse specific error types for user-friendly messages
        const errMsg = data.error || "Unknown error";
        const details = data.details || data.abortInfo || "";
        if (errMsg.includes("Sumex") || errMsg.includes("XML")) {
          throw new Error(`XML generation failed: ${details || errMsg}. Please check invoice line items and try again.`);
        } else if (errMsg.includes("Patient not found")) {
          throw new Error("Patient not found. Please verify the patient record exists.");
        } else if (errMsg.includes("Invoice not found")) {
          throw new Error("Invoice not found. The invoice may have been deleted.");
        } else if (errMsg.includes("not configured") || errMsg.includes("PROXY")) {
          throw new Error("MediData is not configured. Please check Settings → MediData Connection.");
        } else {
          throw new Error(details ? `${errMsg}: ${details}` : errMsg);
        }
      }

      // Update the invoice record with insurance fields
      await supabaseClient
        .from("invoices")
        .update({
          billing_type: billingType,
          health_insurance_law: lawType,
          reminder_level: reminderLevel,
          treatment_reason: lawType === 'UVG' ? 'accident' : treatmentReason,
          insurance_gln: selectedInsurerGln,
          insurance_name: selectedInsurerName,
          patient_ssn: avsNumber || null,
          diagnosis_codes: diagnosisCodes.map((c) => ({ code: c, type: "ICD" })),
          medical_case_number: caseNumber || null,
          accident_date: lawType === 'UVG' && accidentDate ? accidentDate : null,
        })
        .eq("id", consultationId);

      setSuccess(data.submission);
      onSuccess?.(data.submission);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Send Invoice to Insurance
            </h2>
            <p className="text-sm text-slate-500">
              via MediData / Sumex XML
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            {/* Main status banner */}
            {success.transmitted ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-900">Invoice Sent to MediData</p>
                    <p className="mt-0.5 text-sm text-emerald-700">
                      Invoice <span className="font-mono font-medium">#{success.invoiceNumber}</span> has been transmitted successfully. The insurer will process it and respond via MediData.
                    </p>
                  </div>
                </div>
              </div>
            ) : success.transmissionError ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                    <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-900">Invoice Created — Transmission Failed</p>
                    <p className="mt-0.5 text-sm text-amber-700">
                      Invoice <span className="font-mono font-medium">#{success.invoiceNumber}</span> was generated but could not be sent to MediData.
                    </p>
                    <p className="mt-1 rounded-lg bg-amber-100 px-2 py-1 text-xs font-mono text-amber-800">
                      {success.transmissionError}
                    </p>
                    <p className="mt-1.5 text-xs text-amber-600">
                      You can retry from the MediData Dashboard.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-sky-50 border border-sky-200 p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100">
                    <svg className="h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-sky-900">Invoice Saved as Draft</p>
                    <p className="mt-0.5 text-sm text-sky-700">
                      Invoice <span className="font-mono font-medium">#{success.invoiceNumber}</span> has been created. MediData proxy is not configured — configure it in Settings to enable transmission.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Invoice details card */}
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Submission Details</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Number</span>
                  <span className="font-mono font-medium text-slate-900">{success.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Amount</span>
                  <span className="font-semibold text-slate-900">CHF {success.total?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_CONFIG[success.status as MediDataInvoiceStatus]?.bgColor || "bg-slate-100"} ${INVOICE_STATUS_CONFIG[success.status as MediDataInvoiceStatus]?.color || "text-slate-600"}`}>
                    {INVOICE_STATUS_CONFIG[success.status as MediDataInvoiceStatus]?.icon}
                    {INVOICE_STATUS_CONFIG[success.status as MediDataInvoiceStatus]?.labelFr || success.status}
                  </span>
                </div>
                {success.messageId && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Transmission Ref</span>
                    <span className="font-mono text-xs text-slate-600">{success.messageId}</span>
                  </div>
                )}
                {success.pdfGenerated && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">PDF Invoice</span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Generated
                    </span>
                  </div>
                )}
              </div>

              {success.services?.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h4 className="mb-2 text-xs font-medium text-slate-500">Service Lines ({success.services.length})</h4>
                  <div className="space-y-1">
                    {success.services.map((service: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-slate-600">
                          <code className="mr-2 rounded bg-slate-100 px-1 py-0.5 text-[10px]">{service.code}</code>
                          {service.description}
                        </span>
                        <span className="font-medium">CHF {service.total?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Patient Info */}
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-900">{patientName}</p>
                  <p className="text-sm text-slate-500">
                    Invoice total: CHF {displayTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Billing Configuration */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    Billing Type
                  </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBillingType("TG")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      billingType === "TG"
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-semibold">Tiers Garant</div>
                    <div className="text-[10px] opacity-75">Patient pays</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingType("TP")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      billingType === "TP"
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-semibold">Tiers Payant</div>
                    <div className="text-[10px] opacity-75">Insurer pays</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Law Type
                </label>
                <select
                  value={lawType}
                  onChange={(e) => setLawType(e.target.value as SwissLawType)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="KVG">KVG - Assurance maladie</option>
                  <option value="UVG">UVG - Assurance accident</option>
                  <option value="IVG">IVG - Assurance invalidité</option>
                  <option value="MVG">MVG - Assurance militaire</option>
                  <option value="VVG">VVG - Assurance privée</option>
                </select>
              </div>
            </div>

            {/* Reminder Level + Language */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Document Type
                </label>
                <select
                  value={reminderLevel}
                  onChange={(e) => setReminderLevel(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value={0}>Invoice (Normal)</option>
                  <option value={1}>1st Reminder</option>
                  <option value={2}>2nd Reminder</option>
                  <option value={3}>3rd Reminder</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  Reminder level for follow-up invoices.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Invoice Language
                </label>
                <select
                  value={invoiceLanguage}
                  onChange={(e) => setInvoiceLanguage(Number(e.target.value) as 1 | 2 | 3)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value={2}>Français</option>
                  <option value={1}>Deutsch</option>
                  <option value={3}>Italiano</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  Language of the printed invoice PDF.
                </p>
              </div>
            </div>
            </div>

            {/* Insurance Selection */}
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="mb-3 text-xs font-medium text-slate-700">Insurance Details</h3>
              <div className="space-y-3">
                {/* Multiple insurances selector */}
                {patientInsurances.length > 1 && (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">
                      Patient Insurance
                    </label>
                    <select
                      value={selectedInsuranceIdx}
                      onChange={(e) => handleInsuranceSwitch(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      {patientInsurances.map((ins, idx) => (
                        <option key={ins.id} value={idx}>
                          {ins.provider_name || "Unknown Insurer"}
                          {ins.is_primary ? " (Primary)" : ""}
                          {ins.law_type ? ` — ${ins.law_type}` : ""}
                          {ins.insurance_type ? ` [${ins.insurance_type}]` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* GLN not found in MediData warning */}
                {insuranceGlnWarning && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <div className="flex items-start gap-2">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <div>
                        <p className="text-[11px] font-semibold text-amber-800">Insurance Not Found in MediData</p>
                        <p className="mt-0.5 text-[10px] text-amber-700">{insuranceGlnWarning}</p>
                        <p className="mt-1 text-[10px] text-amber-600">Use the search below to select a valid insurer from the MediData participants list. This will also update the patient&apos;s insurance record.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">
                    Insurance Company {updatingInsurance && <span className="text-sky-500">(updating...)</span>}
                  </label>
                  <MedidataInsurerSearch
                    value={selectedInsurerGln}
                    displayName={selectedInsurerName}
                    onChange={handleInsurerChange}
                    placeholder="Search insurer from MediData (e.g., CSS, Helsana, Swica)..."
                    inputClassName="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">
                      AVS/AHV Number
                    </label>
                    <input
                      type="text"
                      value={avsNumber}
                      onChange={(e) => setAvsNumber(e.target.value)}
                      placeholder="756.XXXX.XXXX.XX"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">
                      Policy Number
                    </label>
                    <input
                      type="text"
                      value={policyNumber}
                      onChange={(e) => setPolicyNumber(e.target.value)}
                      placeholder="e.g., 123456789"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">
                    Case Number (for UVG/accident)
                  </label>
                  <input
                    type="text"
                    value={caseNumber}
                    onChange={(e) => setCaseNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                {/* UVG: Accident Date (required) */}
                {lawType === "UVG" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <span className="text-[11px] font-semibold text-amber-700">UVG — Accident Insurance</span>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-amber-700">
                        Accident Date <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="date"
                        value={accidentDate}
                        onChange={(e) => setAccidentDate(e.target.value)}
                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      <p className="mt-1 text-[10px] text-amber-600">Required for UVG invoices (Unfalldatum).</p>
                    </div>
                  </div>
                )}

                {/* IVG: AHV Number reminder */}
                {lawType === "IVG" && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                      </svg>
                      <span className="text-[11px] font-semibold text-blue-700">IVG — Disability Insurance</span>
                    </div>
                    <p className="text-[10px] text-blue-600">
                      AHV/AVS number (756.XXXX.XXXX.XX) is required for IVG invoices. Please ensure it is filled in above.
                    </p>
                    {!avsNumber && (
                      <p className="text-[10px] font-medium text-red-500">⚠ AVS/AHV Number is missing — required for IVG.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Invoice Line Items (from DB) */}
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="mb-3 text-xs font-medium text-slate-700">
                Invoice Service Lines
              </h3>
              {lineItemsLoading ? (
                <div className="py-4 text-center text-xs text-slate-400">Loading line items...</div>
              ) : lineItems.length > 0 ? (
                <div className="space-y-1.5">
                  {lineItems.map((li) => {
                    const isTardoc = !!li.tardoc_code;
                    return (
                      <div key={li.id} className="space-y-0.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <code className="shrink-0 rounded bg-white px-1.5 py-0.5 text-xs text-slate-600 shadow-sm">
                              {li.tardoc_code || li.code || "-"}
                            </code>
                            {isTardoc && (
                              <span className="shrink-0 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-medium text-emerald-700">
                                TARDOC
                              </span>
                            )}
                            <span className="truncate text-xs text-slate-600">{li.name}</span>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="text-xs text-slate-400">&times;{li.quantity}</span>
                            <span className="ml-2 text-xs font-medium text-slate-700">
                              CHF {(li.total_price || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {isTardoc && (
                          <div className="flex items-center gap-3 pl-2 text-[9px] text-slate-400">
                            <span>TP MT: <span className="font-mono font-medium text-slate-600">{(li.tp_al || 0).toFixed(2)}</span></span>
                            <span>TP TT: <span className="font-mono font-medium text-slate-600">{(li.tp_tl || 0).toFixed(2)}</span></span>
                            <span>Side: <span className="font-medium text-slate-600">{li.side_type === 1 ? "Left" : li.side_type === 2 ? "Right" : li.side_type === 3 ? "Both" : "None"}</span></span>
                            {li.external_factor_mt !== 1 && <span>Ext.F: <span className="font-medium text-slate-600">{li.external_factor_mt}</span></span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2">
                    <span className="text-sm font-medium text-slate-700">Total</span>
                    <span className="text-sm font-semibold text-slate-900">
                      CHF {lineItemsTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-3 text-center text-xs text-slate-400">
                  No line items found for this invoice.
                  {invoiceAmount ? ` Invoice amount: CHF ${invoiceAmount.toFixed(2)}` : ""}
                </div>
              )}
            </div>

            {/* Diagnosis Codes */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                ICD-10 Diagnosis Codes (optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={diagnosisInput}
                  onChange={(e) => setDiagnosisInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddDiagnosis()}
                  placeholder="e.g., L70.0"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={handleAddDiagnosis}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"
                >
                  Add
                </button>
              </div>
              {diagnosisCodes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {diagnosisCodes.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs"
                    >
                      {code}
                      <button
                        type="button"
                        onClick={() => handleRemoveDiagnosis(code)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Treatment Reason */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Treatment Reason
              </label>
              <select
                value={treatmentReason}
                onChange={(e) => setTreatmentReason(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="disease">Maladie / Disease</option>
                <option value="accident">Accident</option>
                <option value="maternity">Maternit&eacute; / Maternity</option>
                <option value="prevention">Pr&eacute;vention / Prevention</option>
              </select>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100">
                    <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-red-800">Failed to send invoice</p>
                    <p className="mt-0.5 text-xs text-red-600 break-words">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="shrink-0 ml-auto rounded p-1 text-red-400 hover:text-red-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* XML Preview */}
            {xmlPreview && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-800">XML Preview (Sumex1 v5.00)</span>
                  <button
                    type="button"
                    onClick={() => setXmlPreview(null)}
                    className="text-xs text-amber-600 hover:text-amber-800"
                  >
                    Close
                  </button>
                </div>
                <pre className="max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] leading-relaxed text-emerald-300 font-mono">
                  {xmlPreview}
                </pre>
              </div>
            )}

            {xmlError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                <span className="font-medium">XML Check Failed:</span> {xmlError}
              </div>
            )}

            {/* Skip Validation Override */}
            <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={skipValidation}
                onChange={(e) => setSkipValidation(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <span className="text-[11px] font-medium text-amber-800">Skip Sumex Validation</span>
                <p className="text-[9px] text-amber-600">Override Sumex validation errors when sending to insurance</p>
              </div>
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || isCheckingXml}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCheckXml}
                disabled={isSubmitting || isCheckingXml}
                className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {isCheckingXml ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Checking...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Check XML
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || isCheckingXml}
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Send to Insurance
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
