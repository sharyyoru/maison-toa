"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

interface AiCallButtonProps {
  patientId: string;
  patientName?: string;
}

const AGENTS = [
  { id: process.env.NEXT_PUBLIC_RETELL_AGENT_ID_EN || "", label: "English" },
  { id: process.env.NEXT_PUBLIC_RETELL_AGENT_ID_FR || "", label: "French" },
].filter((a) => a.id);

/** Get current date/time in Swiss timezone (Europe/Zurich) */
function getSwissNow(): Date {
  const now = new Date();
  const swiss = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Zurich" }));
  return swiss;
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(days: number): string {
  const swiss = getSwissNow();
  swiss.setDate(swiss.getDate() + days);
  return toDateString(swiss);
}

const DATE_PRESETS = [
  { label: "Today", getValue: () => toDateString(getSwissNow()) },
  { label: "Tomorrow", getValue: () => addDays(1) },
  { label: "In 3 days", getValue: () => addDays(3) },
  { label: "In 1 week", getValue: () => addDays(7) },
] as const;

const TIME_PRESETS = [
  { label: "Morning", value: "09:30" },
  { label: "Afternoon", value: "14:00" },
  { label: "Evening", value: "17:30" },
] as const;

export default function AiCallButton({ patientId, patientName }: AiCallButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [agentId, setAgentId] = useState<string>(AGENTS[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user } = useAuth();

  const hasConfiguredAgent = AGENTS.length > 0;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const swiss = getSwissNow();
      swiss.setMinutes(swiss.getMinutes() + 5);
      setDate(toDateString(swiss));
      setTime(`${String(swiss.getHours()).padStart(2, "0")}:${String(swiss.getMinutes()).padStart(2, "0")}`);
    }
  }, [isOpen]);

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!hasConfiguredAgent) {
      setError("No Retell agent configured. Ask an admin to set NEXT_PUBLIC_RETELL_AGENT_ID_EN or _FR.");
      return;
    }

    if (!date || !time) {
      setError("Please select a date and time for the call.");
      return;
    }

    const scheduledFor = new Date(`${date}T${time}`);
    if (Number.isNaN(scheduledFor.getTime())) {
      setError("Invalid date or time.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/retell/schedule-patient-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          prompt,
          scheduled_for: scheduledFor.toISOString(),
          service_name: serviceName,
          agent_id: agentId,
          scheduled_by_email: user?.email || null,
          scheduled_by_name: user?.user_metadata?.full_name || user?.email || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to schedule AI call");
      }

      setIsOpen(false);
      setPrompt("");
      setServiceName("");

      router.push(`/patients/${patientId}?m_tab=crm`);
    } catch (err: any) {
      setError(err?.message || "Failed to schedule AI call");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => hasConfiguredAgent && setIsOpen(!isOpen)}
        disabled={!hasConfiguredAgent}
        title={hasConfiguredAgent ? "Schedule AI call" : "No Retell agent configured"}
        className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-200/50 transition-all hover:from-violet-600 hover:to-fuchsia-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        </svg>
        AI Call
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[420px] origin-top-left rounded-xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-800">
          <form onSubmit={handleSchedule}>
            <div className="mb-3 px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Schedule AI Call
              </p>
              {patientName && (
                <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{patientName}</p>
              )}
            </div>

            <div className="space-y-3">
              {AGENTS.length > 1 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Agent Language
                  </label>
                  <div className="flex gap-2">
                    {AGENTS.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setAgentId(agent.id)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                          agentId === agent.id
                            ? "border-violet-400 bg-violet-50 text-violet-700 ring-2 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                        }`}
                      >
                        {agent.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Call Topic
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  e.g. Follow up after consultation and confirm next appointment.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Service / topic (optional)
                </label>
                <input
                  type="text"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-500">e.g. Breast augmentation consultation</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Date</label>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDate(preset.getValue())}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                        date === preset.getValue()
                          ? "border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Time (Swiss)</label>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setTime(preset.value)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                        time === preset.value
                          ? "border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  required
                />
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-60"
              >
                {loading ? "Scheduling…" : "Schedule Call"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
