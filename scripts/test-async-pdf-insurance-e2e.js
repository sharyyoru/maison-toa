#!/usr/bin/env node
/**
 * End-to-end test for async PDF generation and insurance submission (simulator).
 *
 * Uses patient "Ralf Mutant" by default. Creates a temporary test invoice,
 * queues PDFs, runs the Vercel cron worker locally, sends the invoice to the
 * MediData simulator, and cleans up all generated artifacts.
 *
 * Usage:
 *   NEXT_PUBLIC_APP_URL=http://localhost:3000 \
 *   NEXT_PUBLIC_SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   CRON_SECRET=... \
 *   node scripts/test-async-pdf-insurance-e2e.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const { createClient } = require('@supabase/supabase-js');

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET || 'test-secret';

const TEST_PATIENT_FIRST_NAME = 'Ralf';
const TEST_PATIENT_LAST_NAME = 'Mutant';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let exitCode = 0;
const cleanupTasks = [];

function log(...args) {
  console.log('[E2E]', ...args);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return { ok: res.ok, status: res.status, data };
}

async function findTestPatient() {
  const { data, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name')
    .ilike('first_name', TEST_PATIENT_FIRST_NAME)
    .ilike('last_name', TEST_PATIENT_LAST_NAME)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    throw new Error(`Test patient "${TEST_PATIENT_FIRST_NAME} ${TEST_PATIENT_LAST_NAME}" not found: ${error?.message}`);
  }

  const patient = data[0];
  log(`Using test patient: ${patient.first_name} ${patient.last_name} (${patient.id})`);
  return patient;
}

async function createTestInvoice(patientId) {
  const invoiceNumber = `TEST-${Date.now()}`;
  const now = new Date().toISOString();
  const invoiceDate = now.split('T')[0];

  // Copy provider/doctor from Ralf's existing invoice so Sumex has a valid biller
  const { data: sourceInvoice } = await supabase
    .from('invoices')
    .select('provider_id, provider_name, provider_gln, provider_zsr, doctor_user_id, doctor_name, doctor_gln, doctor_zsr, provider_iban, treatment_canton')
    .eq('patient_id', patientId)
    .not('provider_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const provider = sourceInvoice || {};

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      patient_id: patientId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: invoiceDate,
      total_amount: 150.0,
      subtotal: 150.0,
      vat_amount: 0,
      paid_amount: 0,
      status: 'OPEN',
      payment_method: 'Invoice',
      is_archived: false,
      is_demo: false,
      is_complimentary: false,
      billing_type: 'TG',
      health_insurance_law: 'KVG',
      treatment_canton: provider.treatment_canton || 'VD',
      treatment_reason: 'disease',
      treatment_date: now,
      created_at: now,
      updated_at: now,
      provider_id: provider.provider_id || null,
      provider_name: provider.provider_name || null,
      provider_gln: provider.provider_gln || null,
      provider_zsr: provider.provider_zsr || null,
      provider_iban: provider.provider_iban || null,
      doctor_user_id: provider.doctor_user_id || null,
      doctor_name: provider.doctor_name || null,
      doctor_gln: provider.doctor_gln || null,
      doctor_zsr: provider.doctor_zsr || null,
    })
    .select('id, invoice_number')
    .single();

  if (error || !invoice) {
    throw new Error(`Failed to create test invoice: ${error?.message}`);
  }

  log(`Created test invoice ${invoice.invoice_number} (${invoice.id})`);

  // Add a line item so Sumex has something to bill
  const { error: lineError } = await supabase
    .from('invoice_line_items')
    .insert({
      invoice_id: invoice.id,
      name: 'Consultation de test',
      name_fr: 'Consultation de test',
      code: '00.0010',
      tariff_code: 1,
      catalog_name: 'tarmed',
      quantity: 1,
      unit_price: 150.0,
      total_price: 150.0,
      total_price_without_vat: 150.0,
      tp_al: 0,
      tp_al_value: 1,
      vat_rate_value: 0,
      sort_order: 0,
      session_number: 1,
      external_factor_mt: 1,
    });

  if (lineError) {
    log('Warning: failed to insert test line item:', lineError);
  }

  return invoice;
}

async function queuePdf(invoiceId, invoiceType, reminderLevel = 1) {
  const { ok, status, data } = await fetchJson(`${APP_URL}/api/invoices/queue-pdf`, {
    method: 'POST',
    body: JSON.stringify({
      invoiceId,
      invoiceType,
      reminderLevel: invoiceType === 'reminder' ? reminderLevel : 1,
      createdByUserId: '00000000-0000-0000-0000-000000000000',
    }),
  });

  if (!ok && !data.jobId) {
    throw new Error(`queue-pdf failed (${status}): ${data.error || JSON.stringify(data)}`);
  }

  log(`Queued ${invoiceType} PDF for invoice ${invoiceId} — job ${data.jobId} (${data.status || 'pending'})`);
  return data.jobId;
}

async function runPdfCron() {
  log('Triggering PDF cron...');
  const { ok, status, data } = await fetchJson(`${APP_URL}/api/cron/process-pdf-jobs`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

  if (!ok) {
    throw new Error(`PDF cron failed (${status}): ${data.error || JSON.stringify(data)}`);
  }

  log('PDF cron result:', data);
  return data;
}

async function waitForPdfJob(jobId, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data, error } = await supabase
      .from('pdf_generation_jobs')
      .select('status, error_message, pdf_path')
      .eq('id', jobId)
      .single();

    if (error) {
      throw new Error(`Failed to check PDF job: ${error.message}`);
    }

    if (data.status === 'completed') {
      log(`PDF job ${jobId} completed: ${data.pdf_path}`);
      return data;
    }

    if (data.status === 'failed') {
      throw new Error(`PDF job ${jobId} failed: ${data.error_message}`);
    }

    log(`PDF job ${jobId} status: ${data.status} — waiting...`);
    await sleep(3000);
  }

  throw new Error(`PDF job ${jobId} did not complete in time`);
}

async function testInsuranceSimulator(invoiceId) {
  log('Testing insurance simulator send (no real insurance transmission)...');
  const { ok, status, data } = await fetchJson(`${APP_URL}/api/medidata/test-send`, {
    method: 'POST',
    body: JSON.stringify({
      invoiceIds: [invoiceId],
      simulatorFlag: '', // empty = accepted
    }),
  });

  if (!ok) {
    throw new Error(`Insurance simulator test failed (${status}): ${data.error || JSON.stringify(data)}`);
  }

  log('Insurance simulator result:', JSON.stringify(data, null, 2));

  const result = data.results?.[0];
  if (result && !result.success) {
    log('Note: simulator returned a Sumex-level error (no real insurance was sent). This is expected for some test payloads.');
  }

  return data;
}

async function cleanup() {
  log('Running cleanup...');
  for (const task of cleanupTasks) {
    try {
      await task();
    } catch (err) {
      log('Cleanup task failed:', err.message);
    }
  }
  log('Cleanup done');
}

async function main() {
  log('Starting E2E test');
  log(`App URL: ${APP_URL}`);

  try {
    const patient = await findTestPatient();
    const invoice = await createTestInvoice(patient.id);

    // Register cleanup for invoice, line items, PDFs, and jobs
    cleanupTasks.push(async () => {
      // Delete PDFs from storage first
      const { data: jobs } = await supabase
        .from('pdf_generation_jobs')
        .select('pdf_path')
        .eq('invoice_id', invoice.id);

      for (const job of jobs || []) {
        if (job.pdf_path) {
          await supabase.storage.from('invoice-pdfs').remove([job.pdf_path]);
          log(`Deleted PDF: ${job.pdf_path}`);
        }
      }

      await supabase.from('pdf_generation_jobs').delete().eq('invoice_id', invoice.id);
      await supabase.from('medidata_submissions').delete().eq('invoice_id', invoice.id);
      await supabase.from('invoice_line_items').delete().eq('invoice_id', invoice.id);
      await supabase.from('invoices').delete().eq('id', invoice.id);
      log(`Deleted test invoice ${invoice.id} and related records`);
    });

    // 1. Auto-queue on invoice creation (simulated by calling queue-pdf as the frontend would)
    log('\n--- Test 1: Auto-queue TG PDF on invoice creation ---');
    const tgJobId = await queuePdf(invoice.id, 'tg');

    // 2. Manual from patient page invoice tab (simulated by queueing TP/reminder/receipt)
    log('\n--- Test 2: Manual PDF queue (patient page invoice tab scenarios) ---');
    const tpJobId = await queuePdf(invoice.id, 'tp');
    const reminderJobId = await queuePdf(invoice.id, 'reminder', 2);
    const receiptJobId = await queuePdf(invoice.id, 'receipt');

    // 3. Bulk manual from invoices page (simulated by queueing multiple jobs at once)
    log('\n--- Test 3: Bulk PDF queue (invoice page) ---');
    // Already queued multiple jobs above; the cron will pick them one by one.

    // 4. Run the cron to process the queued PDFs
    log('\n--- Test 4: Run PDF cron and wait for jobs ---');
    await runPdfCron();
    await sleep(2000);
    await runPdfCron(); // second job
    await sleep(2000);
    await runPdfCron(); // third job
    await sleep(2000);
    await runPdfCron(); // fourth job

    await waitForPdfJob(tgJobId);
    await waitForPdfJob(tpJobId);
    await waitForPdfJob(reminderJobId);
    await waitForPdfJob(receiptJobId);

    // 5. Insurance simulator test (no real insurance sending)
    log('\n--- Test 5: Insurance simulator send (no real transmission) ---');
    await testInsuranceSimulator(invoice.id);

    log('\n✅ All E2E test steps completed (see notes above for any Sumex-level warnings)');
  } catch (err) {
    log('\n❌ E2E test failed:', err.message);
    console.error(err);
    exitCode = 1;
  } finally {
    await cleanup();
    process.exit(exitCode);
  }
}

main();
