"use client";

import { useState, useEffect } from "react";

interface Service {
  id: string;
  name: string;
  base_price: number | null;
  category_name: string | null;
}

interface Provider {
  id: string;
  name: string;
}

export default function PrepaymentInvoiceButton({ patientId, patientEmail, patientFirstName, patientLastName }: {
  patientId: string;
  patientEmail?: string | null;
  patientFirstName: string;
  patientLastName: string;
}) {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [serviceQuery, setServiceQuery] = useState("");
  const [serviceDropOpen, setServiceDropOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invoiceId: string; stripeUrl: string; invoiceNumber: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/services?category_id=20fdd180-860c-43fc-a5d3-caf5372ef07c").then(r => r.json()),
      fetch("/api/providers?role=billing_entity").then(r => r.json()),
    ]).then(([sData, pData]) => {
      setServices(sData.services || []);
      setProviders(pData.providers || []);
    });
  }, [open]);

  const selectedService = services.find(s => s.id === serviceId);
  const deposit = selectedService?.base_price ? selectedService.base_price * 0.5 : null;

  const filteredServices = serviceQuery.trim()
    ? services.filter(s =>
        s.name.toLowerCase().includes(serviceQuery.toLowerCase()) ||
        (s.category_name ?? "").toLowerCase().includes(serviceQuery.toLowerCase())
      )
    : services;

  async function handleCreate() {
    if (!serviceId) { setError("Please select a service."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/stripe/create-prepayment-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, serviceId, providerId: providerId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!result || !patientEmail) return;
    setSendingEmail(true);
    try {
      await fetch("/api/payments/stripe/send-prepayment-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientEmail,
          patientFirstName,
          patientLastName,
          stripeUrl: result.stripeUrl,
          invoiceNumber: result.invoiceNumber,
          serviceName: selectedService?.name,
          depositAmount: deposit,
        }),
      });
      setEmailSent(true);
    } catch {
      // ignore
    } finally {
      setSendingEmail(false);
    }
  }

  function reset() {
    setOpen(false);
    setResult(null);
    setError(null);
    setServiceId("");
    setProviderId("");
    setServiceQuery("");
    setEmailSent(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Acompte 50%
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900">Créer facture acompte 50%</h2>
              <button onClick={reset} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!result ? (
              <div className="space-y-4">
                {/* Service picker */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Service (base du prix) *</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setServiceDropOpen(o => !o)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white hover:border-amber-300 outline-none text-left"
                    >
                      {selectedService ? (
                        <div>
                          <div className="font-medium text-slate-800 truncate">{selectedService.name}</div>
                          {selectedService.category_name && <div className="text-[10px] text-sky-600">{selectedService.category_name}</div>}
                        </div>
                      ) : <span className="text-slate-400">— sélectionner un service —</span>}
                      <svg className="w-4 h-4 text-slate-400 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {serviceDropOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b">
                          <input autoFocus type="text" value={serviceQuery} onChange={e => setServiceQuery(e.target.value)}
                            placeholder="Rechercher..." className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-amber-400" />
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {filteredServices.map(s => (
                            <button key={s.id} type="button"
                              onClick={() => { setServiceId(s.id); setServiceDropOpen(false); setServiceQuery(""); }}
                              className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 hover:bg-amber-50 ${s.id === serviceId ? "bg-amber-50" : ""}`}
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-800 truncate">{s.name}</div>
                                {s.category_name && <div className="text-[10px] text-sky-600">{s.category_name}</div>}
                              </div>
                              {s.base_price != null && (
                                <div className="shrink-0 text-right">
                                  <div className="text-xs font-semibold text-slate-700">CHF {s.base_price}</div>
                                  <div className="text-[10px] text-amber-600">50% = {(s.base_price * 0.5).toFixed(2)}</div>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {deposit != null && (
                    <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      <span>Prix total: <strong>CHF {selectedService!.base_price}</strong></span>
                      <span>·</span>
                      <span>Acompte 50%: <strong>CHF {deposit.toFixed(2)}</strong></span>
                    </div>
                  )}
                </div>

                {/* Provider */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Entité de facturation</label>
                  <select value={providerId} onChange={e => setProviderId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-amber-400">
                    <option value="">— optionnel —</option>
                    {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button onClick={reset} className="flex-1 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200">Annuler</button>
                  <button onClick={handleCreate} disabled={loading || !serviceId}
                    className="flex-1 py-2 rounded-xl text-sm bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50">
                    {loading ? "Création..." : "Créer & générer lien"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-emerald-800">Facture #{result.invoiceNumber} créée</div>
                    <div className="text-xs text-emerald-600">Acompte CHF {deposit?.toFixed(2)}</div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Lien de paiement Stripe</label>
                  <div className="flex gap-2">
                    <input readOnly value={result.stripeUrl}
                      className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-700 truncate" />
                    <button onClick={() => { navigator.clipboard.writeText(result.stripeUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="px-3 py-2 text-xs rounded-xl bg-slate-900 text-white hover:bg-slate-700 shrink-0">
                      {copied ? "✓ Copié" : "Copier"}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  {patientEmail && (
                    <button onClick={handleSendEmail} disabled={sendingEmail || emailSent}
                      className="flex-1 py-2 rounded-xl text-sm border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                      {emailSent ? "✓ Email envoyé" : sendingEmail ? "Envoi..." : `Envoyer par email`}
                    </button>
                  )}
                  <button onClick={reset} className="flex-1 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200">Fermer</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
