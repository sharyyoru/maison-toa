"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import Image from "next/image";
import { Language, getTranslation } from "@/lib/intakeTranslations";
import InsurerSearchSelect from "@/components/InsurerSearchSelect";
import { pushToDataLayer } from "@/components/GoogleTagManager";

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const STEP_INFO = [
  { num: 1, desc: "Fill Out the Form with all your preferences." },
  { num: 2, desc: "Choose the areas of your body you'd like to treat." },
  { num: 3, desc: "Enter Measurements." },
  { num: 4, desc: "Upload clear photos of the areas you wish to treat to help our experts assess your needs." },
  { num: 5, desc: "If available, view a personalized simulation of your potential results or receive a link to the simulation after review." },
  { num: 6, desc: "You're All Set! Once submitted, your information will be reviewed by our expert team, and we'll reach out to discuss the next steps in your journey." },
];

const NATIONALITIES = [
  "Swiss", "French", "German", "Italian", "British", "American", "Spanish",
  "Portuguese", "Russian", "Chinese", "Japanese", "Brazilian", "Other"
];

const MARITAL_STATUSES = [
  "Single", "Married", "Divorced", "Widowed", "Separated", "Domestic Partnership"
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const ALCOHOL_OPTIONS = ["Never", "Rarely", "Occasionally", "Frequently", "Daily"];
const SPORTS_OPTIONS = ["Never", "Rarely", "Occasionally", "Frequently", "Daily"];
const BIRTH_TYPES = ["Natural", "C-section"];

function IntakeStepsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submissionId = searchParams.get("sid");
  const patientId = searchParams.get("pid");

  const [step, setStep] = useState<Step>(0);
  const [showIntro, setShowIntro] = useState(true);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const langParam = searchParams.get("lang");
  const [language, setLanguage] = useState<Language>((langParam === "fr" ? "fr" : "en") as Language);
  
  // Get translations based on selected language
  const t = getTranslation(language);
  
  // Consultation category selection
  const [consultationCategory, setConsultationCategory] = useState("");
  
  // Track if data already exists (for showing summary screen)
  const [hasExistingData, setHasExistingData] = useState(false);
  const [showDataSummary, setShowDataSummary] = useState(false);
  const [dataCompletionPercent, setDataCompletionPercent] = useState(0);

  // Step 1: Personal Information
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [nationality, setNationality] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [town, setTown] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [profession, setProfession] = useState("");
  const [currentEmployer, setCurrentEmployer] = useState("");

  // Step 2: Insurance Information
  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [insurerGln, setInsurerGln] = useState("");
  const [insuranceCardNumber, setInsuranceCardNumber] = useState("");
  const [insuranceType, setInsuranceType] = useState("");

  // Step 3: Health Background & Lifestyle
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [knownIllnesses, setKnownIllnesses] = useState("");
  const [previousSurgeries, setPreviousSurgeries] = useState("");
  const [allergies, setAllergies] = useState("");
  const [cigarettes, setCigarettes] = useState("");
  const [alcohol, setAlcohol] = useState("");
  const [sports, setSports] = useState("");
  const [medications, setMedications] = useState("");
  const [generalPractitioner, setGeneralPractitioner] = useState("");
  const [gynecologist, setGynecologist] = useState("");
  const [childrenCount, setChildrenCount] = useState("");
  const [birthType1, setBirthType1] = useState("");
  const [birthType2, setBirthType2] = useState("");

  // Step 4: Contact Preference
  const [contactPreference, setContactPreference] = useState("");

  // Step 5: Terms acceptance
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Patient info for confirmation
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");

  // Auto-save refs
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isSavingRef = useRef<boolean>(false);

  // Auto-save function that saves all current form data
  const autoSaveData = useCallback(async () => {
    if (!submissionId || !patientId || isSavingRef.current) return;
    
    isSavingRef.current = true;
    try {
      // Save personal info
      const dob = dobYear && dobMonth && dobDay 
        ? `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`
        : null;

      await supabaseClient.from("patients").update({
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: email || undefined,
        phone: mobile || undefined,
        dob: dob,
        street_address: streetAddress || null,
        postal_code: postalCode || null,
        town: town || null,
        nationality: nationality || null,
        marital_status: maritalStatus || null,
        profession: profession || null,
        current_employer: currentEmployer || null,
      }).eq("id", patientId);

      // Save insurance if any data exists
      if (insuranceProvider || insuranceCardNumber || insuranceType) {
        const { data: existingIns } = await supabaseClient
          .from("patient_insurances")
          .select("id")
          .eq("patient_id", patientId)
          .maybeSingle();

        const insData = {
          patient_id: patientId,
          provider_name: insuranceProvider || null,
          card_number: insuranceCardNumber || null,
          insurance_type: insuranceType || null,
        };

        if (existingIns?.id) {
          await supabaseClient.from("patient_insurances").update(insData).eq("id", existingIns.id);
        } else {
          await supabaseClient.from("patient_insurances").insert(insData);
        }
      }

      // Save health background if any data exists
      if (weight || height || knownIllnesses || previousSurgeries || allergies) {
        // Helper to normalize height - auto-convert if user enters meters instead of cm
        const normalizeHeightForAutoSave = (h: string): number | null => {
          const val = parseFloat(h);
          if (isNaN(val) || val <= 0) return null;
          if (val < 3) return Math.round(val * 100);
          if (val < 50) return Math.round(val * 100);
          return val;
        };
        
        const normalizedHeight = height ? normalizeHeightForAutoSave(height) : null;
        let bmi: string | null = null;
        if (weight && normalizedHeight) {
          const weightVal = parseFloat(weight);
          if (!isNaN(weightVal) && weightVal > 0 && normalizedHeight >= 50 && normalizedHeight <= 300) {
            const bmiVal = weightVal / Math.pow(normalizedHeight / 100, 2);
            if (bmiVal >= 10 && bmiVal <= 100) {
              bmi = bmiVal.toFixed(2);
            }
          }
        }
        
        const { data: existingHealth } = await supabaseClient
          .from("patient_health_background")
          .select("id")
          .eq("submission_id", submissionId)
          .maybeSingle();

        const healthData = {
          patient_id: patientId,
          submission_id: submissionId,
          weight_kg: weight ? parseFloat(weight) : null,
          height_cm: normalizedHeight,
          bmi: bmi ? parseFloat(bmi) : null,
          known_illnesses: knownIllnesses || null,
          previous_surgeries: previousSurgeries || null,
          allergies: allergies || null,
          cigarettes: cigarettes || null,
          alcohol_consumption: alcohol || null,
          sports_activity: sports || null,
          medications: medications || null,
          general_practitioner: generalPractitioner || null,
          gynecologist: gynecologist || null,
          children_count: childrenCount ? parseInt(childrenCount) : null,
          birth_type_1: birthType1 || null,
          birth_type_2: birthType2 || null,
        };

        if (existingHealth?.id) {
          await supabaseClient.from("patient_health_background").update(healthData).eq("id", existingHealth.id);
        } else {
          await supabaseClient.from("patient_health_background").insert(healthData);
        }
      }

      // Save contact preference
      if (contactPreference) {
        const { data: existingPrefs } = await supabaseClient
          .from("patient_intake_preferences")
          .select("id")
          .eq("submission_id", submissionId)
          .maybeSingle();

        const prefsData = {
          submission_id: submissionId,
          patient_id: patientId,
          preferred_contact_method: contactPreference,
        };

        if (existingPrefs?.id) {
          await supabaseClient.from("patient_intake_preferences").update(prefsData).eq("id", existingPrefs.id);
        } else {
          await supabaseClient.from("patient_intake_preferences").insert(prefsData);
        }
      }

      console.log("Auto-save completed successfully");
    } catch (err) {
      console.error("Auto-save error:", err);
    } finally {
      isSavingRef.current = false;
    }
  }, [submissionId, patientId, firstName, lastName, email, mobile, dobYear, dobMonth, dobDay,
      streetAddress, postalCode, town, nationality, maritalStatus, profession, currentEmployer,
      insuranceProvider, insuranceCardNumber, insuranceType, weight, height, knownIllnesses,
      previousSurgeries, allergies, cigarettes, alcohol, sports, medications, generalPractitioner,
      gynecologist, childrenCount, birthType1, birthType2, contactPreference]);

  // Set up auto-save on window close and idle timeout
  useEffect(() => {
    if (!submissionId || !patientId) return;

    // Handle beforeunload (window/tab close)
    const handleBeforeUnload = () => {
      autoSaveData();
    };

    // Reset idle timer on any user activity
    const resetIdleTimer = () => {
      lastActivityRef.current = Date.now();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      // Set new timer for 1 minute (60000ms)
      idleTimerRef.current = setTimeout(() => {
        autoSaveData();
      }, 60000);
    };

    // Add event listeners
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("mousemove", resetIdleTimer);
    window.addEventListener("keydown", resetIdleTimer);
    window.addEventListener("click", resetIdleTimer);
    window.addEventListener("scroll", resetIdleTimer);

    // Start initial idle timer
    resetIdleTimer();

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("mousemove", resetIdleTimer);
      window.removeEventListener("keydown", resetIdleTimer);
      window.removeEventListener("click", resetIdleTimer);
      window.removeEventListener("scroll", resetIdleTimer);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [submissionId, patientId, autoSaveData]);

  useEffect(() => {
    if (!submissionId || !patientId) {
      router.push("/intake");
    } else {
      const fetchExistingData = async () => {
        // Fetch patient data
        const { data: patientData } = await supabaseClient
          .from("patients")
          .select("*")
          .eq("id", patientId)
          .single();
        
        if (patientData) {
          setPatientName(`${patientData.first_name} ${patientData.last_name}`);
          setPatientEmail(patientData.email || "");
          setFirstName(patientData.first_name || "");
          setLastName(patientData.last_name || "");
          setEmail(patientData.email || "");
          setMobile(patientData.phone || "");
          setNationality(patientData.nationality || "");
          setMaritalStatus(patientData.marital_status || "");
          setStreetAddress(patientData.street_address || "");
          setPostalCode(patientData.postal_code || "");
          setTown(patientData.town || "");
          setProfession(patientData.profession || "");
          setCurrentEmployer(patientData.current_employer || "");
          
          // Parse DOB if exists
          if (patientData.dob) {
            const dobParts = patientData.dob.split("-");
            if (dobParts.length === 3) {
              setDobYear(dobParts[0]);
              setDobMonth(dobParts[1]);
              setDobDay(dobParts[2]);
            }
          }
        }

        // Fetch existing insurance data
        const { data: insuranceData } = await supabaseClient
          .from("patient_insurances")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (insuranceData) {
          setInsuranceProvider(insuranceData.provider_name || "");
          setInsuranceCardNumber(insuranceData.card_number || "");
          setInsuranceType(insuranceData.insurance_type || "");
        }

        // Fetch existing health background data
        const { data: healthData } = await supabaseClient
          .from("patient_health_background")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (healthData) {
          setWeight(healthData.weight_kg?.toString() || "");
          setHeight(healthData.height_cm?.toString() || "");
          setKnownIllnesses(healthData.known_illnesses || "");
          setPreviousSurgeries(healthData.previous_surgeries || "");
          setAllergies(healthData.allergies || "");
          setCigarettes(healthData.cigarettes || "");
          setAlcohol(healthData.alcohol_consumption || "");
          setSports(healthData.sports_activity || "");
          setMedications(healthData.medications || "");
          setGeneralPractitioner(healthData.general_practitioner || "");
          setGynecologist(healthData.gynecologist || "");
          setChildrenCount(healthData.children_count?.toString() || "");
          setBirthType1(healthData.birth_type_1 || "");
          setBirthType2(healthData.birth_type_2 || "");
        }

        // Fetch existing preferences data
        const { data: prefsData } = await supabaseClient
          .from("patient_intake_preferences")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (prefsData) {
          setContactPreference(prefsData.preferred_contact_method || "");
        }

        // Calculate completion percentage and check if data exists
        let filledFields = 0;
        let totalFields = 0;

        // Personal info fields (10 fields)
        const personalFields = [patientData?.first_name, patientData?.last_name, patientData?.email, 
          patientData?.phone, patientData?.dob, patientData?.street_address, 
          patientData?.postal_code, patientData?.town, patientData?.nationality, patientData?.marital_status];
        personalFields.forEach(f => { totalFields++; if (f) filledFields++; });

        // Insurance fields (3 fields)
        const insuranceFields = [insuranceData?.provider_name, insuranceData?.card_number, insuranceData?.insurance_type];
        insuranceFields.forEach(f => { totalFields++; if (f) filledFields++; });

        // Health fields (5 key fields)
        const healthFields = [healthData?.weight_kg, healthData?.height_cm, healthData?.known_illnesses, 
          healthData?.previous_surgeries, healthData?.allergies];
        healthFields.forEach(f => { totalFields++; if (f) filledFields++; });

        // Contact preference (1 field)
        totalFields++;
        if (prefsData?.preferred_contact_method) filledFields++;

        const completionPercent = Math.round((filledFields / totalFields) * 100);
        setDataCompletionPercent(completionPercent);

        // If we have meaningful data (at least name and email), go directly to edit mode
        if (patientData?.first_name && patientData?.email && completionPercent > 20) {
          setHasExistingData(true);
          setShowDataSummary(false);
          setShowIntro(false);
          setStep(1); // Go directly to edit information
        }
      };
      fetchExistingData();
    }
  }, [submissionId, patientId, router]);

  // Helper to normalize height - auto-convert if user enters meters instead of cm
  const normalizeHeight = (h: string): number | null => {
    const val = parseFloat(h);
    if (isNaN(val) || val <= 0) return null;
    // If value is less than 3, assume it's in meters and convert to cm
    if (val < 3) {
      return Math.round(val * 100);
    }
    // If value is between 3 and 50, it's likely still meters (e.g., 1.50 entered as 150 with decimal issue)
    // Valid height range is 50-300 cm
    if (val < 50) {
      return Math.round(val * 100);
    }
    return val;
  };

  // Validate height is in reasonable range (50-300 cm)
  const isValidHeight = (h: string): boolean => {
    const normalized = normalizeHeight(h);
    if (normalized === null) return false;
    return normalized >= 50 && normalized <= 300;
  };

  // Validate weight is in reasonable range (20-500 kg)
  const isValidWeight = (w: string): boolean => {
    const val = parseFloat(w);
    if (isNaN(val) || val <= 0) return false;
    return val >= 20 && val <= 500;
  };

  const calculateBMI = () => {
    if (weight && height) {
      const weightVal = parseFloat(weight);
      const heightCm = normalizeHeight(height);
      if (heightCm && !isNaN(weightVal) && weightVal > 0) {
        const bmi = weightVal / Math.pow(heightCm / 100, 2);
        // Sanity check - BMI should be between 10 and 100
        if (bmi >= 10 && bmi <= 100) {
          return bmi.toFixed(2);
        }
      }
    }
    return "";
  };

  const saveStepData = useCallback(async (currentStep: Step) => {
    if (!submissionId || !patientId) return;

    try {
      setLoading(true);
      setError(null);

      // Save personal information to patient record
      if (currentStep === 1) {
        // Validate required fields
        if (!firstName.trim()) {
          throw new Error("First name is required");
        }
        if (!lastName.trim()) {
          throw new Error("Last name is required");
        }
        if (!email.trim()) {
          throw new Error("Email is required");
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          throw new Error("Please enter a valid email address");
        }
        if (!mobile.trim()) {
          throw new Error("Mobile number is required");
        }

        const dob = dobYear && dobMonth && dobDay 
          ? `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`
          : null;

        const { error: patientError } = await supabaseClient
          .from("patients")
          .update({
            first_name: firstName,
            last_name: lastName,
            email: email,
            phone: mobile,
            dob: dob,
            street_address: streetAddress || null,
            postal_code: postalCode || null,
            town: town || null,
            nationality: nationality || null,
            marital_status: maritalStatus || null,
            profession: profession || null,
            current_employer: currentEmployer || null,
          })
          .eq("id", patientId);

        if (patientError) {
          throw new Error(`Failed to save personal information: ${patientError.message}`);
        }
      }

      // Save insurance information
      if (currentStep === 2) {
        const { data: existingInsurance } = await supabaseClient
          .from("patient_insurances")
          .select("id")
          .eq("patient_id", patientId)
          .maybeSingle();

        const insuranceData = {
          patient_id: patientId,
          provider_name: insuranceProvider,
          card_number: insuranceCardNumber,
          insurance_type: insuranceType,
        };

        let insuranceError;
        if (existingInsurance?.id) {
          const { error } = await supabaseClient.from("patient_insurances").update(insuranceData).eq("id", existingInsurance.id);
          insuranceError = error;
        } else {
          const { error } = await supabaseClient.from("patient_insurances").insert(insuranceData);
          insuranceError = error;
        }

        if (insuranceError) {
          throw new Error(`Failed to save insurance information: ${insuranceError.message}`);
        }
      }

      // Save health background
      if (currentStep === 3) {
        // Validate height and weight before saving
        if (height && !isValidHeight(height)) {
          throw new Error(`Invalid height value. Please enter your height in centimeters (e.g., 170 for 1.70m). Valid range: 50-300 cm.`);
        }
        if (weight && !isValidWeight(weight)) {
          throw new Error(`Invalid weight value. Please enter your weight in kilograms. Valid range: 20-500 kg.`);
        }

        const bmi = calculateBMI();
        const normalizedHeight = height ? normalizeHeight(height) : null;
        
        const { data: existingHealth } = await supabaseClient
          .from("patient_health_background")
          .select("id")
          .eq("submission_id", submissionId)
          .single();

        const healthData = {
          patient_id: patientId,
          submission_id: submissionId,
          weight_kg: weight ? parseFloat(weight) : null,
          height_cm: normalizedHeight,
          bmi: bmi ? parseFloat(bmi) : null,
          known_illnesses: knownIllnesses || null,
          previous_surgeries: previousSurgeries || null,
          allergies: allergies || null,
          cigarettes: cigarettes || null,
          alcohol_consumption: alcohol || null,
          sports_activity: sports || null,
          medications: medications || null,
          general_practitioner: generalPractitioner || null,
          gynecologist: gynecologist || null,
          children_count: childrenCount ? parseInt(childrenCount) : null,
          birth_type_1: birthType1 || null,
          birth_type_2: birthType2 || null,
        };

        let healthError;
        if (existingHealth?.id) {
          const { error } = await supabaseClient.from("patient_health_background").update(healthData).eq("id", existingHealth.id);
          healthError = error;
        } else {
          const { error } = await supabaseClient.from("patient_health_background").insert(healthData);
          healthError = error;
        }

        if (healthError) {
          throw new Error(`Failed to save health information: ${healthError.message}. Please contact support.`);
        }
      }

      // Save contact preference and preferred language
      if (currentStep === 4) {
        const { data: existingPrefs } = await supabaseClient
          .from("patient_intake_preferences")
          .select("id")
          .eq("submission_id", submissionId)
          .single();

        const prefsData = {
          submission_id: submissionId,
          patient_id: patientId,
          preferred_contact_method: contactPreference,
          preferred_language: language === "fr" ? "French" : "English",
        };

        let prefsError;
        if (existingPrefs?.id) {
          const { error } = await supabaseClient.from("patient_intake_preferences").update(prefsData).eq("id", existingPrefs.id);
          prefsError = error;
        } else {
          const { error } = await supabaseClient.from("patient_intake_preferences").insert(prefsData);
          prefsError = error;
        }

        if (prefsError) {
          throw new Error(`Failed to save contact preferences: ${prefsError.message}`);
        }
      }

      // Update submission progress
      const { error: progressError } = await supabaseClient
        .from("patient_intake_submissions")
        .update({ current_step: currentStep + 1 })
        .eq("id", submissionId);

      if (progressError) {
        throw new Error(`Failed to update progress: ${progressError.message}`);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save data. Please try again or contact support.";
      setError(errorMessage);
      console.error("Intake form save error:", err);
      
      // Send error notification email with form data for manual record creation
      try {
        const formData = {
          step: currentStep,
          error: errorMessage,
          submissionId,
          patientId,
          personalInfo: {
            firstName, lastName, email, mobile,
            dob: dobYear && dobMonth && dobDay ? `${dobYear}-${dobMonth}-${dobDay}` : null,
            maritalStatus, nationality, streetAddress, postalCode, town,
            profession, currentEmployer
          },
          insurance: { insuranceProvider, insuranceCardNumber, insuranceType },
          healthBackground: {
            weight, height, bmi: calculateBMI(),
            knownIllnesses, previousSurgeries, allergies,
            cigarettes, alcohol, sports, medications,
            generalPractitioner, gynecologist,
            childrenCount, birthType1, birthType2
          },
          contactPreference,
          timestamp: new Date().toISOString()
        };

        await fetch("/api/emails/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: "wilson@mutant.ae",
            subject: `[INTAKE FORM ERROR] Failed submission for ${firstName} ${lastName}`,
            html: `
              <h2>Intake Form Submission Failed</h2>
              <p><strong>Error:</strong> ${errorMessage}</p>
              <p><strong>Step:</strong> ${currentStep}</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              
              <h3>Patient Information</h3>
              <ul>
                <li><strong>Name:</strong> ${firstName} ${lastName}</li>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Phone:</strong> ${mobile}</li>
                <li><strong>DOB:</strong> ${formData.personalInfo.dob || "Not provided"}</li>
                <li><strong>Nationality:</strong> ${nationality || "Not provided"}</li>
                <li><strong>Address:</strong> ${streetAddress}, ${postalCode} ${town}</li>
                <li><strong>Marital Status:</strong> ${maritalStatus || "Not provided"}</li>
                <li><strong>Profession:</strong> ${profession || "Not provided"}</li>
                <li><strong>Employer:</strong> ${currentEmployer || "Not provided"}</li>
              </ul>
              
              <h3>Insurance Information</h3>
              <ul>
                <li><strong>Provider:</strong> ${insuranceProvider || "Not provided"}</li>
                <li><strong>Card Number:</strong> ${insuranceCardNumber || "Not provided"}</li>
                <li><strong>Type:</strong> ${insuranceType || "Not provided"}</li>
              </ul>
              
              <h3>Health Background</h3>
              <ul>
                <li><strong>Weight:</strong> ${weight || "Not provided"} kg</li>
                <li><strong>Height:</strong> ${height || "Not provided"} cm</li>
                <li><strong>BMI:</strong> ${formData.healthBackground.bmi || "Not calculated"}</li>
                <li><strong>Known Illnesses:</strong> ${knownIllnesses || "Not provided"}</li>
                <li><strong>Previous Surgeries:</strong> ${previousSurgeries || "Not provided"}</li>
                <li><strong>Allergies:</strong> ${allergies || "Not provided"}</li>
                <li><strong>Cigarettes:</strong> ${cigarettes || "Not provided"}</li>
                <li><strong>Alcohol:</strong> ${alcohol || "Not provided"}</li>
                <li><strong>Sports:</strong> ${sports || "Not provided"}</li>
                <li><strong>Medications:</strong> ${medications || "Not provided"}</li>
                <li><strong>GP:</strong> ${generalPractitioner || "Not provided"}</li>
                <li><strong>Gynecologist:</strong> ${gynecologist || "Not provided"}</li>
                <li><strong>Children:</strong> ${childrenCount || "0"}</li>
              </ul>
              
              <h3>Contact Preference</h3>
              <p>${contactPreference || "Not provided"}</p>
              
              <h3>System IDs</h3>
              <ul>
                <li><strong>Patient ID:</strong> ${patientId}</li>
                <li><strong>Submission ID:</strong> ${submissionId}</li>
              </ul>
              
              <hr>
              <p><em>This email was automatically sent because the intake form failed to save data. Please create the record manually if needed.</em></p>
            `
          })
        });
        console.log("Error notification email sent to wilson@mutant.ae");
      } catch (emailErr) {
        console.error("Failed to send error notification email:", emailErr);
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [submissionId, patientId, firstName, lastName, dobDay, dobMonth, dobYear, maritalStatus, nationality, streetAddress, postalCode, town, email, mobile, profession, currentEmployer, insuranceProvider, insuranceCardNumber, insuranceType, weight, height, knownIllnesses, previousSurgeries, allergies, cigarettes, alcohol, sports, medications, generalPractitioner, gynecologist, childrenCount, birthType1, birthType2, contactPreference, calculateBMI]);

  const handleNext = async () => {
    try {
      await saveStepData(step);
      // Navigate to next step based on current step
      if (step < 5) {
        setStep((prev) => (prev + 1) as Step);
      }
    } catch {
      // Error already handled in saveStepData
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as Step);
    }
  };

  const handleAcceptTerms = async () => {
    try {
      setLoading(true);

      // Mark submission as completed
      await supabaseClient
        .from("patient_intake_submissions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      // Update patient record
      await supabaseClient
        .from("patients")
        .update({
          intake_submission_id: submissionId,
          intake_completed_at: new Date().toISOString(),
        })
        .eq("id", patientId);

      // Push GTM event for form submission
      pushToDataLayer("aliice_form_submit");
      
      setShowConfirmation(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete");
    } finally {
      setLoading(false);
    }
  };

  // Language selector component
  const LanguageSelector = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setLanguage("en")}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          language === "en"
            ? "bg-slate-800 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("fr")}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          language === "fr"
            ? "bg-slate-800 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        FR
      </button>
    </div>
  );

  // User icon component
  const UserIcon = () => (
    <div className="flex justify-center mb-6">
      <svg className="w-16 h-16 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </div>
  );

  // Confirmation page
  if (showConfirmation) {
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
          <button 
            onClick={() => router.push("/")}
            className="text-slate-400 hover:text-slate-600 p-2"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8">
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl sm:text-3xl font-light text-slate-800 mb-2">
              We're so Glad to Have you at
            </h1>
            <h2 className="text-2xl sm:text-3xl font-medium text-amber-600 mb-8">
              Aliice Aesthetics Team!
            </h2>

            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <h3 className="text-lg font-medium text-amber-600 mb-2">Thank you for Registering!</h3>
              <p className="text-sm text-amber-600 mb-4">
                Your registration has been submitted successfully. Our team will contact you shortly to discuss the next steps.
              </p>
              <div className="space-y-2 text-sm">
                <p><span className="font-semibold text-slate-700">Name:</span> <span className="text-amber-600">{patientName}</span></p>
                <p><span className="font-semibold text-slate-700">Email:</span> <span className="text-amber-600">{patientEmail}</span></p>
              </div>
            </div>

            <div className="text-center">
              <p className="text-lg italic text-amber-600 mb-4">Have any questions<br />in mind?</p>
              <div className="flex items-center justify-center gap-2 text-slate-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                <span className="text-sm">info@aesthetics-ge.ch</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // How it Works intro page
  if (showIntro) {
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
          <button className="text-slate-400 hover:text-slate-600 p-2">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="absolute top-4 right-16">
          <LanguageSelector />
        </div>

        <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-6 sm:py-12">
          <div className="w-full max-w-lg">
            <h1 className="text-2xl sm:text-3xl font-light text-black text-center mb-8 sm:mb-10 italic">{t.howItWorks}</h1>

            <div className="space-y-5 sm:space-y-6 text-left mb-8 sm:mb-10">
              {t.stepInfo.map((s) => (
                <div key={s.num} className="flex gap-3 sm:gap-4">
                  <span className="text-xl sm:text-2xl font-light text-slate-800 w-6 sm:w-8 flex-shrink-0">{s.num}</span>
                  <p className="text-slate-600 text-sm pt-0.5">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => setShowIntro(false)}
                className="px-10 sm:px-12 py-3 rounded-full bg-slate-200 text-slate-600 font-medium hover:bg-slate-300 transition-colors"
              >
                {t.continue.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Terms and Conditions step (Step 0 - FIRST before any data entry)
  if (step === 0) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
        <header className="px-4 sm:px-6 py-4 flex items-center justify-end">
          <LanguageSelector />
        </header>

        <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-6">
          <div className="w-full max-w-md">
            <UserIcon />

            <div className="text-slate-600 text-sm leading-relaxed mb-8">
              <p className="mb-4">
                {t.termsText}
              </p>
              <p>
                {t.termsAcceptText}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={() => {
                setTermsAccepted(true);
                setStep(1);
              }}
              className="w-full py-3 rounded-full border-2 border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors"
            >
              {t.accept}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Thank You + Consultation Category Selection (Step 5)
  if (step === 5) {
    const handleCompleteIntake = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Mark submission as completed
        await supabaseClient
          .from("patient_intake_submissions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            terms_accepted: true,
            terms_accepted_at: new Date().toISOString(),
          })
          .eq("id", submissionId);

        // Update patient record
        await supabaseClient
          .from("patients")
          .update({
            intake_submission_id: submissionId,
            intake_completed_at: new Date().toISOString(),
          })
          .eq("id", patientId);

        // Show confirmation
        setShowConfirmation(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setLoading(false);
      }
    };

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
          <LanguageSelector />
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6">
          <div className="w-full max-w-md text-center">
            {/* Success Icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Thank You Message */}
            <h2 className="text-2xl sm:text-3xl font-medium text-slate-800 mb-3">
              {language === "fr" ? "Merci!" : "Thank You!"}
            </h2>
            <p className="text-slate-600 mb-2">
              {t.hi} <span className="font-semibold text-amber-600">{firstName || patientName}</span>
            </p>
            <p className="text-slate-600 text-lg mb-8">
              {language === "fr" 
                ? "Votre formulaire a été soumis avec succès. Un de nos assistants vous contactera sous peu."
                : "Your form has been submitted successfully. One of our assistants will get in touch with you shortly."}
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleCompleteIntake}
              disabled={loading}
              className="w-full py-3 rounded-full bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {loading ? t.processing : (language === "fr" ? "Terminer" : "Complete")}
            </button>

            {/* Contact Info */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <p className="text-sm text-slate-500 mb-2">
                {language === "fr" ? "Des questions?" : "Have any questions?"}
              </p>
              <div className="flex items-center justify-center gap-2 text-slate-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                <span className="text-sm">info@aesthetics-ge.ch</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Contact Preference step (Step 4)
  if (step === 4) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
        <header className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <Image
            src="/logos/aesthetics-logo.svg"
            alt="Aesthetics Clinic"
            width={60}
            height={60}
            className="h-10 w-auto"
          />
          <LanguageSelector />
        </header>
        <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-6">
          <div className="w-full max-w-md">
            <UserIcon />

            <p className="text-slate-600 text-sm mb-6 italic">{t.contactPrefTitle}</p>

            <div className="mb-6">
              <label className="block text-[#1a4d7c] text-sm font-medium mb-3">
                {t.contactPrefQuestion} <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                {[
                  { value: "email", label: t.contactOptions.email },
                  { value: "phone", label: t.contactOptions.phone },
                  { value: "text", label: t.contactOptions.text },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setContactPreference(option.value)}
                    className={`w-full py-3 px-4 rounded-full border text-center transition-colors ${
                      contactPreference === option.value
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preferred Language Selection */}
            <div className="mb-6">
              <label className="block text-[#1a4d7c] text-sm font-medium mb-3">
                {t.preferredLanguage} <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                {[
                  { value: "en", label: t.english },
                  { value: "fr", label: t.french },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLanguage(option.value as Language)}
                    className={`w-full py-3 px-4 rounded-full border text-center transition-colors ${
                      language === option.value
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                {error}
              </div>
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
              disabled={loading || !contactPreference}
              className="px-8 py-3 rounded-full bg-slate-200 text-slate-600 font-medium hover:bg-slate-300 transition-colors disabled:opacity-50"
            >
              {loading ? t.saving : t.next}
            </button>
          </div>
        </footer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
      <header className="px-4 sm:px-6 py-3 flex items-center justify-between">
        <Image
          src="/logos/aesthetics-logo.svg"
          alt="Aesthetics Clinic"
          width={60}
          height={60}
          className="h-10 w-auto"
        />
        <LanguageSelector />
      </header>

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-md mx-auto">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Step 1: Personal Information */}
          {step === 1 && (
            <div className="space-y-4">
              <UserIcon />
              <p className="text-slate-600 text-sm mb-4">{t.personalInfoTitle}</p>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.firstName} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t.firstName}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.lastName} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder={t.lastName}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">{t.dateOfBirth}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={dobDay}
                    onChange={(e) => setDobDay(e.target.value)}
                    placeholder="DD"
                    maxLength={2}
                    className="w-20 px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none text-center"
                  />
                  <span className="flex items-center text-slate-400">/</span>
                  <select
                    value={dobMonth}
                    onChange={(e) => setDobMonth(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-full border border-slate-300 bg-white text-black focus:border-slate-500 focus:outline-none"
                  >
                    <option value="">MM</option>
                    {t.months.map((month, idx) => (
                      <option key={month} value={String(idx + 1).padStart(2, '0')}>{month}</option>
                    ))}
                  </select>
                  <span className="flex items-center text-slate-400">/</span>
                  <input
                    type="text"
                    value={dobYear}
                    onChange={(e) => setDobYear(e.target.value)}
                    placeholder="YYYY"
                    maxLength={4}
                    className="w-24 px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">{t.maritalStatus}</label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black focus:border-slate-500 focus:outline-none"
                >
                  <option value="">{t.maritalStatus}</option>
                  {t.maritalStatuses.map((status, idx) => (
                    <option key={status} value={MARITAL_STATUSES[idx]}>{status}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.nationality} <span className="text-red-500">*</span>
                </label>
                <select
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black focus:border-slate-500 focus:outline-none"
                >
                  <option value="">{t.nationality}</option>
                  {t.nationalities.map((nat, idx) => (
                    <option key={nat} value={NATIONALITIES[idx]}>{nat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.streetAddress} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder={t.streetAddress}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.postalCode} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder={t.postalCode}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.town} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={town}
                  onChange={(e) => setTown(e.target.value)}
                  placeholder={t.town}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.email} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.email}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.mobile} <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder={t.mobile}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.profession} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder={t.profession}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.currentEmployer} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={currentEmployer}
                  onChange={(e) => setCurrentEmployer(e.target.value)}
                  placeholder={t.currentEmployer}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Step 2: Insurance Information */}
          {step === 2 && (
            <div className="space-y-4">
              <UserIcon />
              <p className="text-slate-600 text-sm mb-4">{t.insuranceInfoTitle}</p>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.insuranceProvider} <span className="text-red-500">*</span>
                </label>
                <InsurerSearchSelect
                  value={insurerGln}
                  onChange={(gln, name) => {
                    setInsurerGln(gln);
                    setInsuranceProvider(name || "");
                  }}
                  placeholder={t.insuranceProvider}
                  inputClassName="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.insuranceCardNumber} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={insuranceCardNumber}
                  onChange={(e) => setInsuranceCardNumber(e.target.value)}
                  placeholder={t.insuranceCardNumber}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.insuranceType} <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {[
                    { value: "private", label: t.insuranceTypes.private },
                    { value: "semi-private", label: t.insuranceTypes.semiPrivate },
                    { value: "basic", label: t.insuranceTypes.basic }
                  ].map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setInsuranceType(type.value)}
                      className={`w-full py-3 px-4 rounded-full border text-center transition-colors ${
                        insuranceType === type.value
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Health Background & Lifestyle */}
          {step === 3 && (
            <div className="space-y-4">
              <UserIcon />
              <p className="text-slate-600 text-sm mb-4">{t.healthInfoTitle}</p>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.weight} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder={t.weight}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.height} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder={`${t.height} (e.g., 170 for 170cm or 1.7 for meters)`}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Enter in cm (e.g., 170) or meters (e.g., 1.70)</p>
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">{t.bmi} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={calculateBMI()}
                  readOnly
                  placeholder={t.autoCalculated}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-slate-100 text-black placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.knownIllnesses} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={knownIllnesses}
                  onChange={(e) => setKnownIllnesses(e.target.value)}
                  placeholder={t.knownIllnesses}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.previousSurgeries} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={previousSurgeries}
                  onChange={(e) => setPreviousSurgeries(e.target.value)}
                  placeholder={t.previousSurgeries}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.allergies} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder={t.allergies}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.cigarettes} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={cigarettes}
                  onChange={(e) => setCigarettes(e.target.value)}
                  placeholder={t.cigarettesPlaceholder}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.alcohol} <span className="text-red-500">*</span>
                </label>
                <select
                  value={alcohol}
                  onChange={(e) => setAlcohol(e.target.value)}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black focus:border-slate-500 focus:outline-none"
                >
                  <option value="">{t.selectFrequency}</option>
                  {t.frequencyOptions.map((opt, idx) => (
                    <option key={opt} value={ALCOHOL_OPTIONS[idx]}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.sports} <span className="text-red-500">*</span>
                </label>
                <select
                  value={sports}
                  onChange={(e) => setSports(e.target.value)}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black focus:border-slate-500 focus:outline-none"
                >
                  <option value="">{t.selectFrequency}</option>
                  {t.frequencyOptions.map((opt, idx) => (
                    <option key={opt} value={SPORTS_OPTIONS[idx]}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.medications} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={medications}
                  onChange={(e) => setMedications(e.target.value)}
                  placeholder={t.currentMedications}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">
                  {t.generalPractitioner} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={generalPractitioner}
                  onChange={(e) => setGeneralPractitioner(e.target.value)}
                  placeholder={t.doctorName}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">{t.gynecologist}</label>
                <input
                  type="text"
                  value={gynecologist}
                  onChange={(e) => setGynecologist(e.target.value)}
                  placeholder={t.doctorName}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1a4d7c] text-sm font-medium mb-1">{t.haveChildren}</label>
                <input
                  type="number"
                  value={childrenCount}
                  onChange={(e) => setChildrenCount(e.target.value)}
                  placeholder={t.numberOfChildren}
                  className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              </div>

              {parseInt(childrenCount) >= 1 && (
                <div>
                  <label className="block text-[#1a4d7c] text-sm font-medium mb-1">{t.birthType1}</label>
                  <select
                    value={birthType1}
                    onChange={(e) => setBirthType1(e.target.value)}
                    className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black focus:border-slate-500 focus:outline-none"
                  >
                    <option value="">{t.selectType}</option>
                    {t.birthTypes.map((type, idx) => (
                      <option key={type} value={BIRTH_TYPES[idx]}>{type}</option>
                    ))}
                  </select>
                </div>
              )}

              {parseInt(childrenCount) >= 2 && (
                <div>
                  <label className="block text-[#1a4d7c] text-sm font-medium mb-1">{t.birthType2}</label>
                  <select
                    value={birthType2}
                    onChange={(e) => setBirthType2(e.target.value)}
                    className="w-full px-4 py-3 rounded-full border border-slate-300 bg-white text-black focus:border-slate-500 focus:outline-none"
                  >
                    <option value="">{t.selectType}</option>
                    {t.birthTypes.map((type, idx) => (
                      <option key={type} value={BIRTH_TYPES[idx]}>{type}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer with navigation */}
      <footer className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 sm:px-6 py-4">
        <div className="max-w-md mx-auto flex justify-center items-center gap-4">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="p-3 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-30"
          >
            <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNext}
            disabled={loading}
            className="px-8 py-3 rounded-full bg-slate-200 text-slate-600 font-medium hover:bg-slate-300 transition-colors disabled:opacity-50"
          >
            {loading ? t.saving : t.next}
          </button>
        </div>
      </footer>
    </main>
  );
}

export default function IntakeStepsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    }>
      <IntakeStepsContent />
    </Suspense>
  );
}
