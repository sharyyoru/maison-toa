"use client";

import type { ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

type InvoicePaymentMethodFilterProps = {
  patientId: string;
  value: string | null;
};

type PaymentOptionKey = "all" | "cash" | "onlinePayment" | "bankTransfer" | "insurance";

const PAYMENT_METHOD_OPTIONS: { value: string; key: PaymentOptionKey }[] = [
  { value: "", key: "all" },
  { value: "Cash", key: "cash" },
  { value: "Online Payment", key: "onlinePayment" },
  { value: "Bank transfer", key: "bankTransfer" },
  { value: "Insurance", key: "insurance" },
];

export default function InvoicePaymentMethodFilter({
  patientId,
  value,
}: InvoicePaymentMethodFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("patient.payment");

  const selectedValue = value ?? "";

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value;

    const params = new URLSearchParams(searchParams?.toString());

    if (!nextValue) {
      params.delete("payment_method");
    } else {
      params.set("payment_method", nextValue);
    }

    const query = params.toString();
    const href = query ? `/patients/${patientId}?${query}` : `/patients/${patientId}`;

    router.replace(href);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span className="text-slate-500">{t("label")}</span>
      <select
        value={selectedValue}
        onChange={handleChange}
        className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {PAYMENT_METHOD_OPTIONS.map((option) => (
          <option
            key={option.value || "all"}
            value={option.value}
          >
            {t(option.key)}
          </option>
        ))}
      </select>
    </div>
  );
}
