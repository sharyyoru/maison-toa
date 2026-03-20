import { Suspense } from "react";

export const metadata = {
  title: "Clinic Onboarding | Aliice",
  description: "Complete your clinic onboarding for Aliice Medical CRM",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Loading...</p>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
