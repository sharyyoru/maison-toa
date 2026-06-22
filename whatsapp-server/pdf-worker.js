const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
const POLL_INTERVAL_MS = parseInt(process.env.PDF_WORKER_POLL_INTERVAL_MS || '7000', 10);
const MAX_CONCURRENT = parseInt(process.env.PDF_WORKER_MAX_CONCURRENT || '2', 10);
const MAX_RETRIES = parseInt(process.env.PDF_WORKER_MAX_RETRIES || '3', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[PDFWorker] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let isRunning = true;
let activeCount = 0;

function log(...args) {
  console.log('[PDFWorker]', ...args);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGeneratePdf(invoiceId, invoiceType, reminderLevel) {
  const url = `${APP_URL}/api/invoices/generate-pdf`;
  const body = JSON.stringify({ invoiceId, invoiceType, reminderLevel });
  const controller = new AbortController();
  // Give Vercel plenty of time; the worker itself has no timeout.
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err.message || String(err) };
  }
}

async function processJob(job) {
  const { id, invoice_id, invoice_type, reminder_level } = job;
  log(`Processing job ${id} — invoice ${invoice_id} (${invoice_type}${invoice_type === 'reminder' ? ` L${reminder_level}` : ''})`);

  const { error: processingError } = await supabase
    .from('pdf_generation_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', id);

  if (processingError) {
    log(`Failed to mark job ${id} as processing:`, processingError);
    return;
  }

  const result = await callGeneratePdf(
    invoice_id,
    invoice_type,
    invoice_type === 'reminder' ? (reminder_level || 1) : 1
  );

  if (result.ok && result.data?.success && result.data?.pdfPath) {
    const { error: completedError } = await supabase
      .from('pdf_generation_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        pdf_path: result.data.pdfPath,
        pdf_url: result.data.pdfUrl || null,
        error_message: null,
      })
      .eq('id', id);

    if (completedError) {
      log(`Failed to mark job ${id} completed:`, completedError);
    } else {
      log(`Job ${id} completed — ${result.data.pdfPath}`);
    }
  } else {
    const errorMessage = result.data?.error || result.data?.details || result.error || `HTTP ${result.status}`;
    const newRetryCount = (job.retry_count || 0) + 1;
    const newStatus = newRetryCount >= MAX_RETRIES ? 'failed' : 'pending';

    const { error: failError } = await supabase
      .from('pdf_generation_jobs')
      .update({
        status: newStatus,
        error_message: errorMessage,
        retry_count: newRetryCount,
        completed_at: newStatus === 'failed' ? new Date().toISOString() : null,
      })
      .eq('id', id);

    if (failError) {
      log(`Failed to update failed job ${id}:`, failError);
    } else {
      log(`Job ${id} ${newStatus === 'failed' ? 'failed permanently' : 'will retry'} (${newRetryCount}/${MAX_RETRIES}): ${errorMessage}`);
    }
  }
}

async function poll() {
  if (!isRunning) return;

  try {
    const { data: pendingJobs, error } = await supabase
      .from('pdf_generation_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_CONCURRENT);

    if (error) {
      log('Error fetching pending jobs:', error);
      return;
    }

    if (pendingJobs && pendingJobs.length > 0) {
      log(`Found ${pendingJobs.length} pending job(s)`);
      const jobsToRun = pendingJobs.slice(0, Math.max(0, MAX_CONCURRENT - activeCount));
      for (const job of jobsToRun) {
        activeCount++;
        processJob(job).finally(() => {
          activeCount = Math.max(0, activeCount - 1);
        });
      }
    }
  } catch (err) {
    log('Unexpected poll error:', err);
  }
}

async function main() {
  log('Starting PDF worker');
  log(`App URL: ${APP_URL}`);
  log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
  log(`Max concurrent: ${MAX_CONCURRENT}`);
  log(`Max retries: ${MAX_RETRIES}`);

  while (isRunning) {
    await poll();
    await sleep(POLL_INTERVAL_MS);
  }
}

function shutdown() {
  log('Shutting down PDF worker...');
  isRunning = false;
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch(err => {
  log('Fatal error:', err);
  process.exit(1);
});

module.exports = { main, shutdown };
