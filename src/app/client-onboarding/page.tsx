"use client";

import { useState, useEffect, useCallback } from "react";

interface OnboardingToken {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface OnboardingSubmission {
  id: string;
  token_id: string | null;
  status: "in_progress" | "completed" | "archived";
  current_step: number;
  practice_name: string | null;
  practice_location: string | null;
  practice_email: string | null;
  main_contact_name: string | null;
  expected_user_count: number | null;
  current_software: string | null;
  service_categories: string[];
  marketing_automations: string[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface TokenWithSubmission extends OnboardingToken {
  submission?: OnboardingSubmission;
}

const STEP_LABELS: Record<number, string> = {
  1: "Practice Identity",
  2: "User Management",
  3: "Data Migration",
  4: "Clinical Services",
  5: "Marketing",
  6: "Compliance",
};

export default function ClientOnboardingPage() {
  const [tokens, setTokens] = useState<TokenWithSubmission[]>([]);
  const [submissions, setSubmissions] = useState<OnboardingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<OnboardingSubmission | null>(null);
  const [activeTab, setActiveTab] = useState<"links" | "submissions">("links");
  const [filterStatus, setFilterStatus] = useState<"all" | "in_progress" | "completed">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/list");
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load data");
      }

      const tokenData = data.tokens || [];
      const submissionData = data.submissions || [];

      // Map submissions to tokens
      const submissionMap = new Map<string, OnboardingSubmission>();
      submissionData.forEach((sub: OnboardingSubmission) => {
        if (sub.token_id) {
          submissionMap.set(sub.token_id, sub);
        }
      });

      const tokensWithSubs = tokenData.map((token: OnboardingToken) => ({
        ...token,
        submission: submissionMap.get(token.id),
      }));

      setTokens(tokensWithSubs);
      setSubmissions(submissionData);
    } catch (err) {
      console.error("Error loading data:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function generateLink() {
    if (!newEmail.trim()) {
      setError("Please enter an email address");
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/onboarding/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate link");
      }

      setSuccess(`Link created successfully! Expires: ${new Date(data.expiresAt).toLocaleDateString()}`);
      setNewEmail("");
      await loadData();

      // Copy to clipboard
      await navigator.clipboard.writeText(data.magicLink);
      setCopiedLink(data.magicLink);
      setTimeout(() => setCopiedLink(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate link");
    } finally {
      setGenerating(false);
    }
  }

  function getMagicLink(token: string) {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/onboarding?token=${token}`;
  }

  async function copyToClipboard(link: string) {
    await navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  }

  function getStatusBadge(token: TokenWithSubmission) {
    if (!token.submission) {
      if (new Date(token.expires_at) < new Date()) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            Expired
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          Pending
        </span>
      );
    }

    if (token.submission.status === "completed") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          Completed
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
        Step {token.submission.current_step}/6
      </span>
    );
  }

  function getProgress(submission: OnboardingSubmission) {
    if (submission.status === "completed") return 100;
    return Math.round((submission.current_step / 6) * 100);
  }

  const filteredSubmissions = submissions.filter((sub) => {
    if (filterStatus === "all") return true;
    return sub.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Client Onboarding</h1>
          <p className="text-sm text-slate-500 mt-1">
            Generate magic links and track clinic onboarding progress
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">
            {submissions.filter((s) => s.status === "completed").length} completed
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-sm text-slate-500">
            {submissions.filter((s) => s.status === "in_progress").length} in progress
          </span>
        </div>
      </div>

      {/* Generate Link Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-1">Generate Magic Link</h2>
            <p className="text-slate-300 text-sm mb-4">
              Create a secure onboarding link for a new clinic. Links expire in 7 days.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="clinic@example.com"
                className="flex-1 px-4 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                onKeyPress={(e) => e.key === "Enter" && generateLink()}
              />
              <button
                onClick={generateLink}
                disabled={generating}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Generate Link
                  </>
                )}
              </button>
            </div>
            {error && (
              <p className="mt-3 text-sm text-red-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            )}
            {success && (
              <p className="mt-3 text-sm text-green-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {success} (Copied to clipboard!)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="border-b border-slate-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab("links")}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === "links"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Generated Links
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                  {tokens.length}
                </span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab("submissions")}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === "submissions"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Submissions
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-600 text-xs">
                  {submissions.filter((s) => s.status === "completed").length}
                </span>
              </span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-slate-500 text-sm">Loading...</p>
          </div>
        ) : activeTab === "links" ? (
          /* Links Tab */
          <div className="divide-y divide-slate-100">
            {tokens.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h3 className="text-slate-900 font-medium mb-1">No links generated yet</h3>
                <p className="text-slate-500 text-sm">Generate your first magic link above</p>
              </div>
            ) : (
              tokens.map((token) => (
                <div
                  key={token.id}
                  className="p-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900 truncate">{token.email}</span>
                        {getStatusBadge(token)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>Created {new Date(token.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>Expires {new Date(token.expires_at).toLocaleDateString()}</span>
                        {token.used_at && (
                          <>
                            <span>•</span>
                            <span className="text-green-600">First accessed {new Date(token.used_at).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                      {token.submission && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <span className="font-medium">{token.submission.practice_name || "Unnamed Practice"}</span>
                            {token.submission.practice_location && (
                              <>
                                <span>•</span>
                                <span>{token.submission.practice_location}</span>
                              </>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-xs">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                                style={{ width: `${getProgress(token.submission)}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500">{getProgress(token.submission)}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {token.submission && (
                        <button
                          onClick={() => setSelectedSubmission(token.submission!)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View details"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => copyToClipboard(getMagicLink(token.token))}
                        className={`p-2 rounded-lg transition-colors ${
                          copiedLink === getMagicLink(token.token)
                            ? "text-green-600 bg-green-50"
                            : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        }`}
                        title="Copy link"
                      >
                        {copiedLink === getMagicLink(token.token) ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Submissions Tab */
          <div>
            {/* Filter */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Filter:</span>
                {(["all", "in_progress", "completed"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      filterStatus === status
                        ? "bg-blue-100 text-blue-700"
                        : "bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {status === "all" ? "All" : status === "in_progress" ? "In Progress" : "Completed"}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredSubmissions.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-slate-900 font-medium mb-1">No submissions found</h3>
                  <p className="text-slate-500 text-sm">
                    {filterStatus !== "all" ? "Try changing the filter" : "Submissions will appear here"}
                  </p>
                </div>
              ) : (
                filteredSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    onClick={() => setSelectedSubmission(submission)}
                    className="p-4 hover:bg-slate-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900">
                            {submission.practice_name || "Unnamed Practice"}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              submission.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                submission.status === "completed" ? "bg-green-500" : "bg-blue-500 animate-pulse"
                              }`}
                            ></span>
                            {submission.status === "completed" ? "Completed" : `Step ${submission.current_step}/6`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          {submission.practice_email && <span>{submission.practice_email}</span>}
                          {submission.practice_location && (
                            <>
                              <span>•</span>
                              <span>{submission.practice_location}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>Started {new Date(submission.created_at).toLocaleDateString()}</span>
                          {submission.completed_at && (
                            <>
                              <span>•</span>
                              <span className="text-green-600">
                                Completed {new Date(submission.completed_at).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-xs">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                submission.status === "completed"
                                  ? "bg-gradient-to-r from-green-500 to-emerald-500"
                                  : "bg-gradient-to-r from-blue-500 to-purple-500"
                              }`}
                              style={{ width: `${getProgress(submission)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">{getProgress(submission)}%</span>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Submission Detail Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {selectedSubmission.practice_name || "Unnamed Practice"}
                </h2>
                <p className="text-sm text-slate-500">
                  {selectedSubmission.practice_email || "No email"}
                  {selectedSubmission.practice_location && ` • ${selectedSubmission.practice_location}`}
                </p>
              </div>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              {/* Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Progress</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedSubmission.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {selectedSubmission.status === "completed"
                      ? "Completed"
                      : `${STEP_LABELS[selectedSubmission.current_step]} (Step ${selectedSubmission.current_step}/6)`}
                  </span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5, 6].map((step) => (
                    <div
                      key={step}
                      className={`flex-1 h-2 rounded-full ${
                        step <= selectedSubmission.current_step ||
                        selectedSubmission.status === "completed"
                          ? selectedSubmission.status === "completed"
                            ? "bg-green-500"
                            : "bg-blue-500"
                          : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-slate-400">
                  {Object.values(STEP_LABELS).map((label, i) => (
                    <span key={i} className="w-12 text-center truncate">{label}</span>
                  ))}
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Practice Info */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    Practice Information
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Main Contact</dt>
                      <dd className="text-slate-900 font-medium">{selectedSubmission.main_contact_name || "-"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Expected Users</dt>
                      <dd className="text-slate-900 font-medium">{selectedSubmission.expected_user_count || "-"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Current Software</dt>
                      <dd className="text-slate-900 font-medium">{selectedSubmission.current_software || "-"}</dd>
                    </div>
                  </dl>
                </div>

                {/* Dates */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Timeline
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Started</dt>
                      <dd className="text-slate-900 font-medium">
                        {new Date(selectedSubmission.created_at).toLocaleString()}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Last Updated</dt>
                      <dd className="text-slate-900 font-medium">
                        {new Date(selectedSubmission.updated_at).toLocaleString()}
                      </dd>
                    </div>
                    {selectedSubmission.completed_at && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Completed</dt>
                        <dd className="text-green-600 font-medium">
                          {new Date(selectedSubmission.completed_at).toLocaleString()}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Services */}
                {selectedSubmission.service_categories && selectedSubmission.service_categories.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      Service Categories
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSubmission.service_categories.map((cat: string, i: number) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-white rounded-lg text-xs text-slate-700 shadow-sm"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Marketing */}
                {selectedSubmission.marketing_automations && selectedSubmission.marketing_automations.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                      Marketing Automations
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSubmission.marketing_automations.map((auto: string, i: number) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-purple-100 rounded-lg text-xs text-purple-700"
                        >
                          {auto.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
