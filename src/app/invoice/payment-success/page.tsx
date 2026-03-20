"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const [referenceId, setReferenceId] = useState<string | null>(null);

  useEffect(() => {
    const ref = searchParams?.get("referenceId");
    if (ref) {
      setReferenceId(ref);
    }
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-xl">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="mb-3 text-2xl font-bold text-slate-900">Payment Successful!</h1>
        <p className="mb-6 text-sm text-slate-600">
          Thank you for your payment. Your transaction has been completed successfully.
        </p>

        {referenceId && (
          <div className="mb-6 rounded-lg bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Reference Number</p>
            <p className="font-mono text-sm font-semibold text-slate-900">{referenceId}</p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            A confirmation email will be sent to your registered email address.
          </p>
          
          <div className="pt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Return to Home
            </Link>
          </div>
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

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500"></div>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
