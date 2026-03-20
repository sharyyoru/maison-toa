"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface UserEntry {
  name: string;
  role: string;
  email: string;
}

interface ServiceEntry {
  name: string;
  category: string;
  price: string;
  duration: string;
}

const STEPS = [
  { num: 1, title: "Practice Identity", desc: "Basic information" },
  { num: 2, title: "The Team", desc: "Users & permissions" },
  { num: 3, title: "The Shift", desc: "Data migration" },
  { num: 4, title: "The Catalog", desc: "Services" },
  { num: 5, title: "The Engine", desc: "Marketing" },
  { num: 6, title: "Compliance", desc: "Review & submit" },
];

const ACCESS_LEVELS = [
  { id: "administrator", label: "Administrator", desc: "Full system access" },
  { id: "practitioner", label: "Practitioner", desc: "Patient care & scheduling" },
  { id: "viewer", label: "Viewer-Only", desc: "Read-only access" },
  { id: "financial", label: "Financial/Billing", desc: "Billing & payments" },
  { id: "frontdesk", label: "Front Desk", desc: "Scheduling & check-in" },
];

const SOFTWARE_OPTIONS = [
  "Legacy EMR/EHR System",
  "Practice Management Software",
  "Excel/Spreadsheets",
  "Google Sheets",
  "Physical Paper Records",
  "Other CRM",
  "No Current System",
  "Other",
];

const STORAGE_OPTIONS = [
  { value: "<50GB", label: "Less than 50GB" },
  { value: "50-100GB", label: "50GB - 100GB" },
  { value: "100-500GB", label: "100GB - 500GB" },
  { value: "500GB-1TB", label: "500GB - 1TB" },
  { value: "1TB+", label: "More than 1TB" },
];

const SERVICE_CATEGORIES = [
  "General Practice",
  "Surgery",
  "Pediatrics",
  "Diagnostics",
  "Dermatology",
  "Aesthetic Medicine",
  "Dental",
  "Ophthalmology",
  "Orthopedics",
  "Cardiology",
  "Physical Therapy",
  "Mental Health",
  "Other",
];

const LEAD_SOURCES = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "google", label: "Google Search/SEO" },
  { id: "doctor_referral", label: "Doctor Referrals" },
  { id: "patient_referral", label: "Patient Referrals" },
  { id: "insurance", label: "Insurance Providers" },
  { id: "walkins", label: "Walk-ins" },
  { id: "website", label: "Website" },
  { id: "email", label: "Email Marketing" },
  { id: "events", label: "Events/Conferences" },
  { id: "other", label: "Other" },
];

const MARKETING_AUTOMATIONS = [
  { id: "appointment_reminders", label: "Appointment Reminders (SMS/Email)" },
  { id: "post_consultation", label: "Post-Consultation Follow-ups" },
  { id: "birthday_campaigns", label: "Birthday/Seasonal Campaigns" },
  { id: "reengagement", label: "Re-engagement of Dormant Patients" },
  { id: "review_requests", label: "Review/Feedback Requests (Google/Yelp)" },
  { id: "newsletter", label: "Newsletter/Updates" },
  { id: "treatment_reminders", label: "Treatment/Medication Reminders" },
  { id: "intake_forms", label: "Digital Intake Forms" },
];

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [completed, setCompleted] = useState(false);

  // Step 1: Practice Identity
  const [practiceName, setPracticeName] = useState("");
  const [practiceLocation, setPracticeLocation] = useState("");
  const [practiceAddress, setPracticeAddress] = useState("");
  const [practicePhone, setPracticePhone] = useState("");
  const [practiceEmail, setPracticeEmail] = useState("");
  const [practiceWebsite, setPracticeWebsite] = useState("");
  const [mainContactName, setMainContactName] = useState("");
  const [mainContactEmail, setMainContactEmail] = useState("");
  const [mainContactPhone, setMainContactPhone] = useState("");
  const [mainContactRole, setMainContactRole] = useState("");

  // Step 2: User Management
  const [expectedUserCount, setExpectedUserCount] = useState<number | "">("");
  const [userDirectory, setUserDirectory] = useState<UserEntry[]>([]);
  const [accessLevels, setAccessLevels] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [newDepartment, setNewDepartment] = useState("");

  // Step 3: Data Migration
  const [currentSoftware, setCurrentSoftware] = useState("");
  const [currentSoftwareOther, setCurrentSoftwareOther] = useState("");
  const [dataAccessAuthorized, setDataAccessAuthorized] = useState<boolean | null>(null);
  const [migrationContactName, setMigrationContactName] = useState("");
  const [migrationContactEmail, setMigrationContactEmail] = useState("");
  const [storageEstimate, setStorageEstimate] = useState("");
  const [patientFileCount, setPatientFileCount] = useState<number | "">("");

  // Step 4: Clinical Services
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);
  const [servicesList, setServicesList] = useState<ServiceEntry[]>([]);
  const [servicesFileUrl, setServicesFileUrl] = useState("");

  // Step 5: Marketing
  const [leadSources, setLeadSources] = useState<string[]>([]);
  const [marketingAutomations, setMarketingAutomations] = useState<string[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Step 6: Compliance
  const [gdprConsent, setGdprConsent] = useState(false);
  const [hipaaAcknowledgment, setHipaaAcknowledgment] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError("No access token provided. Please use the link sent to your email.");
      setLoading(false);
      return;
    }

    validateToken();
  }, [token]);

  async function validateToken() {
    try {
      const res = await fetch("/api/onboarding/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid or expired link");
        setLoading(false);
        return;
      }

      setSubmissionId(data.submissionId);
      setPracticeEmail(data.email);
      setCurrentStep(data.currentStep || 1);

      if (data.status === "completed") {
        setCompleted(true);
      }

      // Load existing data if resuming
      if (data.isExisting) {
        await loadSubmissionData(data.submissionId);
      }

      setLoading(false);
    } catch (err) {
      setError("Failed to validate access. Please try again.");
      setLoading(false);
    }
  }

  async function loadSubmissionData(id: string) {
    try {
      const res = await fetch(`/api/onboarding/save?id=${id}`);
      const data = await res.json();

      if (data.ok && data.submission) {
        const s = data.submission;
        // Load all saved data
        setPracticeName(s.practice_name || "");
        setPracticeLocation(s.practice_location || "");
        setPracticeAddress(s.practice_address || "");
        setPracticePhone(s.practice_phone || "");
        setPracticeEmail(s.practice_email || "");
        setPracticeWebsite(s.practice_website || "");
        setMainContactName(s.main_contact_name || "");
        setMainContactEmail(s.main_contact_email || "");
        setMainContactPhone(s.main_contact_phone || "");
        setMainContactRole(s.main_contact_role || "");
        setExpectedUserCount(s.expected_user_count || "");
        setUserDirectory(s.user_directory || []);
        setAccessLevels(s.access_levels || []);
        setDepartments(s.departments || []);
        setCurrentSoftware(s.current_software || "");
        setCurrentSoftwareOther(s.current_software_other || "");
        setDataAccessAuthorized(s.data_access_authorized);
        setMigrationContactName(s.migration_contact_name || "");
        setMigrationContactEmail(s.migration_contact_email || "");
        setStorageEstimate(s.storage_estimate || "");
        setPatientFileCount(s.patient_file_count || "");
        setServiceCategories(s.service_categories || []);
        setServicesList(s.services_list || []);
        setServicesFileUrl(s.services_file_url || "");
        setLeadSources(s.lead_sources || []);
        setMarketingAutomations(s.marketing_automations || []);
        setAdditionalNotes(s.additional_notes || "");
        setGdprConsent(s.gdpr_consent || false);
        setHipaaAcknowledgment(s.hipaa_acknowledgment || false);
        setTermsAccepted(s.terms_accepted || false);
      }
    } catch (err) {
      console.error("Failed to load submission data:", err);
    }
  }

  async function saveStep(step: Step, nextStep?: Step) {
    if (!submissionId) return;

    setSaving(true);
    setError(null);

    let stepData: Record<string, any> = {};

    switch (step) {
      case 1:
        stepData = {
          practiceName,
          practiceLocation,
          practiceAddress,
          practicePhone,
          practiceEmail,
          practiceWebsite,
          mainContactName,
          mainContactEmail,
          mainContactPhone,
          mainContactRole,
        };
        break;
      case 2:
        stepData = {
          expectedUserCount: expectedUserCount || null,
          userDirectory,
          accessLevels,
          departments,
        };
        break;
      case 3:
        stepData = {
          currentSoftware,
          currentSoftwareOther,
          dataAccessAuthorized,
          migrationContactName,
          migrationContactEmail,
          storageEstimate,
          patientFileCount: patientFileCount || null,
        };
        break;
      case 4:
        stepData = {
          serviceCategories,
          servicesList,
          servicesFileUrl,
        };
        break;
      case 5:
        stepData = {
          leadSources,
          marketingAutomations,
          additionalNotes,
        };
        break;
      case 6:
        stepData = {
          gdprConsent,
          hipaaAcknowledgment,
          termsAccepted,
        };
        break;
    }

    try {
      const res = await fetch("/api/onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          step: nextStep || step,
          data: stepData,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      if (step === 6) {
        setCompleted(true);
      } else if (nextStep) {
        setCurrentStep(nextStep);
      }

      setSaving(false);
    } catch (err) {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  function addUserEntry() {
    setUserDirectory([...userDirectory, { name: "", role: "", email: "" }]);
  }

  function updateUserEntry(index: number, field: keyof UserEntry, value: string) {
    const updated = [...userDirectory];
    updated[index][field] = value;
    setUserDirectory(updated);
  }

  function removeUserEntry(index: number) {
    setUserDirectory(userDirectory.filter((_, i) => i !== index));
  }

  function addDepartment() {
    if (newDepartment.trim() && !departments.includes(newDepartment.trim())) {
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment("");
    }
  }

  function addServiceEntry() {
    setServicesList([...servicesList, { name: "", category: "", price: "", duration: "" }]);
  }

  function updateServiceEntry(index: number, field: keyof ServiceEntry, value: string) {
    const updated = [...servicesList];
    updated[index][field] = value;
    setServicesList(updated);
  }

  function removeServiceEntry(index: number) {
    setServicesList(servicesList.filter((_, i) => i !== index));
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <Image
          src="/logos/aliice-logo.png"
          alt="Aliice"
          width={120}
          height={32}
          className="h-8 w-auto brightness-0 invert mb-8"
        />
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-sm sm:text-base">Validating your access...</p>
        </div>
      </main>
    );
  }

  if (error && !submissionId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <Image
          src="/logos/aliice-logo.png"
          alt="Aliice"
          width={120}
          height={32}
          className="h-8 w-auto brightness-0 invert mb-8"
        />
        <div className="bg-white rounded-xl sm:rounded-2xl p-6 sm:p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 sm:w-8 sm:h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">Access Error</h1>
          <p className="text-slate-600 mb-6 text-sm sm:text-base">{error}</p>
          <a
            href="mailto:support@aliice.io"
            className="inline-block px-6 py-3 bg-slate-900 text-white rounded-full hover:bg-slate-800 transition-colors text-sm sm:text-base"
          >
            Contact Support
          </a>
        </div>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <Image
          src="/logos/aliice-logo.png"
          alt="Aliice"
          width={120}
          height={32}
          className="h-8 w-auto brightness-0 invert mb-8"
        />
        <div className="bg-white rounded-xl sm:rounded-2xl p-6 sm:p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 sm:w-8 sm:h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-2">Onboarding Complete!</h1>
          <p className="text-slate-600 mb-6 text-sm sm:text-base">
            Thank you for completing the onboarding form. Our team will review your information and reach out within 24-48 hours.
          </p>
          <p className="text-xs sm:text-sm text-slate-500">
            Questions? Contact us at{" "}
            <a href="mailto:support@aliice.io" className="text-blue-600 hover:underline">
              support@aliice.io
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Image
              src="/logos/aliice-logo.png"
              alt="Aliice"
              width={100}
              height={28}
              className="h-6 sm:h-7 w-auto brightness-0 invert"
            />
            <span className="text-slate-400 text-xs hidden sm:inline">|</span>
            <span className="text-slate-300 text-xs hidden sm:inline">Clinic Onboarding</span>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs sm:text-sm">Step {currentStep} of 6</p>
            <p className="text-white text-xs sm:text-sm font-medium">{STEPS[currentStep - 1].title}</p>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex items-center gap-1 sm:gap-2">
          {STEPS.map((step, i) => (
            <div key={step.num} className="flex-1 flex items-center">
              <button
                onClick={() => step.num < currentStep && setCurrentStep(step.num as Step)}
                disabled={step.num > currentStep}
                className={`w-full h-1.5 sm:h-2 rounded-full transition-colors ${
                  step.num <= currentStep
                    ? "bg-gradient-to-r from-blue-500 to-purple-600"
                    : "bg-slate-700"
                } ${step.num < currentStep ? "cursor-pointer hover:opacity-80" : ""}`}
              />
              {i < STEPS.length - 1 && <div className="w-1 sm:w-2" />}
            </div>
          ))}
        </div>
        <div className="hidden sm:flex justify-between mt-2 text-xs text-slate-500">
          {STEPS.map((step) => (
            <span key={step.num} className={currentStep === step.num ? "text-white" : ""}>
              {step.desc}
            </span>
          ))}
        </div>
      </div>

      {/* Form Content */}
      <div className="max-w-3xl mx-auto px-3 sm:px-4 pb-8 sm:pb-12">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Practice Identity */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-1">Practice Identity</h2>
                <p className="text-slate-500">Tell us about your clinic or practice</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Practice Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={practiceName}
                    onChange={(e) => setPracticeName(e.target.value)}
                    placeholder="e.g., Geneva Medical Center"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Location/City</label>
                  <input
                    type="text"
                    value={practiceLocation}
                    onChange={(e) => setPracticeLocation(e.target.value)}
                    placeholder="e.g., Geneva, Switzerland"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={practicePhone}
                    onChange={(e) => setPracticePhone(e.target.value)}
                    placeholder="+41 22 123 4567"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Address</label>
                  <input
                    type="text"
                    value={practiceAddress}
                    onChange={(e) => setPracticeAddress(e.target.value)}
                    placeholder="Street, City, Postal Code, Country"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Practice Email</label>
                  <input
                    type="email"
                    value={practiceEmail}
                    onChange={(e) => setPracticeEmail(e.target.value)}
                    placeholder="info@clinic.com"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
                  <input
                    type="url"
                    value={practiceWebsite}
                    onChange={(e) => setPracticeWebsite(e.target.value)}
                    placeholder="https://www.clinic.com"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <h3 className="text-lg font-medium text-slate-900 mb-4">Main Contact Person</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={mainContactName}
                      onChange={(e) => setMainContactName(e.target.value)}
                      placeholder="John Smith"
                      className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                    <input
                      type="text"
                      value={mainContactRole}
                      onChange={(e) => setMainContactRole(e.target.value)}
                      placeholder="e.g., Office Manager, IT Director"
                      className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={mainContactEmail}
                      onChange={(e) => setMainContactEmail(e.target.value)}
                      placeholder="john@clinic.com"
                      className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={mainContactPhone}
                      onChange={(e) => setMainContactPhone(e.target.value)}
                      placeholder="+41 79 123 4567"
                      className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: User Management */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-1">User Management & Permissions</h2>
                <p className="text-slate-500">Define your team structure and access levels</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Expected Number of Users
                </label>
                <input
                  type="number"
                  min="1"
                  value={expectedUserCount}
                  onChange={(e) => setExpectedUserCount(e.target.value ? parseInt(e.target.value) : "")}
                  placeholder="e.g., 10"
                  className="w-full max-w-xs px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">User Directory</label>
                  <button
                    type="button"
                    onClick={addUserEntry}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Add User
                  </button>
                </div>
                {userDirectory.length === 0 ? (
                  <p className="text-slate-500 text-sm italic">No users added yet. Click "Add User" to start.</p>
                ) : (
                  <div className="space-y-3">
                    {userDirectory.map((user, index) => (
                      <div key={index} className="flex gap-3 items-start p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1 grid gap-3 md:grid-cols-3">
                          <input
                            type="text"
                            value={user.name}
                            onChange={(e) => updateUserEntry(index, "name", e.target.value)}
                            placeholder="Full Name"
                            className="px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                          />
                          <input
                            type="text"
                            value={user.role}
                            onChange={(e) => updateUserEntry(index, "role", e.target.value)}
                            placeholder="Role (e.g., Doctor)"
                            className="px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                          />
                          <input
                            type="email"
                            value={user.email}
                            onChange={(e) => updateUserEntry(index, "email", e.target.value)}
                            placeholder="Email"
                            className="px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeUserEntry(index)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Access Levels Required</label>
                <div className="grid gap-2 md:grid-cols-2">
                  {ACCESS_LEVELS.map((level) => (
                    <label
                      key={level.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        accessLevels.includes(level.id)
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={accessLevels.includes(level.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAccessLevels([...accessLevels, level.id]);
                          } else {
                            setAccessLevels(accessLevels.filter((l) => l !== level.id));
                          }
                        }}
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{level.label}</p>
                        <p className="text-xs text-slate-500">{level.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Departments/Locations (Multi-location practices)
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addDepartment())}
                    placeholder="e.g., Geneva Clinic, Lausanne Branch"
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                  <button
                    type="button"
                    onClick={addDepartment}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {departments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {departments.map((dept, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                      >
                        {dept}
                        <button
                          type="button"
                          onClick={() => setDepartments(departments.filter((_, idx) => idx !== i))}
                          className="hover:text-blue-900"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Data Migration */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-1">Data Migration & Storage</h2>
                <p className="text-slate-500">Help us understand your current data ecosystem</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Current Software/System</label>
                <select
                  value={currentSoftware}
                  onChange={(e) => setCurrentSoftware(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                >
                  <option value="">Select your current system...</option>
                  {SOFTWARE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {currentSoftware === "Other" && (
                  <input
                    type="text"
                    value={currentSoftwareOther}
                    onChange={(e) => setCurrentSoftwareOther(e.target.value)}
                    placeholder="Please specify..."
                    className="w-full mt-2 px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Do you authorize Aliice to access your current database for migration?
                </label>
                <div className="flex gap-4">
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                    dataAccessAuthorized === true ? "border-green-500 bg-green-50" : "border-slate-200"
                  }`}>
                    <input
                      type="radio"
                      name="dataAccess"
                      checked={dataAccessAuthorized === true}
                      onChange={() => setDataAccessAuthorized(true)}
                      className="w-4 h-4 text-green-600"
                    />
                    <span className="text-sm font-medium">Yes, I authorize</span>
                  </label>
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                    dataAccessAuthorized === false ? "border-red-500 bg-red-50" : "border-slate-200"
                  }`}>
                    <input
                      type="radio"
                      name="dataAccess"
                      checked={dataAccessAuthorized === false}
                      onChange={() => setDataAccessAuthorized(false)}
                      className="w-4 h-4 text-red-600"
                    />
                    <span className="text-sm font-medium">No, not at this time</span>
                  </label>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <h3 className="text-lg font-medium text-slate-900 mb-4">Migration Point of Contact</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name (IT/Office Manager)</label>
                    <input
                      type="text"
                      value={migrationContactName}
                      onChange={(e) => setMigrationContactName(e.target.value)}
                      placeholder="Contact name"
                      className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={migrationContactEmail}
                      onChange={(e) => setMigrationContactEmail(e.target.value)}
                      placeholder="it@clinic.com"
                      className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Storage Needed</label>
                  <select
                    value={storageEstimate}
                    onChange={(e) => setStorageEstimate(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  >
                    <option value="">Select estimate...</option>
                    {STORAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Number of Patient Files</label>
                  <input
                    type="number"
                    min="0"
                    value={patientFileCount}
                    onChange={(e) => setPatientFileCount(e.target.value ? parseInt(e.target.value) : "")}
                    placeholder="e.g., 5000"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Clinical Services */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-1">Clinical Services & Cataloging</h2>
                <p className="text-slate-500">Configure your service offerings for scheduling and billing</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Service Categories</label>
                <div className="grid gap-2 md:grid-cols-3">
                  {SERVICE_CATEGORIES.map((cat) => (
                    <label
                      key={cat}
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                        serviceCategories.includes(cat)
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={serviceCategories.includes(cat)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setServiceCategories([...serviceCategories, cat]);
                          } else {
                            setServiceCategories(serviceCategories.filter((c) => c !== cat));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300"
                      />
                      <span className="text-sm">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">Service List (Optional)</label>
                  <button
                    type="button"
                    onClick={addServiceEntry}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Add Service
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  You can also upload a file later with your complete service list.
                </p>
                {servicesList.length > 0 && (
                  <div className="space-y-3">
                    {servicesList.map((service, index) => (
                      <div key={index} className="flex gap-3 items-start p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1 grid gap-3 md:grid-cols-4">
                          <input
                            type="text"
                            value={service.name}
                            onChange={(e) => updateServiceEntry(index, "name", e.target.value)}
                            placeholder="Service Name"
                            className="px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                          />
                          <select
                            value={service.category}
                            onChange={(e) => updateServiceEntry(index, "category", e.target.value)}
                            className="px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                          >
                            <option value="">Category</option>
                            {serviceCategories.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={service.price}
                            onChange={(e) => updateServiceEntry(index, "price", e.target.value)}
                            placeholder="Price (e.g., 150 CHF)"
                            className="px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                          />
                          <input
                            type="text"
                            value={service.duration}
                            onChange={(e) => updateServiceEntry(index, "duration", e.target.value)}
                            placeholder="Duration (e.g., 30 min)"
                            className="px-3 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeServiceEntry(index)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5: Marketing & Growth */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-1">Marketing & Growth</h2>
                <p className="text-slate-500">Configure your CRM automation engine</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Lead Sources</label>
                <p className="text-xs text-slate-500 mb-3">Where do your patients typically come from?</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {LEAD_SOURCES.map((source) => (
                    <label
                      key={source.id}
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                        leadSources.includes(source.id)
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={leadSources.includes(source.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setLeadSources([...leadSources, source.id]);
                          } else {
                            setLeadSources(leadSources.filter((s) => s !== source.id));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300"
                      />
                      <span className="text-sm">{source.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Marketing Automations</label>
                <p className="text-xs text-slate-500 mb-3">Select the workflows you'd like to enable</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {MARKETING_AUTOMATIONS.map((auto) => (
                    <label
                      key={auto.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        marketingAutomations.includes(auto.id)
                          ? "border-purple-500 bg-purple-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={marketingAutomations.includes(auto.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMarketingAutomations([...marketingAutomations, auto.id]);
                          } else {
                            setMarketingAutomations(marketingAutomations.filter((a) => a !== auto.id));
                          }
                        }}
                        className="w-4 h-4 text-purple-600 rounded border-slate-300"
                      />
                      <span className="text-sm">{auto.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Additional Notes</label>
                <textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Any specific requirements or questions about marketing automation..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 6: Compliance & Submit */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-1">Compliance & Submission</h2>
                <p className="text-slate-500">Review and confirm your onboarding information</p>
              </div>

              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-medium text-slate-900 mb-3">Summary</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Practice:</dt>
                    <dd className="text-slate-900 font-medium">{practiceName || "Not provided"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Location:</dt>
                    <dd className="text-slate-900">{practiceLocation || "Not provided"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Expected Users:</dt>
                    <dd className="text-slate-900">{expectedUserCount || "Not provided"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Current System:</dt>
                    <dd className="text-slate-900">{currentSoftware || "Not provided"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Service Categories:</dt>
                    <dd className="text-slate-900">{serviceCategories.length || 0} selected</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Marketing Automations:</dt>
                    <dd className="text-slate-900">{marketingAutomations.length || 0} selected</dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-4">
                <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={gdprConsent}
                    onChange={(e) => setGdprConsent(e.target.checked)}
                    className="mt-0.5 w-5 h-5 text-blue-600 rounded border-slate-300"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">GDPR Consent</p>
                    <p className="text-xs text-slate-500 mt-1">
                      I consent to the processing of the information provided in accordance with GDPR regulations. 
                      This data will be used solely for the purpose of onboarding and service setup.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={hipaaAcknowledgment}
                    onChange={(e) => setHipaaAcknowledgment(e.target.checked)}
                    className="mt-0.5 w-5 h-5 text-blue-600 rounded border-slate-300"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">HIPAA Acknowledgment</p>
                    <p className="text-xs text-slate-500 mt-1">
                      I acknowledge that any patient data shared during onboarding will be handled in compliance 
                      with HIPAA regulations where applicable.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-5 h-5 text-blue-600 rounded border-slate-300"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Terms & Conditions</p>
                    <p className="text-xs text-slate-500 mt-1">
                      I have read and agree to the Aliice{" "}
                      <a href="#" className="text-blue-600 hover:underline">Terms of Service</a> and{" "}
                      <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-200">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((currentStep - 1) as Step)}
                disabled={saving}
                className="px-4 sm:px-6 py-2 text-slate-600 hover:text-slate-900 font-medium disabled:opacity-50 text-sm sm:text-base"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {currentStep < 6 ? (
              <button
                type="button"
                onClick={() => saveStep(currentStep, (currentStep + 1) as Step)}
                disabled={saving}
                className="px-5 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 text-sm sm:text-base"
              >
                {saving ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Saving...
                  </>
                ) : (
                  <>
                    Continue
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => saveStep(6)}
                disabled={saving || !gdprConsent || !hipaaAcknowledgment || !termsAccepted}
                className="px-5 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 text-sm sm:text-base"
              >
                {saving ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Submitting...
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">Submit Onboarding</span>
                    <span className="sm:hidden">Submit</span>
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
