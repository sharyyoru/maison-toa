# Doctor Schedule Integration Guide

## Overview
This document explains how the booking system now integrates with the dynamic doctor schedules set in the Controllers page.

**Location:** All bookings are for Lausanne. The system automatically checks all Lausanne location variants (Lausanne, Rhône, Champel, Geneva) in the database.

## What Changed

### 1. New API Endpoints Created

#### `/api/public/doctor-availability`
Fetches a doctor's availability schedule from the `user_availability` database table for Lausanne.

**Parameters:**
- `doctorName` (required): Doctor's full name (e.g., "Dr. Claire Balbo" or "Claire Balbo")

**Response:**
```json
{
  "availability": {
    "1": { "start": "08:00", "end": "19:00", "available": true },
    "2": { "start": "08:00", "end": "19:00", "available": true },
    "5": { "start": "08:00", "end": "19:00", "available": true }
  },
  "source": "database",
  "providerId": "...",
  "userId": "..."
}
```

#### `/api/public/doctor-available-dates`
Returns a list of available dates for a doctor based on their Lausanne schedule.

**Parameters:**
- `doctorName` (required): Doctor's name
- `maxDaysAhead` (optional): Days to look ahead (default: 90)

**Response:**
```json
{
  "availableDates": ["2026-04-22", "2026-04-23", "2026-04-25"],
  "source": "database",
  "doctorName": "Claire Balbo"
}
```

### 2. Updated Existing APIs

#### `/api/public/appointment/slots`
Now queries the database for doctor availability instead of using only hardcoded schedules.

**What it does:**
1. Looks up the provider by `doctorSlug`
2. Fetches their schedule from `user_availability` table
3. Generates time slots based on database schedule
4. Falls back to hardcoded `DOCTOR_AVAILABILITY` if database data not found

### 3. Location Handling

All bookings are for **Lausanne only**. The system automatically checks multiple location name variants in the database to ensure compatibility:
- **Supported variants**: "lausanne", "Lausanne", "Rhône", "rhone", "Champel", "champel", "Geneva", "geneva"

When you set a doctor's schedule in the Controllers page using any of these location names, the booking system will find and use that schedule.

## How It Works

### Data Flow

1. **Admin sets schedule in Controllers page**
   - Navigate to `/controllers`
   - Select a doctor/user
   - Set their weekly schedule (days + hours)
   - Save to `user_availability` table

2. **Booking page requests doctor schedule**
   - When user selects a doctor, the booking page calls `/api/public/doctor-availability`
   - API matches doctor name to provider, then to user_id
   - Returns schedule from `user_availability` table

3. **Time slots are generated**
   - When user selects a date, slots API is called
   - Slots are generated based on database schedule for that day of week
   - If no database schedule exists, falls back to hardcoded schedule

4. **Appointment is booked**
   - User selects time slot and confirms
   - Appointment is created in database

### Provider-to-User Mapping

The system links doctors to users via:
1. **Email matching**: Matches `providers.email` to `users.email`
2. **Name matching**: Falls back to matching `providers.name` to `users.full_name`

## Updating Booking Pages (Optional Enhancement)

The booking pages currently use local hardcoded availability functions. To make them fully dynamic:

### Option 1: Use the Available Dates API

Replace the local `getAvailableDates()` function call with an API call:

```typescript
// OLD:
const dates = getAvailableDates(doctorSlug, locationId, 90);
setAvailableDatesSet(new Set(dates));

// NEW:
const response = await fetch(`/api/public/doctor-available-dates?doctorName=${encodeURIComponent(doctor.name)}`);
const data = await response.json();
if (data.availableDates && data.source === "database") {
  setAvailableDatesSet(new Set(data.availableDates));
} else {
  // Fallback to hardcoded
  const dates = getAvailableDates(doctorSlug, locationId, 90);
  setAvailableDatesSet(new Set(dates));
}
```

### Option 2: Keep Current Implementation

The current implementation will work without changes because:
- The `/api/public/appointment/slots` endpoint already uses database schedules
- When user selects a date, if the doctor doesn't work that day, no slots will be shown
- The booking will fail with an appropriate error message

## Testing

### 1. Set up a test schedule in Controllers

1. Go to `/controllers`
2. Select "Dr Reda Reamani" (or create a user matching a provider)
3. Set schedule: Monday, Wednesday, Friday only, 8:00 AM - 7:00 PM
4. Save

### 2. Test booking page

1. Go to booking page for Dr. Reda Benani
2. Try to book on Tuesday or Thursday
3. Should see no available time slots
4. Try Monday, Wednesday, or Friday
5. Should see slots from 8:00 AM to 7:00 PM (in 30-min intervals)

## Location Variants Reference

All the following location names in the Controllers page will match for Lausanne bookings:

| Location Name in Controllers | Will Match for Bookings |
|------------------------------|-------------------------|
| Lausanne | ✓ Lausanne bookings |
| lausanne | ✓ Lausanne bookings |
| Rhône | ✓ Lausanne bookings |
| rhone | ✓ Lausanne bookings |
| Champel | ✓ Lausanne bookings |
| champel | ✓ Lausanne bookings |
| Geneva | ✓ Lausanne bookings |
| geneva | ✓ Lausanne bookings |

## Troubleshooting

### Doctor schedule not reflecting in booking

**Check:**
1. Does the provider exist in `providers` table?
2. Does a user exist with matching email or name?
3. Is there data in `user_availability` for that user_id?
4. Is the location set to one of the supported Lausanne variants?
5. Is `is_available` set to `true` for the days?

**Debug:**
Check the API response:
```
GET /api/public/doctor-availability?doctorName=Dr.%20Claire%20Balbo
```

Should return:
- `source: "database"` if found
- `source: "no_user"` if user not found
- `source: "not_found"` if provider not found

### Slots still showing hardcoded times

The system has a fallback mechanism. If database lookup fails, it uses hardcoded `DOCTOR_AVAILABILITY` from `/lib/doctorAvailability.ts`.

**To force database-only:**
Remove or comment out the fallback in `/api/public/appointment/slots/route.ts`:
```typescript
// Comment out these lines to disable fallback
if (allSlots.length === 0) {
  const { generateTimeSlots } = await import("@/lib/doctorAvailability");
  allSlots = generateTimeSlots(doctorSlug, "lausanne", dayOfWeek);
}
```

## Files Modified

- `/src/app/api/public/doctor-availability/route.ts` (NEW)
- `/src/app/api/public/doctor-available-dates/route.ts` (NEW)
- `/src/app/api/public/appointment/slots/route.ts` (MODIFIED)
- `/src/lib/useDoctorAvailability.ts` (NEW - optional helper hook)

## Next Steps

To fully integrate dynamic schedules into all booking pages, update these files:
- `/src/app/book-appointment/doctors/[slug]/page.tsx`
- `/src/app/book-appointment/new-patient/[category]/[treatment]/[doctor]/page.tsx`
- `/src/app/book-appointment/existing-patient/[category]/[treatment]/[doctor]/page.tsx`
- `/src/app/embed/book/page.tsx`

Replace the `getAvailableDates()` call with the API fetch shown in "Option 1" above.
