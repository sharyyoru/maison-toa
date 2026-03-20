"use client";

import { useEffect, useState, Suspense, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseClient } from "@/lib/supabaseClient";
import { pushToDataLayer } from "@/components/GoogleTagManager";

const LIPOSUCTION_AREAS = [
  "Tummy", "Flancs", "Back", "Arms", "Thighs", "Legs", "Breast", "Chin", "Other"
];

// Face consultation specific
const FACE_EFFECTS = [
  "Looking less saggy", "Less angry", "Less tired", "More attractive", 
  "More feminine", "Masculine", "More young"
];

const FACE_PRIORITY_AREAS = [
  "Wrinkles", "Eyebags", "Nasolabial Fold", "Jaw Line", "Neck"
];

const FACE_BUDGET_OPTIONS = [
  "$ 500", "$ 1,000", "$ 2,000", "$ 2,000 +"
];

const FACE_PHOTO_POSITIONS = [
  { id: "left_45", label: "Left 45 Image" },
  { id: "front", label: "Front Image" },
  { id: "right_45", label: "Right 45 Image" },
  { id: "right_profile", label: "right profile face" },
  { id: "left_profile", label: "left profile face" },
];

// Measurement fields based on selected areas
const AREA_MEASUREMENTS: Record<string, string[]> = {
  "Tummy": ["Upper Tummy", "Lower Tummy"],
  "Flancs": ["Left Lumbar Area", "Right Lumbar Area"],
  "Back": ["Upper Back", "Lower Back"],
  "Arms": ["Left Arm", "Right Arm"],
  "Thighs": ["Left Thigh", "Right Thigh"],
  "Legs": ["Left Leg", "Right Leg"],
  "Breast": ["Left Breast", "Right Breast"],
  "Chin": ["Chin Area"],
  "Other": ["Other Area"]
};

const VIDEO_URL = "https://geneva.aliice.space/storage/guide-videos/8zcexcQrrUk7VXgDAaWGMpVPAgpd9v11BdO0mgir.mp4";

// Breast consultation specific
const BREAST_SURGERY_TYPES = [
  "Augmentation", "Reduction", "Lift", "Benign Tumor Removal", 
  "Malignant Tumor Removal", "Reconstruction", "Malformation", "Other"
];

const BREAST_PROCEDURE_TYPES = [
  "Breast Augmentation", "Breast Reduction", "Breast Lift", "Breast Reconstruction", "Breast Exchange"
];

const AUGMENTATION_OPTIONS = ["Implant", "Fat Transplantation", "I don't know"];
const CUP_SIZES = ["SIZE A", "SIZE B", "SIZE C", "SIZE D", "SIZE E", "SIZE F", "SIZE G"];

const BREAST_MEASUREMENTS = [
  { id: "sternum_nipple_right", label: "Sternum to Nipple Distance (Right)", required: true },
  { id: "sternum_nipple_left", label: "Sternum to Nipple Distance (Left)", required: true },
  { id: "submammary_fold_right", label: "Submammary Fold Distance (Right)", required: false },
  { id: "submammary_fold_left", label: "Submammary Fold Distance (Left)", required: false },
  { id: "nipple_mammary_left", label: "Left Nipple to Mammary Base Width", required: false },
  { id: "nipple_mammary_right", label: "Right Nipple to Mammary Base Width", required: false },
  { id: "inter_nipple", label: "Inter-Nipple Distance", required: false },
  { id: "upper_pole_right", label: "Right Upper Pole Pinch Thickness", required: false },
  { id: "upper_pole_left", label: "Left Upper Pole Pinch Thickness", required: false },
];

const BREAST_PHOTO_POSITIONS = [
  { id: "left", label: "Left Image" },
  { id: "front", label: "Front Image" },
  { id: "right", label: "Right Image" },
  { id: "right_profile", label: "Right profile breast" },
  { id: "left_profile", label: "Left profile breast" },
];

type ConsultationStep = 1 | 2 | 3 | 4 | 5 | 6;

function ConsultationContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const category = params.category as string;
  const patientId = searchParams.get("pid");
  const submissionId = searchParams.get("sid");

  const [step, setStep] = useState<ConsultationStep>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Liposuction: Area selection
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  // Shared: Measurements
  const [measurements, setMeasurements] = useState<Record<string, string>>({});

  // Shared: Photo upload
  const [uploadMode, setUploadMode] = useState<"now" | "later">("now");
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, boolean>>({});

  // Breast consultation specific state
  const [hadBreastSurgery, setHadBreastSurgery] = useState<"yes" | "no" | null>(null);
  const [breastSurgeryTypes, setBreastSurgeryTypes] = useState<string[]>([]);
  const [hadBreastfeed, setHadBreastfeed] = useState<"yes" | "no" | null>(null);
  const [breastfeedHowLong, setBreastfeedHowLong] = useState("");
  const [hadBreastConditions, setHadBreastConditions] = useState<"yes" | "no" | null>(null);
  const [breastConditionsDetails, setBreastConditionsDetails] = useState("");
  const [hadUltrasound, setHadUltrasound] = useState<"yes" | "no" | null>(null);
  const [ultrasoundHowLong, setUltrasoundHowLong] = useState("");
  const [ultrasoundWhy, setUltrasoundWhy] = useState("");
  const [hadPreviousConsultation, setHadPreviousConsultation] = useState<"yes" | "no" | null>(null);
  const [selectedProcedureTypes, setSelectedProcedureTypes] = useState<string[]>([]);
  const [augmentationOption, setAugmentationOption] = useState("");
  const [desiredCupSize, setDesiredCupSize] = useState("");
  const [reductionComments, setReductionComments] = useState("");
  const [liftComments, setLiftComments] = useState("");

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Auto-save refs
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);

  // Face consultation specific state
  const [hadFaceTreatments, setHadFaceTreatments] = useState<"yes" | "no" | null>(null);
  const [faceTreatmentKind, setFaceTreatmentKind] = useState("");
  const [faceTreatmentWhen, setFaceTreatmentWhen] = useState("");
  const [selectedEffects, setSelectedEffects] = useState<string[]>([]);
  const [selectedFaceAreas, setSelectedFaceAreas] = useState<string[]>([]);
  const [selectedBudget, setSelectedBudget] = useState("");

  const toggleArea = (area: string) => {
    setSelectedAreas(prev => 
      prev.includes(area) 
        ? prev.filter(a => a !== area)
        : [...prev, area]
    );
  };

  const getMeasurementFields = () => {
    const fields: string[] = [];
    selectedAreas.forEach(area => {
      if (AREA_MEASUREMENTS[area]) {
        fields.push(...AREA_MEASUREMENTS[area]);
      }
    });
    return fields;
  };

  const handleMeasurementChange = (field: string, value: string) => {
    setMeasurements(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (position: string, file: File | null) => {
    setPhotos(prev => ({ ...prev, [position]: file }));
  };

  const toggleProcedureType = (type: string) => {
    setSelectedProcedureTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleSurgeryType = (type: string) => {
    setBreastSurgeryTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleEffect = (effect: string) => {
    setSelectedEffects(prev =>
      prev.includes(effect) ? prev.filter(e => e !== effect) : [...prev, effect]
    );
  };

  const toggleFaceArea = (area: string) => {
    setSelectedFaceAreas(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  // Auto-save function for consultation data
  const autoSaveConsultation = useCallback(async () => {
    if (!patientId || !submissionId || isSavingRef.current) return;
    
    isSavingRef.current = true;
    try {
      const consultationData: Record<string, unknown> = {
        patient_id: patientId,
        submission_id: submissionId,
        consultation_type: category,
        measurements: measurements,
        upload_mode: uploadMode,
        updated_at: new Date().toISOString(),
      };

      if (category === "liposuction") {
        consultationData.selected_areas = selectedAreas;
      } else if (category === "breast") {
        consultationData.breast_data = {
          had_surgery: hadBreastSurgery,
          surgery_types: breastSurgeryTypes,
          had_breastfeed: hadBreastfeed,
          breastfeed_how_long: breastfeedHowLong,
          had_conditions: hadBreastConditions,
          conditions_details: breastConditionsDetails,
          had_ultrasound: hadUltrasound,
          ultrasound_how_long: ultrasoundHowLong,
          ultrasound_why: ultrasoundWhy,
          had_previous_consultation: hadPreviousConsultation,
          procedure_types: selectedProcedureTypes,
          augmentation_option: augmentationOption,
          desired_cup_size: desiredCupSize,
          reduction_comments: reductionComments,
          lift_comments: liftComments,
        };
      } else if (category === "face") {
        consultationData.face_data = {
          had_treatments: hadFaceTreatments,
          treatment_kind: faceTreatmentKind,
          treatment_when: faceTreatmentWhen,
          effects: selectedEffects,
          priority_areas: selectedFaceAreas,
          budget: selectedBudget,
        };
      }

      await supabaseClient
        .from("patient_consultation_data")
        .upsert(consultationData, { onConflict: "patient_id,consultation_type" });

      console.log("Consultation auto-save completed");
    } catch (err) {
      console.error("Consultation auto-save error:", err);
    } finally {
      isSavingRef.current = false;
    }
  }, [patientId, submissionId, category, measurements, uploadMode, selectedAreas,
      hadBreastSurgery, breastSurgeryTypes, hadBreastfeed, breastfeedHowLong,
      hadBreastConditions, breastConditionsDetails, hadUltrasound, ultrasoundHowLong,
      ultrasoundWhy, hadPreviousConsultation, selectedProcedureTypes, augmentationOption,
      desiredCupSize, reductionComments, liftComments, hadFaceTreatments, faceTreatmentKind,
      faceTreatmentWhen, selectedEffects, selectedFaceAreas, selectedBudget]);

  // Set up auto-save on window close and idle timeout
  useEffect(() => {
    if (!patientId || !submissionId) return;

    const handleBeforeUnload = () => {
      autoSaveConsultation();
    };

    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        autoSaveConsultation();
      }, 60000);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("mousemove", resetIdleTimer);
    window.addEventListener("keydown", resetIdleTimer);
    window.addEventListener("click", resetIdleTimer);

    resetIdleTimer();

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("mousemove", resetIdleTimer);
      window.removeEventListener("keydown", resetIdleTimer);
      window.removeEventListener("click", resetIdleTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [patientId, submissionId, autoSaveConsultation]);

  const saveAndProceed = async () => {
    setLoading(true);
    setError(null);

    try {
      // Build consultation data based on category
      const consultationData: Record<string, unknown> = {
        patient_id: patientId,
        submission_id: submissionId,
        consultation_type: category,
        measurements: measurements,
        upload_mode: uploadMode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (category === "liposuction") {
        consultationData.selected_areas = selectedAreas;
      } else if (category === "breast") {
        consultationData.breast_data = {
          had_surgery: hadBreastSurgery,
          surgery_types: breastSurgeryTypes,
          had_breastfeed: hadBreastfeed,
          breastfeed_how_long: breastfeedHowLong,
          had_conditions: hadBreastConditions,
          conditions_details: breastConditionsDetails,
          had_ultrasound: hadUltrasound,
          ultrasound_how_long: ultrasoundHowLong,
          ultrasound_why: ultrasoundWhy,
          had_previous_consultation: hadPreviousConsultation,
          procedure_types: selectedProcedureTypes,
          augmentation_option: augmentationOption,
          desired_cup_size: desiredCupSize,
          reduction_comments: reductionComments,
          lift_comments: liftComments,
        };
      } else if (category === "face") {
        consultationData.face_data = {
          had_treatments: hadFaceTreatments,
          treatment_kind: faceTreatmentKind,
          treatment_when: faceTreatmentWhen,
          effects: selectedEffects,
          priority_areas: selectedFaceAreas,
          budget: selectedBudget,
        };
      }

      const { error: saveError } = await supabaseClient
        .from("patient_consultation_data")
        .upsert(consultationData, { onConflict: "patient_id,consultation_type" });

      if (saveError) throw saveError;

      // Upload photos if mode is "now"
      if (uploadMode === "now") {
        setUploading(true);
        const photosToUpload = Object.entries(photos).filter(([, file]) => file !== null);
        const totalPhotos = photosToUpload.length;
        
        for (let i = 0; i < photosToUpload.length; i++) {
          const [position, file] = photosToUpload[i];
          if (file) {
            // Set progress to 50% while uploading
            setUploadProgress(prev => ({ ...prev, [position]: 50 }));
            
            const fileName = `${patientId}/${category}/${position}_${Date.now()}.${file.name.split('.').pop()}`;
            const { error: uploadError } = await supabaseClient.storage
              .from("patient-photos")
              .upload(fileName, file);
            
            if (uploadError) {
              console.error(`Failed to upload ${position}:`, uploadError);
              setUploadProgress(prev => ({ ...prev, [position]: 0 }));
            } else {
              // Mark as completed
              setUploadProgress(prev => ({ ...prev, [position]: 100 }));
              setUploadedPhotos(prev => ({ ...prev, [position]: true }));
            }
          }
        }
        setUploading(false);
      }

      // Push GTM event for form submission
      pushToDataLayer("aliice_form_submit");
      
      // Redirect to book appointment with patient info and consultation type
      router.push(`/book-appointment/doctors?pid=${patientId}&sid=${submissionId}&autofill=true&ctype=${category}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && selectedAreas.length > 0) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      saveAndProceed();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as ConsultationStep);
    } else {
      window.history.back();
    }
  };

  // Liposuction specific rendering
  if (category === "liposuction") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
        <header className="px-4 sm:px-6 py-4 flex items-center justify-between">
          <Image
            src="/logos/aesthetics-logo.svg"
            alt="Aesthetics Clinic"
            width={60}
            height={60}
            className="h-12 w-auto"
          />
        </header>

        <div className="flex-1 overflow-auto px-4 sm:px-6 py-6">
          <div className="max-w-md mx-auto">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Step 1: Select Areas */}
            {step === 1 && (
              <>
                <h1 className="text-2xl font-light text-slate-800 mb-2">Customize Your Liposuction Plan</h1>
                <p className="text-slate-600 text-sm mb-6">A.) Choose areas of the body to be treated:</p>

                <div className="space-y-3 mb-8">
                  {LIPOSUCTION_AREAS.map((area) => (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleArea(area)}
                      className={`w-full py-3 px-4 rounded-full border text-center transition-colors ${
                        selectedAreas.includes(area)
                          ? "bg-sky-100 text-sky-700 border-sky-400"
                          : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 2: Measurements */}
            {step === 2 && (
              <>
                <h1 className="text-2xl font-light text-slate-800 mb-6">Body Measurements for Evaluation</h1>

                {/* Instruction Box with Video */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                  <h3 className="font-medium text-slate-800 mb-2">Instruction</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Please measure the circumference of the selected limb areas using a flexible measuring tape. 
                    <strong> Wrap the tape snugly (but not tightly)</strong> around the thickest part of the arm, leg, or thigh.
                  </p>
                  
                  {/* Embedded Video */}
                  <video
                    src={VIDEO_URL}
                    controls
                    className="w-full rounded-lg"
                    poster="/video-poster.jpg"
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>

                {/* Dynamic Measurement Fields */}
                <div className="space-y-4">
                  {getMeasurementFields().map((field) => (
                    <div key={field}>
                      <label className="block text-sm text-slate-600 mb-1">
                        Please enter measurement of in cm *<br />
                        <span className="font-medium text-slate-800">{field}</span>
                      </label>
                      <input
                        type="number"
                        value={measurements[field] || ""}
                        onChange={(e) => handleMeasurementChange(field, e.target.value)}
                        placeholder="INPUTTEXT"
                        className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Step 3: Photo Upload */}
            {step === 3 && (
              <>
                <h1 className="text-2xl font-light text-slate-800 mb-6 italic">Upload Your Photos</h1>

                {/* Upload Mode Toggle */}
                <div className="flex justify-center gap-2 mb-6">
                  <button
                    onClick={() => setUploadMode("now")}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${
                      uploadMode === "now"
                        ? "bg-slate-800 text-white"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    Upload Now
                  </button>
                  <button
                    onClick={() => setUploadMode("later")}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${
                      uploadMode === "later"
                        ? "bg-slate-800 text-white"
                        : "bg-white border border-slate-300 text-slate-600"
                    }`}
                  >
                    Upload Later
                  </button>
                </div>

                {uploadMode === "now" ? (
                  <div className="space-y-4">
                    {["left", "front", "right", "back"].map((position) => (
                      <div key={position}>
                        <label className="block text-sm font-medium text-slate-700 mb-2 capitalize">
                          {position} Image
                        </label>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => fileInputRefs.current[position]?.click()}
                            disabled={uploading}
                            className="px-4 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                          >
                            Choose file
                          </button>
                          <span className="text-sm text-slate-500 flex-1">
                            {photos[position]?.name || "No file chosen"}
                          </span>
                          {uploadedPhotos[position] && (
                            <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                          <input
                            ref={(el) => { fileInputRefs.current[position] = el; }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleFileChange(position, e.target.files?.[0] || null)}
                          />
                        </div>
                        {/* Progress bar */}
                        {uploadProgress[position] !== undefined && uploadProgress[position] > 0 && uploadProgress[position] < 100 && (
                          <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                            <div className="bg-sky-500 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress[position]}%` }}></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sky-600 text-sm">
                      We will send you a link to your email to upload the photos.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 sm:px-6 py-4">
          <div className="max-w-md mx-auto flex justify-center items-center gap-4">
            <button
              onClick={handleBack}
              className="p-3 rounded-full hover:bg-slate-200 transition-colors"
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              disabled={loading || uploading || (step === 1 && selectedAreas.length === 0)}
              className="px-8 py-3 rounded-full bg-slate-200 text-slate-600 font-medium hover:bg-slate-300 transition-colors disabled:opacity-50"
            >
              {loading || uploading ? "Processing..." : "NEXT"}
            </button>
          </div>
        </footer>
      </main>
    );
  }

  // Breast consultation flow
  if (category === "breast") {
    const breastHandleNext = () => {
      if (step < 6) setStep((prev) => (prev + 1) as ConsultationStep);
      else saveAndProceed();
    };

    const breastHandleBack = () => {
      if (step > 1) setStep((prev) => (prev - 1) as ConsultationStep);
      else window.history.back();
    };

    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
        <header className="px-4 sm:px-6 py-4 flex items-center justify-between">
          <Image src="/logos/aesthetics-logo.svg" alt="Aesthetics Clinic" width={60} height={60} className="h-12 w-auto" />
        </header>

        <div className="flex-1 overflow-auto px-4 sm:px-6 py-6">
          <div className="max-w-md mx-auto">
            {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}

            {/* Step 1: Previous procedures/conditions */}
            {step === 1 && (
              <>
                <h1 className="text-2xl font-light text-slate-800 mb-6">Let us know if you&apos;ve had any breast procedures or conditions before.</h1>

                {/* Had Breast Surgery Before */}
                <p className="text-amber-600 text-sm font-medium mb-3">Had Breast Surgery Before</p>
                <div className="space-y-2 mb-4">
                  {["yes", "no"].map((opt) => (
                    <button key={opt} onClick={() => setHadBreastSurgery(opt as "yes" | "no")}
                      className={`w-full py-3 px-4 rounded-full border text-left transition-colors ${hadBreastSurgery === opt ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                      {opt === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>

                {/* Show surgery types if Yes */}
                {hadBreastSurgery === "yes" && (
                  <>
                    <p className="text-amber-600 text-sm font-medium mb-3 italic">Had Breast Surgery Before</p>
                    <div className="space-y-2 mb-4">
                      {BREAST_SURGERY_TYPES.map((type) => (
                        <button key={type} onClick={() => toggleSurgeryType(type)}
                          className={`w-full py-2 px-4 rounded-full border text-center text-sm transition-colors ${breastSurgeryTypes.includes(type) ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                          {type}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Had breast feed before */}
                <p className="text-slate-700 text-sm mb-3">Had breast feed before?</p>
                <div className="space-y-2 mb-4">
                  {["yes", "no"].map((opt) => (
                    <button key={opt} onClick={() => setHadBreastfeed(opt as "yes" | "no")}
                      className={`w-full py-3 px-4 rounded-full border text-left transition-colors ${hadBreastfeed === opt ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                      {opt === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>

                {hadBreastfeed === "yes" && (
                  <div className="mb-4">
                    <h3 className="text-xl font-light text-slate-800 mb-2">Please tell us more</h3>
                    <label className="text-slate-600 text-sm">How long ago?</label>
                    <input type="text" value={breastfeedHowLong} onChange={(e) => setBreastfeedHowLong(e.target.value)}
                      className="w-full mt-1 px-4 py-3 rounded-full border border-slate-300 bg-white text-black" />
                  </div>
                )}

                {/* Breast conditions */}
                <p className="text-slate-700 text-sm mb-3">Have you ever had breast conditions (nodes, cysts, mastitis)?</p>
                <div className="space-y-2 mb-4">
                  {["yes", "no"].map((opt) => (
                    <button key={opt} onClick={() => setHadBreastConditions(opt as "yes" | "no")}
                      className={`w-full py-3 px-4 rounded-full border text-left transition-colors ${hadBreastConditions === opt ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                      {opt === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>

                {hadBreastConditions === "yes" && (
                  <div className="mb-4">
                    <h3 className="text-xl font-light text-slate-800 mb-2">Please tell us more</h3>
                    <label className="text-slate-600 text-sm">Details</label>
                    <input type="text" value={breastConditionsDetails} onChange={(e) => setBreastConditionsDetails(e.target.value)}
                      className="w-full mt-1 px-4 py-3 rounded-full border border-slate-300 bg-white text-black" />
                  </div>
                )}
              </>
            )}

            {/* Step 2: Ultrasound/mammography + previous consultation */}
            {step === 2 && (
              <>
                <h1 className="text-2xl font-light text-slate-800 mb-6">Let us know if you&apos;ve had any breast procedures or conditions before.</h1>

                <p className="text-slate-700 text-sm mb-3">Have you ever had a breast ultrasound or mammography?</p>
                <div className="space-y-2 mb-4">
                  {["yes", "no"].map((opt) => (
                    <button key={opt} onClick={() => setHadUltrasound(opt as "yes" | "no")}
                      className={`w-full py-3 px-4 rounded-full border text-left transition-colors ${hadUltrasound === opt ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                      {opt === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>

                {hadUltrasound === "yes" && (
                  <div className="mb-4">
                    <h3 className="text-xl font-light text-slate-800 mb-2">Please tell us more</h3>
                    <label className="text-slate-600 text-sm">How long ago?</label>
                    <input type="text" value={ultrasoundHowLong} onChange={(e) => setUltrasoundHowLong(e.target.value)}
                      className="w-full mt-1 px-4 py-3 rounded-full border border-slate-300 bg-white text-black mb-3" />
                    <label className="text-slate-600 text-sm">Why</label>
                    <input type="text" value={ultrasoundWhy} onChange={(e) => setUltrasoundWhy(e.target.value)}
                      className="w-full mt-1 px-4 py-3 rounded-full border border-slate-300 bg-white text-black" />
                  </div>
                )}

                <p className="text-slate-700 text-sm mb-3">Have you ever had a previous breast consultation?</p>
                <div className="space-y-2 mb-4">
                  {["yes", "no"].map((opt) => (
                    <button key={opt} onClick={() => setHadPreviousConsultation(opt as "yes" | "no")}
                      className={`w-full py-3 px-4 rounded-full border text-left transition-colors ${hadPreviousConsultation === opt ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                      {opt === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 3: Procedure type selection */}
            {step === 3 && (
              <>
                <h1 className="text-2xl font-light text-slate-800 mb-2">Let us know if you&apos;ve had any breast procedures or conditions before.</h1>
                <p className="text-amber-600 text-sm italic mb-4">What type of breast procedure are you considering?</p>

                <div className="space-y-4">
                  {BREAST_PROCEDURE_TYPES.map((procedure) => (
                    <div key={procedure}>
                      <button onClick={() => toggleProcedureType(procedure)}
                        className={`w-full py-3 px-4 rounded-full border text-center transition-colors ${selectedProcedureTypes.includes(procedure) ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                        {procedure}
                      </button>

                      {/* Augmentation options */}
                      {procedure === "Breast Augmentation" && selectedProcedureTypes.includes(procedure) && (
                        <div className="mt-3 ml-4 p-4 bg-slate-50 rounded-xl">
                          <p className="text-sm font-medium text-slate-700 mb-2">Breast Augmentation Options:</p>
                          <div className="space-y-2 mb-4">
                            {AUGMENTATION_OPTIONS.map((opt) => (
                              <button key={opt} onClick={() => setAugmentationOption(opt)}
                                className={`w-full py-2 px-4 rounded-full border text-sm ${augmentationOption === opt ? "bg-sky-100 border-sky-400" : "bg-white border-slate-300"}`}>
                                {opt}
                              </button>
                            ))}
                          </div>
                          <p className="text-sm font-medium text-slate-700 mb-2">Desired Cup Size</p>
                          <div className="space-y-2">
                            {CUP_SIZES.map((size) => (
                              <button key={size} onClick={() => setDesiredCupSize(size)}
                                className={`w-full py-2 px-4 rounded-full border text-sm ${desiredCupSize === size ? "bg-sky-100 border-sky-400" : "bg-white border-slate-300"}`}>
                                {size}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reduction comments */}
                      {procedure === "Breast Reduction" && selectedProcedureTypes.includes(procedure) && (
                        <div className="mt-3 ml-4">
                          <label className="text-sm text-slate-600">Comments for Reduction</label>
                          <textarea value={reductionComments} onChange={(e) => setReductionComments(e.target.value)}
                            className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-300 bg-white text-black" rows={3} />
                        </div>
                      )}

                      {/* Lift comments */}
                      {procedure === "Breast Lift" && selectedProcedureTypes.includes(procedure) && (
                        <div className="mt-3 ml-4">
                          <label className="text-sm text-slate-600">Comments for Lift</label>
                          <textarea value={liftComments} onChange={(e) => setLiftComments(e.target.value)}
                            className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-300 bg-white text-black" rows={3} />
                        </div>
                      )}

                      {/* Reconstruction info */}
                      {procedure === "Breast Reconstruction" && selectedProcedureTypes.includes(procedure) && (
                        <p className="mt-3 ml-4 text-sm text-slate-600 italic">This procedure is typically for post-cancer reconstruction.</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Step 4: Measurements */}
            {step === 4 && (
              <>
                <h1 className="text-2xl font-light text-slate-800 mb-6">Body measurements for sternum to nipple</h1>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                  <h3 className="font-medium text-slate-800 mb-2">Instruction</h3>
                  <p className="text-sm text-slate-600 italic mb-2">Measure around the fullest part of your chest</p>
                  <p className="text-sm text-slate-600 italic mb-4">Measure from the center of your chest to the desired point</p>
                  <video src={VIDEO_URL} controls className="w-full rounded-lg">Your browser does not support the video tag.</video>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {BREAST_MEASUREMENTS.map((m) => (
                    <div key={m.id} className={m.id === "inter_nipple" ? "col-span-2" : ""}>
                      <label className="text-xs text-slate-600">
                        {m.required && <span className="text-red-500">* </span>}{m.label}
                      </label>
                      <input type="text" value={measurements[m.id] || ""} onChange={(e) => handleMeasurementChange(m.id, e.target.value)}
                        placeholder="Enter measurement" className="w-full mt-1 px-3 py-2 rounded-full border border-slate-300 bg-white text-black text-sm" />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Step 5: Photo Upload */}
            {step === 5 && (
              <>
                <h1 className="text-2xl font-light text-slate-800 mb-4 italic">Upload Your Photos</h1>

                <div className="flex justify-center gap-2 mb-4">
                  <button onClick={() => setUploadMode("now")} className={`px-6 py-2 rounded-full text-sm font-medium ${uploadMode === "now" ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>Upload Now</button>
                  <button onClick={() => setUploadMode("later")} className={`px-6 py-2 rounded-full text-sm font-medium ${uploadMode === "later" ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>Upload Later</button>
                </div>

                {uploadMode === "now" ? (
                  <>
                    <p className="text-sky-600 text-sm italic mb-2">Help us get a clear view of your treatment goals.</p>
                    <p className="text-slate-600 text-xs mb-2">Please upload clear, well-lit images of the area you&apos;d like treated.</p>
                    <p className="text-slate-600 text-xs mb-4">Include front, side, and rear views of your face if possible.</p>

                    <div className="space-y-4">
                      {BREAST_PHOTO_POSITIONS.map((pos) => (
                        <div key={pos.id}>
                          <label className="block text-sm font-medium text-slate-700 mb-2">{pos.label}</label>
                          <div className="flex items-center gap-3">
                            <button onClick={() => fileInputRefs.current[pos.id]?.click()} disabled={uploading}
                              className="px-4 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-200 disabled:opacity-50">Choose file</button>
                            <span className="text-sm text-slate-500 flex-1">{photos[pos.id]?.name || "No file chosen"}</span>
                            {uploadedPhotos[pos.id] && (
                              <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                            <input ref={(el) => { fileInputRefs.current[pos.id] = el; }} type="file" accept="image/*" className="hidden"
                              onChange={(e) => handleFileChange(pos.id, e.target.files?.[0] || null)} />
                          </div>
                          {uploadProgress[pos.id] !== undefined && uploadProgress[pos.id] > 0 && uploadProgress[pos.id] < 100 && (
                            <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                              <div className="bg-sky-500 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress[pos.id]}%` }}></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sky-600 text-sm">We will send you a link to your email to upload the photos.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 sm:px-6 py-4">
          <div className="max-w-md mx-auto flex justify-center items-center gap-4">
            <button onClick={breastHandleBack} className="p-3 rounded-full hover:bg-slate-200 transition-colors">
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={breastHandleNext} disabled={loading || uploading}
              className="px-8 py-3 rounded-full bg-slate-200 text-slate-600 font-medium hover:bg-slate-300 transition-colors disabled:opacity-50">
              {loading || uploading ? "Processing..." : "NEXT"}
            </button>
          </div>
        </footer>
      </main>
    );
  }

  // Face consultation flow (5 steps)
  const faceHandleNext = () => {
    if (step < 5) setStep((prev) => (prev + 1) as ConsultationStep);
    else saveAndProceed();
  };

  const faceHandleBack = () => {
    if (step > 1) setStep((prev) => (prev - 1) as ConsultationStep);
    else window.history.back();
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between">
        <Image src="/logos/aesthetics-logo.svg" alt="Aesthetics Clinic" width={60} height={60} className="h-12 w-auto" />
      </header>

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-6">
        <div className="max-w-md mx-auto">
          {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}

          {/* Step 1: Previous treatments */}
          {step === 1 && (
            <>
              <h1 className="text-2xl font-light text-slate-800 mb-6">Let us know if you&apos;ve had injectables, lasers, or other facial treatments before.</h1>

              <p className="text-amber-600 text-sm mb-3">Have you ever had injectables, laser treatments, or other facial rejuvenation procedures before?</p>
              <div className="space-y-2 mb-4">
                {["yes", "no"].map((opt) => (
                  <button key={opt} onClick={() => setHadFaceTreatments(opt as "yes" | "no")}
                    className={`w-full py-3 px-4 rounded-full border text-center transition-colors ${hadFaceTreatments === opt ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                    {opt === "yes" ? "Yes" : "No"}
                  </button>
                ))}
              </div>

              {hadFaceTreatments === "yes" && (
                <div className="mb-4">
                  <h3 className="text-xl font-light text-slate-800 mb-4">Please tell us more about your previous treatments</h3>
                  <label className="text-slate-600 text-sm">What kind of treatment?</label>
                  <input type="text" value={faceTreatmentKind} onChange={(e) => setFaceTreatmentKind(e.target.value)}
                    placeholder="e.g., Botox, Laser" className="w-full mt-1 mb-3 px-4 py-3 rounded-full border border-slate-300 bg-white text-black" />
                  <label className="text-slate-600 text-sm">When did you have it?</label>
                  <input type="text" value={faceTreatmentWhen} onChange={(e) => setFaceTreatmentWhen(e.target.value)}
                    placeholder="e.g., 6 months ago" className="w-full mt-1 px-4 py-3 rounded-full border border-slate-300 bg-white text-black" />
                </div>
              )}
            </>
          )}

          {/* Step 2: Effect/emotion multi-select */}
          {step === 2 && (
            <>
              <p className="text-amber-600 text-sm italic mb-4">What effect emotion are you looking for?</p>
              <div className="space-y-2">
                {FACE_EFFECTS.map((effect) => (
                  <button key={effect} onClick={() => toggleEffect(effect)}
                    className={`w-full py-3 px-4 rounded-full border text-left transition-colors ${selectedEffects.includes(effect) ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                    {effect}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 3: Face area priority multi-select */}
          {step === 3 && (
            <>
              <h1 className="text-2xl font-light text-slate-800 mb-6">What area in your face is a priority to treat?</h1>
              <div className="space-y-2">
                {FACE_PRIORITY_AREAS.map((area) => (
                  <button key={area} onClick={() => toggleFaceArea(area)}
                    className={`w-full py-3 px-4 rounded-full border text-left transition-colors ${selectedFaceAreas.includes(area) ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                    {area}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 4: Budget selection */}
          {step === 4 && (
            <>
              <h1 className="text-2xl font-light text-slate-800 mb-2">Set your budget.</h1>
              <p className="text-amber-600 text-sm italic mb-4">What&apos;s your estimated budget for this treatment? (This helps us tailor the best plan for your needs)</p>
              <div className="space-y-2">
                {FACE_BUDGET_OPTIONS.map((budget) => (
                  <button key={budget} onClick={() => setSelectedBudget(budget)}
                    className={`w-full py-3 px-4 rounded-full border text-left transition-colors ${selectedBudget === budget ? "bg-sky-100 text-sky-700 border-sky-400" : "bg-white border-slate-300 text-slate-700"}`}>
                    {budget}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 5: Photo Upload */}
          {step === 5 && (
            <>
              <h1 className="text-2xl font-light text-slate-800 mb-4 italic">Upload Your Photos</h1>

              <div className="flex justify-center gap-2 mb-4">
                <button onClick={() => setUploadMode("now")} className={`px-6 py-2 rounded-full text-sm font-medium ${uploadMode === "now" ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>Upload Now</button>
                <button onClick={() => setUploadMode("later")} className={`px-6 py-2 rounded-full text-sm font-medium ${uploadMode === "later" ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>Upload Later</button>
              </div>

              {uploadMode === "now" ? (
                <>
                  <p className="text-sky-600 text-sm italic mb-2">Let&apos;s get a closer look at your skin to tailor the perfect treatment for you.</p>
                  <p className="text-slate-600 text-xs mb-2">Please upload clear, well-lit images of the area you&apos;d like treated.</p>
                  <p className="text-slate-600 text-xs mb-4">Include front, side, and rear views of your face if possible. You can upload files, or take a photo directly on mobile.</p>

                  <div className="space-y-4">
                    {FACE_PHOTO_POSITIONS.map((pos) => (
                      <div key={pos.id}>
                        <label className="block text-sm font-medium text-slate-700 mb-2">{pos.label}</label>
                        <div className="flex items-center gap-3">
                          <button onClick={() => fileInputRefs.current[pos.id]?.click()} disabled={uploading}
                            className="px-4 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-200 disabled:opacity-50">Choose file</button>
                          <span className="text-sm text-slate-500 flex-1">{photos[pos.id]?.name || "No file chosen"}</span>
                          {uploadedPhotos[pos.id] && (
                            <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                          <input ref={(el) => { fileInputRefs.current[pos.id] = el; }} type="file" accept="image/*" className="hidden"
                            onChange={(e) => handleFileChange(pos.id, e.target.files?.[0] || null)} />
                        </div>
                        {uploadProgress[pos.id] !== undefined && uploadProgress[pos.id] > 0 && uploadProgress[pos.id] < 100 && (
                          <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                            <div className="bg-sky-500 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress[pos.id]}%` }}></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sky-600 text-sm">We will send you a link to your email to upload the photos.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 sm:px-6 py-4">
        <div className="max-w-md mx-auto flex justify-center items-center gap-4">
          <button onClick={faceHandleBack} className="p-3 rounded-full hover:bg-slate-200 transition-colors">
            <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={faceHandleNext} disabled={loading || uploading}
            className="px-8 py-3 rounded-full bg-slate-200 text-slate-600 font-medium hover:bg-slate-300 transition-colors disabled:opacity-50">
            {loading || uploading ? "Processing..." : "NEXT"}
          </button>
        </div>
      </footer>
    </main>
  );
}

export default function ConsultationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    }>
      <ConsultationContent />
    </Suspense>
  );
}
