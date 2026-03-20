/**
 * WhatsApp Queue Processor
 * 
 * Polls the Supabase whatsapp_queue table for pending messages
 * and sends them via the appropriate user's WhatsApp session.
 * 
 * If a user's session is disconnected, marks the message as failed
 * and creates a notification for the user to reconnect.
 */

const { createClient } = require('@supabase/supabase-js');
const { getConnectionStatus, sendMessage, getChatByPhoneNumber, broadcastToUser } = require('./whatsapp-manager');
const { logEvent } = require('./db');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL = parseInt(process.env.QUEUE_POLL_INTERVAL) || 10000;
const BATCH_SIZE = 10;

let supabase = null;
let pollTimer = null;
let isProcessing = false;

/**
 * Initialize the Supabase client for queue processing
 */
function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[Queue] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — queue processor disabled');
    return false;
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('[Queue] Supabase client initialized');
  return true;
}

/**
 * Start the queue polling loop
 */
function startQueueProcessor() {
  if (!initSupabase()) return;

  console.log(`[Queue] Starting queue processor (polling every ${POLL_INTERVAL}ms)`);
  pollTimer = setInterval(processQueue, POLL_INTERVAL);

  // Run once immediately
  processQueue();
}

/**
 * Stop the queue polling loop
 */
function stopQueueProcessor() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[Queue] Queue processor stopped');
  }
}

/**
 * Main queue processing function — called on each poll interval
 */
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Fetch pending messages that are due (scheduled_at <= now)
    const now = new Date().toISOString();
    const { data: items, error } = await supabase
      .from('whatsapp_queue')
      .select('*')
      .in('status', ['pending', 'session_failed'])
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('[Queue] Error fetching queue items:', error.message);
      isProcessing = false;
      return;
    }

    if (!items || items.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`[Queue] Processing ${items.length} pending message(s)`);

    for (const item of items) {
      await processQueueItem(item);
    }
  } catch (err) {
    console.error('[Queue] Unexpected error in processQueue:', err);
  } finally {
    isProcessing = false;
  }
}

/**
 * Process a single queue item
 */
async function processQueueItem(item) {
  const { id, sender_user_id, to_phone, message_body, retry_count, max_retries } = item;

  // Mark as 'sending' to prevent duplicate processing
  const { error: lockError } = await supabase
    .from('whatsapp_queue')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['pending', 'session_failed']);

  if (lockError) {
    console.error(`[Queue] Failed to lock item ${id}:`, lockError.message);
    return;
  }

  try {
    // Check if the sender's WhatsApp session is connected
    const status = await getConnectionStatus(sender_user_id);

    if (!status || status.status !== 'ready') {
      // Session not connected — unlimited retries with increasing backoff
      const newRetryCount = retry_count + 1;
      // Backoff: 2min, 5min, 10min, then every 10min
      const delayMs = newRetryCount <= 1 ? 2 * 60000
        : newRetryCount <= 3 ? 5 * 60000
        : 10 * 60000;

      await supabase
        .from('whatsapp_queue')
        .update({
          status: 'session_failed',
          retry_count: newRetryCount,
          error_message: `WhatsApp session not connected for user ${sender_user_id}`,
          scheduled_at: new Date(Date.now() + delayMs).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      console.warn(`[Queue] Session not ready for user ${sender_user_id}, item ${id} — session retry ${newRetryCount} (next in ${delayMs / 60000}min)`);

      // Notify user on first session failure and every 5th retry
      if (newRetryCount === 1 || newRetryCount % 5 === 0) {
        await notifySessionDown(sender_user_id, item);
      }

      return;
    }

    // Resolve phone number to WhatsApp chatId
    const formattedPhone = to_phone.replace(/\D/g, '');
    const chatId = `${formattedPhone}@c.us`;

    // Send the message via the user's WhatsApp session
    await sendMessage(sender_user_id, chatId, message_body);

    // Mark as sent
    await supabase
      .from('whatsapp_queue')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', id);

    console.log(`[Queue] Sent message ${id} to ${to_phone} via user ${sender_user_id}`);
    logEvent(sender_user_id, 'queue_message_sent', { queueId: id, to: to_phone });

    // Also log to workflow_enrollment_steps if enrollment_id is present
    if (item.enrollment_id) {
      await supabase.from('workflow_enrollment_steps').insert({
        enrollment_id: item.enrollment_id,
        step_type: 'action',
        step_action: 'send_whatsapp',
        step_config: { to_phone, sender_user_id: sender_user_id },
        status: 'completed',
        executed_at: new Date().toISOString(),
        result: { queue_id: id, to: to_phone, sent_via: 'whatsapp_web' },
      });
    }

  } catch (err) {
    const newRetryCount = retry_count + 1;
    const isFinalFailure = newRetryCount >= max_retries;

    await supabase
      .from('whatsapp_queue')
      .update({
        status: isFinalFailure ? 'failed' : 'pending',
        retry_count: newRetryCount,
        error_message: err.message || 'Unknown send error',
        scheduled_at: isFinalFailure
          ? item.scheduled_at
          : new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    console.error(`[Queue] Failed to send item ${id}:`, err.message);
    logEvent(sender_user_id, 'queue_message_failed', { queueId: id, error: err.message });

    if (isFinalFailure) {
      await notifySessionDown(sender_user_id, item);

      // Log failed step to workflow enrollment
      if (item.enrollment_id) {
        await supabase.from('workflow_enrollment_steps').insert({
          enrollment_id: item.enrollment_id,
          step_type: 'action',
          step_action: 'send_whatsapp',
          step_config: { to_phone, sender_user_id: sender_user_id },
          status: 'failed',
          executed_at: new Date().toISOString(),
          error_message: err.message || 'Unknown send error',
        });
      }
    }
  }
}

/**
 * Notify user that their WhatsApp session is down and queued messages are failing.
 * Uses WebSocket broadcast (real-time) + stores in whatsapp_queue error for later visibility.
 */
async function notifySessionDown(userId, queueItem) {
  try {
    const patientName = queueItem.patient_id ? 'a patient' : 'a contact';
    const message = `Your WhatsApp session is disconnected. A message to ${patientName} (${queueItem.to_phone}) could not be sent. Please reconnect by scanning the QR code.`;

    // Real-time WebSocket notification to the user's browser
    broadcastToUser(userId, 'queue_alert', {
      type: 'session_down',
      title: 'WhatsApp Session Disconnected',
      message,
      queueId: queueItem.id,
      toPhone: queueItem.to_phone,
      patientId: queueItem.patient_id,
      dealId: queueItem.deal_id,
    });

    // Also log the event in SQLite for persistence
    logEvent(userId, 'session_down_notification', {
      queueId: queueItem.id,
      toPhone: queueItem.to_phone,
      message,
    });

    console.log(`[Queue] Sent session-down alert to user ${userId}`);
  } catch (err) {
    console.error(`[Queue] Failed to notify user ${userId}:`, err.message);
  }
}

/**
 * Get queue stats for diagnostics
 */
async function getQueueStats() {
  if (!supabase) return { enabled: false };

  try {
    const { data: counts } = await supabase
      .rpc('get_whatsapp_queue_stats')
      .single();

    // Fallback: just count by status
    if (!counts) {
      const { count: pending } = await supabase
        .from('whatsapp_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: failed } = await supabase
        .from('whatsapp_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed');

      const { count: sent } = await supabase
        .from('whatsapp_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent');

      return { enabled: true, pending: pending || 0, failed: failed || 0, sent: sent || 0 };
    }

    return { enabled: true, ...counts };
  } catch (err) {
    return { enabled: true, error: err.message };
  }
}

/**
 * Called when a user's WhatsApp session becomes ready.
 * Resets all their session_failed items to pending so they get sent immediately.
 */
async function resetSessionFailedItems(userId) {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('whatsapp_queue')
      .update({
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('sender_user_id', userId)
      .eq('status', 'session_failed')
      .select('id');

    if (error) {
      console.error(`[Queue] Failed to reset session_failed items for user ${userId}:`, error.message);
    } else if (data && data.length > 0) {
      console.log(`[Queue] Session reconnected for user ${userId} — reset ${data.length} queued message(s) for immediate sending`);
      logEvent(userId, 'session_reconnected_queue_reset', { count: data.length });
      // Trigger immediate processing
      processQueue();
    }
  } catch (err) {
    console.error(`[Queue] Error resetting session_failed items:`, err.message);
  }
}

module.exports = {
  startQueueProcessor,
  stopQueueProcessor,
  processQueue,
  getQueueStats,
  resetSessionFailedItems,
};
