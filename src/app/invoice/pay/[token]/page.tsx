"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type LineItem = {
  name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type InvoiceData = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  payment_method: string | null;
  doctor_name: string | null;
  status: string;
  pdf_path: string | null;
  payment_link_expires_at: string | null;
  payrexx_payment_link: string | null;
  title: string | null;
  notes: string | null;
  service_label: string | null;
  line_items: LineItem[];
};

type PatientData = {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
};

export default function InvoicePaymentPage() {
  const params = useParams();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [redirectingToStripe, setRedirectingToStripe] = useState(false);

  useEffect(() => {
    if (!token) { setError("Invalid payment link"); setLoading(false); return; }
    fetch(`/api/invoices/get-by-token?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); } else { setInvoice(data.invoice); setPatient(data.patient); }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load invoice"); setLoading(false); });
  }, [token]);

  async function handleStripePayment() {
    if (!token) return;
    setRedirectingToStripe(true);
    try {
      const res = await fetch("/api/payments/stripe/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { alert(data.error || "Failed to create payment session"); setRedirectingToStripe(false); }
    } catch { alert("Failed to connect to payment service"); setRedirectingToStripe(false); }
  }

  function downloadPDF() {
    if (!invoice?.pdf_path) return;
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/invoice-pdfs/${invoice.pdf_path}`;
    window.open(publicUrl, "_blank");
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center">
        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
        <p className="text-sm text-slate-600">Loading invoice...</p>
      </div>
    </div>
  );

  if (error || !invoice || !patient) return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xl">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Payment Link Error</h1>
        <p className="text-sm text-slate-600">{error || "Unable to load invoice"}</p>
      </div>
    </div>
  );

  if (invoice.status === "PAID" || invoice.status === "OVERPAID") return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-xl">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Already Paid</h1>
        <p className="mb-6 text-sm text-slate-600">This invoice has already been paid.</p>
        {invoice.pdf_path && (
          <button onClick={downloadPDF} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
            Download Invoice
          </button>
        )}
      </div>
    </div>
  );

  const formattedAmount = (invoice.total_amount || 0).toFixed(2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">MAISON TOA</h1>
            <p className="text-xs text-slate-600">Lausanne</p>
          </div>
          <a href="tel:0227322223" className="text-sm text-slate-600 hover:text-slate-900">Tél. 022 732 22 23</a>
        </div>
      </div>

      <div className="mx-auto max-w-2xl p-4 py-8">
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Invoice Details</h2>
          <div className="mb-6 space-y-3 border-b border-slate-100 pb-6 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Numéro de facture :</span><span className="font-medium">{invoice.invoice_number}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Patient :</span><span className="font-medium">{patient.first_name} {patient.last_name}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Date :</span><span className="font-medium">{new Date(invoice.invoice_date).toLocaleDateString("fr-CH")}</span></div>
            {invoice.doctor_name && <div className="flex justify-between"><span className="text-slate-600">Médecin :</span><span className="font-medium">{invoice.doctor_name}</span></div>}
          </div>

          {/* Service breakdown */}
          {(invoice.line_items?.length > 0 || invoice.service_label) && (
            <div className="mb-6 rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Service</p>
              {invoice.line_items?.length > 0 ? (
                <ul className="space-y-1.5">
                  {invoice.line_items.map((item, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-800 font-medium">{item.name || "Prestation"}</span>
                      <span className="text-slate-600 ml-4 whitespace-nowrap">CHF {Number(item.total_price).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm font-medium text-slate-800">{invoice.service_label}</p>
              )}
            </div>
          )}

          <div className="mb-6 flex items-center justify-between rounded-lg bg-slate-900 p-4 text-white">
            <span className="text-base font-semibold">Acompte à régler :</span>
            <span className="text-2xl font-bold">{formattedAmount} CHF</span>
          </div>

          {invoice.pdf_path && (
            <button onClick={downloadPDF} className="mb-6 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Download Invoice PDF
            </button>
          )}

          <button
            onClick={handleStripePayment}
            disabled={redirectingToStripe}
            className="w-full rounded-lg bg-gradient-to-r from-sky-600 to-sky-700 px-6 py-5 text-lg font-bold text-white shadow-lg hover:from-sky-700 hover:to-sky-800 transition-all disabled:opacity-60"
          >
            {redirectingToStripe ? "Redirecting..." : "Pay Online with Card"}
          </button>
        </div>
      </div>
    </div>
  );
}
