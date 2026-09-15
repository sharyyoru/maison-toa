# Sumex Proxy v2 (Windows VM)

Reverse proxy in front of the four Sumex1 REST servers, listening on `:8080`.

## What's new in v2 (vs. the proxy currently running)
1. **`POST /batch`** — executes an array of Sumex calls **sequentially, VM-locally**
   in one HTTP round-trip. This is the key performance fix for BILL-009:
   one invoice generation makes ~35–45 Sumex calls; over the WAN each costs a
   full round-trip (~60–250 ms), on the VM each costs ~1 ms.

   ```json
   POST /batch
   {
     "stopOnError": true,
     "calls": [
       { "method": "POST",
         "path": "/generalInvoiceRequestManagerServer500/IGeneralInvoiceRequest/SetTreatment",
         "body": { "pIGeneralInvoiceRequest": 123, "...": "..." } },
       { "method": "GET",
         "path": "/generalInvoiceRequestManagerServer500/IGeneralInvoiceRequest/GetCreateServiceExInput?pIGeneralInvoiceRequest=123&bstrTariffType=007" }
     ]
   }
   ```
   Response: `{ "results": [{"status":200,"ms":12.3,"json":{...}}, ...],
   "totalMs": ..., "completed": N, "aborted": false }`.
   A call with HTTP ≥ 400 or `pbStatus === false` aborts the rest
   (remaining slots return `{"skipped": true}`).

2. **`X-Upstream-Ms` response header** on every proxied call — lets the app
   distinguish network time from Sumex COM processing time (profiling).

## Install / update on the VM
1. Stop the service: `python sumex_proxy.py stop` (or `net stop SumexProxy`)
2. Replace the script with this version (same path as the current one)
3. Start: `python sumex_proxy.py start` (or `net start SumexProxy`)
4. Verify: `curl http://localhost:8080/health` and
   `curl -X POST http://localhost:8080/batch -H "Content-Type: application/json" -d "{\"calls\":[{\"method\":\"GET\",\"path\":\"/generalInvoiceRequestManagerServer500/IGeneralInvoiceRequestManager/GetCreateGeneralInvoiceRequestManager\"}]}"`

No other configuration changes; routes/ports/logging are identical to v1.

## App side
Once v2 is live, the app (`src/lib/sumexInvoice.ts`) can be switched to batch
mode (planned follow-up): it will probe `/batch` once and fall back to
per-call mode automatically if unavailable, so deploying either side first is
safe.
