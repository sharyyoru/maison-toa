/**
 * Tests the exact resolution chain used by the booking_deposit webhook
 * handler (resolveBookingDoctorCalendar -> resolveDepositBillingEntity),
 * without needing a signed Stripe webhook call.
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
import { resolveBookingDoctorCalendar } from "../src/lib/bookingDoctorCalendar";
import { resolveDepositBillingEntity } from "../src/lib/depositBillingEntity";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const cases = [
  { slug: "adnan-plakalo", name: "Dr. Adnan Plakalo", expected: "Dr Adnan Plakalo" },
  { slug: "natalia-koltunova", name: "Dr. Natalia Koltunova", expected: "Dr Koltunova Natalia" },
  { slug: "laetitia-guarino", name: "Dr. Laetitia Guarino", expected: "Dr Guarino" },
  { slug: "reda-benani", name: "Dr. Reda Benani", expected: "Dr Benani Reda" },
  { slug: "alexandra-miles", name: "Dr. Alexandra Miles", expected: "Soins Miles" },
  { slug: "sophie-nordback", name: "Dr. Sophie Nordback", expected: "Soins Nordback" },
  { slug: "juliette-le-mentec", name: "Juliette", expected: "Soins Assistantes" },
];

(async () => {
  let failures = 0;
  for (const c of cases) {
    const calendarLink = await resolveBookingDoctorCalendar(supabase as any, c.slug);
    if (!calendarLink?.providerId) {
      console.log(`❌ FAILED: slug "${c.slug}" did not resolve to a providerId`);
      failures++;
      continue;
    }
    const entity = await resolveDepositBillingEntity(supabase as any, calendarLink.providerId, c.name);
    const pass = entity?.name === c.expected;
    console.log(`${pass ? "✅" : "❌"} slug="${c.slug}" (${c.name}) -> "${entity?.name}" (expected "${c.expected}")`);
    if (!pass) failures++;
  }
  console.log(failures === 0 ? "\n✅ ALL WEBHOOK-PATH LOGIC TESTS PASSED" : `\n❌ ${failures} FAILED`);
  process.exit(failures > 0 ? 1 : 0);
})();
