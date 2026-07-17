# Laura Bookings Export API

This API lets Laura (and other authorized consumers) export appointment/booking data as JSON for reporting and Meta ads attribution.

## Base URL

```
https://maison-toa-dk99.vercel.app/api/laura
```

Replace with the local/ staging URL during development (`http://localhost:3000/api/laura`, etc.).

## Authentication

Every request must include the API key in the `X-API-Key` header.

```http
X-API-Key: <LAURA_API_KEY>
```

Keep this key secret. It is stored in the `organization_api_keys` table as a SHA-256 hash.

## Endpoints

### 1. Export bookings

`GET /api/laura/bookings`

Returns a paginated list of appointments between `from` and `to` (inclusive, interpreted as Swiss/Europe-Zurich dates).

#### Query parameters

| Param    | Type     | Required | Default | Description |
|----------|----------|----------|---------|-------------|
| `from`   | `date`   | yes      | —       | Start date `YYYY-MM-DD` |
| `to`     | `date`   | yes      | —       | End date `YYYY-MM-DD` |
| `status` | string[] | no       | all     | Comma-separated appointment statuses: `scheduled,confirmed,completed,cancelled,no_show` |
| `source` | string[] | no       | all     | Comma-separated sources: `manual,ai,online_booking` |
| `service`| string[] | no       | all     | Comma-separated service names (case-insensitive substring match) |
| `page`   | integer  | no       | `1`     | Page number |
| `limit`  | integer  | no       | `500`   | Page size (max `2000`) |

#### Example

```bash
curl -H "X-API-Key: <LAURA_API_KEY>" \
  "https://maison-toa-dk99.vercel.app/api/laura/bookings?from=2026-08-01&to=2026-08-31&status=confirmed,cancelled,no_show&limit=1000"
```

#### Response

```json
{
  "data": [
    {
      "id": "...",
      "patient_id": "...",
      "patient_first_name": "Jane",
      "patient_last_name": "Doe",
      "patient_email": "jane@example.com",
      "patient_phone": "+41 ...",
      "patient_dob": "1985-03-15",
      "start_time": "2026-08-10T09:00:00+00:00",
      "end_time": "2026-08-10T09:30:00+00:00",
      "status": "confirmed",
      "status_group": "confirmed",
      "reason": "HIFU Treatment [Doctor: Sophie Nordback] [Online Booking] [Lang: en] [Category: Face]",
      "title": null,
      "notes": null,
      "location": "Geneva",
      "source": "online_booking",
      "channel": "meta",
      "channel_group": "meta_ads",
      "tracking_params": {
        "utm_source": "meta",
        "utm_medium": "paid_social",
        "utm_campaign": "summer_hifu",
        "fbclid": "abc123"
      },
      "service_name": "HIFU Treatment",
      "price": 250.00,
      "deal_value": 250.00,
      "currency": "CHF",
      "provider_name": "Dr. Sophie Nordback",
      "doctor_name": "Sophie Nordback",
      "created_at": "2026-08-01T14:23:00+00:00"
    }
  ],
  "meta": {
    "from": "2026-08-01",
    "to": "2026-08-31",
    "status": "confirmed,cancelled,no_show",
    "source": null,
    "service": null,
    "page": 1,
    "limit": 1000,
    "count": 1,
    "total": 1
  }
}
```

#### Field notes

- `status_group` collapses `scheduled`, `confirmed`, `completed` into `confirmed` and keeps `cancelled` and `no_show` distinct.
- `channel` shows the captured `utm_source` or the raw `source`.
- `channel_group` is `meta_ads` when the booking came from an online-booking URL carrying `fbclid`, `utm_source` containing `meta/facebook/instagram/fb`, or `utm_medium` containing `cpc/paid_social/paid`.
- `price` is taken from the deal value, the linked service's `base_price`, or the `service_ids[0]` service price, in that order.
- `service_name` is taken from the booking treatment, linked service, parsed `reason` text, or appointment category.

### 2. Filter options

`GET /api/laura/bookings/filters`

Returns the distinct statuses, sources, and service names that can be used in the export filters.

```bash
curl -H "X-API-Key: <LAURA_API_KEY>" \
  "https://maison-toa-dk99.vercel.app/api/laura/bookings/filters"
```

```json
{
  "statuses": ["scheduled", "confirmed", "completed", "cancelled", "no_show"],
  "sources": ["ai", "manual", "online_booking"],
  "services": ["Consultation", "HIFU Treatment", "..."]
}
```

## Meta ads attribution

The public booking pages capture UTM and click IDs from the URL and `sessionStorage`, then store them in `appointments.tracking_params`. This lets the export API distinguish Meta-paid bookings from organic online bookings.

Tracked parameters:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `gclid` (Google)
- `fbclid` (Meta)

To use this with Meta ads, append UTM parameters to the booking page URL, for example:

```
https://maison-toa-dk99.vercel.app/book-appointment/new-patient/face/hifu/sophie-nordback?utm_source=meta&utm_medium=paid_social&utm_campaign=summer_hifu&fbclid=...
```

The API will then report `channel_group: "meta_ads"` for those bookings.

## Regenerating / rotating the API key

If the key is compromised or needs rotation, generate a new one and insert it:

```bash
# In the project directory
node -e "const c=require('crypto'); console.log('laura_'+c.randomBytes(32).toString('hex'))"

# Then insert the SHA-256 hash into the database
PGPASSWORD=<password> psql <connection-string> -c \
  "INSERT INTO organization_api_keys (name, key_hash, scopes) VALUES ('Laura Bookings Export', '<sha256-hash>', ARRAY['bookings:read']);"
```

Update this documentation and the consumer's configuration with the new key.
