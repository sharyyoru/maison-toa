import { NextResponse } from "next/server";
import { printInvoiceResponse } from "@/lib/sumexInvoice";

/**
 * GET /api/medidata/test-sumex-response
 * Test the Sumex response manager: LoadXML (POST + octet-stream) then Print.
 * Uses the sample response XML from the MediData simulator.
 * Diagnostic endpoint — remove after testing.
 */

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<invoice:response xmlns:invoice="http://www.forum-datenaustausch.ch/invoice" xmlns="http://www.forum-datenaustausch.ch/invoice" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" guid="cd0d6e9f210a4a94be6ed3b04f2db43d" language="de" modus="production" xsi:schemaLocation="http://www.forum-datenaustausch.ch/invoice generalInvoiceResponse_500.xsd">
<invoice:processing xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xenc="http://www.w3.org/2001/04/xmlenc#">
<invoice:transport from="2099988876514" to="2099988899483">
<invoice:via sequence_id="1" via="7601001304307"/>
</invoice:transport>
</invoice:processing>
<invoice:payload xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xenc="http://www.w3.org/2001/04/xmlenc#" request_subtype="normal" request_type="invoice" response_timestamp="1771852165">
<invoice:invoice request_date="2026-02-23T00:00:00" request_id="CONS-MLZ0QP32" request_timestamp="1771848500"/>
<invoice:body>
<invoice:prolog>
<invoice:package copyright="Aesthetics Clinic XT SA" name="AestheticsClinic" version="100"/>
<invoice:generator copyright="suva 2000-26" name="GeneralInvoiceRequestManager 5.00.006" version="500"/>
</invoice:prolog>
<invoice:billers>
<invoice:biller_gln gln="7601003000115">
<invoice:company>
<invoice:companyname>Aesthetics Clinic XT SA</invoice:companyname>
<invoice:postal>
<invoice:street house_no="18" street_name="chemin Rieu">chemin Rieu 18</invoice:street>
<invoice:zip state_code="GE">1208</invoice:zip>
<invoice:city>Genève</invoice:city>
</invoice:postal>
</invoice:company>
</invoice:biller_gln>
<invoice:biller_zsr zsr="H123456">
<invoice:company>
<invoice:companyname>Aesthetics Clinic XT SA</invoice:companyname>
<invoice:postal>
<invoice:street house_no="18" street_name="chemin Rieu">chemin Rieu 18</invoice:street>
<invoice:zip state_code="GE">1208</invoice:zip>
<invoice:city>Genève</invoice:city>
</invoice:postal>
</invoice:company>
</invoice:biller_zsr>
</invoice:billers>
<invoice:debitor gln="2099988876514">
<invoice:company>
<invoice:companyname>Versicherung mit Antwortsimulator</invoice:companyname>
<invoice:postal>
<invoice:street house_no="1" street_name="Teststrasse">Teststrasse 1</invoice:street>
<invoice:zip state_code="ZH">8001</invoice:zip>
<invoice:city>Zürich</invoice:city>
</invoice:postal>
</invoice:company>
</invoice:debitor>
<invoice:providers>
<invoice:provider_gln gln="7601002525541" gln_location="7601002525541">
<invoice:person>
<invoice:familyname>Yulia</invoice:familyname>
<invoice:givenname>Raspertova</invoice:givenname>
<invoice:postal>
<invoice:street house_no="18" street_name="chemin Rieu">chemin Rieu 18</invoice:street>
<invoice:zip state_code="GE">1208</invoice:zip>
<invoice:city>Genève</invoice:city>
</invoice:postal>
</invoice:person>
</invoice:provider_gln>
<invoice:provider_zsr zsr="K460025">
<invoice:person>
<invoice:familyname>Yulia</invoice:familyname>
<invoice:givenname>Raspertova</invoice:givenname>
<invoice:postal>
<invoice:street house_no="18" street_name="chemin Rieu">chemin Rieu 18</invoice:street>
<invoice:zip state_code="GE">1208</invoice:zip>
<invoice:city>Genève</invoice:city>
</invoice:postal>
</invoice:person>
</invoice:provider_zsr>
</invoice:providers>
<invoice:insurance gln="2099988876514">
<invoice:company>
<invoice:companyname>Versicherung mit Antwortsimulator</invoice:companyname>
<invoice:postal>
<invoice:street house_no="1" street_name="Teststrasse">Teststrasse 1</invoice:street>
<invoice:zip state_code="ZH">8001</invoice:zip>
<invoice:city>Zürich</invoice:city>
</invoice:postal>
</invoice:company>
</invoice:insurance>
<invoice:patient birthdate="2025-05-29" gender="male" sex="male" ssn="7569999999991">
<invoice:person>
<invoice:familyname>Mutant</invoice:familyname>
<invoice:givenname>Wilson</invoice:givenname>
<invoice:postal>
<invoice:street house_no="Furjan" street_name="Al">Al Furjan</invoice:street>
<invoice:zip state_code="GE">00000</invoice:zip>
<invoice:city>Dubai</invoice:city>
</invoice:postal>
</invoice:person>
</invoice:patient>
<invoice:contact>
<invoice:person>
<invoice:familyname>KontaktFamily</invoice:familyname>
<invoice:givenname>Gabriela</invoice:givenname>
<invoice:postal>
<invoice:zip>8888</invoice:zip>
<invoice:city>Kontaktcity</invoice:city>
</invoice:postal>
</invoice:person>
</invoice:contact>
<invoice:treatment canton="GE" date_begin="2026-02-23" date_end="2026-02-23" reason="disease"/>
<invoice:tiers_payant allowModification="false">
<invoice:accepted status_in="received" status_out="granted">
<invoice:explanation>Standardantwort des Antwortensimulators.</invoice:explanation>
<invoice:balance amount="100.00" amount_due="90" amount_paid="10"/>
</invoice:accepted>
</invoice:tiers_payant>
</invoice:body>
</invoice:payload>
</invoice:response>`;

export async function GET() {
  const steps: { step: string; success: boolean; data?: unknown; error?: string }[] = [];

  try {
    console.log("[test-sumex-response] Starting printInvoiceResponse test...");
    const result = await printInvoiceResponse(SAMPLE_XML, "test_response.xml");

    steps.push({
      step: "printInvoiceResponse",
      success: result.success,
      data: result.success
        ? { pdfSize: result.pdfContent?.length, pdfFilePath: result.pdfFilePath }
        : undefined,
      error: result.error,
    });

    return NextResponse.json({ steps }, { status: 200 });
  } catch (error) {
    steps.push({
      step: "printInvoiceResponse",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ steps }, { status: 200 });
  }
}
