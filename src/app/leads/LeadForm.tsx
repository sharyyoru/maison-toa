"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import InsurerSearchSelect from "@/components/InsurerSearchSelect";

type Language = "en" | "fr";

type Step =
  | "search"
  | "register"
  | "how"
  | "personal"
  | "insurance"
  | "health"
  | "contact"
  | "consent"
  | "thankyou";

const translations: Record<Language, {
  brandTitle: string;
  searchTitle: string;
  searchEmailLabel: string;
  searchButton: string;
  searchNoAccount: string;
  searchRegisterLink: string;
  registerTitle: string;
  registerFirstName: string;
  registerLastName: string;
  registerMobile: string;
  registerEmail: string;
  registerButton: string;
  registerHaveAccount: string;
  registerLoginLink: string;
  howTitle: string;
  howButton: string;
  personalTitle: string;
  personalIntro: string;
  personalFirstName: string;
  personalLastName: string;
  personalDob: string;
  personalDobDay: string;
  personalDobMonth: string;
  personalDobYear: string;
  personalMaritalStatus: string;
  personalNationality: string;
  personalStreetAddress: string;
  personalPostalCode: string;
  personalTown: string;
  personalEmail: string;
  personalMobile: string;
  personalProfession: string;
  personalEmployer: string;
  insuranceTitle: string;
  insuranceIntro: string;
  insuranceProvider: string;
  insuranceCardNumber: string;
  insuranceType: string;
  insuranceTypePrivate: string;
  insuranceTypeSemiPrivate: string;
  insuranceTypeBasic: string;
  healthTitle: string;
  healthIntro: string;
  healthWeight: string;
  healthHeight: string;
  healthBmi: string;
  healthIllnesses: string;
  healthSurgeries: string;
  healthAllergies: string;
  healthCigarettes: string;
  healthAlcohol: string;
  healthAlcoholSelect: string;
  healthSports: string;
  healthSportsSelect: string;
  healthMedications: string;
  healthGp: string;
  healthGynecologist: string;
  healthChildren: string;
  contactTitle: string;
  contactIntro: string;
  contactEmail: string;
  contactPhone: string;
  contactSms: string;
  consentTitle: string;
  consentText: string;
  consentAccept: string;
  thankYouTitle: string;
  thankYouBody: string;
  back: string;
  next: string;
  continue: string;
  languageLabel: string;
  requiredError: string;
  submitErrorGeneric: string;
}> = {
  en: {
    brandTitle: "Aesthetics Clinic",
    searchTitle: "Search",
    searchEmailLabel: "Email",
    searchButton: "Search",
    searchNoAccount: "Don't have an account?",
    searchRegisterLink: "Register",
    registerTitle: "Register",
    registerFirstName: "First Name",
    registerLastName: "Last Name",
    registerMobile: "Mobile",
    registerEmail: "Email",
    registerButton: "Register",
    registerHaveAccount: "Already have an account?",
    registerLoginLink: "Login",
    howTitle: "How it Works",
    howButton: "Continue",
    personalTitle: "Please enter your personal information",
    personalIntro: "Fields marked with * are required.",
    personalFirstName: "First Name",
    personalLastName: "Last Name",
    personalDob: "Date of Birth",
    personalDobDay: "DD",
    personalDobMonth: "MM",
    personalDobYear: "YYYY",
    personalMaritalStatus: "Marital Status",
    personalNationality: "Nationality",
    personalStreetAddress: "Street Address",
    personalPostalCode: "Postal Code",
    personalTown: "Town",
    personalEmail: "Email",
    personalMobile: "Mobile",
    personalProfession: "Profession",
    personalEmployer: "Current Employer",
    insuranceTitle: "Please enter your insurance information",
    insuranceIntro: "",
    insuranceProvider: "Name of Insurance Provider",
    insuranceCardNumber: "Insurance Card Number",
    insuranceType: "Type of Insurance",
    insuranceTypePrivate: "PRIVATE",
    insuranceTypeSemiPrivate: "SEMI-PRIVATE",
    insuranceTypeBasic: "BASIC",
    healthTitle: "Please enter your health background & lifestyle information",
    healthIntro: "",
    healthWeight: "Indicate Weight in (kilograms)",
    healthHeight: "Indicate Height in (cm)",
    healthBmi: "BMI",
    healthIllnesses: "Known illnesses (separate multiple with commas, write n/a if none)",
    healthSurgeries: "Previous surgeries (indicate n/a if none)",
    healthAllergies: "Allergies (indicate n/a if none)",
    healthCigarettes: "Cigarettes (indicate n/a if none)",
    healthAlcohol: "Alcohol",
    healthAlcoholSelect: "Select an option",
    healthSports: "Sports",
    healthSportsSelect: "Select an option",
    healthMedications: "Medications (separate multiple with commas, write n/a if none)",
    healthGp: "General Practitioner",
    healthGynecologist: "Gynecologist",
    healthChildren: "Do you have children?",
    contactTitle: "Just a few more things",
    contactIntro: "Where do you prefer to be contacted?",
    contactEmail: "Through Email",
    contactPhone: "Through phone call",
    contactSms: "Text message",
    consentTitle: "Consent",
    consentText:
      "I, the undersigned, certify that the information provided is truthful, and I am not subject to any lawsuits, nor any act of default, assuming all responsibility for any inaccuracies. Furthermore, I have been informed that the 1st consultation is paid on the spot. I also authorize my doctor, in the event that I do not pay my bills, to inform the authorities of the nature of my debts and to proceed to their recovery by legal means. For any dispute, the legal executive is in Geneva. By clicking 'I accept', you accept and agree to the terms and conditions above.",
    consentAccept: "ACCEPT",
    thankYouTitle: "Thank you",
    thankYouBody:
      "Your information has been submitted successfully. Our team will review your details and contact you shortly to discuss the next steps.",
    back: "Back",
    next: "Next",
    continue: "Continue",
    languageLabel: "Language",
    requiredError: "Please fill in all required fields.",
    submitErrorGeneric: "Unexpected error submitting the form. Please try again.",
  },
  fr: {
    brandTitle: "Aesthetics Clinic",
    searchTitle: "Rechercher",
    searchEmailLabel: "Email",
    searchButton: "Rechercher",
    searchNoAccount: "Vous n'avez pas de compte ?",
    searchRegisterLink: "Inscription",
    registerTitle: "Inscription",
    registerFirstName: "Prénom",
    registerLastName: "Nom",
    registerMobile: "Mobile",
    registerEmail: "Email",
    registerButton: "S'inscrire",
    registerHaveAccount: "Vous avez déjà un compte ?",
    registerLoginLink: "Connexion",
    howTitle: "Comment ça marche",
    howButton: "Continuer",
    personalTitle: "Veuillez saisir vos informations personnelles",
    personalIntro: "Les champs marqués d'un * sont obligatoires.",
    personalFirstName: "Prénom",
    personalLastName: "Nom",
    personalDob: "Date de naissance",
    personalDobDay: "JJ",
    personalDobMonth: "MM",
    personalDobYear: "AAAA",
    personalMaritalStatus: "État civil",
    personalNationality: "Nationalité",
    personalStreetAddress: "Adresse",
    personalPostalCode: "Code postal",
    personalTown: "Ville",
    personalEmail: "Email",
    personalMobile: "Mobile",
    personalProfession: "Profession",
    personalEmployer: "Employeur actuel",
    insuranceTitle: "Veuillez saisir vos informations d'assurance",
    insuranceIntro: "",
    insuranceProvider: "Nom de l'assureur",
    insuranceCardNumber: "Numéro de carte d'assurance",
    insuranceType: "Type d'assurance",
    insuranceTypePrivate: "PRIVÉE",
    insuranceTypeSemiPrivate: "SEMI-PRIVÉE",
    insuranceTypeBasic: "BASIQUE",
    healthTitle: "Veuillez saisir vos informations médicales et de style de vie",
    healthIntro: "",
    healthWeight: "Indiquez le poids (en kilogrammes)",
    healthHeight: "Indiquez la taille (en cm)",
    healthBmi: "IMC",
    healthIllnesses:
      "Maladies connues (séparez par des virgules, écrivez n/a s'il n'y en a pas)",
    healthSurgeries:
      "Opérations antérieures (indiquez n/a s'il n'y en a pas)",
    healthAllergies: "Allergies (indiquez n/a s'il n'y en a pas)",
    healthCigarettes: "Cigarettes (indiquez n/a s'il n'y en a pas)",
    healthAlcohol: "Alcool",
    healthAlcoholSelect: "Sélectionnez une option",
    healthSports: "Sport",
    healthSportsSelect: "Sélectionnez une option",
    healthMedications:
      "Médicaments (séparez par des virgules, écrivez n/a s'il n'y en a pas)",
    healthGp: "Médecin traitant",
    healthGynecologist: "Gynécologue",
    healthChildren: "Avez-vous des enfants ?",
    contactTitle: "Encore quelques questions",
    contactIntro: "Comment préférez-vous être contacté(e) ?",
    contactEmail: "Par email",
    contactPhone: "Par appel téléphonique",
    contactSms: "Par message texte",
    consentTitle: "Consentement",
    consentText:
      "Je soussigné(e) certifie que les informations fournies sont exactes et que je ne fais l'objet d'aucune poursuite ni d'aucun défaut de paiement, en assumant toute responsabilité en cas d'inexactitude. J'ai été informé(e) que la première consultation est payante. J'autorise également mon médecin, en cas de non-paiement de mes factures, à informer les autorités compétentes de la nature de mes dettes et à entreprendre les démarches légales nécessaires à leur recouvrement. Pour tout litige, le for juridique est à Genève. En cliquant sur 'J'accepte', vous acceptez les termes et conditions ci-dessus.",
    consentAccept: "J'ACCEPTE",
    thankYouTitle: "Merci",
    thankYouBody:
      "Vos informations ont été envoyées avec succès. Notre équipe les analysera et vous contactera prochainement pour discuter des prochaines étapes.",
    back: "Retour",
    next: "Suivant",
    continue: "Continuer",
    languageLabel: "Langue",
    requiredError: "Veuillez remplir tous les champs obligatoires.",
    submitErrorGeneric:
      "Erreur inattendue lors de l'envoi du formulaire. Veuillez réessayer.",
  },
};

function classNames(...values: (string | null | undefined | false)[]) {
  return values.filter(Boolean).join(" ");
}

export default function LeadForm() {
  const [language, setLanguage] = useState<Language>("en");
  const [step, setStep] = useState<Step>("search");

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [countryCode, setCountryCode] = useState("+41");
  const [phone, setPhone] = useState("");

  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [nationality, setNationality] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [town, setTown] = useState("");
  const [profession, setProfession] = useState("");
  const [employer, setEmployer] = useState("");

  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [insurerGln, setInsurerGln] = useState("");
  const [insuranceCardNumber, setInsuranceCardNumber] = useState("");
  const [insuranceType, setInsuranceType] = useState<
    "private" | "semi_private" | "basic" | ""
  >("private");

  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [bmi, setBmi] = useState("");
  const [illnesses, setIllnesses] = useState("");
  const [surgeries, setSurgeries] = useState("");
  const [allergies, setAllergies] = useState("");
  const [cigarettes, setCigarettes] = useState("");
  const [alcohol, setAlcohol] = useState("");
  const [sports, setSports] = useState("");
  const [medications, setMedications] = useState("");
  const [gp, setGp] = useState("");
  const [gynecologist, setGynecologist] = useState("");
  const [children, setChildren] = useState("");

  const [contactPreference, setContactPreference] = useState<
    "email" | "phone" | "sms" | ""
  >("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const t = translations[language];

  const dobIso = useMemo(() => {
    if (!dobDay || !dobMonth || !dobYear) return null;
    const day = dobDay.padStart(2, "0");
    const month = dobMonth.padStart(2, "0");
    if (dobYear.length !== 4) return null;
    return `${dobYear}-${month}-${day}`;
  }, [dobDay, dobMonth, dobYear]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError(t.requiredError);
      return;
    }
    setError(null);
    setStep("register");
  }

  function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError(t.requiredError);
      return;
    }
    setError(null);
    setStep("how");
  }

  function goNext(target: Step) {
    setError(null);
    setStep(target);
  }

  async function handleSubmitLead() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError(t.requiredError);
      return;
    }

    if (!nationality.trim() || !streetAddress.trim() || !postalCode.trim() || !town.trim() || !profession.trim() || !employer.trim()) {
      setError(t.requiredError);
      setStep("personal");
      return;
    }

    if (insuranceProvider.trim() && (!insuranceCardNumber.trim() || !insuranceType)) {
      setError(t.requiredError);
      setStep("insurance");
      return;
    }

    if (!contactPreference) {
      setError(t.requiredError);
      setStep("contact");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/leads/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneCountryCode: countryCode.trim(),
          phoneNumber: phone.trim(),
          personal: {
            dob: dobIso,
            maritalStatus: maritalStatus || null,
            nationality: nationality.trim(),
            streetAddress: streetAddress.trim(),
            postalCode: postalCode.trim(),
            town: town.trim(),
            profession: profession.trim(),
            currentEmployer: employer.trim(),
          },
          insurance: insuranceProvider.trim()
            ? {
                providerName: insuranceProvider.trim(),
                cardNumber: insuranceCardNumber.trim(),
                type: insuranceType || null,
              }
            : null,
          health: {
            weight: weight || null,
            height: height || null,
            bmi: bmi || null,
            illnesses: illnesses || null,
            surgeries: surgeries || null,
            allergies: allergies || null,
            cigarettes: cigarettes || null,
            alcohol: alcohol || null,
            sports: sports || null,
            medications: medications || null,
            generalPractitioner: gp || null,
            gynecologist: gynecologist || null,
            children: children || null,
          },
          contactPreference,
          consentAccepted: true,
        }),
      });

      if (!response.ok) {
        try {
          const json = (await response.json()) as { error?: string };
          setError(json.error || t.submitErrorGeneric);
        } catch {
          setError(t.submitErrorGeneric);
        }
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      setStep("thankyou");
    } catch {
      setError(t.submitErrorGeneric);
      setSubmitting(false);
    }
  }

  function renderCircleButton(label: string, onClick: () => void, disabled = false) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={classNames(
          "relative mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-[0_18px_45px_rgba(15,23,42,0.16)] transition",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {label}
      </button>
    );
  }

  function renderSearchStep() {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <h2 className="text-xl font-semibold text-slate-900">{t.searchTitle}</h2>
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="space-y-1 text-left">
            <label className="block text-xs font-medium text-slate-700" htmlFor="search-email">
              {t.searchEmailLabel}
            </label>
            <input
              id="search-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          {renderCircleButton(t.searchButton, () => handleSearchSubmit({
            preventDefault() {},
          } as FormEvent<HTMLFormElement>))}
        </form>
        <p className="text-xs text-slate-500">
          {t.searchNoAccount}{" "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep("register");
            }}
            className="font-semibold text-sky-600 hover:text-sky-700"
          >
            {t.searchRegisterLink}
          </button>
        </p>
      </div>
    );
  }

  function renderRegisterStep() {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <h2 className="text-xl font-semibold text-slate-900">{t.registerTitle}</h2>
        <form onSubmit={handleRegisterSubmit} className="space-y-3 text-left">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="reg-first-name">
              {t.registerFirstName} <span className="text-red-500">*</span>
            </label>
            <input
              id="reg-first-name"
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="reg-last-name">
              {t.registerLastName} <span className="text-red-500">*</span>
            </label>
            <input
              id="reg-last-name"
              type="text"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700" htmlFor="reg-country-code">
                +
              </label>
              <select
                id="reg-country-code"
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
                className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="+41">+41 (Switzerland)</option>
                <option value="+33">+33 (France)</option>
                <option value="+44">+44 (UK)</option>
                <option value="+49">+49 (Germany)</option>
                <option value="+39">+39 (Italy)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700" htmlFor="reg-phone">
                {t.registerMobile} <span className="text-red-500">*</span>
              </label>
              <input
                id="reg-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="reg-email">
              {t.registerEmail} <span className="text-red-500">*</span>
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          {renderCircleButton(t.registerButton, () => handleRegisterSubmit({
            preventDefault() {},
          } as FormEvent<HTMLFormElement>))}
        </form>
        <p className="text-xs text-slate-500">
          {t.registerHaveAccount}{" "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep("search");
            }}
            className="font-semibold text-sky-600 hover:text-sky-700"
          >
            {t.registerLoginLink}
          </button>
        </p>
      </div>
    );
  }

  function renderHowStep() {
    return (
      <div className="w-full max-w-md space-y-6 text-center">
        <h2 className="text-2xl font-semibold tracking-wide text-slate-900">
          {t.howTitle}
        </h2>
        <ol className="space-y-3 text-left text-sm text-slate-700">
          <li>
            <span className="font-semibold">1.</span> Fill out the form with all your
            preferences.
          </li>
          <li>
            <span className="font-semibold">2.</span> Choose the areas of your body
            you'd like to treat.
          </li>
          <li>
            <span className="font-semibold">3.</span> Enter your measurements.
          </li>
          <li>
            <span className="font-semibold">4.</span> Upload clear photos of the areas
            you wish to treat to help our experts assess your needs.
          </li>
          <li>
            <span className="font-semibold">5.</span> If available, view a
            personalized simulation of your potential results or receive a link to
            the simulation after review.
          </li>
          <li>
            <span className="font-semibold">6.</span> Select your treatment
            preferences and finalize your choices.
          </li>
          <li>
            <span className="font-semibold">7.</span> Choose your preferred dates and
            any additional options.
          </li>
          <li>
            <span className="font-semibold">8.</span> You're all set! Once
            submitted, our expert team will review your information and contact you.
          </li>
        </ol>
        {renderCircleButton(t.continue, () => goNext("personal"))}
      </div>
    );
  }

  function renderPersonalStep() {
    return (
      <div className="w-full max-w-xl space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t.personalTitle}</h2>
        <p className="text-xs text-slate-500">{t.personalIntro}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="first-name">
              {t.personalFirstName} <span className="text-red-500">*</span>
            </label>
            <input
              id="first-name"
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="last-name">
              {t.personalLastName} <span className="text-red-500">*</span>
            </label>
            <input
              id="last-name"
              type="text"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">
            {t.personalDob}
          </label>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder={t.personalDobDay}
              value={dobDay}
              onChange={(event) => setDobDay(event.target.value.replace(/[^0-9]/g, ""))}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-center text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <input
              type="text"
              placeholder={t.personalDobMonth}
              value={dobMonth}
              onChange={(event) => setDobMonth(event.target.value.replace(/[^0-9]/g, ""))}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-center text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <input
              type="text"
              placeholder={t.personalDobYear}
              value={dobYear}
              onChange={(event) => setDobYear(event.target.value.replace(/[^0-9]/g, ""))}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-center text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="marital-status">
            {t.personalMaritalStatus}
          </label>
          <select
            id="marital-status"
            value={maritalStatus}
            onChange={(event) => setMaritalStatus(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">-</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="nationality">
            {t.personalNationality} <span className="text-red-500">*</span>
          </label>
          <input
            id="nationality"
            type="text"
            value={nationality}
            onChange={(event) => setNationality(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="street-address">
            {t.personalStreetAddress} <span className="text-red-500">*</span>
          </label>
          <input
            id="street-address"
            type="text"
            value={streetAddress}
            onChange={(event) => setStreetAddress(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="postal-code">
              {t.personalPostalCode} <span className="text-red-500">*</span>
            </label>
            <input
              id="postal-code"
              type="text"
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="town">
              {t.personalTown} <span className="text-red-500">*</span>
            </label>
            <input
              id="town"
              type="text"
              value={town}
              onChange={(event) => setTown(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="personal-email">
            {t.personalEmail} <span className="text-red-500">*</span>
          </label>
          <input
            id="personal-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="personal-mobile">
            {t.personalMobile} <span className="text-red-500">*</span>
          </label>
          <input
            id="personal-mobile"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="profession">
              {t.personalProfession} <span className="text-red-500">*</span>
            </label>
            <input
              id="profession"
              type="text"
              value={profession}
              onChange={(event) => setProfession(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="employer">
              {t.personalEmployer} <span className="text-red-500">*</span>
            </label>
            <input
              id="employer"
              type="text"
              value={employer}
              onChange={(event) => setEmployer(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goNext("how")}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            {t.back}
          </button>
          {renderCircleButton(t.next, () => goNext("insurance"))}
        </div>
      </div>
    );
  }

  function renderInsuranceStep() {
    return (
      <div className="w-full max-w-xl space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t.insuranceTitle}</h2>
        <p className="text-xs text-slate-500">{t.insuranceIntro}</p>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">
            {t.insuranceProvider}
          </label>
          <InsurerSearchSelect
            value={insurerGln}
            onChange={(gln, name) => {
              setInsurerGln(gln);
              setInsuranceProvider(name || "");
            }}
            placeholder={t.insuranceProvider}
            inputClassName="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="insurance-card">
            {t.insuranceCardNumber}
          </label>
          <input
            id="insurance-card"
            type="text"
            value={insuranceCardNumber}
            onChange={(event) => setInsuranceCardNumber(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700">
            {t.insuranceType}
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            {["private", "semi_private", "basic"].map((type) => {
              const label =
                type === "private"
                  ? t.insuranceTypePrivate
                  : type === "semi_private"
                  ? t.insuranceTypeSemiPrivate
                  : t.insuranceTypeBasic;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setInsuranceType(type as typeof insuranceType)}
                  className={classNames(
                    "w-full rounded-full border px-3 py-2 text-xs font-medium shadow-sm transition",
                    insuranceType === type
                      ? "border-sky-500 bg-sky-600 text-white shadow-[0_10px_25px_rgba(15,23,42,0.22)]"
                      : "border-slate-200 bg-white/80 text-slate-700 hover:border-sky-300 hover:bg-sky-50",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goNext("personal")}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            {t.back}
          </button>
          {renderCircleButton(t.next, () => goNext("health"))}
        </div>
      </div>
    );
  }

  function renderHealthStep() {
    return (
      <div className="w-full max-w-xl space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t.healthTitle}</h2>
        <p className="text-xs text-slate-500">{t.healthIntro}</p>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="weight">
              {t.healthWeight}
            </label>
            <input
              id="weight"
              type="text"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="height">
              {t.healthHeight}
            </label>
            <input
              id="height"
              type="text"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="bmi">
              {t.healthBmi}
            </label>
            <input
              id="bmi"
              type="text"
              value={bmi}
              onChange={(event) => setBmi(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="illnesses">
            {t.healthIllnesses}
          </label>
          <input
            id="illnesses"
            type="text"
            value={illnesses}
            onChange={(event) => setIllnesses(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="surgeries">
            {t.healthSurgeries}
          </label>
          <input
            id="surgeries"
            type="text"
            value={surgeries}
            onChange={(event) => setSurgeries(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="allergies">
            {t.healthAllergies}
          </label>
          <input
            id="allergies"
            type="text"
            value={allergies}
            onChange={(event) => setAllergies(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="cigarettes">
            {t.healthCigarettes}
          </label>
          <input
            id="cigarettes"
            type="text"
            value={cigarettes}
            onChange={(event) => setCigarettes(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="alcohol">
              {t.healthAlcohol}
            </label>
            <select
              id="alcohol"
              value={alcohol}
              onChange={(event) => setAlcohol(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="">{t.healthAlcoholSelect}</option>
              <option value="none">None</option>
              <option value="occasionally">Occasionally</option>
              <option value="regularly">Regularly</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="sports">
              {t.healthSports}
            </label>
            <select
              id="sports"
              value={sports}
              onChange={(event) => setSports(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="">{t.healthSportsSelect}</option>
              <option value="none">None</option>
              <option value="sometimes">Sometimes</option>
              <option value="regularly">Regularly</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="medications">
            {t.healthMedications}
          </label>
          <input
            id="medications"
            type="text"
            value={medications}
            onChange={(event) => setMedications(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="gp">
              {t.healthGp}
            </label>
            <input
              id="gp"
              type="text"
              value={gp}
              onChange={(event) => setGp(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="gynecologist">
              {t.healthGynecologist}
            </label>
            <input
              id="gynecologist"
              type="text"
              value={gynecologist}
              onChange={(event) => setGynecologist(event.target.value)}
              className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="children">
            {t.healthChildren}
          </label>
          <input
            id="children"
            type="text"
            value={children}
            onChange={(event) => setChildren(event.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goNext("insurance")}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            {t.back}
          </button>
          {renderCircleButton(t.next, () => goNext("contact"))}
        </div>
      </div>
    );
  }

  function renderContactStep() {
    return (
      <div className="w-full max-w-xl space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t.contactTitle}</h2>
        <p className="text-xs text-slate-500">{t.contactIntro}</p>
        <div className="grid gap-2 md:grid-cols-3">
          {([
            ["email", t.contactEmail],
            ["phone", t.contactPhone],
            ["sms", t.contactSms],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setContactPreference(value)}
              className={classNames(
                "w-full rounded-full border px-3 py-2 text-xs font-medium shadow-sm transition",
                contactPreference === value
                  ? "border-sky-500 bg-sky-600 text-white shadow-[0_10px_25px_rgba(15,23,42,0.22)]"
                  : "border-slate-200 bg-white/80 text-slate-700 hover:border-sky-300 hover:bg-sky-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goNext("health")}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            {t.back}
          </button>
          {renderCircleButton(t.next, () => goNext("consent"))}
        </div>
      </div>
    );
  }

  function renderConsentStep() {
    return (
      <div className="w-full max-w-xl space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t.consentTitle}</h2>
        <p className="text-xs leading-relaxed text-slate-700">{t.consentText}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goNext("contact")}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            {t.back}
          </button>
          <button
            type="button"
            onClick={handleSubmitLead}
            disabled={submitting}
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-6 py-2 text-xs font-semibold uppercase tracking-wide text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.18)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "..." : t.consentAccept}
          </button>
        </div>
      </div>
    );
  }

  function renderThankYouStep() {
    return (
      <div className="w-full max-w-md space-y-4 text-center">
        <h2 className="text-2xl font-semibold text-slate-900">{t.thankYouTitle}</h2>
        <p className="text-sm text-slate-600">{t.thankYouBody}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Image
            src="/logos/maisontoa-logo.png"
            alt={t.brandTitle}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full bg-white shadow-sm"
          />
          <span className="text-sm font-semibold tracking-wide text-slate-900">
            {t.brandTitle}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          <span className="mr-1 font-medium">{t.languageLabel}:</span>
          <button
            type="button"
            onClick={() => setLanguage(language === "en" ? "fr" : "en")}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {language === "en" ? "English" : "Français"}
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl rounded-3xl bg-white/80 p-8 text-sm shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}

          {step === "search" && renderSearchStep()}
          {step === "register" && renderRegisterStep()}
          {step === "how" && renderHowStep()}
          {step === "personal" && renderPersonalStep()}
          {step === "insurance" && renderInsuranceStep()}
          {step === "health" && renderHealthStep()}
          {step === "contact" && renderContactStep()}
          {step === "consent" && renderConsentStep()}
          {step === "thankyou" && renderThankYouStep()}
        </div>
      </main>
    </div>
  );
}
