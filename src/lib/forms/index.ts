// Form Definitions Index - exports all form definitions
export { OPERATIVE_PROTOCOL_FORMS } from "./operativeProtocolForms";
export { BREAST_SURGERY_FORMS } from "./breastSurgeryForms";
export { INSURANCE_LETTER_FORMS } from "./insuranceLetterForms";
export { ATTESTATION_FORMS } from "./attestationForms";
export { MEDICAL_LETTER_FORMS } from "./medicalLetterForms";

// Combined export of all template forms
import { OPERATIVE_PROTOCOL_FORMS } from "./operativeProtocolForms";
import { BREAST_SURGERY_FORMS } from "./breastSurgeryForms";
import { INSURANCE_LETTER_FORMS } from "./insuranceLetterForms";
import { ATTESTATION_FORMS } from "./attestationForms";
import { MEDICAL_LETTER_FORMS } from "./medicalLetterForms";

export const ALL_TEMPLATE_FORMS = [
  ...OPERATIVE_PROTOCOL_FORMS,
  ...BREAST_SURGERY_FORMS,
  ...INSURANCE_LETTER_FORMS,
  ...ATTESTATION_FORMS,
  ...MEDICAL_LETTER_FORMS,
];
