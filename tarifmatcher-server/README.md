# TarifMatcher server

HTTP wrapper around the official OAAT TarifMatcher 1.2.1 — the ambulatory
flat-rate grouper that turns gesture codes + an ICD-10 diagnosis into a flat
rate. It runs as its own service (Google Cloud Run) because the grouper is a
Java library and Vercel's Node runtime has no JVM.

The app works without it: `src/lib/acfGrouper.ts` evaluates the same official
PCS files in TypeScript (checked against this jar on thousands of random
cases). When `TARIFMATCHER_URL` is set, `/api/acf/sumex` (`runGrouper`) asks
this service too and the official result wins on any disagreement; if the
service is down, the built-in result is used and a warning is returned.

## Tariff years

One tariff bundle per application year, chosen from the treatment date on the
Europe/Zurich calendar. There is no default year: a request without
`serviceDate` / `applicationYear`, or for a year that is not loaded, gets 400.

| Year | PCS | Catalogue | LKAAT | TARDOC |
|---|---|---|---|---|
| 2026 | `system_ambP_11c_260402_lkaat.json` (V1.1d_lk) | `catalog_ambP_11c.csv` | `lkaat_1.0c_251128.json` | `tardoc_TARDOC_1.4c_251128_fr.json` |
| 2027 | `system_ambP_12_lkaat.json` (V1.2_lk) | `catalog_ambP_12.csv` | `lkaat_1.1.json` | `tardoc_TARDOC_1.5_fr.json` |

The files are byte-identical to the official OAAT archives and to
`src/data/oaat/2026/` and `src/data/oaat/2027/` (hashes in their `meta.json`).

## Endpoints

```
GET  /health  -> { ok, supportedYears: [2026, 2027], missing: [] }   (no secret needed)
POST /group   header x-tarifmatcher-secret: <TARIFMATCHER_SECRET>
  { serviceDate: "2026-03-01",            // or applicationYear: 2026
    services: ["C09.AC.0140", { code: "AA.00.0020", side: "L", number: 2 }],
    diagnoses: ["N64.8"], ageYears: 45, sex: "M" | "W", drugs: [] }
  // or { serviceDate, cases: [ {caseId, services, diagnoses, ...}, ... ] } (max 500)
  -> { ok, applicationYear, results: [{ caseId, flatRate, costWeight, mappedTardocs }], warnings }
```

`sex` matters for 2026: V1.1d has sex-specific chapter rules (e.g.
`C09.AC.0140` + `N40` groups to `C90.01B` for M and `C99.80Z` for W).

## Deploying to Google Cloud Run

Needs `gcloud` logged in with Cloud Run Admin, Cloud Build Editor, Artifact
Registry Admin, Service Account User and Secret Manager Admin on the project.

One-time setup:

```bash
PROJECT=my-gcp-project
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com --project $PROJECT
printf %s "$(openssl rand -hex 32)" | gcloud secrets create tarifmatcher-secret --data-file=- --project $PROJECT
# Let the Cloud Run runtime service account read it:
PN=$(gcloud projects describe $PROJECT --format 'value(projectNumber)')
gcloud secrets add-iam-policy-binding tarifmatcher-secret --project $PROJECT \
  --member "serviceAccount:${PN}-compute@developer.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor
```

Deploy (and every update):

```bash
GCP_PROJECT=$PROJECT ./tarifmatcher-server/deploy.sh   # region europe-west6 (Zurich)
```

`deploy.sh` builds this folder with Cloud Build, deploys service
`maison-toa-tarifmatcher` (1 vCPU, 1 GiB, 4 concurrent requests — each request
starts one JVM — scale to zero, max 3 instances) with a startup probe on
`/health`, and prints the health response. The service is public at the
network level (Vercel cannot present Google IAM tokens); `/group` is protected
by the shared secret.

Then in Vercel (Production) set, and redeploy:

- `TARIFMATCHER_URL` = the `https://…run.app` URL printed by `deploy.sh`
- `TARIFMATCHER_SECRET` = `gcloud secrets versions access latest --secret tarifmatcher-secret`

Rollback: `gcloud run services update-traffic maison-toa-tarifmatcher
--to-revisions <previous-revision>=100 --region europe-west6`, or unset
`TARIFMATCHER_URL` in Vercel to go back to the built-in grouper only.

## Notes on the vendor jar

- The manifest declares `Main-Class: …Batchgrouper.java` (with `.java`), so
  `java -jar` fails; `server.js` runs it on the classpath.
- The batch input is `;`-separated with a header naming PCS variables. List
  values inside a field are separated by `|` — a comma is **not** a
  separator, `A,B` is read as one unknown code. A service is
  `code:side:date:number:session`.
- The wrapper shells out to the vendor's batch grouper rather than
  reimplementing its decision trees.

## Local check

```bash
cd tarifmatcher-server
npm test                  # starts the server and checks the jar on 2026 + 2027 cases
docker build -t tarifmatcher . && docker run --rm -p 8080:8080 -e TARIFMATCHER_SECRET=dev tarifmatcher
curl -s localhost:8080/health
curl -s -X POST localhost:8080/group -H 'Content-Type: application/json' -H 'x-tarifmatcher-secret: dev' \
  -d '{"serviceDate":"2026-03-01","services":["C09.AC.0140"],"diagnoses":["N64.8"],"ageYears":45,"sex":"W"}'
```
