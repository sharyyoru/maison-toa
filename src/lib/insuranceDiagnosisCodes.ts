const ICD_10_CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;

export function resolveInsuranceDiagnosisCodes(invoiceDiagnosisCodes: unknown): string[] {
  if (!Array.isArray(invoiceDiagnosisCodes)) return [];

  return invoiceDiagnosisCodes
    .filter((diagnosis: unknown) => typeof diagnosis === "string" || (diagnosis as { type?: unknown })?.type === "ICD")
    .map((diagnosis: unknown) => typeof diagnosis === "string" ? diagnosis : (diagnosis as { code?: unknown })?.code)
    .filter((code): code is string => typeof code === "string")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => ICD_10_CODE_PATTERN.test(code));
}
