"use client";

import { INVOICE_STATUS_CONFIG, type MediDataInvoiceStatus } from "@/lib/medidata";

type InvoiceStatusBadgeProps = {
  status: MediDataInvoiceStatus;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  language?: "en" | "fr";
};

export default function InvoiceStatusBadge({
  status,
  showIcon = true,
  size = "md",
  language = "fr",
}: InvoiceStatusBadgeProps) {
  const config = INVOICE_STATUS_CONFIG[status];
  
  if (!config) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
        Unknown
      </span>
    );
  }

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-0.5 text-xs",
    lg: "px-3 py-1 text-sm",
  };

  const label = language === "fr" ? config.labelFr : config.label;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.bgColor} ${config.color} ${sizeClasses[size]}`}
    >
      {showIcon && <span>{config.icon}</span>}
      {label}
    </span>
  );
}

type InvoiceStatusTimelineProps = {
  history: Array<{
    id: string;
    previous_status: string | null;
    new_status: string;
    response_code: string | null;
    response_message: string | null;
    created_at: string;
  }>;
};

export function InvoiceStatusTimeline({ history }: InvoiceStatusTimelineProps) {
  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-slate-500">No status history available</p>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((entry, idx) => {
        const config = INVOICE_STATUS_CONFIG[entry.new_status as MediDataInvoiceStatus];
        const date = new Date(entry.created_at);
        
        return (
          <div key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${config?.bgColor || "bg-slate-100"}`}
              >
                {config?.icon || "•"}
              </div>
              {idx < history.length - 1 && (
                <div className="h-full w-0.5 bg-slate-200" />
              )}
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center gap-2">
                <span className={`font-medium ${config?.color || "text-slate-600"}`}>
                  {config?.labelFr || entry.new_status}
                </span>
                <span className="text-xs text-slate-400">
                  {date.toLocaleDateString("fr-CH")} {date.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {entry.response_message && (
                <p className="mt-1 text-xs text-slate-500">{entry.response_message}</p>
              )}
              {entry.response_code && (
                <code className="mt-1 inline-block rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
                  Code: {entry.response_code}
                </code>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
