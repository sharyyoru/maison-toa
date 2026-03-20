"use client";

import type { ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type InvoicePaymentMethodFilterProps = {
  patientId: string;
  value: string | null;
};

const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "Cash", label: "Cash" },
  { value: "Online Payment", label: "Online Payment" },
  { value: "Bank transfer", label: "Bank transfer" },
  { value: "Insurance", label: "Insurance" },
];

export default function InvoicePaymentMethodFilter({
  patientId,
  value,
}: InvoicePaymentMethodFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
      <span className="text-slate-500">Payment:</span>
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
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
