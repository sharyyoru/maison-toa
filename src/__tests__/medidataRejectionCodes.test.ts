import assert from "node:assert/strict";
import {
  classifyRejectionError,
  classifyRejection,
  normalise,
} from "@/lib/medidataRejectionCodes";

// Every `text` below is a verbatim insurer message taken from
// medidata_responses on the production project, so these tests pin the
// behaviour against what insurers actually send rather than invented strings.

// --- Invoice-level duplicates: the dominant rejection class (~107 responses).
//     These MUST require a Storno — resending is what created the problem. ---
{
  const sanitas = classifyRejectionError({
    code: "000125",
    text: "Double calcul - facture d'origine réglée ",
  });
  assert.equal(sanitas.rejectionClass, "DUPLICATE_INVOICE");
  assert.equal(sanitas.resubmitPolicy, "requires_storno");
  assert.equal(sanitas.matchedBy, "code+text");
  assert.equal(sanitas.conflict, false);

  for (const text of [
    "Double calcul - facture d'origine en cours de traitement",
    "Nous avons déjà reçu la même facture (elle est en cours de traitement).",
    "La facture a déjà été payée.",
    "Nous avons déjà reçu et payé la même facture avec le même numéro de facture et la même date de facturation.",
    "La facture originale de ce document est encore en cours de traitement",
    "Facture deux fois imputée. Original: no int. 142760155 / no ext. 10034",
  ]) {
    const c = classifyRejectionError({ text });
    assert.equal(c.rejectionClass, "DUPLICATE_INVOICE", `text-only: ${text}`);
    assert.equal(c.resubmitPolicy, "requires_storno");
  }
}

// --- Three-digit codes from other insurers must classify too; they are a
//     different namespace from Sanitas' six-digit codes. ---
{
  assert.equal(classifyRejectionError({ code: "406" }).rejectionClass, "DUPLICATE_INVOICE");
  assert.equal(classifyRejectionError({ code: "135" }).rejectionClass, "DUPLICATE_INVOICE");
  assert.equal(classifyRejectionError({ code: "853" }).rejectionClass, "CONFIG_GLN");
  assert.equal(classifyRejectionError({ code: "59109" }).rejectionClass, "TAX_POINT");
  // Zero-padding differences between senders must not defeat the lookup.
  assert.equal(classifyRejectionError({ code: "000406" }).rejectionClass, "DUPLICATE_INVOICE");
}

// --- Line-level "already compensated": fixable by correcting lines, so a
//     corrected resend is allowed WITHOUT a Storno. ---
{
  const c = classifyRejectionError({
    code: "000412",
    text: "Prestation TARDOC déjà compensée le même jour ",
    recordId: "2",
  });
  assert.equal(c.rejectionClass, "SERVICE_ALREADY_BILLED");
  assert.equal(c.resubmitPolicy, "allow_corrected_resend");

  assert.equal(
    classifyRejectionError({ code: "005222", text: "Prestation déjà compensée le même jour" })
      .rejectionClass,
    "SERVICE_ALREADY_BILLED",
  );
}

// --- Tariff data vs tax point must not be confused. "valeur du point
//     tarifaire" contains "tarifaire", so ordering of the text rules matters. ---
{
  assert.equal(
    classifyRejectionError({ code: "59109", text: "Valeurs du point tarifaire trop élevées." })
      .rejectionClass,
    "TAX_POINT",
  );
  assert.equal(
    classifyRejectionError({ text: "La taxe de valeur est trop grande" }).rejectionClass,
    "TAX_POINT",
  );
  assert.equal(
    classifyRejectionError({
      code: "003622",
      text: "15.09.2026: Le chiffre tarifaire (0064 / Stylo marquer stérile) dans le tarif (406) n'existe pas.",
    }).rejectionClass,
    "TARIFF_DATA",
  );
  assert.equal(
    classifyRejectionError({ code: "003622", text: "Le chiffre tarifaire ne correspond pas au tarif fourni." })
      .rejectionClass,
    "TARIFF_DATA",
  );
}

// --- A tariff-406 message mentioning "(406)" must NOT be read as reject code
//     406 (duplicate). This is the exact code/text collision the classifier
//     exists to survive. ---
{
  const c = classifyRejectionError({
    code: "003622",
    text: "Le chiffre tarifaire (0077 / 1 porte lame #3) dans le tarif (406) n'existe pas",
  });
  assert.equal(c.rejectionClass, "TARIFF_DATA");
  assert.notEqual(c.rejectionClass, "DUPLICATE_INVOICE");
}

// --- Missing specialty code. By raw occurrence this is the single biggest
//     defect in production (eK6.2.1 313x, 5.113.002 137x). Codes here are
//     alphanumeric and dotted, which a digits-only code regex misses entirely. ---
{
  const ek = classifyRejectionError({
    code: "eK6.2.1",
    text: "Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc",
  });
  assert.equal(ek.rejectionClass, "MISSING_SPECIALTY");
  assert.equal(ek.resubmitPolicy, "allow_corrected_resend");

  const dotted = classifyRejectionError({
    code: "5.113.002",
    text: "Le code de spécialité n’a pas été transmis, ligne 1 concernant la position tarifaire MK.05.0040.",
    recordId: "1",
  });
  assert.equal(dotted.rejectionClass, "MISSING_SPECIALTY");

  // "position tarifaire" in the text must NOT drag this into TARIFF_DATA.
  assert.notEqual(dotted.rejectionClass, "TARIFF_DATA");
}

// --- Missing diagnosis for tariff 007 (annex H). ---
{
  assert.equal(
    classifyRejectionError({
      code: "4.504.003",
      text: "Le diagnostic est manquant pour la prestation du tarif 007. Selon l'annexe H de la convention",
    }).rejectionClass,
    "MISSING_DIAGNOSIS",
  );
  assert.equal(
    classifyRejectionError({ code: "S_000772", text: "Diagnostic manquant dans l'en-tête de la facture." })
      .rejectionClass,
    "MISSING_DIAGNOSIS",
  );
}

// --- Alphanumeric duplicate and tax-point codes from other senders. ---
{
  assert.equal(
    classifyRejectionError({ code: "eK5.1.2", text: "La facture a déjà été payée." }).rejectionClass,
    "DUPLICATE_INVOICE",
  );
  assert.equal(
    classifyRejectionError({
      code: "eK6.T001",
      text: "007 - AA.15.0010 - Etude de dossiers provenant de tiers: La taxe de valeur est trop grande",
    }).rejectionClass,
    "TAX_POINT",
  );
}

// --- Law type rejected by the cost bearer (Suva). Entities must be decoded by
//     the parser before classification; raw &quot; must still classify. ---
{
  const q = classifyRejectionError({
    code: "QD4",
    text: `L'indication figurant sur la facture sous le point "Loi" n'est pas supportée par la Suva`,
  });
  assert.equal(q.rejectionClass, "LAW_TYPE");
  assert.equal(q.resubmitPolicy, "manual_only");
}

// --- Manual-only classes: resending cannot help, so never auto-allow. ---
{
  const doc = classifyRejectionError({
    code: "13",
    text: "Malgré nos demandes, nous n'avons pas reçu de rapport médical pour le Botox",
  });
  assert.equal(doc.rejectionClass, "CLINICAL_DOC");
  assert.equal(doc.resubmitPolicy, "manual_only");

  const notInsured = classifyRejectionError({
    text: "Le client n'était pas assuré auprès du répondant des coûts au moment du traitement.",
  });
  assert.equal(notInsured.rejectionClass, "NOT_INSURED");
  assert.equal(notInsured.resubmitPolicy, "manual_only");

  assert.equal(classifyRejectionError({ text: "unknown mandant ean" }).rejectionClass, "CONFIG_GLN");
}

// --- Unknown codes must be conservative: manual_only, never resendable. ---
{
  const c = classifyRejectionError({ code: "777777", text: "Some reason we have never seen" });
  assert.equal(c.rejectionClass, "UNKNOWN");
  assert.equal(c.resubmitPolicy, "manual_only");
  assert.equal(c.matchedBy, "none");
}

// --- Code 999 is an explicit free-text carrier, so it must fall through to the
//     text and not be treated as a class of its own. ---
{
  const freeText = classifyRejectionError({
    code: "999",
    text: "Se réfère à un motif de renvoi en texte libre",
  });
  assert.equal(freeText.rejectionClass, "UNKNOWN");

  // Same carrier code, but the text is classifiable -> text decides.
  const carried = classifyRejectionError({ code: "999", text: "Double calcul - facture d'origine réglée" });
  assert.equal(carried.rejectionClass, "DUPLICATE_INVOICE");
  assert.equal(carried.matchedBy, "text");
}

// --- Code/text disagreement: the text wins and the conflict is flagged, so a
//     bad CODE_RULES entry surfaces instead of silently misrouting. ---
{
  const c = classifyRejectionError({ code: "000412", text: "Double calcul - facture d'origine réglée" });
  assert.equal(c.rejectionClass, "DUPLICATE_INVOICE");
  assert.equal(c.matchedBy, "text");
  assert.equal(c.conflict, true);
}

// --- Aggregation. A real Sanitas rejection carries one invoice-level duplicate
//     plus several line-level errors; Storno must win over the resendable ones. ---
{
  const real = classifyRejection([
    { code: "000125", text: "Double calcul - facture d'origine réglée " },
    { code: "000412", text: "Prestation TARDOC déjà compensée le même jour ", recordId: "2" },
    { code: "000412", text: "Prestation TARDOC déjà compensée le même jour ", recordId: "3" },
    { code: "000412", text: "Prestation TARDOC déjà compensée le même jour ", recordId: "4" },
  ]);
  assert.equal(real.rejectionClass, "DUPLICATE_INVOICE");
  assert.equal(real.resubmitPolicy, "requires_storno");
}

// --- manual_only must outrank allow_corrected_resend: if documentation is
//     missing, fixing a tariff line and resending still will not be paid. ---
{
  const mixed = classifyRejection([
    { code: "003622", text: "Le chiffre tarifaire ne correspond pas au tarif fourni." },
    { code: "13", text: "Malgré nos demandes, nous n'avons pas reçu de rapport médical pour le Botox" },
  ]);
  assert.equal(mixed.resubmitPolicy, "manual_only");
}

// --- No structured errors (older messages): fall back to <invoice:explanation>. ---
{
  const fallback = classifyRejection(
    [],
    "1) Double calcul - facture d'origine en cours de traitement 2) Prestation TARDOC déjà compensée le même jour",
  );
  assert.equal(fallback.rejectionClass, "DUPLICATE_INVOICE");
  assert.equal(fallback.resubmitPolicy, "requires_storno");

  const nothing = classifyRejection([], null);
  assert.equal(nothing.rejectionClass, "UNKNOWN");
  assert.equal(nothing.resubmitPolicy, "manual_only");
}

// --- Diacritic/case independence, since insurers are inconsistent. ---
{
  assert.equal(normalise("Déjà REÇU  la même"), "deja recu la meme");
  assert.equal(
    classifyRejectionError({ text: "DOUBLE CALCUL - FACTURE D'ORIGINE REGLEE" }).rejectionClass,
    "DUPLICATE_INVOICE",
  );
}

console.log("medidataRejectionCodes: all assertions passed");
