/**
 * Classification of insurer rejection reasons from MediData / Forum
 * Datenaustausch `generalInvoiceResponse_500` payloads.
 *
 * Insurer responses carry machine-readable errors, e.g.
 *   <invoice:error record_id="2" code="000412"
 *                 text="Prestation TARDOC déjà compensée le même jour"/>
 *
 * Two things make naive code lookup unsafe, both observed in production:
 *
 *  1. Reject codes are NOT a single namespace. Sanitas emits 6-digit codes
 *     (`000125`, `000412`), other insurers emit 3-digit (`406`, `135`, `853`,
 *     `13`) and 5-digit (`59109`). Short codes genuinely collide in meaning
 *     across senders — `406` is a reject code for one insurer and a *tariff
 *     number* in another insurer's message text.
 *  2. Some codes are explicitly free-text carriers (`999` = "se réfère à un
 *     motif de renvoi en texte libre"), so the code says nothing at all.
 *
 * We therefore classify by code AND by message text, and reconcile the two.
 * Where they disagree the text wins (it states the reason directly) and the
 * conflict is flagged. Anything unrecognised is `UNKNOWN` / `manual_only`, so
 * a code we have never seen can never silently authorise a resend.
 */

export type RejectionClass =
  | 'DUPLICATE_INVOICE'
  | 'SERVICE_ALREADY_BILLED'
  | 'MISSING_SPECIALTY'
  | 'MISSING_DIAGNOSIS'
  | 'TARIFF_DATA'
  | 'TAX_POINT'
  | 'LAW_TYPE'
  | 'CONFIG_GLN'
  | 'CLINICAL_DOC'
  | 'NOT_INSURED'
  | 'UNKNOWN';

/** What a user is allowed to do next. */
export type ResubmitPolicy =
  /** Insurer already holds the invoice — must be cancelled (Storno) first. */
  | 'requires_storno'
  /** Fix the data on the invoice and send again; no Storno needed. */
  | 'allow_corrected_resend'
  /** Needs action outside the app (documents, contracts, configuration). */
  | 'manual_only';

export type RejectionErrorInput = {
  code?: string | null;
  text?: string | null;
  recordId?: string | null;
  insurerGln?: string | null;
};

export type Classification = {
  rejectionClass: RejectionClass;
  resubmitPolicy: ResubmitPolicy;
  matchedBy: 'code' | 'text' | 'code+text' | 'none';
  /** Code and text mapped to different classes; text was preferred. */
  conflict: boolean;
  /** Short operator-facing explanation of the required next step. */
  guidance: string;
};

const POLICY_BY_CLASS: Record<RejectionClass, ResubmitPolicy> = {
  DUPLICATE_INVOICE: 'requires_storno',
  SERVICE_ALREADY_BILLED: 'allow_corrected_resend',
  MISSING_SPECIALTY: 'allow_corrected_resend',
  MISSING_DIAGNOSIS: 'allow_corrected_resend',
  TARIFF_DATA: 'allow_corrected_resend',
  TAX_POINT: 'allow_corrected_resend',
  LAW_TYPE: 'manual_only',
  CONFIG_GLN: 'manual_only',
  CLINICAL_DOC: 'manual_only',
  NOT_INSURED: 'manual_only',
  UNKNOWN: 'manual_only',
};

const GUIDANCE: Record<RejectionClass, string> = {
  DUPLICATE_INVOICE:
    'The insurer already holds this invoice. Cancel the previous submission (Storno), then resend.',
  SERVICE_ALREADY_BILLED:
    'One or more services were already billed for this patient on this date. Remove or correct those lines, then resend.',
  MISSING_SPECIALTY:
    'The specialty code (service spécialisé / Fachgebiet) required for TARDOC positions was not transmitted. Set the treating provider\'s specialty, then resend.',
  MISSING_DIAGNOSIS:
    'A diagnosis required for tariff 007 (TARDOC) is missing. Add the ICD-10 diagnosis to the invoice, then resend.',
  LAW_TYPE:
    'The law type (KVG/UVG/IVG/MVG) on this invoice is not accepted by this cost bearer. Correct the law/cost bearer before resending.',
  TARIFF_DATA:
    'A tariff code on this invoice is not valid for the tariff used. Correct the service or material codes, then resend.',
  TAX_POINT:
    'The tax point value is higher than the insurer accepts. Check the tariff/tax point configuration, then resend.',
  CONFIG_GLN:
    'The billing party GLN/EAN is not recognised by the insurer. This is a configuration issue — do not resend until it is fixed.',
  CLINICAL_DOC:
    'The insurer is waiting for clinical documentation. Supply the report through the agreed channel; resending the invoice will not help.',
  NOT_INSURED:
    'The patient was not insured with this cost bearer on the treatment date. Re-bill the correct cost bearer or the patient.',
  UNKNOWN:
    'The rejection reason could not be classified automatically. Read the insurer message and decide manually.',
};

/**
 * Codes we are confident about. `insurerGln` narrows a code when the same
 * digits mean different things to different senders; entries without it apply
 * to any sender.
 */
type CodeRule = { code: string; insurerGln?: string; cls: RejectionClass };

const CODE_RULES: CodeRule[] = [
  // Invoice-level duplicates — the dominant rejection class in production.
  { code: '000125', cls: 'DUPLICATE_INVOICE' }, // "Double calcul", "déjà reçu/payée"
  { code: '135', cls: 'DUPLICATE_INVOICE' }, // "Facture deux fois imputée"
  { code: '406', cls: 'DUPLICATE_INVOICE' }, // "facture originale encore en cours de traitement"
  { code: 'eK5.1.2', cls: 'DUPLICATE_INVOICE' }, // "La facture a déjà été payée."
  { code: '4.102.000', cls: 'DUPLICATE_INVOICE' }, // "Facture avec le numéro ... déjà reçue le ..."

  // Missing specialty code on TARDOC positions. By occurrence this is the
  // single largest defect in the data (eK6.2.1 313x, 5.113.002 137x) — far
  // more than the duplicates, though it affects fewer distinct invoices.
  { code: 'eK6.2.1', cls: 'MISSING_SPECIALTY' }, // "service spécialisé correct"
  { code: '5.113.002', cls: 'MISSING_SPECIALTY' }, // "code de spécialité n'a pas été transmis, ligne N"

  // Diagnosis required for tariff 007 (TARDOC), per annex H.
  { code: '4.504.003', cls: 'MISSING_DIAGNOSIS' },
  { code: 'S_000772', cls: 'MISSING_DIAGNOSIS' }, // "Diagnostic manquant dans l'en-tête"

  // Law type not supported by this cost bearer (seen from Suva).
  { code: 'QD4', cls: 'LAW_TYPE' },

  // Line-level: that service was already compensated on that day.
  { code: '000412', cls: 'SERVICE_ALREADY_BILLED' }, // "Prestation TARDOC déjà compensée le même jour"
  { code: '005222', cls: 'SERVICE_ALREADY_BILLED' }, // "Prestation déjà compensée le même jour"
  { code: 'eK6.1.6', cls: 'SERVICE_ALREADY_BILLED' }, // "Prestation facturée à double." (still firing)

  // Tariff / material data problems.
  { code: '003622', cls: 'TARIFF_DATA' }, // "chiffre tarifaire ... n'existe pas"

  // Tax point values.
  { code: '59109', cls: 'TAX_POINT' }, // "Valeurs du point tarifaire trop élevées"

  // Configuration.
  { code: '853', cls: 'CONFIG_GLN' }, // "unknown mandant ean"

  // Clinical documentation outstanding.
  { code: '13', cls: 'CLINICAL_DOC' }, // "pas reçu de rapport médical"

  // `999` is an explicit free-text carrier: intentionally NOT mapped, so
  // classification falls through to the text patterns below.
];

/** Lowercase and strip diacritics so "déjà" and "deja" both match. */
export function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Text patterns, checked in order. French is what these insurers send today;
 * German equivalents are included because the same insurers switch language
 * per contract and the cost of being wrong is a duplicate rejection.
 */
const TEXT_RULES: Array<{ cls: RejectionClass; patterns: RegExp[] }> = [
  {
    cls: 'DUPLICATE_INVOICE',
    patterns: [
      /double calcul/,
      /deux fois impute/,
      /deja recu/,
      /deja ete payee/,
      /deja payee/,
      /facture originale/,
      /meme facture/,
      /doppelt/,
      /bereits erhalten/,
      /bereits bezahlt/,
      /rechnung .*bereits/,
    ],
  },
  {
    cls: 'SERVICE_ALREADY_BILLED',
    // Must come after DUPLICATE_INVOICE: an invoice-level duplicate message
    // can also mention compensated services, and Storno takes precedence.
    patterns: [
      /deja compensee/,
      /facturee a double/,
      /facture a double/,
      /bereits verguetet/,
      /bereits abgegolten/,
      /doppelt verrechnet/,
    ],
  },
  {
    // Before TARIFF_DATA: these messages name a "position tarifaire", which
    // would otherwise be swallowed by the tariff patterns.
    cls: 'MISSING_SPECIALTY',
    patterns: [
      /service specialise/,
      /code de specialite/,
      /fachgebiet/,
      /spezialitaetscode/,
      /code specialite/,
    ],
  },
  {
    cls: 'MISSING_DIAGNOSIS',
    patterns: [
      /diagnostic est manquant/,
      /diagnostic manquant/,
      /diagnose fehlt/,
      /fehlende diagnose/,
    ],
  },
  {
    cls: 'TAX_POINT',
    // Before TARIFF_DATA: "valeur du point tarifaire" contains "tarifaire".
    patterns: [
      /point tarifaire/,
      /taxe de valeur/,
      /taxpunktwert/,
      /taxpunkt/,
    ],
  },
  {
    cls: 'LAW_TYPE',
    patterns: [/pas supportee par la suva/, /sous .?loi.? n.est pas/, /gesetz .*nicht unterstuetzt/],
  },
  {
    cls: 'TARIFF_DATA',
    patterns: [
      /chiffre tarifaire/,
      /ne correspond pas au tarif/,
      /tarifziffer/,
      /tarif .*n.existe pas/,
    ],
  },
  {
    cls: 'CONFIG_GLN',
    patterns: [/mandant ean/, /unknown mandant/, /gln .*inconnu/, /ean .*unbekannt/],
  },
  {
    cls: 'CLINICAL_DOC',
    patterns: [/rapport medical/, /arztbericht/, /rapport .*botox/],
  },
  {
    cls: 'NOT_INSURED',
    patterns: [
      /n.etait pas assure/,
      /pas assure/,
      /nicht versichert/,
      /kein versicherungsschutz/,
    ],
  },
];

function classifyByCode(code: string | null | undefined, insurerGln?: string | null): RejectionClass | null {
  if (!code) return null;
  const trimmed = String(code).trim();
  if (!trimmed) return null;

  // Sender-specific rule first, then the generic one.
  const specific = CODE_RULES.find((r) => r.code === trimmed && r.insurerGln && r.insurerGln === insurerGln);
  if (specific) return specific.cls;

  const generic = CODE_RULES.find((r) => r.code === trimmed && !r.insurerGln);
  if (generic) return generic.cls;

  // Tolerate zero-padding differences between senders ("406" vs "000406").
  const unpadded = trimmed.replace(/^0+/, '');
  const padded = CODE_RULES.find((r) => !r.insurerGln && r.code.replace(/^0+/, '') === unpadded);
  return padded ? padded.cls : null;
}

function classifyByText(text: string | null | undefined): RejectionClass | null {
  if (!text) return null;
  const haystack = normalise(String(text));
  if (!haystack) return null;
  for (const rule of TEXT_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule.cls;
  }
  return null;
}

function build(cls: RejectionClass, matchedBy: Classification['matchedBy'], conflict: boolean): Classification {
  return {
    rejectionClass: cls,
    resubmitPolicy: POLICY_BY_CLASS[cls],
    matchedBy,
    conflict,
    guidance: GUIDANCE[cls],
  };
}

/** Classify one `<invoice:error>`. */
export function classifyRejectionError(input: RejectionErrorInput): Classification {
  const byCode = classifyByCode(input.code, input.insurerGln);
  const byText = classifyByText(input.text);

  if (byCode && byText) {
    if (byCode === byText) return build(byCode, 'code+text', false);
    // Disagreement: trust the message text, but surface that it happened so a
    // wrong CODE_RULES entry shows up in the worklist instead of hiding.
    return build(byText, 'text', true);
  }
  if (byText) return build(byText, 'text', false);
  if (byCode) return build(byCode, 'code', false);
  return build('UNKNOWN', 'none', false);
}

/**
 * Most restrictive policy wins:
 *   requires_storno > manual_only > allow_corrected_resend
 *
 * A duplicate must be cancelled before anything else can be corrected, so it
 * outranks even manual_only. An unclassifiable error must never be diluted by
 * a sibling error that happens to be resendable.
 */
const POLICY_RANK: Record<ResubmitPolicy, number> = {
  requires_storno: 3,
  manual_only: 2,
  allow_corrected_resend: 1,
};

/**
 * Classify a whole rejection. `fallbackExplanation` is the
 * `<invoice:explanation>` free text, used when a response carried no
 * structured `<invoice:error>` elements (older messages, and `999` senders).
 */
export function classifyRejection(
  errors: RejectionErrorInput[],
  fallbackExplanation?: string | null,
): Classification {
  const classified = (errors ?? [])
    .map(classifyRejectionError)
    .filter((c) => c.rejectionClass !== 'UNKNOWN' || (errors ?? []).length === 1);

  if (classified.length === 0) {
    if (fallbackExplanation) {
      const byText = classifyByText(fallbackExplanation);
      if (byText) return build(byText, 'text', false);
    }
    return build('UNKNOWN', 'none', false);
  }

  let winner = classified[0];
  for (const c of classified.slice(1)) {
    if (POLICY_RANK[c.resubmitPolicy] > POLICY_RANK[winner.resubmitPolicy]) winner = c;
  }
  return { ...winner, conflict: classified.some((c) => c.conflict) };
}

/** Convenience for UI badges. */
export const REJECTION_CLASS_LABELS: Record<RejectionClass, string> = {
  DUPLICATE_INVOICE: 'Duplicate invoice',
  SERVICE_ALREADY_BILLED: 'Service already billed',
  MISSING_SPECIALTY: 'Specialty code missing',
  MISSING_DIAGNOSIS: 'Diagnosis missing',
  TARIFF_DATA: 'Tariff data error',
  TAX_POINT: 'Tax point value',
  LAW_TYPE: 'Law type not accepted',
  CONFIG_GLN: 'GLN/EAN configuration',
  CLINICAL_DOC: 'Documentation outstanding',
  NOT_INSURED: 'Not insured on treatment date',
  UNKNOWN: 'Unclassified',
};
