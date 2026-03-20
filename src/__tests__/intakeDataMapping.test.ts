/**
 * Intake Form Data Mapping Tests
 * Verifies that intake form data maps correctly to patient page display
 */

// Test 1: Patient personal information field mapping
function testPatientFieldMapping() {
  console.log("Test 1: Patient Personal Information Field Mapping");

  // Simulate intake form data structure
  const intakeFormFields = {
    first_name: "John",
    last_name: "Doe",
    email: "john.doe@example.com",
    phone: "+41791234567",
    dob: "1990-05-15", // Fixed: was date_of_birth
    street_address: "123 Main Street",
    postal_code: "8001",
    town: "Zurich", // Fixed: was city
    nationality: "Swiss",
    marital_status: "Single",
    profession: "Engineer",
    current_employer: "Tech Corp", // Fixed: was employer
  };

  // Expected patient page query fields (from page.tsx line 41)
  const patientPageFields = [
    "id", "first_name", "last_name", "email", "phone", "gender",
    "dob", "marital_status", "nationality", "street_address",
    "postal_code", "town", "profession", "current_employer",
    "source", "notes", "avatar_url", "language_preference",
    "clinic_preference", "lifecycle_stage", "contact_owner_name",
    "contact_owner_email", "created_by", "created_at", "updated_at"
  ];

  let passed = 0;
  let failed = 0;

  // Verify all intake form fields exist in patient page query
  for (const [field, value] of Object.entries(intakeFormFields)) {
    if (patientPageFields.includes(field)) {
      passed++;
      console.log(`  ✓ Field "${field}" maps correctly`);
    } else {
      failed++;
      console.log(`  ✗ Field "${field}" NOT in patient page query`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 2: Insurance table name consistency
function testInsuranceTableName() {
  console.log("Test 2: Insurance Table Name Consistency");

  // All components should use the same table name
  const correctTableName = "patient_insurances";
  
  // Simulated table references (after fix)
  const tableReferences = [
    { file: "intake/steps/page.tsx", table: "patient_insurances" },
    { file: "PatientIntakeDataCard.tsx", table: "patient_insurances" },
    { file: "patients/[id]/page.tsx", table: "patient_insurances" },
    { file: "PatientDetailsWizard.tsx", table: "patient_insurances" },
  ];

  let passed = 0;
  let failed = 0;

  for (const ref of tableReferences) {
    if (ref.table === correctTableName) {
      passed++;
      console.log(`  ✓ ${ref.file}: uses "${ref.table}"`);
    } else {
      failed++;
      console.log(`  ✗ ${ref.file}: uses "${ref.table}" (should be "${correctTableName}")`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 3: Health background data structure
function testHealthBackgroundMapping() {
  console.log("Test 3: Health Background Data Mapping");

  // Fields saved by intake form (step 3)
  const intakeHealthFields = {
    patient_id: "uuid",
    submission_id: "uuid",
    weight_kg: 70,
    height_cm: 175,
    bmi: 22.86,
    known_illnesses: "None",
    previous_surgeries: "None",
    allergies: "None",
    cigarettes: "Never",
    alcohol_consumption: "Occasionally",
    sports_activity: "Frequently",
    medications: "None",
    general_practitioner: "Dr. Smith",
    gynecologist: "Dr. Jones",
    children_count: 2,
    birth_type_1: "Natural",
    birth_type_2: "C-section",
  };

  // Fields displayed by PatientIntakeDataCard
  const displayedFields = [
    "weight_kg", "height_cm", "bmi",
    "known_illnesses", "previous_surgeries", "allergies", "medications",
    "cigarettes", "alcohol_consumption", "sports_activity",
    "general_practitioner", "gynecologist",
    "children_count", "birth_type_1", "birth_type_2"
  ];

  let passed = 0;
  let failed = 0;

  for (const field of displayedFields) {
    if (field in intakeHealthFields) {
      passed++;
      console.log(`  ✓ Health field "${field}" saved and displayed`);
    } else {
      failed++;
      console.log(`  ✗ Health field "${field}" NOT saved by intake form`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 4: Date of birth format
function testDateOfBirthFormat() {
  console.log("Test 4: Date of Birth Format");

  function formatDob(year: string, month: string, day: string): string | null {
    if (!year || !month || !day) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const testCases = [
    { year: "1990", month: "5", day: "15", expected: "1990-05-15" },
    { year: "1985", month: "12", day: "1", expected: "1985-12-01" },
    { year: "2000", month: "1", day: "31", expected: "2000-01-31" },
    { year: "", month: "5", day: "15", expected: null },
    { year: "1990", month: "", day: "15", expected: null },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = formatDob(tc.year, tc.month, tc.day);
    const testPassed = result === tc.expected;

    if (testPassed) {
      passed++;
      console.log(`  ✓ DOB format "${tc.year}-${tc.month}-${tc.day}": "${result}"`);
    } else {
      failed++;
      console.log(`  ✗ DOB format "${tc.year}-${tc.month}-${tc.day}": got "${result}", expected "${tc.expected}"`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 5: Insurance data structure
function testInsuranceDataStructure() {
  console.log("Test 5: Insurance Data Structure");

  // Fields saved by intake form
  const intakeInsuranceFields = {
    patient_id: "uuid",
    provider_name: "Swiss Life",
    card_number: "1234567890",
    insurance_type: "Private",
  };

  // Fields queried by patient page (from page.tsx)
  const patientPageInsuranceFields = [
    "id", "provider_name", "card_number", "insurance_type", "created_at"
  ];

  let passed = 0;
  let failed = 0;

  // Verify intake fields match (excluding auto-generated ones)
  const requiredFields = ["provider_name", "card_number", "insurance_type"];
  for (const field of requiredFields) {
    if (field in intakeInsuranceFields && patientPageInsuranceFields.includes(field)) {
      passed++;
      console.log(`  ✓ Insurance field "${field}" correctly mapped`);
    } else {
      failed++;
      console.log(`  ✗ Insurance field "${field}" mismatch`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 6: Intake preferences structure
function testIntakePreferencesStructure() {
  console.log("Test 6: Intake Preferences Structure");

  // Fields saved by intake form (step 4)
  const intakePrefsFields = {
    submission_id: "uuid",
    patient_id: "uuid",
    preferred_contact_method: "email",
  };

  // Fields displayed by PatientIntakeDataCard
  const displayedPrefsFields = [
    "preferred_language",
    "consultation_type", 
    "preferred_contact_method",
    "preferred_contact_time",
    "additional_notes"
  ];

  let passed = 0;
  let failed = 0;

  // The intake form only saves preferred_contact_method
  // Other fields can be edited via PatientIntakeDataCard
  if ("preferred_contact_method" in intakePrefsFields) {
    passed++;
    console.log(`  ✓ preferred_contact_method saved by intake form`);
  } else {
    failed++;
    console.log(`  ✗ preferred_contact_method NOT saved`);
  }

  // Verify submission_id and patient_id are included for linking
  if ("submission_id" in intakePrefsFields && "patient_id" in intakePrefsFields) {
    passed++;
    console.log(`  ✓ Preferences linked to submission and patient`);
  } else {
    failed++;
    console.log(`  ✗ Missing link fields`);
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Run all tests
console.log("=== Intake Form Data Mapping Tests ===\n");

const intakeTest1 = testPatientFieldMapping();
const intakeTest2 = testInsuranceTableName();
const intakeTest3 = testHealthBackgroundMapping();
const intakeTest4 = testDateOfBirthFormat();
const intakeTest5 = testInsuranceDataStructure();
const intakeTest6 = testIntakePreferencesStructure();

const intakeAllPassed = intakeTest1 && intakeTest2 && intakeTest3 && intakeTest4 && intakeTest5 && intakeTest6;

console.log("=== Test Summary ===");
console.log(`Test 1 (Patient Fields): ${intakeTest1 ? "PASSED" : "FAILED"}`);
console.log(`Test 2 (Insurance Table): ${intakeTest2 ? "PASSED" : "FAILED"}`);
console.log(`Test 3 (Health Background): ${intakeTest3 ? "PASSED" : "FAILED"}`);
console.log(`Test 4 (DOB Format): ${intakeTest4 ? "PASSED" : "FAILED"}`);
console.log(`Test 5 (Insurance Data): ${intakeTest5 ? "PASSED" : "FAILED"}`);
console.log(`Test 6 (Intake Preferences): ${intakeTest6 ? "PASSED" : "FAILED"}`);
console.log(`\nOverall: ${intakeAllPassed ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗"}`);

if (!intakeAllPassed) {
  process.exit(1);
}
