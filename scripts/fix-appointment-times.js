/**
 * Fix appointment times - convert from incorrectly stored times to proper Swiss timezone
 * 
 * The issue: Excel times (Swiss local time) were parsed as UTC and stored directly.
 * For example, 10:30 Swiss time was stored as 10:30 UTC instead of 08:30 UTC (winter) or 09:30 UTC (summer).
 * 
 * This script adjusts all imported appointment times to account for Swiss timezone.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Swiss timezone offset in hours (CET = +1, CEST = +2)
// We'll use a function to determine the correct offset based on the date
function getSwissOffset(date) {
  // Check if date is in daylight saving time (last Sunday of March to last Sunday of October)
  const year = date.getUTCFullYear();
  
  // Last Sunday of March
  const marchLast = new Date(Date.UTC(year, 2, 31));
  while (marchLast.getUTCDay() !== 0) marchLast.setUTCDate(marchLast.getUTCDate() - 1);
  marchLast.setUTCHours(1, 0, 0, 0); // DST starts at 01:00 UTC
  
  // Last Sunday of October
  const octoberLast = new Date(Date.UTC(year, 9, 31));
  while (octoberLast.getUTCDay() !== 0) octoberLast.setUTCDate(octoberLast.getUTCDate() - 1);
  octoberLast.setUTCHours(1, 0, 0, 0); // DST ends at 01:00 UTC
  
  // If between last Sunday of March and last Sunday of October, it's CEST (UTC+2)
  if (date >= marchLast && date < octoberLast) {
    return 2; // CEST
  }
  return 1; // CET
}

async function fixAppointmentTimes() {
  console.log('Starting appointment time fix...');
  
  // Get all appointments that were imported (have notes mentioning import or source = manual with legacy title)
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, start_time, end_time, notes, title')
    .or('notes.ilike.%Imported%,notes.ilike.%Migrated%,title.ilike.%Legacy%');
  
  if (error) {
    console.error('Error fetching appointments:', error);
    return;
  }
  
  console.log(`Found ${appointments?.length || 0} imported appointments to fix`);
  
  if (!appointments || appointments.length === 0) {
    // Try getting all appointments if filter didn't work
    const { data: allAppts, error: allError } = await supabase
      .from('appointments')
      .select('id, start_time, end_time');
    
    if (allError) {
      console.error('Error fetching all appointments:', allError);
      return;
    }
    
    console.log(`Fetching all ${allAppts?.length || 0} appointments instead`);
    
    if (!allAppts || allAppts.length === 0) {
      console.log('No appointments found');
      return;
    }
    
    appointments.push(...allAppts);
  }
  
  let fixed = 0;
  let errors = 0;
  const batchSize = 100;
  
  for (let i = 0; i < appointments.length; i += batchSize) {
    const batch = appointments.slice(i, i + batchSize);
    const updates = [];
    
    for (const appt of batch) {
      const startDate = new Date(appt.start_time);
      const endDate = appt.end_time ? new Date(appt.end_time) : null;
      
      // Get the Swiss offset for this date
      const offset = getSwissOffset(startDate);
      
      // The times were stored as if they were UTC, but they were actually Swiss local time
      // So we need to SUBTRACT the offset to get the correct UTC time
      // e.g., 10:30 stored as UTC should actually be 10:30 Swiss = 08:30 UTC (if offset is 2)
      const correctedStart = new Date(startDate.getTime() - (offset * 60 * 60 * 1000));
      const correctedEnd = endDate ? new Date(endDate.getTime() - (offset * 60 * 60 * 1000)) : null;
      
      updates.push({
        id: appt.id,
        start_time: correctedStart.toISOString(),
        end_time: correctedEnd ? correctedEnd.toISOString() : null
      });
    }
    
    // Update in batch
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          start_time: update.start_time,
          end_time: update.end_time
        })
        .eq('id', update.id);
      
      if (updateError) {
        errors++;
        if (errors < 5) console.error('Update error:', updateError);
      } else {
        fixed++;
      }
    }
    
    console.log(`Progress: ${Math.min(i + batchSize, appointments.length)}/${appointments.length} processed`);
  }
  
  console.log(`\nCompleted: ${fixed} appointments fixed, ${errors} errors`);
}

// Run
fixAppointmentTimes().catch(console.error);
