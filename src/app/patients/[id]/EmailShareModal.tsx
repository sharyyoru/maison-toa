"use client";

interface EmailShareModalProps {
  open: boolean;
  onClose: () => void;
  selectedFileCount: number;
  emailSubject: string;
  emailBody: string;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSend: (event: React.FormEvent) => void;
  sending: boolean;
  error: string | null;
  patientName: string;
}

export default function EmailShareModal({
  open,
  onClose,
  selectedFileCount,
  emailSubject,
  emailBody,
  onSubjectChange,
  onBodyChange,
  onSend,
  sending,
  error,
  patientName,
}: EmailShareModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Share Documents by Email
              </h3>
              <p className="text-sm text-emerald-100 mt-0.5">
                Sending {selectedFileCount} file{selectedFileCount > 1 ? 's' : ''} to {patientName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={onSend} className="px-6 py-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
              <svg className="h-5 w-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Subject */}
          <div className="mb-4">
            <label htmlFor="email-subject" className="block text-sm font-medium text-slate-700 mb-1.5">
              Subject
            </label>
            <input
              id="email-subject"
              type="text"
              value={emailSubject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="Your documents from Aesthetic Clinic"
              disabled={sending}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Message Body */}
          <div className="mb-4">
            <label htmlFor="email-body" className="block text-sm font-medium text-slate-700 mb-1.5">
              Message (Optional)
            </label>
            <textarea
              id="email-body"
              value={emailBody}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder={`Hi ${patientName},\n\nPlease find your documents attached below.\n\nBest regards,\nAesthetic Clinic`}
              rows={6}
              disabled={sending}
              className="w-full resize-none rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Document links will be automatically added to the email.
            </p>
          </div>

          {/* Info box */}
          <div className="mb-5 flex items-start gap-2 p-3 rounded-xl bg-sky-50 border border-sky-200">
            <svg className="h-5 w-5 text-sky-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-sky-700">
              <p className="font-medium">Email will be sent to patient's registered email address</p>
              <p className="text-xs text-sky-600 mt-0.5">
                {selectedFileCount} document{selectedFileCount > 1 ? 's' : ''} will be shared as download links
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Email
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
