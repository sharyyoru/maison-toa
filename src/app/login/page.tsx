import Image from "next/image";
import { getTranslations } from "next-intl/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const t = await getTranslations("loginPage");
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-6 text-sm shadow-[0_22px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <Image
            src="/logos/maisontoa-logo.png"
            alt="Maison Toa logo"
            width={96}
            height={32}
            className="h-8 w-auto"
          />
          <Image
            src="/logos/maisontoa-logo.png"
            alt="Maison Toa logo"
            width={96}
            height={32}
            className="h-8 w-auto"
          />
        </div>
        <div className="mb-5 space-y-1 text-center">
          <h1 className="text-base font-semibold text-slate-900">
            {t("signInTitle")}
          </h1>
          <p className="text-xs text-slate-500">
            {t("signInSubtitle")}
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
