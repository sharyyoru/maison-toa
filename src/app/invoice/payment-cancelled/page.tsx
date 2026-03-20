"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function PaymentCancelledContent() {
  const searchParams = useSearchParams();
  const referenceId = searchParams?.get("referenceId");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-xl">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-10 w-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h1 className="mb-3 text-2xl font-bold text-slate-900">Payment Cancelled</h1>
        <p className="mb-6 text-sm text-slate-600">
          Your payment has been cancelled. No charges have been made to your account.
        </p>

        {referenceId && (
          <div className="mb-6 rounded-lg bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Reference Number</p>
            <p className="font-mono text-sm font-semibold text-slate-900">{referenceId}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => window.history.back()}
            className="w-full rounded-lg bg-amber-600 px-6 py-3 text-sm font-medium text-white hover:bg-amber-700"
          >
            Return to Payment
          </button>
          
          <Link
            href="/"
            className="block w-full rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Return to Home
          </Link>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6">
          <p className="text-xs text-slate-400">
            Aesthetics Clinic XT SA<br />
            Chemin Rieu 18, 1208 Genève<br />
            Tél. 022 732 22 23
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PaymentCancelledPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 to-slate-100">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500"></div>
        </div>
      }
    >
      <PaymentCancelledContent />
    </Suspense>
  );
}
