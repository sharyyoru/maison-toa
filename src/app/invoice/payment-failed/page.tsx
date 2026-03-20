"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function PaymentFailedContent() {
  const searchParams = useSearchParams();
  const referenceId = searchParams?.get("referenceId");
  const error = searchParams?.get("error");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xl">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        
        <h1 className="mb-3 text-2xl font-bold text-slate-900">Payment Failed</h1>
        <p className="mb-6 text-sm text-slate-600">
          Unfortunately, your payment could not be processed. Please try again or contact us for assistance.
        </p>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4">
            <p className="text-xs text-red-600">{decodeURIComponent(error)}</p>
          </div>
        )}

        {referenceId && (
          <div className="mb-6 rounded-lg bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Reference Number</p>
            <p className="font-mono text-sm font-semibold text-slate-900">{referenceId}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => window.history.back()}
            className="w-full rounded-lg bg-red-600 px-6 py-3 text-sm font-medium text-white hover:bg-red-700"
          >
            Try Again
          </button>
          
          <Link
            href="/"
            className="block w-full rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Return to Home
          </Link>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6">
          <p className="text-xs text-slate-500">
            Need help? Contact us at:
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            Tél. 022 732 22 23
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-slate-100">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-red-500"></div>
        </div>
      }
    >
      <PaymentFailedContent />
    </Suspense>
  );
}
