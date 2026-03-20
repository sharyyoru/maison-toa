import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ──────────────────────────────────────────────────────────────────────

type ParsedTransaction = {
  bookingDate: string | null;
  amount: number;
  currency: string;
  creditDebit: string;
  referenceNumber: string | null;
  debtorName: string | null;
  ultimateDebtorName: string | null;
  debtorIban: string | null;
  description: string | null;
  bankReference: string | null;
  endToEndId: string | null;
};

type MatchResult = {
  transaction: ParsedTransaction;
  matchStatus: "matched" | "unmatched" | "overpaid" | "underpaid" | "already_paid" | "duplicate" | "error";
  matchNotes: string;
  matchedInvoiceId: string | null;
  matchedInstallmentId: string | null;
  matchedInvoiceNumber: string | null;
  previousPaidAmount: number | null;
  newPaidAmount: number | null;
};

// ─── XML Parser (server-side using regex since no DOMParser) ─────────────────

function getTagContent(xml: string, tagPath: string): string | null {
  // Simple XML tag extractor - handles nested tags via path like "BookgDt>Dt"
  const tags = tagPath.split(">");
  let context = xml;
  for (const tag of tags) {
    const t = tag.trim();
    const regex = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, "i");
    const match = context.match(regex);
    if (!match) return null;
    context = match[1];
  }
  return context.trim();
}

function getAttr(xml: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function getAllMatches(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  return xml.match(regex) || [];
}

function parseCamt054(xmlText: string): {
  transactions: ParsedTransaction[];
  messageId: string | null;
  iban: string | null;
  bankName: string | null;
  dateFrom: string | null;
  dateTo: string | null;
} {
  const messageId = getTagContent(xmlText, "GrpHdr>MsgId");
  const iban = getTagContent(xmlText, "Acct>Id>IBAN");
  const bankName = getTagContent(xmlText, "Svcr>FinInstnId>Nm");
  const dateFrom = getTagContent(xmlText, "FrToDt>FrDtTm");
  const dateTo = getTagContent(xmlText, "FrToDt>ToDtTm");

  const transactions: ParsedTransaction[] = [];
  const entries = getAllMatches(xmlText, "Ntry");

  for (const entry of entries) {
    const bookingDate = getTagContent(entry, "BookgDt>Dt");
    const amtTag = entry.match(/<Amt[^>]*Ccy="([^"]*)"[^>]*>([^<]*)<\/Amt>/i);
    const amount = amtTag ? parseFloat(amtTag[2]) : 0;
    const currency = amtTag ? amtTag[1] : "CHF";
    const creditDebit = getTagContent(entry, "CdtDbtInd") || "CRDT";

    // Get transaction details
    const txDtls = getAllMatches(entry, "TxDtls");
    const txBlock = txDtls[0] || entry;

    const referenceNumber = getTagContent(txBlock, "CdtrRefInf>Ref");
    const debtorName = getTagContent(txBlock, "Dbtr>Pty>Nm");
    const ultimateDebtorName = getTagContent(txBlock, "UltmtDbtr>Pty>Nm");
    const debtorIban = getTagContent(txBlock, "DbtrAcct>Id>IBAN");
    const description = getTagContent(entry, "AddtlNtryInf") || getTagContent(txBlock, "AddtlTxInf");
    const bankReference = getTagContent(txBlock, "Refs>AcctSvcrRef");
    const endToEndId = getTagContent(txBlock, "Refs>EndToEndId");

    transactions.push({
      bookingDate,
      amount: creditDebit === "DBIT" ? -amount : amount,
      currency,
      creditDebit,
      referenceNumber,
      debtorName,
      ultimateDebtorName,
      debtorIban,
      description,
      bankReference,
      endToEndId,
    });
  }

  return { transactions, messageId, iban, bankName, dateFrom, dateTo };
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { xmlContent, fileName, fileUrl, userId, userName } = body as {
      xmlContent: string;
      fileName: string;
      fileUrl?: string;
      userId?: string;
      userName?: string;
    };

    if (!xmlContent || !fileName) {
      return NextResponse.json({ success: false, error: "Missing xmlContent or fileName" }, { status: 400 });
    }

    // Parse XML
    const parsed = parseCamt054(xmlContent);
    if (parsed.transactions.length === 0) {
      return NextResponse.json({ success: false, error: "No transactions found in XML. Is this a valid camt.054 file?" }, { status: 400 });
    }

    // Only process CREDIT transactions (incoming payments)
    const creditTransactions = parsed.transactions.filter((tx) => tx.creditDebit === "CRDT" && tx.amount > 0);

    // Match each transaction
    const results: MatchResult[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    let alreadyPaidCount = 0;
    let overpaidCount = 0;
    let underpaidCount = 0;
    let matchedAmount = 0;

    for (const tx of creditTransactions) {
      const result = await matchTransaction(tx);
      results.push(result);

      switch (result.matchStatus) {
        case "matched": matchedCount++; matchedAmount += tx.amount; break;
        case "unmatched": unmatchedCount++; break;
        case "already_paid": alreadyPaidCount++; break;
        case "overpaid": overpaidCount++; matchedAmount += tx.amount; break;
        case "underpaid": underpaidCount++; matchedAmount += tx.amount; break;
        case "duplicate": unmatchedCount++; break;
        case "error": unmatchedCount++; break;
      }
    }

    const totalAmount = creditTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    // Save import record
    const { data: importRecord, error: importError } = await supabaseAdmin
      .from("bank_payment_imports")
      .insert({
        file_name: fileName,
        file_url: fileUrl || null,
        imported_by_user_id: userId || null,
        imported_by_name: userName || null,
        total_transactions: creditTransactions.length,
        matched_count: matchedCount,
        unmatched_count: unmatchedCount,
        already_paid_count: alreadyPaidCount,
        overpaid_count: overpaidCount,
        underpaid_count: underpaidCount,
        total_amount: totalAmount,
        matched_amount: matchedAmount,
        message_id: parsed.messageId,
        iban: parsed.iban,
        bank_name: parsed.bankName,
        statement_date_from: parsed.dateFrom,
        statement_date_to: parsed.dateTo,
        status: unmatchedCount > 0 ? "partial" : "completed",
      })
      .select("id")
      .single();

    if (importError) {
      console.error("Failed to save import record:", importError);
      return NextResponse.json({ success: false, error: "Failed to save import record: " + importError.message }, { status: 500 });
    }

    // Save individual match results
    if (results.length > 0) {
      const itemRows = results.map((r) => ({
        import_id: importRecord.id,
        booking_date: r.transaction.bookingDate,
        amount: Math.abs(r.transaction.amount),
        currency: r.transaction.currency,
        reference_number: r.transaction.referenceNumber,
        debtor_name: r.transaction.debtorName,
        ultimate_debtor_name: r.transaction.ultimateDebtorName,
        debtor_iban: r.transaction.debtorIban,
        description: r.transaction.description,
        bank_reference: r.transaction.bankReference,
        end_to_end_id: r.transaction.endToEndId,
        credit_debit: r.transaction.creditDebit,
        match_status: r.matchStatus,
        match_notes: r.matchNotes,
        matched_invoice_id: r.matchedInvoiceId,
        matched_installment_id: r.matchedInstallmentId,
        matched_invoice_number: r.matchedInvoiceNumber,
        previous_paid_amount: r.previousPaidAmount,
        new_paid_amount: r.newPaidAmount,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from("bank_payment_import_items")
        .insert(itemRows);

      if (itemsError) {
        console.error("Failed to save import items:", itemsError);
      }
    }

    return NextResponse.json({
      success: true,
      importId: importRecord.id,
      summary: {
        totalTransactions: creditTransactions.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        alreadyPaid: alreadyPaidCount,
        overpaid: overpaidCount,
        underpaid: underpaidCount,
        totalAmount,
        matchedAmount,
        messageId: parsed.messageId,
        iban: parsed.iban,
        bankName: parsed.bankName,
      },
      results: results.map((r) => ({
        referenceNumber: r.transaction.referenceNumber,
        amount: r.transaction.amount,
        currency: r.transaction.currency,
        debtorName: r.transaction.debtorName || r.transaction.ultimateDebtorName,
        bookingDate: r.transaction.bookingDate,
        matchStatus: r.matchStatus,
        matchNotes: r.matchNotes,
        matchedInvoiceNumber: r.matchedInvoiceNumber,
      })),
    });
  } catch (err: any) {
    console.error("Bank XML processing error:", err);
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 });
  }
}

// ─── Match a single transaction ──────────────────────────────────────────────

async function matchTransaction(tx: ParsedTransaction): Promise<MatchResult> {
  const base: MatchResult = {
    transaction: tx,
    matchStatus: "unmatched",
    matchNotes: "",
    matchedInvoiceId: null,
    matchedInstallmentId: null,
    matchedInvoiceNumber: null,
    previousPaidAmount: null,
    newPaidAmount: null,
  };

  if (!tx.referenceNumber) {
    base.matchNotes = "No reference number in transaction";
    return base;
  }

  const ref = tx.referenceNumber.trim();

  // 1. Try matching against invoices table
  const { data: invoiceMatch } = await supabaseAdmin
    .from("invoices")
    .select("id, invoice_number, total_amount, paid_amount, status")
    .eq("reference_number", ref)
    .limit(1)
    .maybeSingle();

  if (invoiceMatch) {
    return await applyPaymentToInvoice(tx, invoiceMatch, base);
  }

  // 2. Try matching against invoice_installments table
  const { data: installmentMatch } = await supabaseAdmin
    .from("invoice_installments")
    .select("id, invoice_id, invoice_number, installment_number, amount, paid_amount, status")
    .eq("reference_number", ref)
    .limit(1)
    .maybeSingle();

  if (installmentMatch) {
    return await applyPaymentToInstallment(tx, installmentMatch, base);
  }

  // 3. No match found
  base.matchNotes = `No invoice or installment found for reference: ${ref}`;
  return base;
}

async function applyPaymentToInvoice(
  tx: ParsedTransaction,
  invoice: { id: string; invoice_number: string; total_amount: number; paid_amount: number; status: string },
  base: MatchResult
): Promise<MatchResult> {
  const result = { ...base };
  result.matchedInvoiceId = invoice.id;
  result.matchedInvoiceNumber = invoice.invoice_number;
  result.previousPaidAmount = Number(invoice.paid_amount) || 0;

  const totalDue = Number(invoice.total_amount) || 0;
  const alreadyPaid = Number(invoice.paid_amount) || 0;
  const remaining = totalDue - alreadyPaid;
  const paymentAmount = Math.abs(tx.amount);

  // Already fully paid
  if (invoice.status === "PAID" || remaining <= 0.01) {
    result.matchStatus = "already_paid";
    result.matchNotes = `Invoice ${invoice.invoice_number} is already fully paid (${alreadyPaid.toFixed(2)}/${totalDue.toFixed(2)} CHF)`;
    result.newPaidAmount = alreadyPaid;
    return result;
  }

  const newPaidAmount = alreadyPaid + paymentAmount;
  result.newPaidAmount = newPaidAmount;

  // Determine status
  let newInvoiceStatus: string;
  if (newPaidAmount >= totalDue - 0.01 && newPaidAmount <= totalDue + 0.01) {
    result.matchStatus = "matched";
    result.matchNotes = `Exact match: ${paymentAmount.toFixed(2)} CHF. Invoice ${invoice.invoice_number} fully paid.`;
    newInvoiceStatus = "PAID";
  } else if (newPaidAmount > totalDue + 0.01) {
    result.matchStatus = "overpaid";
    const overage = newPaidAmount - totalDue;
    result.matchNotes = `Overpaid by ${overage.toFixed(2)} CHF. Payment: ${paymentAmount.toFixed(2)}, Total: ${totalDue.toFixed(2)}, Already paid: ${alreadyPaid.toFixed(2)}`;
    newInvoiceStatus = "OVERPAID";
  } else {
    result.matchStatus = "underpaid";
    const stillOwed = totalDue - newPaidAmount;
    result.matchNotes = `Partial payment: ${paymentAmount.toFixed(2)} CHF. Still owed: ${stillOwed.toFixed(2)} CHF.`;
    newInvoiceStatus = "PARTIAL_PAID";
  }

  // Update invoice in DB
  const { error: updateError } = await supabaseAdmin
    .from("invoices")
    .update({
      paid_amount: newPaidAmount,
      status: newInvoiceStatus,
    })
    .eq("id", invoice.id);

  if (updateError) {
    result.matchStatus = "error";
    result.matchNotes = `Failed to update invoice: ${updateError.message}`;
  }

  return result;
}

async function applyPaymentToInstallment(
  tx: ParsedTransaction,
  installment: { id: string; invoice_id: string; invoice_number: string; installment_number: number; amount: number; paid_amount: number; status: string },
  base: MatchResult
): Promise<MatchResult> {
  const result = { ...base };
  result.matchedInstallmentId = installment.id;
  result.matchedInvoiceId = installment.invoice_id;
  result.matchedInvoiceNumber = installment.invoice_number || `Installment #${installment.installment_number}`;
  result.previousPaidAmount = Number(installment.paid_amount) || 0;

  const totalDue = Number(installment.amount) || 0;
  const alreadyPaid = Number(installment.paid_amount) || 0;
  const remaining = totalDue - alreadyPaid;
  const paymentAmount = Math.abs(tx.amount);

  // Already fully paid
  if (installment.status === "PAID" || remaining <= 0.01) {
    result.matchStatus = "already_paid";
    result.matchNotes = `Installment ${installment.invoice_number} already paid (${alreadyPaid.toFixed(2)}/${totalDue.toFixed(2)} CHF)`;
    result.newPaidAmount = alreadyPaid;
    return result;
  }

  const newPaidAmount = alreadyPaid + paymentAmount;
  result.newPaidAmount = newPaidAmount;

  let newStatus: string;
  if (newPaidAmount >= totalDue - 0.01 && newPaidAmount <= totalDue + 0.01) {
    result.matchStatus = "matched";
    result.matchNotes = `Exact match: ${paymentAmount.toFixed(2)} CHF. Installment ${installment.invoice_number} fully paid.`;
    newStatus = "PAID";
  } else if (newPaidAmount > totalDue + 0.01) {
    result.matchStatus = "overpaid";
    const overage = newPaidAmount - totalDue;
    result.matchNotes = `Overpaid by ${overage.toFixed(2)} CHF. Payment: ${paymentAmount.toFixed(2)}, Due: ${totalDue.toFixed(2)}`;
    newStatus = "PAID";
  } else {
    result.matchStatus = "underpaid";
    const stillOwed = totalDue - newPaidAmount;
    result.matchNotes = `Partial payment: ${paymentAmount.toFixed(2)} CHF. Still owed: ${stillOwed.toFixed(2)} CHF.`;
    newStatus = "PENDING";
  }

  // Update installment
  const { error: updateError } = await supabaseAdmin
    .from("invoice_installments")
    .update({
      paid_amount: newPaidAmount,
      status: newStatus,
      paid_at: newStatus === "PAID" ? new Date().toISOString() : null,
    })
    .eq("id", installment.id);

  if (updateError) {
    result.matchStatus = "error";
    result.matchNotes = `Failed to update installment: ${updateError.message}`;
    return result;
  }

  // Also update parent invoice paid_amount (sum of all installment paid amounts)
  if (installment.invoice_id) {
    const { data: allInstallments } = await supabaseAdmin
      .from("invoice_installments")
      .select("amount, paid_amount, status")
      .eq("invoice_id", installment.invoice_id);

    if (allInstallments) {
      const totalInstPaid = allInstallments.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
      const totalInstAmount = allInstallments.reduce((s, i) => s + Number(i.amount || 0), 0);
      const allPaid = allInstallments.every((i) => i.status === "PAID");

      const { data: parentInvoice } = await supabaseAdmin
        .from("invoices")
        .select("total_amount")
        .eq("id", installment.invoice_id)
        .single();

      const invoiceTotal = Number(parentInvoice?.total_amount) || totalInstAmount;
      let invoiceStatus: string;
      if (allPaid && totalInstPaid >= invoiceTotal - 0.01) {
        invoiceStatus = "PAID";
      } else if (totalInstPaid > invoiceTotal + 0.01) {
        invoiceStatus = "OVERPAID";
      } else if (totalInstPaid > 0.01) {
        invoiceStatus = "PARTIAL_PAID";
      } else {
        invoiceStatus = "OPEN";
      }

      await supabaseAdmin
        .from("invoices")
        .update({
          paid_amount: totalInstPaid,
          status: invoiceStatus,
        })
        .eq("id", installment.invoice_id);
    }
  }

  return result;
}
