export type Language = "en" | "fr";

export const translations = {
  en: {
    // Header
    language: "Language",
    
    // Intro page
    heroTitle: "Advanced Aesthetic Treatments",
    heroTitleHighlight: "Tailored to You",
    heroDescription: "Easily provide your details and preferences in our simple, multi-step form, designed to assess your needs and treatments.",
    search: "Search",
    enterEmail: "Enter your email",
    continue: "Continue",
    searching: "Searching...",
    noAccount: "Don't have an account?",
    register: "Register",
    alreadyHaveAccount: "Already have an account?",
    login: "Login",
    registering: "Registering...",
    
    // Registration
    firstName: "First Name",
    lastName: "Last Name",
    mobile: "Mobile",
    email: "Email",
    allFieldsRequired: "All fields are required",
    pleaseEnterEmail: "Please enter your email address",
    
    // How it Works
    howItWorks: "How it Works",
    stepInfo: [
      { num: 1, desc: "Fill Out the Form with all your preferences." },
      { num: 2, desc: "Choose the areas of your body you'd like to treat." },
      { num: 3, desc: "Enter Measurements." },
      { num: 4, desc: "Upload clear photos of the areas you wish to treat to help our experts assess your needs." },
      { num: 5, desc: "If available, view a personalized simulation of your potential results or receive a link to the simulation after review." },
      { num: 6, desc: "Select your treatment preferences and finalize your choices, including preferred dates and any additional options." },
      { num: 7, desc: "Select your treatment preferences and finalize your choices, including preferred dates and any additional options." },
      { num: 8, desc: "You're All Set! Once submitted, your information will be reviewed by our expert team, and we'll reach out to discuss the next steps in your journey." },
    ],
    
    // Terms
    termsText: "I, the undersigned, certify that the information provided is truthful, and I am not subject to any lawsuits, nor any act of default, assuming all responsibility for any inaccuracies. Furthermore, I have been informed that the 1st consultation is paid on the spot. I also authorize my doctor, in the event that I do not pay my bills, to inform the authorities of the nature of my debts and to proceed to their recovery by legal means. For any dispute, the legal executive is in Geneva.",
    termsAcceptText: "By clicking \"I accept,\" you accept and agree to the terms and conditions above.",
    accept: "ACCEPT",
    
    // Personal Information (Step 1)
    personalInfoTitle: "Please Enter your Personal Information",
    dateOfBirth: "Date of Birth",
    maritalStatus: "Marital Status",
    nationality: "Nationality",
    streetAddress: "Street Address",
    postalCode: "Postal Code",
    town: "Town",
    profession: "Profession",
    currentEmployer: "Current Employer",
    
    // Marital Status options
    maritalStatuses: ["Single", "Married", "Divorced", "Widowed", "Separated", "Domestic Partnership"],
    
    // Nationality options
    nationalities: ["Swiss", "French", "German", "Italian", "British", "American", "Spanish", "Portuguese", "Russian", "Chinese", "Japanese", "Brazilian", "Other"],
    
    // Months
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    
    // Insurance Information (Step 2)
    insuranceInfoTitle: "Please Enter your Insurance Information",
    insuranceProvider: "Name of Insurance Provider",
    insuranceCardNumber: "Insurance Card Number",
    insuranceType: "Type of Insurance",
    insuranceTypes: {
      private: "PRIVATE",
      semiPrivate: "SEMI-PRIVATE",
      basic: "BASIC"
    },
    
    // Health Background (Step 3)
    healthInfoTitle: "Please enter your Health Background & Lifestyle Information",
    weight: "Indicate Weight in (kilograms)",
    height: "Indicate Height in (cm)",
    bmi: "BMI",
    autoCalculated: "Auto-calculated",
    knownIllnesses: "Known Illnesses (separate multiple with commas, write n/a if none)",
    previousSurgeries: "Previous Surgeries (indicate n/a if none)",
    allergies: "Allergies (indicate n/a if none)",
    cigarettes: "Cigarettes (indicate n/a if none)",
    cigarettesPlaceholder: "Cigarettes per day",
    alcohol: "Alcohol",
    sports: "Sports",
    selectFrequency: "Select frequency",
    frequencyOptions: ["Never", "Rarely", "Occasionally", "Frequently", "Daily"],
    medications: "Medications (separate multiple with commas, write n/a if none)",
    currentMedications: "Current medications",
    generalPractitioner: "General Practitioner",
    doctorName: "Doctor's name",
    gynecologist: "Gynecologist",
    haveChildren: "Do you have Children?",
    numberOfChildren: "Number of children",
    birthType1: "Birth Type 1",
    birthType2: "Birth Type 2",
    selectType: "Select type",
    birthTypes: ["Natural", "C-section"],
    
    // Contact Preference (Step 4)
    contactPrefTitle: "Just a few more things",
    contactPrefQuestion: "Where do you prefer to be contacted",
    contactOptions: {
      email: "Through Email",
      phone: "Through phone call",
      text: "Text message"
    },
    
    // Preferred Language
    preferredLanguage: "Preferred Language",
    english: "English",
    french: "French",
    
    // Consultation Category (Step 5)
    thankYouRegistering: "Thank You for Registering!",
    changesSaved: "Your Changes Have Been Saved!",
    hi: "Hi",
    categoryQuestion: "What category are you interested in?",
    consultationOptions: {
      liposuction: "Liposuction consultation",
      breast: "Breast consultation",
      face: "Face consultation"
    },
    
    // Navigation
    next: "NEXT",
    back: "Back",
    saving: "Saving...",
    processing: "Processing...",
    
    // Data Summary
    formCompletion: "Form Completion",
    personalInformation: "Personal Information",
    insuranceDetails: "Insurance Details",
    healthBackground: "Health Background",
    contactPreference: "Contact Preference",
    continueConsultation: "Continue to Consultation",
    editMyInformation: "Edit My Information",
    
    // Confirmation
    gladToHave: "We're so Glad to Have you at",
    aliiceTeam: "Aliice Aesthetics Team!",
    thankYouMessage: "Your registration has been submitted successfully. Our team will contact you shortly to discuss the next steps.",
    name: "Name",
    haveQuestions: "Have any questions in mind?",
  },
  
  fr: {
    // Header
    language: "Langue",
    
    // Intro page
    heroTitle: "Traitements Esthétiques Avancés",
    heroTitleHighlight: "Sur Mesure Pour Vous",
    heroDescription: "Fournissez facilement vos coordonnées et préférences dans notre formulaire simple en plusieurs étapes, conçu pour évaluer vos besoins et traitements.",
    search: "Rechercher",
    enterEmail: "Entrez votre email",
    continue: "Continuer",
    searching: "Recherche...",
    noAccount: "Vous n'avez pas de compte ?",
    register: "S'inscrire",
    alreadyHaveAccount: "Vous avez déjà un compte ?",
    login: "Connexion",
    registering: "Inscription...",
    
    // Registration
    firstName: "Prénom",
    lastName: "Nom de famille",
    mobile: "Téléphone",
    email: "Email",
    allFieldsRequired: "Tous les champs sont obligatoires",
    pleaseEnterEmail: "Veuillez entrer votre adresse email",
    
    // How it Works
    howItWorks: "Comment ça marche",
    stepInfo: [
      { num: 1, desc: "Remplissez le formulaire avec toutes vos préférences." },
      { num: 2, desc: "Choisissez les zones de votre corps que vous souhaitez traiter." },
      { num: 3, desc: "Entrez les mesures." },
      { num: 4, desc: "Téléchargez des photos claires des zones que vous souhaitez traiter pour aider nos experts à évaluer vos besoins." },
      { num: 5, desc: "Si disponible, visualisez une simulation personnalisée de vos résultats potentiels ou recevez un lien vers la simulation après examen." },
      { num: 6, desc: "Sélectionnez vos préférences de traitement et finalisez vos choix, y compris les dates préférées et toute option supplémentaire." },
      { num: 7, desc: "Sélectionnez vos préférences de traitement et finalisez vos choix, y compris les dates préférées et toute option supplémentaire." },
      { num: 8, desc: "Vous êtes prêt ! Une fois soumis, vos informations seront examinées par notre équipe d'experts, et nous vous contacterons pour discuter des prochaines étapes." },
    ],
    
    // Terms
    termsText: "Je soussigné(e), certifie que les informations fournies sont véridiques, et je ne fais l'objet d'aucune poursuite judiciaire, ni d'aucun acte de défaut, assumant toute responsabilité en cas d'inexactitude. De plus, j'ai été informé(e) que la 1ère consultation est payée sur place. J'autorise également mon médecin, en cas de non-paiement de mes factures, à informer les autorités de la nature de mes dettes et à procéder à leur recouvrement par voie légale. Pour tout litige, la juridiction compétente est celle de Genève.",
    termsAcceptText: "En cliquant sur « J'accepte », vous acceptez et convenez des termes et conditions ci-dessus.",
    accept: "ACCEPTER",
    
    // Personal Information (Step 1)
    personalInfoTitle: "Veuillez entrer vos informations personnelles",
    dateOfBirth: "Date de naissance",
    maritalStatus: "Situation matrimoniale",
    nationality: "Nationalité",
    streetAddress: "Adresse",
    postalCode: "Code postal",
    town: "Ville",
    profession: "Profession",
    currentEmployer: "Employeur actuel",
    
    // Marital Status options
    maritalStatuses: ["Célibataire", "Marié(e)", "Divorcé(e)", "Veuf/Veuve", "Séparé(e)", "Partenariat domestique"],
    
    // Nationality options
    nationalities: ["Suisse", "Français(e)", "Allemand(e)", "Italien(ne)", "Britannique", "Américain(e)", "Espagnol(e)", "Portugais(e)", "Russe", "Chinois(e)", "Japonais(e)", "Brésilien(ne)", "Autre"],
    
    // Months
    months: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
    
    // Insurance Information (Step 2)
    insuranceInfoTitle: "Veuillez entrer vos informations d'assurance",
    insuranceProvider: "Nom de l'assureur",
    insuranceCardNumber: "Numéro de carte d'assurance",
    insuranceType: "Type d'assurance",
    insuranceTypes: {
      private: "PRIVÉE",
      semiPrivate: "SEMI-PRIVÉE",
      basic: "DE BASE"
    },
    
    // Health Background (Step 3)
    healthInfoTitle: "Veuillez entrer vos antécédents de santé et mode de vie",
    weight: "Indiquez le poids en (kilogrammes)",
    height: "Indiquez la taille en (cm)",
    bmi: "IMC",
    autoCalculated: "Calculé automatiquement",
    knownIllnesses: "Maladies connues (séparez par des virgules, écrivez n/a si aucune)",
    previousSurgeries: "Chirurgies antérieures (indiquez n/a si aucune)",
    allergies: "Allergies (indiquez n/a si aucune)",
    cigarettes: "Cigarettes (indiquez n/a si aucune)",
    cigarettesPlaceholder: "Cigarettes par jour",
    alcohol: "Alcool",
    sports: "Sport",
    selectFrequency: "Sélectionnez la fréquence",
    frequencyOptions: ["Jamais", "Rarement", "Occasionnellement", "Fréquemment", "Quotidiennement"],
    medications: "Médicaments (séparez par des virgules, écrivez n/a si aucun)",
    currentMedications: "Médicaments actuels",
    generalPractitioner: "Médecin généraliste",
    doctorName: "Nom du médecin",
    gynecologist: "Gynécologue",
    haveChildren: "Avez-vous des enfants ?",
    numberOfChildren: "Nombre d'enfants",
    birthType1: "Type d'accouchement 1",
    birthType2: "Type d'accouchement 2",
    selectType: "Sélectionnez le type",
    birthTypes: ["Naturel", "Césarienne"],
    
    // Contact Preference (Step 4)
    contactPrefTitle: "Encore quelques détails",
    contactPrefQuestion: "Comment préférez-vous être contacté(e)",
    contactOptions: {
      email: "Par email",
      phone: "Par téléphone",
      text: "Par SMS"
    },
    
    // Preferred Language
    preferredLanguage: "Langue préférée",
    english: "Anglais",
    french: "Français",
    
    // Consultation Category (Step 5)
    thankYouRegistering: "Merci pour votre inscription !",
    changesSaved: "Vos modifications ont été enregistrées !",
    hi: "Bonjour",
    categoryQuestion: "Quelle catégorie vous intéresse ?",
    consultationOptions: {
      liposuction: "Consultation liposuccion",
      breast: "Consultation poitrine",
      face: "Consultation visage"
    },
    
    // Navigation
    next: "SUIVANT",
    back: "Retour",
    saving: "Enregistrement...",
    processing: "Traitement...",
    
    // Data Summary
    formCompletion: "Progression du formulaire",
    personalInformation: "Informations personnelles",
    insuranceDetails: "Détails d'assurance",
    healthBackground: "Antécédents de santé",
    contactPreference: "Préférence de contact",
    continueConsultation: "Continuer vers la consultation",
    editMyInformation: "Modifier mes informations",
    
    // Confirmation
    gladToHave: "Nous sommes ravis de vous avoir chez",
    aliiceTeam: "L'équipe Aliice Aesthetics !",
    thankYouMessage: "Votre inscription a été soumise avec succès. Notre équipe vous contactera prochainement pour discuter des prochaines étapes.",
    name: "Nom",
    haveQuestions: "Vous avez des questions ?",
  }
};

export const getTranslation = (lang: Language) => translations[lang];
