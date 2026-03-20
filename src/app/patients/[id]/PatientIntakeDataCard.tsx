"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type IntakeSubmission = {
  id: string;
  status: string;
  current_step: number;
  started_at: string;
  completed_at: string | null;
};

type IntakePreferences = {
  id?: string;
  submission_id?: string;
  preferred_language: string;
  consultation_type: string;
  preferred_contact_method: string;
  preferred_contact_time: string;
  additional_notes: string | null;
};

type TreatmentArea = {
  id: string;
  area_name: string;
  area_category: string;
  specific_concerns: string[];
  priority: number;
};

type Measurements = {
  id?: string;
  submission_id?: string;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
};

type IntakePhoto = {
  id: string;
  photo_type: string;
  storage_path: string;
  file_name: string;
  uploaded_at: string;
};

type TreatmentPreferences = {
  id?: string;
  submission_id?: string;
  preferred_date_range_start: string | null;
  preferred_date_range_end: string | null;
  flexibility: string;
  budget_range: string;
  financing_interest: boolean;
  special_requests: string | null;
};

type HealthBackground = {
  id?: string;
  submission_id?: string;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  known_illnesses: string | null;
  previous_surgeries: string | null;
  allergies: string | null;
  cigarettes: string | null;
  alcohol_consumption: string | null;
  sports_activity: string | null;
  medications: string | null;
  general_practitioner: string | null;
  gynecologist: string | null;
  children_count: number | null;
  birth_type_1: string | null;
  birth_type_2: string | null;
};

type PatientInsurance = {
  id?: string;
  patient_id?: string;
  provider_name: string | null;
  card_number: string | null;
  insurance_type: string | null;
};

type ConsultationData = {
  id: string;
  consultation_type: string;
  selected_areas: string[] | null;
  measurements: Record<string, string> | null;
  breast_data: Record<string, unknown> | null;
  face_data: Record<string, unknown> | null;
  upload_mode: string;
  created_at: string;
};

type EditingSection = "preferences" | "measurements" | "treatment_prefs" | "health_background" | "insurance" | null;

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  ru: "Russian",
};

const TREATMENT_AREAS_OPTIONS = [
  { id: "face", label: "Face", category: "face" },
  { id: "neck", label: "Neck", category: "face" },
  { id: "chest", label: "Chest", category: "body" },
  { id: "abdomen", label: "Abdomen", category: "body" },
  { id: "arms", label: "Arms", category: "body" },
  { id: "back", label: "Back", category: "body" },
  { id: "buttocks", label: "Buttocks", category: "body" },
  { id: "thighs", label: "Thighs", category: "body" },
  { id: "legs", label: "Legs", category: "body" },
];

const BMI_CATEGORIES = [
  { max: 18.5, label: "Underweight", color: "text-blue-600 bg-blue-50" },
  { max: 25, label: "Normal", color: "text-emerald-600 bg-emerald-50" },
  { max: 30, label: "Overweight", color: "text-amber-600 bg-amber-50" },
  { max: 100, label: "Obese", color: "text-red-600 bg-red-50" },
];

function getBMICategory(bmi: number) {
  return BMI_CATEGORIES.find((cat) => bmi < cat.max) || BMI_CATEGORIES[3];
}

function calculateBMI(height: number | null, weight: number | null): number | null {
  if (!height || !weight || height <= 0) return null;
  return parseFloat((weight / Math.pow(height / 100, 2)).toFixed(1));
}

export default function PatientIntakeDataCard({ patientId }: { patientId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submission, setSubmission] = useState<IntakeSubmission | null>(null);
  const [preferences, setPreferences] = useState<IntakePreferences | null>(null);
  const [treatmentAreas, setTreatmentAreas] = useState<TreatmentArea[]>([]);
  const [measurements, setMeasurements] = useState<Measurements | null>(null);
  const [photos, setPhotos] = useState<IntakePhoto[]>([]);
  const [treatmentPrefs, setTreatmentPrefs] = useState<TreatmentPreferences | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [healthBackground, setHealthBackground] = useState<HealthBackground | null>(null);
  const [insurance, setInsurance] = useState<PatientInsurance | null>(null);
  const [consultationData, setConsultationData] = useState<ConsultationData[]>([]);
  
  // Edit mode states
  const [editingSection, setEditingSection] = useState<EditingSection>(null);
  const [editPrefs, setEditPrefs] = useState<IntakePreferences | null>(null);
  const [editMeasurements, setEditMeasurements] = useState<Measurements | null>(null);
  const [editTreatmentPrefs, setEditTreatmentPrefs] = useState<TreatmentPreferences | null>(null);
  const [editInsurance, setEditInsurance] = useState<PatientInsurance | null>(null);

  const loadIntakeData = useCallback(async () => {
    setLoading(true);

    // Get latest intake submission
    const { data: submissions } = await supabaseClient
      .from("patient_intake_submissions")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!submissions || submissions.length === 0) {
      // Create a new submission if none exists
      const { data: newSub } = await supabaseClient
        .from("patient_intake_submissions")
        .insert({ patient_id: patientId, status: "in_progress", current_step: 1 })
        .select()
        .single();
      
      if (newSub) {
        setSubmission(newSub as IntakeSubmission);
      }
      setLoading(false);
      return;
    }

    const sub = submissions[0] as IntakeSubmission;
    setSubmission(sub);

    // Load all related data by PATIENT_ID first (most reliable), then fall back to submission_id
    // This ensures we always find data regardless of which submission it was linked to
    const [prefsRes, healthRes, insuranceRes, areasRes, measRes, photosRes, treatPrefsRes] = await Promise.all([
      // Preferences: query by patient_id directly
      supabaseClient
        .from("patient_intake_preferences")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Health background: query by patient_id directly
      supabaseClient
        .from("patient_health_background")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Insurance: query by patient_id directly
      supabaseClient
        .from("patient_insurances")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Treatment areas: try by submission_id first
      supabaseClient
        .from("patient_treatment_areas")
        .select("*")
        .eq("submission_id", sub.id)
        .order("priority", { ascending: true }),
      // Measurements: try by submission_id first
      supabaseClient
        .from("patient_measurements")
        .select("*")
        .eq("submission_id", sub.id)
        .maybeSingle(),
      // Photos: try by submission_id first
      supabaseClient
        .from("patient_intake_photos")
        .select("*")
        .eq("submission_id", sub.id)
        .order("uploaded_at", { ascending: true }),
      // Treatment preferences: try by submission_id first
      supabaseClient
        .from("patient_treatment_preferences")
        .select("*")
        .eq("submission_id", sub.id)
        .maybeSingle(),
    ]);

    // Set preferences (queried by patient_id)
    if (prefsRes.data) {
      setPreferences(prefsRes.data as IntakePreferences);
    }
    
    // Set health background (queried by patient_id)
    if (healthRes.data) {
      setHealthBackground(healthRes.data as HealthBackground);
    }

    // Set other data from submission-based queries
    if (areasRes.data) setTreatmentAreas(areasRes.data as TreatmentArea[]);
    if (measRes.data) setMeasurements(measRes.data as Measurements);
    if (photosRes.data) setPhotos(photosRes.data as IntakePhoto[]);
    if (treatPrefsRes.data) setTreatmentPrefs(treatPrefsRes.data as TreatmentPreferences);

    // Fetch consultation data (liposuction, breast, face)
    const { data: consultations } = await supabaseClient
      .from("patient_consultation_data")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    
    if (consultations) {
      setConsultationData(consultations as ConsultationData[]);
    }
    
    // Insurance: try patient_insurances first, then patient_insurance (legacy table) as fallback
    if (insuranceRes.data) {
      setInsurance(insuranceRes.data as PatientInsurance);
    } else {
      // Fallback: try legacy patient_insurance table (singular)
      try {
        const { data: legacyIns } = await supabaseClient
          .from("patient_insurance")
          .select("*")
          .eq("patient_id", patientId)
          .maybeSingle();
        if (legacyIns) setInsurance(legacyIns as PatientInsurance);
      } catch {
        // Legacy table may not exist, ignore error
      }
    }

    // Get signed URLs for photos
    if (photosRes.data && photosRes.data.length > 0) {
      const urls: Record<string, string> = {};
      for (const photo of photosRes.data as IntakePhoto[]) {
        const { data: urlData } = await supabaseClient.storage
          .from("patient-intake-photos")
          .createSignedUrl(photo.storage_path, 3600);
        if (urlData?.signedUrl) {
          urls[photo.id] = urlData.signedUrl;
        }
      }
        setPhotoUrls(urls);
      }

      setLoading(false);
  }, [patientId]);

  useEffect(() => {
    loadIntakeData();
  }, [loadIntakeData]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-1/3"></div>
        <div className="h-32 bg-slate-200 rounded"></div>
        <div className="h-32 bg-slate-200 rounded"></div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-200 flex items-center justify-center">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm text-slate-600">No intake form data available</p>
        <p className="text-xs text-slate-400 mt-1">Patient has not completed the intake form yet</p>
      </div>
    );
  }

  // Save handlers
  const savePreferences = async (data: Partial<IntakePreferences>) => {
    if (!submission) return;
    setSaving(true);
    try {
      if (preferences?.id) {
        await supabaseClient.from("patient_intake_preferences").update(data).eq("id", preferences.id);
      } else {
        await supabaseClient.from("patient_intake_preferences").insert({
          ...data,
          submission_id: submission.id,
          patient_id: patientId,
        });
      }
      await loadIntakeData();
      setEditingSection(null);
    } catch (err) {
      console.error("Failed to save preferences:", err);
    }
    setSaving(false);
  };

  const saveMeasurements = async (data: Partial<Measurements>) => {
    if (!submission) return;
    setSaving(true);
    try {
      const bmi = calculateBMI(data.height_cm ?? null, data.weight_kg ?? null);
      const payload = { ...data, bmi };
      
      if (measurements?.id) {
        await supabaseClient.from("patient_measurements").update(payload).eq("id", measurements.id);
      } else {
        await supabaseClient.from("patient_measurements").insert({
          ...payload,
          submission_id: submission.id,
          patient_id: patientId,
        });
      }
      await loadIntakeData();
      setEditingSection(null);
    } catch (err) {
      console.error("Failed to save measurements:", err);
    }
    setSaving(false);
  };

  const saveTreatmentPrefs = async (data: Partial<TreatmentPreferences>) => {
    if (!submission) return;
    setSaving(true);
    try {
      if (treatmentPrefs?.id) {
        await supabaseClient.from("patient_treatment_preferences").update(data).eq("id", treatmentPrefs.id);
      } else {
        await supabaseClient.from("patient_treatment_preferences").insert({
          ...data,
          submission_id: submission.id,
          patient_id: patientId,
        });
      }
      await loadIntakeData();
      setEditingSection(null);
    } catch (err) {
      console.error("Failed to save treatment preferences:", err);
    }
    setSaving(false);
  };

  const saveInsurance = async (data: Partial<PatientInsurance>) => {
    setSaving(true);
    try {
      const saveData = {
        provider_name: data.provider_name || null,
        card_number: data.card_number || null,
        insurance_type: data.insurance_type || null,
      };

      if (insurance?.id) {
        const { error } = await supabaseClient.from("patient_insurances").update(saveData).eq("id", insurance.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from("patient_insurances").insert({
          ...saveData,
          patient_id: patientId,
        });
        if (error) throw error;
      }
      await loadIntakeData();
      setEditingSection(null);
    } catch (err) {
      console.error("Failed to save insurance:", err);
      alert(`Failed to save insurance: ${err instanceof Error ? err.message : String(err)}`);
    }
    setSaving(false);
  };

  const EditButton = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="ml-auto text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
      Edit
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Patient Intake Data</h3>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            submission.status === "completed"
              ? "bg-emerald-100 text-emerald-700"
              : submission.status === "in_progress"
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {submission.status === "completed" ? "Completed" : submission.status === "in_progress" ? "In Progress" : submission.status}
        </span>
      </div>

      {/* Submission Info */}
      <div className="text-xs text-slate-500 flex gap-4">
        <span>Started: {new Date(submission.started_at).toLocaleDateString()}</span>
        {submission.completed_at && (
          <span>Completed: {new Date(submission.completed_at).toLocaleDateString()}</span>
        )}
      </div>

      {/* Main Grid - Always show all sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Preferences Card - Always show */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h4 className="font-medium text-slate-900">Preferences</h4>
            <EditButton onClick={() => {
              setEditPrefs(preferences || { preferred_language: "en", consultation_type: "either", preferred_contact_method: "email", preferred_contact_time: "anytime", additional_notes: null });
              setEditingSection("preferences");
            }} />
          </div>
          
          {editingSection === "preferences" && editPrefs ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Language</label>
                <select value={editPrefs.preferred_language} onChange={(e) => setEditPrefs({ ...editPrefs, preferred_language: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black">
                  <option value="en">English</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="es">Spanish</option>
                  <option value="ru">Russian</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Consultation Type</label>
                <select value={editPrefs.consultation_type} onChange={(e) => setEditPrefs({ ...editPrefs, consultation_type: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black">
                  <option value="in-person">In Person</option>
                  <option value="virtual">Virtual</option>
                  <option value="either">Either</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Contact Method</label>
                <select value={editPrefs.preferred_contact_method} onChange={(e) => setEditPrefs({ ...editPrefs, preferred_contact_method: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black">
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Best Time</label>
                <select value={editPrefs.preferred_contact_time} onChange={(e) => setEditPrefs({ ...editPrefs, preferred_contact_time: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black">
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                  <option value="anytime">Anytime</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Notes</label>
                <textarea value={editPrefs.additional_notes || ""} onChange={(e) => setEditPrefs({ ...editPrefs, additional_notes: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => savePreferences(editPrefs)} disabled={saving} className="px-4 py-2 bg-black text-white text-xs rounded-lg hover:bg-slate-800 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                <button onClick={() => setEditingSection(null)} className="px-4 py-2 text-slate-600 text-xs hover:bg-slate-100 rounded-lg">Cancel</button>
              </div>
            </div>
          ) : preferences ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Language</span><span className="text-slate-900 font-medium">{LANGUAGE_LABELS[preferences.preferred_language] || preferences.preferred_language}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Consultation</span><span className="text-slate-900 font-medium capitalize">{preferences.consultation_type}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Contact via</span><span className="text-slate-900 font-medium capitalize">{preferences.preferred_contact_method}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Best time</span><span className="text-slate-900 font-medium capitalize">{preferences.preferred_contact_time}</span></div>
              {preferences.additional_notes && <div className="pt-2 border-t border-slate-100"><span className="text-slate-500 text-xs">Notes:</span><p className="text-slate-700 mt-1">{preferences.additional_notes}</p></div>}
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No preferences set. Click Edit to add.</p>
          )}
        </div>

        {/* Treatment Areas Card - Shows consultation data */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h4 className="font-medium text-slate-900">Treatment Areas</h4>
          </div>
          {consultationData.length > 0 ? (
            <div className="space-y-4">
              {consultationData.map((consultation) => (
                <div key={consultation.id} className="border-l-2 border-rose-300 pl-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-slate-900 capitalize">{consultation.consultation_type} Consultation</span>
                    <span className="text-xs text-white bg-rose-500 px-2 py-0.5 rounded-full">
                      {consultation.upload_mode === "now" ? "Photos Uploaded" : "Photos Pending"}
                    </span>
                  </div>
                  
                  {/* Liposuction: show selected areas */}
                  {consultation.consultation_type === "liposuction" && consultation.selected_areas && (
                    <div className="mb-2">
                      <span className="text-xs text-slate-500">Selected Areas:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {consultation.selected_areas.map((area: string) => (
                          <span key={area} className="text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{area}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Breast: show procedure types */}
                  {consultation.consultation_type === "breast" && consultation.breast_data && (
                    <div className="mb-2">
                      <span className="text-xs text-slate-500">Procedure Types:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {((consultation.breast_data as Record<string, unknown>).procedure_types as string[] || []).map((proc: string) => (
                          <span key={proc} className="text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{proc}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Face: show effects and priority areas */}
                  {consultation.consultation_type === "face" && consultation.face_data && (
                    <div className="space-y-2">
                      {((consultation.face_data as Record<string, unknown>).effects as string[] || []).length > 0 && (
                        <div>
                          <span className="text-xs text-slate-500">Desired Effects:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {((consultation.face_data as Record<string, unknown>).effects as string[]).map((effect: string) => (
                              <span key={effect} className="text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{effect}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {((consultation.face_data as Record<string, unknown>).priority_areas as string[] || []).length > 0 && (
                        <div>
                          <span className="text-xs text-slate-500">Priority Areas:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {((consultation.face_data as Record<string, unknown>).priority_areas as string[]).map((area: string) => (
                              <span key={area} className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full">{area}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {typeof (consultation.face_data as Record<string, unknown>).budget === 'string' && (
                        <div className="text-xs text-slate-600">
                          <span className="text-slate-500">Budget:</span> {(consultation.face_data as Record<string, string>).budget}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Measurements if available */}
                  {consultation.measurements && Object.keys(consultation.measurements).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500">Measurements:</span>
                      <div className="grid grid-cols-2 gap-1 mt-1 text-xs">
                        {Object.entries(consultation.measurements).slice(0, 4).map(([key, value]) => (
                          <div key={key} className="text-slate-600">
                            <span className="capitalize">{key.replace(/_/g, ' ')}:</span> {value}cm
                          </div>
                        ))}
                        {Object.keys(consultation.measurements).length > 4 && (
                          <div className="text-slate-400">+{Object.keys(consultation.measurements).length - 4} more</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : treatmentAreas.length > 0 ? (
            <div className="space-y-3">
              {treatmentAreas.map((area, idx) => (
                <div key={area.id} className="border-l-2 border-rose-300 pl-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">#{idx + 1}</span>
                    <span className="font-medium text-slate-900 capitalize">{area.area_name}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{area.area_category}</span>
                  </div>
                  {area.specific_concerns && area.specific_concerns.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {area.specific_concerns.map((concern) => (
                        <span key={concern} className="text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{concern}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No treatment areas selected.</p>
          )}
        </div>

        {/* Treatment Preferences Card - Always show */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h4 className="font-medium text-slate-900">Treatment Preferences</h4>
            <EditButton onClick={() => {
              setEditTreatmentPrefs(treatmentPrefs || { preferred_date_range_start: null, preferred_date_range_end: null, flexibility: "flexible", budget_range: "standard", financing_interest: false, special_requests: null });
              setEditingSection("treatment_prefs");
            }} />
          </div>
          
          {editingSection === "treatment_prefs" && editTreatmentPrefs ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Start Date</label>
                  <input type="date" value={editTreatmentPrefs.preferred_date_range_start || ""} onChange={(e) => setEditTreatmentPrefs({ ...editTreatmentPrefs, preferred_date_range_start: e.target.value || null })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">End Date</label>
                  <input type="date" value={editTreatmentPrefs.preferred_date_range_end || ""} onChange={(e) => setEditTreatmentPrefs({ ...editTreatmentPrefs, preferred_date_range_end: e.target.value || null })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Flexibility</label>
                <select value={editTreatmentPrefs.flexibility} onChange={(e) => setEditTreatmentPrefs({ ...editTreatmentPrefs, flexibility: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black">
                  <option value="flexible">Flexible</option>
                  <option value="specific_dates">Specific Dates</option>
                  <option value="asap">ASAP</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Budget Range</label>
                <select value={editTreatmentPrefs.budget_range} onChange={(e) => setEditTreatmentPrefs({ ...editTreatmentPrefs, budget_range: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black">
                  <option value="economy">Economy</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                  <option value="no_limit">No Limit</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="financing_edit" checked={editTreatmentPrefs.financing_interest} onChange={(e) => setEditTreatmentPrefs({ ...editTreatmentPrefs, financing_interest: e.target.checked })} className="w-4 h-4" />
                <label htmlFor="financing_edit" className="text-sm text-slate-600">Interested in financing</label>
              </div>
              <div>
                <label className="text-xs text-slate-500">Special Requests</label>
                <textarea value={editTreatmentPrefs.special_requests || ""} onChange={(e) => setEditTreatmentPrefs({ ...editTreatmentPrefs, special_requests: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => saveTreatmentPrefs(editTreatmentPrefs)} disabled={saving} className="px-4 py-2 bg-black text-white text-xs rounded-lg hover:bg-slate-800 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                <button onClick={() => setEditingSection(null)} className="px-4 py-2 text-slate-600 text-xs hover:bg-slate-100 rounded-lg">Cancel</button>
              </div>
            </div>
          ) : treatmentPrefs ? (
            <div className="space-y-2 text-sm">
              {(treatmentPrefs.preferred_date_range_start || treatmentPrefs.preferred_date_range_end) && <div className="flex justify-between"><span className="text-slate-500">Preferred dates</span><span className="text-slate-900 font-medium">{treatmentPrefs.preferred_date_range_start && new Date(treatmentPrefs.preferred_date_range_start).toLocaleDateString()}{treatmentPrefs.preferred_date_range_start && treatmentPrefs.preferred_date_range_end && " - "}{treatmentPrefs.preferred_date_range_end && new Date(treatmentPrefs.preferred_date_range_end).toLocaleDateString()}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">Flexibility</span><span className="text-slate-900 font-medium capitalize">{treatmentPrefs.flexibility.replace("_", " ")}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Budget</span><span className="text-slate-900 font-medium capitalize">{treatmentPrefs.budget_range.replace("_", " ")}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Financing interest</span><span className={`font-medium ${treatmentPrefs.financing_interest ? "text-emerald-600" : "text-slate-400"}`}>{treatmentPrefs.financing_interest ? "Yes" : "No"}</span></div>
              {treatmentPrefs.special_requests && <div className="pt-2 border-t border-slate-100"><span className="text-slate-500 text-xs">Special requests:</span><p className="text-slate-700 mt-1">{treatmentPrefs.special_requests}</p></div>}
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No treatment preferences set. Click Edit to add.</p>
          )}
        </div>

        {/* Insurance Card - Editable */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h4 className="font-medium text-slate-900">Insurance Information</h4>
            <EditButton onClick={() => {
              setEditInsurance(insurance || { provider_name: "", card_number: "", insurance_type: "" });
              setEditingSection("insurance");
            }} />
          </div>
          
          {editingSection === "insurance" && editInsurance ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Provider Name</label>
                <input type="text" value={editInsurance.provider_name || ""} onChange={(e) => setEditInsurance({ ...editInsurance, provider_name: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black" placeholder="Insurance Provider" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Card Number</label>
                <input type="text" value={editInsurance.card_number || ""} onChange={(e) => setEditInsurance({ ...editInsurance, card_number: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black" placeholder="Card Number" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Insurance Type</label>
                <select value={editInsurance.insurance_type || ""} onChange={(e) => setEditInsurance({ ...editInsurance, insurance_type: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-black">
                  <option value="">Select Type</option>
                  <option value="private">Private</option>
                  <option value="semi-private">Semi-Private</option>
                  <option value="basic">Basic</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => saveInsurance(editInsurance)} disabled={saving} className="px-4 py-2 bg-black text-white text-xs rounded-lg hover:bg-slate-800 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                <button onClick={() => setEditingSection(null)} className="px-4 py-2 text-slate-600 text-xs hover:bg-slate-100 rounded-lg">Cancel</button>
              </div>
            </div>
          ) : insurance ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Provider</span><span className="text-slate-900 font-medium">{insurance.provider_name || "N/A"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Card Number</span><span className="text-slate-900 font-medium">{insurance.card_number || "N/A"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="text-slate-900 font-medium">{insurance.insurance_type || "N/A"}</span></div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No insurance information provided. Click Edit to add.</p>
          )}
        </div>

        {/* Health Background Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h4 className="font-medium text-slate-900">Health Background & Lifestyle</h4>
          </div>
          {healthBackground ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-slate-500 text-xs mb-1">Physical</p>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Weight</span><span className="text-slate-900 font-medium">{healthBackground.weight_kg ? `${healthBackground.weight_kg} kg` : "N/A"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Height</span><span className="text-slate-900 font-medium">{healthBackground.height_cm ? `${healthBackground.height_cm} cm` : "N/A"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">BMI</span><span className="text-slate-900 font-medium">{healthBackground.bmi || "N/A"}</span></div>
                </div>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Medical History</p>
                <div className="space-y-1">
                  <div><span className="text-slate-500">Illnesses:</span> <span className="text-slate-900">{healthBackground.known_illnesses || "N/A"}</span></div>
                  <div><span className="text-slate-500">Surgeries:</span> <span className="text-slate-900">{healthBackground.previous_surgeries || "N/A"}</span></div>
                  <div><span className="text-slate-500">Allergies:</span> <span className="text-slate-900">{healthBackground.allergies || "N/A"}</span></div>
                  <div><span className="text-slate-500">Medications:</span> <span className="text-slate-900">{healthBackground.medications || "N/A"}</span></div>
                </div>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Lifestyle</p>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Cigarettes</span><span className="text-slate-900 font-medium">{healthBackground.cigarettes || "N/A"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Alcohol</span><span className="text-slate-900 font-medium">{healthBackground.alcohol_consumption || "N/A"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sports</span><span className="text-slate-900 font-medium">{healthBackground.sports_activity || "N/A"}</span></div>
                </div>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Healthcare Providers</p>
                <div className="space-y-1">
                  <div><span className="text-slate-500">GP:</span> <span className="text-slate-900">{healthBackground.general_practitioner || "N/A"}</span></div>
                  <div><span className="text-slate-500">Gynecologist:</span> <span className="text-slate-900">{healthBackground.gynecologist || "N/A"}</span></div>
                </div>
              </div>
              {healthBackground.children_count && healthBackground.children_count > 0 && (
                <div>
                  <p className="text-slate-500 text-xs mb-1">Children</p>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Count</span><span className="text-slate-900 font-medium">{healthBackground.children_count}</span></div>
                    {healthBackground.birth_type_1 && <div className="flex justify-between"><span className="text-slate-500">Birth 1</span><span className="text-slate-900 font-medium">{healthBackground.birth_type_1}</span></div>}
                    {healthBackground.birth_type_2 && <div className="flex justify-between"><span className="text-slate-500">Birth 2</span><span className="text-slate-900 font-medium">{healthBackground.birth_type_2}</span></div>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No health background information provided.</p>
          )}
        </div>
      </div>

      {/* Photos Section - Always show */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h4 className="font-medium text-slate-900">Uploaded Photos</h4>
          <span className="text-xs text-slate-400">({photos.length})</span>
        </div>
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 group">
                {photoUrls[photo.id] ? (
                  <img src={photoUrls[photo.id]} alt={photo.file_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  <p className="text-xs text-white truncate">{photo.file_name}</p>
                  <p className="text-xs text-white/60">{new Date(photo.uploaded_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">No photos uploaded.</p>
        )}
      </div>
    </div>
  );
}
