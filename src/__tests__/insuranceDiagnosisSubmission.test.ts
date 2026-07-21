import assert from "node:assert/strict";
import { resolveInsuranceDiagnosisCodes } from "@/lib/insuranceDiagnosisCodes";
import {
  buildInvoiceRequest,
  DiagnosisType,
  EsrType,
  LawType,
  PlaceType,
  RoleType,
  SexType,
  TiersMode,
} from "@/lib/sumexInvoice";

const diagnoses = resolveInsuranceDiagnosisCodes([{ code: "Z00.0", type: "ICD" }]);
assert.deepEqual(diagnoses, ["Z00.0"], "saved invoice diagnosis must be used for submission");
assert.deepEqual(
  resolveInsuranceDiagnosisCodes(undefined),
  [],
  "missing invoice diagnoses must not fall back to any other source",
);
assert.deepEqual(
  resolveInsuranceDiagnosisCodes([{ type: "ICD", code: "not-an-icd-code" }]),
  [],
  "malformed invoice diagnoses must be rejected",
);

const addDiagnosisRequests: Record<string, unknown>[] = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method ?? "GET";

  if (method === "POST" && url.includes("/AddDiagnosis")) {
    addDiagnosisRequests.push(JSON.parse(String(init?.body)));
  }

  if (url.includes("GetCreateGeneralInvoiceRequestManager")) {
    return Response.json({ pIGeneralInvoiceRequestManager: 1 });
  }
  if (url.includes("GetGeneralInvoiceRequest")) {
    return Response.json({ pIGeneralInvoiceRequest: 2 });
  }
  if (url.includes("GetCreateAddress")) {
    return Response.json({ pIAddress: 3 });
  }
  if (url.includes("/GetXML")) {
    return Response.json({
      pbStatus: true,
      pbstrOutputFile: "",
      plValidationError: 0,
      plTimestamp: 0,
      pbstrUsedSchema: "mock",
      pIGeneralInvoiceResult: 4,
    });
  }
  if (url.includes("/Finalize")) {
    return Response.json({ pbStatus: true, pdRoundDifference: 0 });
  }
  return Response.json({ pbStatus: true });
};

async function main() {
  try {
    const result = await buildInvoiceRequest({
    invoiceId: "MOCK-ICD10-001",
    invoiceDate: "2026-01-01",
    roleType: RoleType.Physician,
    placeType: PlaceType.Practice,
    tiersMode: TiersMode.Payant,
    lawType: LawType.KVG,
    iban: "CH4431999123000889012",
    esrType: EsrType.QR,
    billerGln: "7601003000000",
    billerAddress: { companyName: "Mock Clinic", street: "Rue Test 1", zip: "1000", city: "Lausanne" },
    providerGln: "7601003000000",
    providerAddress: { familyName: "Mock", givenName: "Doctor", street: "Rue Test 1", zip: "1000", city: "Lausanne" },
    insuranceGln: "7601003999999",
    insuranceAddress: { companyName: "Mock Insurer", street: "Rue Assurance 1", zip: "3000", city: "Bern" },
    patientSex: SexType.Female,
    patientBirthdate: "1990-01-01",
    patientAddress: { familyName: "Patient", givenName: "Mock", street: "Rue Patient 1", zip: "1000", city: "Lausanne" },
    treatmentCanton: "VD",
    treatmentDateBegin: "2026-01-01",
    treatmentDateEnd: "2026-01-01",
    diagnoses: diagnoses.map((code) => ({ type: DiagnosisType.ICD, code })),
  });

  assert.equal(result.success, true, "mock Sumex request should complete");
  assert.deepEqual(addDiagnosisRequests, [{
    pIGeneralInvoiceRequest: 2,
    eDiagnosisType: DiagnosisType.ICD,
    bstrCode: "Z00.0",
    bstrText: "",
  }], "Sumex AddDiagnosis request must contain the saved ICD-10 code");
  console.log("Insurance ICD-10 submission mock passed: saved invoice code Z00.0 was sent to Sumex AddDiagnosis.");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main();
