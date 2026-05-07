# Spec 17 — Services & Categories

## Overview

There are **two separate category/service systems** in this project that serve different purposes and must not be confused:

| System | Tables | Used By | Managed At |
|---|---|---|---|
| **Service Catalog** | `service_categories`, `services`, `service_groups`, `service_group_services` | Invoicing, billing, medication templates | `/services` |
| **Booking Catalog** | `booking_categories`, `booking_treatments` | Public booking funnel | `/admin/booking-categories` + `/settings` |

---

## System A — Service Catalog (`/services`)

### Purpose
Internal catalog of billable services used when creating invoices and prescriptions. Not directly visible to patients.

### Route
`/services` — authenticated staff only

### Tabs
The page has 5 tabs:
1. **Categories** — manage `service_categories`
2. **Services** — manage `services`
3. **Groups** — manage `service_groups` + `service_group_services`
4. **TarDoc Groups** — TARDOC tariff groups (separate component `TardocGroupsTab`)
5. **Medication Templates** — medication templates (separate component `MedicationTemplatesTab`)

---

### Tab 1: Categories

**Table**: `service_categories`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Required |
| `description` | text | Optional |
| `sort_order` | int | Controls display order |
| `color` | text | Tailwind class e.g. `bg-emerald-300/70` |

**Features**:
- Create category (name + description)
- Edit category inline (name, description, color picker from 19 preset Tailwind colors)
- Delete category — blocked if any services exist under it
- Search/filter by name
- Sort order is auto-assigned as `max(sort_order) + 1` on create

**Color presets** (19 options): Slate, Gray, Red, Orange, Amber, Yellow, Lime, Green, Emerald, Teal, Cyan, Sky, Blue, Indigo, Violet, Purple, Fuchsia, Pink, Rose — all as `bg-{color}-300/70`

---

### Tab 2: Services

**Table**: `services`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `category_id` | uuid | FK → service_categories |
| `name` | text | Required |
| `code` | text | Optional service code |
| `description` | text | Optional |
| `is_active` | bool | Default true |
| `base_price` | numeric | CHF, optional |
| `duration_minutes` | int | Optional |
| `vat_status` | text | `"voll"` (taxable) or `"befreit"` (exempt) |
| `vat_rate_pct` | numeric | 8.1 if voll, 0 if befreit |

**Features**:
- Create service (category, name, description, price, duration, VAT toggle)
- Edit service inline (same fields + can change category)
- Delete service
- Search by name/description
- Filter by category (dropdown with search)
- Pagination: 20 items per page
- Toggle `is_active` (active/inactive badge)
- Duration displayed as human-readable: `45 min`, `1 hr`, `1 hr 30 min`

**VAT logic**: checkbox "VAT applicable" → if checked: `vat_status = "voll"`, `vat_rate_pct = 8.1`; if unchecked: `vat_status = "befreit"`, `vat_rate_pct = 0`

---

### Tab 3: Groups (Service Packages)

**Tables**: `service_groups`, `service_group_services`

`service_groups`:
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Required |
| `description` | text | Optional |
| `discount_percent` | numeric | Group-level discount (0–100) |

`service_group_services`:
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `group_id` | uuid | FK → service_groups |
| `service_id` | uuid | FK → services |
| `discount_percent` | numeric | Per-item override discount |
| `quantity` | int | Default 1 |

**Features**:
- Create group (name, description, group discount %, select services with per-item discount % and quantity)
- Delete group (cascades to service_group_services)
- Search groups by name
- Search services within group creation form
- Pagination: 20 items per page

---

## System B — Booking Catalog

### Purpose
Controls what patients see in the **public booking funnel** (`/book-appointment`). Completely separate from the service catalog.

### Two sub-systems within Booking Catalog

#### B1: Booking Categories + Treatments (`/admin/booking-categories`)

**Tables**: `booking_categories`, `booking_treatments`

`booking_categories`:
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Display name |
| `description` | text | Optional |
| `patient_type` | text | `"new"` or `"existing"` |
| `order_index` | int | Display order |
| `slug` | text | URL slug |
| `enabled` | bool | Show/hide in funnel |
| `skip_treatment` | bool | Skip treatment selection step |

`booking_treatments`:
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `category_id` | uuid | FK → booking_categories |
| `name` | text | Treatment name |
| `description` | text | Optional |
| `duration_minutes` | int | Default 30 |
| `order_index` | int | Display order |
| `enabled` | bool | Show/hide |

**Features at `/admin/booking-categories`**:
- Two tabs: "First-Time Patients" / "Existing Patients"
- Add/edit/delete categories per patient type
- Reorder categories with up/down arrows
- Fields: name, slug, description, enabled toggle
- **Save is batch** — all changes saved at once via `PUT /api/settings/booking-categories`

**API**:
- `GET /api/settings/booking-categories` — returns all categories
- `PUT /api/settings/booking-categories` — upserts all, deletes removed ones
- `GET /api/settings/booking-treatments?category_id=...` — returns treatments for a category
- `PUT /api/settings/booking-treatments` — batch upsert
- `POST /api/settings/booking-treatments` — create single treatment
- `DELETE /api/settings/booking-treatments?id=...` — delete single treatment

#### B2: Booking Doctors (`/settings` → booking tab)

**Tables**: `booking_doctors`, `booking_doctor_treatment_assignments`

Controls which doctors appear for which treatments in the public funnel.

**API**:
- `GET /api/settings/booking-doctors`
- `GET /api/settings/booking-doctor-assignments`

---

## What's Missing / Gaps to Implement

Based on the scan, these features are **absent or incomplete**:

1. **No treatment management UI at `/admin/booking-categories`** — the page only manages categories, not the treatments within them. There is no UI to add/edit/delete `booking_treatments` from this page. The treatments API exists but the UI doesn't expose it.

2. **No link between `services` and `booking_treatments`** — a service in the catalog (e.g. "Botox 1 zone") has no connection to a booking treatment (e.g. "Injections"). They are completely separate. This means staff must maintain two separate lists.

3. **No `skip_treatment` toggle in the admin UI** — the `booking_categories.skip_treatment` column exists and is handled in the API, but there's no checkbox for it in the admin page.

4. **No image/icon support for booking categories** — the public funnel shows categories without images; no image upload field exists.

5. **Service `code` field not editable in UI** — the `services.code` column exists in the DB but the create/edit forms don't expose it.

6. **No bulk import for services** — there is a `scripts/import-services.sql` and `scripts/services_import.csv` suggesting a one-time import was done, but no UI for ongoing CSV import.

---

## Proposed Implementation

When you say "implement something here", the most useful additions would be:

**Option A — Add treatment management to booking categories admin**
Add an expandable section under each booking category to manage its treatments (add, edit, reorder, delete, enable/disable).

**Option B — Link services catalog to booking treatments**
Add a `service_id` FK on `booking_treatments` so a booking treatment maps to a billable service. When a patient books, the linked service auto-populates the invoice.

**Option C — Add `skip_treatment` toggle to admin UI**
Simple checkbox on each booking category row.

**Option D — Make service `code` editable**
Add the `code` field to the create/edit service forms.

Tell me which option(s) to implement and I'll proceed.
