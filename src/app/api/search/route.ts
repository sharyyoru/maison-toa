import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SYSTEM_PAGES = [
  { label: "Dashboard", href: "/", category: "pages" },
  { label: "Patients", href: "/patients", category: "pages" },
  { label: "Agenda / Appointments", href: "/appointments", category: "pages" },
  { label: "Deals & Pipeline", href: "/deals", category: "pages" },
  { label: "Online Bookings", href: "/online-bookings", category: "pages" },
  { label: "Book Appointment CMS", href: "/cms/book-appointment", category: "pages" },
  { label: "Lead Import", href: "/lead-import", category: "pages" },
  { label: "CSV Import", href: "/lead-import", category: "pages" },
  { label: "Import History", href: "/lead-import/history", category: "pages" },
  { label: "Meta & Zapier Leads", href: "/lead-import/meta-leads", category: "pages" },
  { label: "Retell AI Calls", href: "/lead-import/retell-calls", category: "pages" },
  { label: "Embed Forms", href: "/lead-import/embed-forms", category: "pages" },
  { label: "Financials", href: "/financials", category: "pages" },
  { label: "Invoices", href: "/invoices", category: "pages" },
  { label: "Acomptes 50%", href: "/deposits", category: "pages" },
  { label: "MediData", href: "/medidata", category: "pages" },
  { label: "Services", href: "/services", category: "pages" },
  { label: "Tasks", href: "/tasks", category: "pages" },
  { label: "User Management", href: "/users", category: "pages" },
  { label: "Workflows", href: "/workflows", category: "pages" },
  { label: "Workflow Templates", href: "/workflows/templates", category: "pages" },
  { label: "Controllers", href: "/controllers", category: "pages" },
  { label: "Email Reports", href: "/email-reports", category: "pages" },
  { label: "Chat with Aliice", href: "/chat", category: "pages" },
  { label: "Client Onboarding", href: "/client-onboarding", category: "pages" },
  { label: "Settings", href: "/settings", category: "pages" },
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, categories, page = 1, limit = 20 } = body as {
      query: string;
      categories?: string[];
      page?: number;
      limit?: number;
    };

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ results: [], query: "" });
    }

    const searchTerm = query.trim();
    const offset = (page - 1) * limit;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const lowerTerm = searchTerm.toLowerCase();
    const pageResults = SYSTEM_PAGES.filter((p) =>
      p.label.toLowerCase().includes(lowerTerm)
    ).map((p) => ({
      id: p.href,
      title: p.label,
      subtitle: p.href,
      href: p.href,
      category: "pages" as const,
    }));

    const { data: patients } = await supabase
      .from("patients")
      .select("id, first_name, last_name, email, phone")
      .or(
        `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
      )
      .range(offset, offset + limit - 1)
      .limit(limit);

    const patientResults = (patients || []).map((p: any) => ({
      id: p.id,
      title: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unnamed",
      subtitle: p.email || p.phone || "",
      href: `/patients/${p.id}`,
      category: "patients" as const,
    }));

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, name, status")
      .ilike("name", `%${searchTerm}%`)
      .range(offset, offset + limit - 1)
      .limit(limit);

    const taskResults = (tasks || []).map((t: any) => ({
      id: t.id,
      title: t.name || "Untitled task",
      subtitle: t.status || "",
      href: "/tasks",
      category: "tasks" as const,
    }));

    const { data: deals } = await supabase
      .from("deals")
      .select("id, title, patient_id")
      .ilike("title", `%${searchTerm}%`)
      .range(offset, offset + limit - 1)
      .limit(limit);

    const dealResults = (deals || []).map((d: any) => ({
      id: d.id,
      title: d.title || "Untitled deal",
      subtitle: d.patient_id ? "Linked to patient" : "",
      href: d.patient_id ? `/patients/${d.patient_id}` : "/deals",
      category: "deals" as const,
    }));

    const { data: services } = await supabase
      .from("services")
      .select("id, name, code")
      .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
      .range(offset, offset + limit - 1)
      .limit(limit);

    const serviceResults = (services || []).map((s: any) => ({
      id: s.id,
      title: s.name || "Unnamed service",
      subtitle: s.code || "",
      href: "/services",
      category: "services" as const,
    }));

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, patient_id")
      .or(`invoice_number.ilike.%${searchTerm}%,total_amount::text.ilike.%${searchTerm}%`)
      .range(offset, offset + limit - 1)
      .limit(limit);

    const invoiceResults = (invoices || []).map((inv: any) => ({
      id: inv.id,
      title: `Invoice #${inv.invoice_number || inv.id}`,
      subtitle: inv.total_amount ? `CHF ${inv.total_amount}` : "",
      href: inv.patient_id ? `/patients/${inv.patient_id}` : "/invoices",
      category: "invoices" as const,
    }));

    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, title, reason, start_time, patient_id")
      .or(`title.ilike.%${searchTerm}%,reason.ilike.%${searchTerm}%`)
      .range(offset, offset + limit - 1)
      .limit(limit);

    const appointmentResults = (appointments || []).map((a: any) => ({
      id: a.id,
      title: a.title || a.reason || "Appointment",
      subtitle: a.start_time ? new Date(a.start_time).toLocaleString() : "",
      href: a.patient_id ? `/patients/${a.patient_id}` : "/appointments",
      category: "appointments" as const,
    }));

    const allResults = [
      ...pageResults,
      ...patientResults,
      ...taskResults,
      ...dealResults,
      ...serviceResults,
      ...invoiceResults,
      ...appointmentResults,
    ];

    const grouped = new Map<string, { category: string; items: any[] }>();
    for (const item of allResults) {
      if (!grouped.has(item.category)) {
        grouped.set(item.category, { category: item.category, items: [] });
      }
      grouped.get(item.category)!.items.push(item);
    }

    let resultGroups = Array.from(grouped.values()).map((g) => ({
      ...g,
      total: g.items.length,
    }));

    if (categories && categories.length > 0) {
      resultGroups = resultGroups.filter((g) => categories.includes(g.category));
    }

    const categoryOrder = ["pages", "patients", "appointments", "tasks", "deals", "services", "invoices"];
    resultGroups.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));

    return NextResponse.json({
      results: resultGroups,
      query: searchTerm,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Search failed" },
      { status: 500 }
    );
  }
}
