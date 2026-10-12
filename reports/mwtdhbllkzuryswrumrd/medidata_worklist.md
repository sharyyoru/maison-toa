# MediData submission worklist — maisontoa-clinic (`mwtdhbllkzuryswrumrd`)

Generated 2026-10-12T21:49:43.144Z. **No invoice was re-submitted by this script.**

Covers every non-superseded submission that is `rejected`, or `pending` for more
than 45 days. Rejection reasons come from the insurer's own
`<invoice:error>` codes, now parsed into `medidata_response_errors`.

## Redundant active submissions retired

10 invoice(s) had more than one active submission. The newest is kept; the rest are marked `is_superseded` (applied).

| Invoice | Active | Statuses | Retiring |
|---|---:|---|---:|
| `1002320` | 2 | transmitted,transmitted | 1 |
| `1004472` | 2 | transmitted,pending | 1 |
| `1004860` | 2 | pending,pending | 1 |
| `1005445` | 2 | transmitted,pending | 1 |
| `1005500` | 2 | transmitted,pending | 1 |
| `1005758` | 2 | transmitted,pending | 1 |
| `1006256` | 2 | pending,pending | 1 |
| `1006751` | 2 | pending,pending | 1 |
| `1008343` | 2 | pending,pending | 1 |
| `67484` | 4 | transmitted,transmitted,transmitted,transmitted | 3 |

## Summary by reason

| Reason | Submissions | What to do |
|---|---:|---|
| Duplicate invoice | 132 | **Storno required** before any resend |
| Awaiting insurer response | 62 | Chase the insurer; resend is allowed (stale) |
| Specialty code missing | 29 | Fix the data, then resend |
| Unclassified | 22 | Manual handling — resending will not help |
| Service already billed | 9 | Fix the data, then resend |
| Tariff data error | 6 | Fix the data, then resend |
| Tax point value | 3 | Fix the data, then resend |
| Not insured on treatment date | 2 | Manual handling — resending will not help |
| Diagnosis missing | 2 | Fix the data, then resend |
| GLN/EAN configuration | 2 | Manual handling — resending will not help |
| Law type not accepted | 2 | Manual handling — resending will not help |
| Documentation outstanding | 1 | Manual handling — resending will not help |

## Duplicate invoice — 132

The insurer already holds this invoice. Cancel the previous submission (Storno), then resend.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1002320` | rejected | 124 | 5 | yes | eK5.1.2, eK5.1.2, eK5.1.2, eK5.1.2 | La facture a déjà été payée. |
| `1002787` | rejected | 123 | 4 | no | 000125, 000125, S_000772, S_000772 | Double calcul - facture d'origine en cours de traitement |
| `1002787` | rejected | 118 | 4 | no | 000125, 000125, S_000772, S_000772 | Double calcul - facture d'origine en cours de traitement |
| `1005410` | rejected | 98 | 4 | no | 000125 | Double calcul - facture d'origine en cours de traitement |
| `1002787` | rejected | 98 | 4 | no | 000125 | Double calcul - facture d'origine en cours de traitement |
| `1006204` | rejected | 83 | 4 | no | 000125 | Nous avons déjà reçu et payé la même facture avec le même numéro de facture et la même date de facturation. |
| `1005410` | rejected | 80 | 4 | no | 000125 | Double calcul - facture d'origine en cours de traitement |
| `1002315` | rejected | 124 | 3 | no | 4.102.000, 5.113.002, 4.504.003, 4.504.003 | Facture avec le numéro de facture 1002315 déjà reçue le 03.06.2026 |
| `1003466` | rejected | 118 | 3 | no | 4.102.000, 4.504.003, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1003466 déjà reçue le 15.06.2026 |
| `1002363` | rejected | 110 | 3 | no | 4.102.000, 4.504.003, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1002363 déjà reçue le 04.06.2026 |
| `1005404` | rejected | 98 | 3 | no | 000125 | Double calcul - facture d'origine en cours de traitement |
| `1006259` | rejected | 84 | 3 | no | 121 | La facture a déjà été payée ou elle est en cours de traitement. Dans ce cas, nous vous prions de patienter enc |
| `1005404` | rejected | 80 | 3 | no | 000125, 13, 13 | Double calcul - facture d'origine en cours de traitement |
| `1002363` | rejected | 61 | 3 | no | 006223, 000125, 000412, 000412 | Veuillez utiliser un code tarifaire valide afin de facturer correctement les consommables. Merci beaucoup. |
| `1002319` | rejected | 61 | 3 | no | 4.102.000, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1002319 déjà reçue le 21.05.2026 |
| `1002315` | rejected | 61 | 3 | no | 4.102.000, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1002315 déjà reçue le 03.06.2026 |
| `1006894` | rejected | 56 | 3 | no | eK5.1.2, eK5.1.2, eK6.2.1, eK6.2.1 | La facture a déjà été payée. |
| `1008509` | rejected | 39 | 3 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008509 déjà reçue le 31.08.2026 |
| `1008501` | rejected | 39 | 3 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008501 déjà reçue le 31.08.2026 |
| `1008499` | rejected | 39 | 3 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008499 déjà reçue le 31.08.2026 |
| `1007452` | rejected | 39 | 3 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1007452 déjà reçue le 17.08.2026 |
| `1008128` | rejected | 31 | 3 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008128 déjà reçue le 25.08.2026 |
| `1008509` | rejected | 27 | 3 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008509 déjà reçue le 31.08.2026 |
| `1008128` | rejected | 27 | 3 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008128 déjà reçue le 25.08.2026 |
| `1008499` | rejected | 27 | 3 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008499 déjà reçue le 31.08.2026 |
| `1008501` | rejected | 27 | 3 | no | 4.102.000, 4.102.000, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008501 déjà reçue le 31.08.2026 |
| `1007452` | rejected | 27 | 3 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1007452 déjà reçue le 17.08.2026 |
| `1008509` | rejected | 19 | 3 | no | 4.102.000 | Facture avec le numéro de facture 1008509 déjà reçue le 31.08.2026 |
| `1008499` | rejected | 19 | 3 | no | 4.102.000, 7.102.000 | Facture avec le numéro de facture 1008499 déjà reçue le 31.08.2026 |
| `1002321` | rejected | 124 | 2 | yes | eK5.1.2, eK5.1.2, eK5.1.2 | La facture a déjà été payée. |
| `1002364` | rejected | 123 | 2 | no | 000125, 005222, 005222, 005222 | Double calcul - facture d'origine réglée |
| `1003705` | rejected | 110 | 2 | no | 4.102.000, 4.102.000, 4.102.000, 4.102.000 | Facture avec le numéro de facture 1003705 déjà reçue le 18.06.2026 |
| `1005533` | rejected | 89 | 2 | no | 4.102.000, 5.113.002, 4.504.003, 4.504.003 | Facture avec le numéro de facture 1005533 déjà reçue le 07.07.2026 |
| `1005176` | rejected | 89 | 2 | no | 4.102.000, 4.504.003, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1005176 déjà reçue le 03.07.2026 |
| `1006464` | rejected | 81 | 2 | no | 4.102.000, 4.102.000, 4.102.000, 5.113.002 | Facture avec le numéro de facture 1006464 déjà reçue le 22.07.2026 |
| `1006517` | rejected | 80 | 2 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1006517 déjà reçue le 23.07.2026 |
| `1006582` | rejected | 80 | 2 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1006582 déjà reçue le 24.07.2026 |
| `1005533` | rejected | 61 | 2 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1005533 déjà reçue le 07.07.2026 |
| `1008527` | rejected | 39 | 2 | no | 4.102.000, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008527 déjà reçue le 31.08.2026 |
| `1007947` | rejected | 39 | 2 | no | RMT, 135, RMT | Cette personne ne dispose pas d'une couverture AOS auprès de CONCORDIA au moment du traitement. Veuillez envoy |
| `1008323` | rejected | 39 | 2 | no | 000125 | Nous avons déjà reçu et payé la même facture avec le même numéro de facture et la même date de facturation. |
| `1008791` | rejected | 31 | 2 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008791 déjà reçue le 03.09.2026 |
| `1009238` | rejected | 28 | 2 | no | 000125 | Double calcul - facture d'origine réglée |
| `1008791` | rejected | 27 | 2 | no | 4.102.000, 5.113.002, 5.113.002, 5.113.002 | Facture avec le numéro de facture 1008791 déjà reçue le 03.09.2026 |
| `1010106` | rejected | 17 | 2 | no | 4.102.000 | Facture avec le numéro de facture 1010106 déjà reçue le 24.09.2026 |
| `1009643` | rejected | 4 | 2 | no | 000125, 000412, 000412, 000412 | Double calcul - facture d'origine réglée |
| `1002343` | rejected | 125 | 1 | no | 406 | La facture originale de ce document est encore en cours de traitement chez nous.  L'original a le N° de factur |
| `1002362` | rejected | 123 | 1 | no | 406 | La facture originale de ce document est encore en cours de traitement chez nous.  L'original a le N° de factur |
| `1002323` | rejected | 122 | 1 | no | 000125 | Nous avons déjà reçu et payé la même facture avec le même numéro de facture et la même date de facturation. |
| `1003178` | rejected | 121 | 1 | no | eK5.1.2 | La facture a déjà été payée. |
| `1003459` | rejected | 116 | 1 | no | 406 | La facture originale de ce document est encore en cours de traitement chez nous.  L'original a le N° de factur |
| `1002340` | rejected | 110 | 1 | no | 406, 406, 406, 406 | La facture originale de ce document est encore en cours de traitement chez nous.  L'original a le N° de factur |
| `1003457` | rejected | 110 | 1 | no | 406, 406, 406, 406 | La facture originale de ce document est encore en cours de traitement chez nous.  L'original a le N° de factur |
| `1003478` | rejected | 110 | 1 | no | 135, 135, 135, 135 | Facture deux fois imputée. Original: no int. 142760155 / no ext. 1003478. |
| `1003284` | rejected | 110 | 1 | no | 000125, 000125, 000125, 000125 | Nous avons déjà reçu la même facture (elle est en cours de traitement). |
| `1002905` | rejected | 110 | 1 | no | 000125 | Nous avons déjà reçu la même facture (elle est en cours de traitement). |
| `1002344` | rejected | 110 | 1 | no | 999, 000125 | Notre demande du 04.08.2026 ne nous est pas parvenue. |
| `1004402` | rejected | 101 | 1 | no | 000125, 005222, 005222, 005222 | Double calcul - facture d'origine réglée |
| `1006043` | rejected | 89 | 1 | no | 000125 | Double calcul - facture d'origine en cours de traitement |
| `1005935` | rejected | 89 | 1 | no | eK5.1.2 | La facture a déjà été payée. |

_…and 72 more._

## Awaiting insurer response — 62

Transmitted but no insurer response after 45+ days. Chase MediData/the insurer. The submission guard treats these as stale, so a resend is permitted and will supersede this row.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1004860` | pending | 61 | 5 | no | — |  |
| `1005410` | pending | 53 | 4 | no | — |  |
| `1005404` | pending | 98 | 3 | no | — |  |
| `1002363` | pending | 98 | 3 | no | — |  |
| `1006256` | pending | 61 | 3 | no | — |  |
| `1006894` | pending | 59 | 3 | no | — |  |
| `1004472` | pending | 109 | 2 | no | — |  |
| `1004151` | pending | 109 | 2 | no | — |  |
| `1002364` | pending | 109 | 2 | no | — |  |
| `1003705` | pending | 109 | 2 | no | — |  |
| `1005445` | pending | 97 | 2 | no | — |  |
| `1005500` | pending | 89 | 2 | no | — |  |
| `1006294` | pending | 84 | 2 | no | — |  |
| `1006258` | pending | 84 | 2 | no | — |  |
| `1006464` | pending | 81 | 2 | no | — |  |
| `1006582` | pending | 61 | 2 | no | — |  |
| `1006517` | pending | 61 | 2 | no | — |  |
| `1005176` | pending | 61 | 2 | no | — |  |
| `1006751` | pending | 59 | 2 | no | — |  |
| `1006940` | pending | 56 | 2 | no | — |  |
| `1007407` | pending | 54 | 2 | no | — |  |
| `1004181` | pending | 110 | 1 | no | — |  |
| `1001230` | pending | 98 | 1 | no | — |  |
| `1005454` | pending | 97 | 1 | no | — |  |
| `1005469` | pending | 97 | 1 | no | — |  |
| `1006019` | pending | 89 | 1 | no | — |  |
| `1005701` | pending | 89 | 1 | no | — |  |
| `1006290` | pending | 84 | 1 | no | — |  |
| `1006293` | pending | 84 | 1 | no | — |  |
| `1006291` | pending | 84 | 1 | no | — |  |
| `1006227` | pending | 84 | 1 | no | — |  |
| `1006292` | pending | 84 | 1 | no | — |  |
| `1006262` | pending | 84 | 1 | no | — |  |
| `1005596` | pending | 84 | 1 | no | — |  |
| `1005828` | pending | 84 | 1 | no | — |  |
| `1006261` | pending | 84 | 1 | no | — |  |
| `1006257` | pending | 83 | 1 | no | — |  |
| `1006415` | pending | 81 | 1 | no | — |  |
| `1006382` | pending | 81 | 1 | no | — |  |
| `1006388` | pending | 81 | 1 | no | — |  |
| `1006580` | pending | 80 | 1 | no | — |  |
| `1006515` | pending | 80 | 1 | no | — |  |
| `1007258` | pending | 59 | 1 | no | — |  |
| `1007173` | pending | 59 | 1 | no | — |  |
| `1006938` | pending | 59 | 1 | no | — |  |
| `1006587` | pending | 59 | 1 | no | — |  |
| `1006795` | pending | 59 | 1 | no | — |  |
| `1006891` | pending | 59 | 1 | no | — |  |
| `1006947` | pending | 59 | 1 | no | — |  |
| `1006902` | pending | 59 | 1 | no | — |  |
| `1006901` | pending | 59 | 1 | no | — |  |
| `1006963` | pending | 59 | 1 | no | — |  |
| `1007134` | pending | 59 | 1 | no | — |  |
| `1007155` | pending | 59 | 1 | no | — |  |
| `1007263` | pending | 59 | 1 | no | — |  |
| `1006933` | pending | 59 | 1 | no | — |  |
| `1006900` | pending | 59 | 1 | no | — |  |
| `1007367` | pending | 56 | 1 | no | — |  |
| `1007363` | pending | 56 | 1 | no | — |  |
| `1007408` | pending | 56 | 1 | no | — |  |

_…and 2 more._

## Specialty code missing — 29

The specialty code (service spécialisé / Fachgebiet) required for TARDOC positions was not transmitted. Set the treating provider's specialty, then resend.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1005474` | rejected | 89 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006520` | rejected | 80 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006581` | rejected | 80 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006581` | rejected | 61 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006520` | rejected | 61 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1005474` | rejected | 61 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1005474` | rejected | 59 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006520` | rejected | 59 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006581` | rejected | 59 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1005474` | rejected | 27 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006520` | rejected | 27 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006581` | rejected | 27 | 5 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006896` | rejected | 59 | 4 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006597` | rejected | 59 | 4 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006896` | rejected | 56 | 4 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006597` | rejected | 56 | 4 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006896` | rejected | 27 | 4 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006597` | rejected | 27 | 4 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1003466` | rejected | 98 | 3 | no | 5.113.002, 5.113.002 | Le code de spécialité n’a pas été transmis, ligne 4 concernant la position tarifaire AK.00.0090. Selon l’annex |
| `1006256` | rejected | 84 | 3 | no | eK2.3.3, eK2.3.3, eK6.2.1, eK6.2.1 | A la date de l'octroi des prestations, nous ne couvrions pas encore/plus votre patient par le biais de l'assur |
| `1006894` | rejected | 59 | 3 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006793` | rejected | 59 | 3 | no | eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1008433` | rejected | 39 | 3 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1007938` | rejected | 39 | 3 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1009259` | rejected | 31 | 3 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1007938` | rejected | 27 | 3 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1006793` | rejected | 27 | 3 | no | eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1008433` | rejected | 27 | 3 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |
| `1005841` | rejected | 89 | 1 | no | eK6.2.1, eK6.2.1, eK6.2.1, eK6.2.1 | Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc |

## Unclassified — 22

The rejection reason could not be classified automatically. Read the insurer message and decide manually.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1006204` | rejected | 84 | 4 | no | — |  |
| `1006204` | rejected | 84 | 4 | no | — |  |
| `1006204` | rejected | 83 | 4 | no | — |  |
| `1002315` | rejected | 123 | 3 | no | — |  |
| `1006259` | rejected | 84 | 3 | no | — |  |
| `1006259` | rejected | 84 | 3 | no | — |  |
| `1009259` | rejected | 31 | 3 | no | — |  |
| `1002337` | rejected | 110 | 2 | no | — |  |
| `1006294` | rejected | 84 | 2 | no | — |  |
| `1006258` | rejected | 84 | 2 | no | — |  |
| `1006940` | rejected | 59 | 2 | no | — |  |
| `1008488` | rejected | 39 | 2 | no | — |  |
| `1008323` | rejected | 39 | 2 | no | — |  |
| `1009238` | rejected | 31 | 2 | no | — |  |
| `1009078` | rejected | 31 | 2 | no | — |  |
| `1008938` | rejected | 31 | 2 | no | — |  |
| `1008843` | rejected | 31 | 2 | no | — |  |
| `1008748` | rejected | 31 | 2 | no | — |  |
| `1010172` | rejected | 17 | 2 | no | — |  |
| `1010074` | rejected | 17 | 2 | no | — |  |
| `1009405` | rejected | 17 | 2 | no | — |  |
| `1003363` | rejected | 118 | 1 | no | — |  |

## Service already billed — 9

One or more services were already billed for this patient on this date. Remove or correct those lines, then resend.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1006581` | rejected | 19 | 5 | no | eK6.1.6, eK6.1.6 | 007 - AA.00.0070 - AA.00.0070 - Instruction du patient par le medecin pour lui apprendre à effectuer lui-même  |
| `1006520` | rejected | 19 | 5 | no | eK6.1.6, eK6.1.6, eK6.1.6 | 007 - AA.00.0070 - AA.00.0070 - Instruction du patient par le medecin pour lui apprendre à effectuer lui-même  |
| `1005474` | rejected | 19 | 5 | no | eK6.1.6, eK6.1.6, eK6.1.6 | 007 - AA.00.0070 - AA.00.0070 - Instruction du patient par le medecin pour lui apprendre à effectuer lui-même  |
| `1006597` | rejected | 19 | 4 | no | eK6.1.6, eK6.1.6, eK6.1.6, eK6.1.6 | 007 - AA.00.0070 - AA.00.0070 - Instruction du patient par le medecin pour lui apprendre à effectuer lui-même  |
| `1006896` | rejected | 19 | 4 | no | eK6.1.6, eK6.1.6, eK6.1.6 | 007 - AA.00.0070 - AA.00.0070 - Instruction du patient par le medecin pour lui apprendre à effectuer lui-même  |
| `1006793` | rejected | 19 | 3 | no | eK6.1.6, eK6.1.6 | 007 - AA.10.0010 - AA.10.0010 - Consultation télémédicale simultanée, premières 5min: Prestation facturée à do |
| `1007938` | rejected | 19 | 3 | no | eK6.1.6, eK6.1.6, eK6.1.6, eK6.1.6 | 007 - AA.00.0070 - AA.00.0070 - Instruction du patient par le medecin pour lui apprendre à effectuer lui-même  |
| `1009642` | rejected | 4 | 2 | no | 000412, 000412, 000412, 000412 | Prestation TARDOC déjà compensée le même jour |
| `1006781` | rejected | 59 | 1 | no | 005222, 005222, 005222, 005222 | Prestation déjà compensée le même jour |

## Tariff data error — 6

A tariff code on this invoice is not valid for the tariff used. Correct the service or material codes, then resend.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1008843` | rejected | 28 | 2 | no | 003622, 003622, S_003622, 003622 | 04.09.2026: Le chiffre tarifaire (15.0 / Aiguille Rose 18 G - 38 MM) dans le tarif (590) n'existe pas. Plus d' |
| `1009642` | rejected | 17 | 2 | no | 003622, 003622, 003622, 003622 | Le chiffre tarifaire ne correspond pas au tarif fourni. |
| `1009643` | rejected | 17 | 2 | no | 003622, 003622, 003622, 003622 | Le chiffre tarifaire ne correspond pas au tarif fourni. |
| `1009595` | rejected | 17 | 2 | no | 003622, 003622, 003622, 003622 | 15.09.2026: Le chiffre tarifaire (0093 / Ciseau Stevens courves, 11 cm) dans le tarif (406) n'existe pas. Plus |
| `1009595` | rejected | 4 | 2 | no | 003622, 003622, 003622, 003622 | 15.09.2026: Le chiffre tarifaire (0093 / Ciseau Stevens courves, 11 cm) dans le tarif (406) n'existe pas. Plus |
| `1010257` | rejected | 4 | 1 | no | 003622, 003622 | 25.09.2026: Le chiffre tarifaire (0065 / Ampoules Triamcort) dans le tarif (406) n'existe pas. Plus d'informat |

## Tax point value — 3

The tax point value is higher than the insurer accepts. Check the tariff/tax point configuration, then resend.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `67484` | rejected | 124 | 8 | yes | eK6.T001, eK6.T001, eK6.T001, eK6.T001 | 007 - AA.15.0010 - Etude de dossiers provenant de tiers, en l'absence du patient, par période de 1 min: La tax |
| `1009570` | rejected | 17 | 2 | no | 59109 | Valeurs du point tarifaire trop élevées. |
| `1009570` | rejected | 4 | 2 | no | 59109, 59109 | Valeurs du point tarifaire trop élevées. |

## Not insured on treatment date — 2

The patient was not insured with this cost bearer on the treatment date. Re-bill the correct cost bearer or the patient.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1004860` | rejected | 101 | 5 | no | 2.401.000, 2.401.000, eK6.2.1, eK6.2.1 | Le client n'était pas assuré auprès du répondant des coûts au moment du traitement. |
| `1004860` | rejected | 98 | 5 | no | 2.401.000, 2.401.000, eK6.2.1, eK6.2.1 | Le client n'était pas assuré auprès du répondant des coûts au moment du traitement. |

## Diagnosis missing — 2

A diagnosis required for tariff 007 (TARDOC) is missing. Add the ICD-10 diagnosis to the invoice, then resend.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1002319` | rejected | 124 | 3 | no | 4.504.003, 5.113.002, 5.113.002, 4.504.003 | Le diagnostic est manquant pour la prestation du tarif 007. Selon l'annexe H de la convention de structure tar |
| `1004151` | rejected | 110 | 2 | no | 4.504.003, 5.113.002, 4.504.003, 5.113.002 | Le diagnostic est manquant pour la prestation du tarif 007. Selon l'annexe H de la convention de structure tar |

## GLN/EAN configuration — 2

The billing party GLN/EAN is not recognised by the insurer. This is a configuration issue — do not resend until it is fixed.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1007407` | rejected | 56 | 2 | no | 853, 853 | unknown mandant ean |
| `1010021` | rejected | 17 | 2 | no | 853, 853 | unknown mandant ean |

## Law type not accepted — 2

The law type (KVG/UVG/IVG/MVG) on this invoice is not accepted by this cost bearer. Correct the law/cost bearer before resending.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1003054` | rejected | 112 | 1 | no | QD4, QD4 | L'indication figurant sur la facture sous le point "Loi" n'est pas supportée par la Suva |
| `1003055` | rejected | 110 | 1 | no | QD4, QD4, QD4, QD4 | L'indication figurant sur la facture sous le point "Loi" n'est pas supportée par la Suva |

## Documentation outstanding — 1

The insurer is waiting for clinical documentation. Supply the report through the agreed channel; resending the invoice will not help.

| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |
|---|---|---:|---:|---|---|---|
| `1005410` | rejected | 53 | 4 | no | 13, 13 | Malgré nos demandes, nous n'avons pas reçu de rapport médical pour le Botox |

## Note on patient copies

Submissions left `pending` that appear to have a rejection response received it
for a **patient copy** (TP Art. 42), which insurers routinely reject as a
duplicate of the original. `/api/medidata/poll` ignores those by design and this
script does not override them — the original invoice is still legitimately in
flight. Do not treat them as failures on the strength of the copy rejection.
