import assert from "node:assert/strict";
import { generateInvoiceXml, parseInvoiceResponseXml } from "@/lib/invoiceXmlNative";
import {
  RoleType,
  PlaceType,
  TiersMode,
  LawType,
  type SumexInvoiceInput,
} from "@/lib/sumexInvoice";

// The Sumex1 REST server is gone, so this generator now produces the
// generalInvoiceRequest_500 XML that goes to Swiss insurers. These tests pin
// the properties that cause real-world rejections.

const addr = {
  type: 1,
  companyName: "Maison TOA",
  street: "Voie du Chariot",
  streetNo: "6",
  postalCode: "1003",
  town: "Lausanne",
  countryCode: "CH",
} as unknown as SumexInvoiceInput["billerAddress"];


/**
 * Minimal well-formedness check: walks the tag stream and verifies every
 * element is closed, in the right order. Returns a list of problems.
 */
function wellFormedErrors(xml: string): string[] {
  const errors: string[] = [];
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml)) !== null) {
    const [, closing, name, , selfClose] = m;
    if (closing) {
      const open = stack.pop();
      if (open !== name) errors.push(`</${name}> closes <${open ?? "nothing"}>`);
    } else if (!selfClose) {
      stack.push(name);
    }
  }
  if (stack.length) errors.push(`unclosed: ${stack.join(", ")}`);
  return errors;
}

function baseInput(overrides: Partial<SumexInvoiceInput> = {}): SumexInvoiceInput {
  return {
    roleType: RoleType.Physician,
    placeType: PlaceType.Practice,
    tiersMode: TiersMode.Payant,
    invoiceId: "1009643",
    invoiceDate: "2026-09-16",
    lawType: LawType.KVG,
    iban: "CH9300762011623852957",
    billerGln: "7601002932929",
    billerAddress: addr,
    providerGln: "7601000731173",
    providerAddress: addr,
    // A TP invoice needs a debitor/patient address to render.
    patientAddress: {
      type: 2,
      familyName: "Test",
      givenName: "Patient",
      street: "Rue de Test",
      streetNo: "1",
      postalCode: "1000",
      town: "Lausanne",
      countryCode: "CH",
    } as unknown as SumexInvoiceInput["billerAddress"],
    patientGender: "female",
    treatmentCanton: "VD",
    treatmentDateBegin: "2026-09-16",
    ...overrides,
  } as SumexInvoiceInput;
}

// --- Produces well-formed, correctly-rooted XML. ---
{
  const out = generateInvoiceXml(baseInput());
  assert.ok(out.xmlContent.length > 0, "expected XML output");
  assert.match(out.xmlContent, /^<\?xml version="1\.0"/, "must start with an XML declaration");
  assert.match(out.xmlContent, /generalInvoiceRequest_500|invoice:request/, "must be a generalInvoiceRequest_500 document");

  // Stack-based well-formedness check: a malformed or mis-nested document is
  // rejected outright by MediData, so verify nesting rather than just counts.
  assert.deepEqual(wellFormedErrors(out.xmlContent), [], "document must be well-formed");
}

// --- Control characters must never reach the XML.
//     A CSV import with Windows line endings left a trailing \r on service
//     codes; XML attribute-value normalisation turns it into a space, so the
//     insurer receives the tariff code "2130 " instead of "2130" and rejects
//     the line. Stripping happens centrally in esc().
{
  const out = generateInvoiceXml(baseInput({
    services: [{
      code: "2130\r",
      serviceName: "Consultation\r\n",
      quantity: 1,
      tariffType: "001",
      amount: 50,
      unitMT: 0,
      unitTT: 50,
      sessionNumber: 1,
      dateBegin: "2026-09-16",
    }],
  } as unknown as Partial<SumexInvoiceInput>));

  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(out.xmlContent),
    "no raw control characters may appear anywhere in the document");
  assert.ok(!out.xmlContent.includes("2130\r"), "the carriage return must be stripped from the code");
  assert.ok(!out.xmlContent.includes('"2130 "'), "the code must not degrade to '2130 ' via attribute normalisation");
}

// --- XML special characters in patient/provider data must be escaped, not
//     passed through (a name like "Müller & Co <AG>" must not break the doc).
{
  const out = generateInvoiceXml(baseInput({
    billerAddress: { ...addr, companyName: 'Clinic & Partners <"Test">' } as typeof addr,
  }));
  assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(out.xmlContent),
    "every bare ampersand must be escaped");
  assert.ok(out.xmlContent.includes("&amp;"), "ampersand should appear escaped");
}

// --- Response parsing: a real Sanitas rejection must be understood, including
//     the structured <invoice:error> codes the duplicate guard depends on. ---
{
  const xml = `<?xml version='1.0' encoding='UTF-8'?><invoice:response xmlns:invoice="http://www.forum-datenaustausch.ch/invoice" language="fr"><invoice:payload response_timestamp="1791455209"><invoice:invoice request_timestamp="1791447614" request_date="2026-09-16T00:00:00" request_id="1009643"/><invoice:body><invoice:tiers_payant allowModification="false"><invoice:rejected status_in="unknown" status_out="unknown"><invoice:explanation>1) Double calcul - facture d'origine réglée</invoice:explanation><invoice:error code="000125" text="Double calcul - facture d'origine réglée "/><invoice:error record_id="2" code="000412" text="Prestation TARDOC déjà compensée le même jour "/></invoice:rejected></invoice:tiers_payant></invoice:body></invoice:payload></invoice:response>`;

  const p = parseInvoiceResponseXml(xml);
  assert.equal(p.responseType, "rejected");
  assert.ok(p.notifications.length >= 2, "both <invoice:error> elements must be surfaced");
  const codes = p.notifications.map((n) => n.code);
  assert.ok(codes.includes("000125"), "invoice-level duplicate code must be parsed");
  assert.ok(codes.includes("000412"), "line-level code must be parsed");
}

// --- An accepted response must not be read as a rejection. ---
{
  const xml = `<?xml version='1.0' encoding='UTF-8'?><invoice:response xmlns:invoice="http://www.forum-datenaustausch.ch/invoice"><invoice:payload response_timestamp="1791455209"><invoice:body><invoice:tiers_payant><invoice:accepted status_in="ok" status_out="granted"><invoice:explanation>Accepted</invoice:explanation></invoice:accepted></invoice:tiers_payant></invoice:body></invoice:payload></invoice:response>`;
  const p = parseInvoiceResponseXml(xml);
  assert.equal(p.responseType, "accepted");
}

// --- A missing treatment canton must fail with a usable message, not a
//     TypeError. The canton determines the tariff context, so defaulting it
//     silently would put a wrong value on the claim.
{
  assert.throws(
    () => generateInvoiceXml(baseInput({ treatmentCanton: undefined } as unknown as Partial<SumexInvoiceInput>)),
    /treatmentCanton is required/,
    "must explain what is missing",
  );
}

console.log("invoiceXmlNative: all assertions passed");
