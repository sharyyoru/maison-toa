"use client";
import Link from "next/link";
import Image from "next/image";

export default function BookingPaymentSuccess() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center border border-slate-200">
        <Link href="/book-appointment" className="flex justify-center mb-6">
          <Image src="/logos/maisontoa-logo.png" alt="Maison Toa" width={200} height={60} className="h-12 w-auto" />
        </Link>
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Rendez-vous confirmé !</h1>
        <p className="text-slate-600 mb-2">
          Votre acompte a été reçu. Votre rendez-vous est confirmé.
        </p>
        <p className="text-sm text-slate-500 mb-6">
          Un email de confirmation vous sera envoyé sous peu.
        </p>
        <p className="text-xs text-slate-400 mb-6 italic">
          Le montant de la consultation est déductible de tout traitement réalisé dans les 3 mois suivants.
        </p>
        <Link
          href="/book-appointment"
          className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full font-medium hover:bg-slate-800 transition-colors text-sm"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
