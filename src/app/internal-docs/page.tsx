"use client";

import { useState } from "react";

type Section = "overview" | "features" | "ai-plans" | "api" | "database";

export default function InternalDocsPage() {
  const [activeSection, setActiveSection] = useState<Section>("overview");

  const sections: { key: Section; label: string }[] = [
    { key: "overview", label: "Platform Overview" },
    { key: "features", label: "Current Features" },
    { key: "ai-plans", label: "AI Development Plans" },
    { key: "api", label: "API Reference" },
    { key: "database", label: "Database Schema" },
  ];

  return (
    <div className="min-h-screen space-y-6">
      <header className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Internal Documentation</h1>
            <p className="text-sm text-slate-500">Platform Functions & AI Development Roadmap</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
          🔒 This page is internal and not linked from the main navigation
        </p>
      </header>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <nav className="w-56 shrink-0">
          <div className="sticky top-4 space-y-1">
            {sections.map((section) => (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === section.key
                    ? "bg-violet-100 text-violet-800"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {activeSection === "overview" && <OverviewSection />}
          {activeSection === "features" && <FeaturesSection />}
          {activeSection === "ai-plans" && <AiPlansSection />}
          {activeSection === "api" && <ApiSection />}
          {activeSection === "database" && <DatabaseSection />}
        </main>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Platform Overview</h2>
        <p className="text-sm text-slate-600 mb-4">
          Aliice is a comprehensive Medical CRM and ERP platform designed specifically for aesthetic clinics. 
          It combines patient management, appointment scheduling, deal pipeline tracking, and AI-powered automation 
          to streamline clinic operations.
        </p>
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="rounded-lg bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Tech Stack</h3>
            <ul className="mt-2 text-xs text-slate-600 space-y-1">
              <li>• Next.js 15 (App Router)</li>
              <li>• React 19</li>
              <li>• TypeScript</li>
              <li>• Tailwind CSS 4</li>
              <li>• Supabase (PostgreSQL + Auth)</li>
              <li>• OpenAI API Integration</li>
            </ul>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Core Modules</h3>
            <ul className="mt-2 text-xs text-slate-600 space-y-1">
              <li>• Patient Management</li>
              <li>• Appointment Calendar</li>
              <li>• Deals & Pipeline</li>
              <li>• Task Management</li>
              <li>• Document Storage</li>
              <li>• Email & Communication</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturesSection() {
  const featureCategories = [
    {
      title: "Patient Management",
      features: [
        { name: "Patient Records", desc: "Comprehensive patient profiles with medical history, contact info, and CRM data" },
        { name: "Document Storage", desc: "Upload, organize, and manage patient documents with folder structure" },
        { name: "Before & After Editor", desc: "Create comparison images with zoom and position controls" },
        { name: "Medical Consultations", desc: "Track consultations with 3D imaging integration (Crisalix)" },
        { name: "Notes & Mentions", desc: "Internal notes with @mention functionality for team collaboration" },
        { name: "Activity Timeline", desc: "Complete history of patient interactions and changes" },
      ],
    },
    {
      title: "Scheduling & Calendar",
      features: [
        { name: "Appointment Calendar", desc: "Day/week/month views with drag-drop scheduling" },
        { name: "Booking System", desc: "Public booking page for patients to self-schedule" },
        { name: "Doctor Profiles", desc: "Individual doctor pages with availability management" },
        { name: "Appointment Reminders", desc: "Automated email and WhatsApp reminders" },
      ],
    },
    {
      title: "Sales & Pipeline",
      features: [
        { name: "Deal Pipeline", desc: "Kanban board for tracking sales opportunities" },
        { name: "Stage Management", desc: "Customizable pipeline stages with automation triggers" },
        { name: "Lead Management", desc: "Capture and qualify leads from multiple sources" },
        { name: "Service Catalog", desc: "Manage treatments and pricing" },
      ],
    },
    {
      title: "Communication",
      features: [
        { name: "Email Integration", desc: "Send and receive emails directly from patient records" },
        { name: "Email Templates", desc: "AI-powered email generation with custom tones" },
        { name: "WhatsApp Integration", desc: "View and respond to WhatsApp messages" },
        { name: "Task Comments", desc: "Team communication on tasks with mentions" },
      ],
    },
    {
      title: "Automation & Workflows",
      features: [
        { name: "Workflow Builder", desc: "Visual workflow designer for automation sequences" },
        { name: "Email Sequences", desc: "Automated email campaigns based on triggers" },
        { name: "Controllers", desc: "System controllers for various automation rules" },
        { name: "Appointment Workflows", desc: "Pre and post-appointment automation" },
      ],
    },
    {
      title: "Financials",
      features: [
        { name: "Invoice Generation", desc: "Create and manage patient invoices" },
        { name: "Payment Links", desc: "Secure payment processing with tokenized links" },
        { name: "Financial Reports", desc: "Revenue tracking and financial analytics" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {featureCategories.map((category) => (
        <div key={category.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{category.title}</h2>
          <div className="grid gap-3">
            {category.features.map((feature) => (
              <div key={feature.name} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                <div className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-slate-800">{feature.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AiPlansSection() {
  const aiFeatures = [
    {
      category: "Patient Intelligence",
      status: "planned",
      features: [
        {
          name: "AI Patient Risk Scoring",
          desc: "Analyze patient data to predict no-shows, cancellations, and treatment outcomes",
          priority: "high",
        },
        {
          name: "Smart Patient Segmentation",
          desc: "Automatically group patients by behavior, preferences, and value for targeted marketing",
          priority: "high",
        },
        {
          name: "Treatment Recommendation Engine",
          desc: "Suggest optimal treatments based on patient history, preferences, and clinic offerings",
          priority: "medium",
        },
        {
          name: "Patient Lifetime Value Prediction",
          desc: "ML model to predict patient LTV for prioritization and marketing spend optimization",
          priority: "medium",
        },
      ],
    },
    {
      category: "Communication AI",
      status: "partial",
      features: [
        {
          name: "AI Email Composer",
          desc: "Generate professional emails with customizable tone and context awareness",
          priority: "high",
          implemented: true,
        },
        {
          name: "Smart Reply Suggestions",
          desc: "AI-generated quick replies for common patient inquiries",
          priority: "high",
        },
        {
          name: "Sentiment Analysis",
          desc: "Analyze patient communication sentiment to flag concerns early",
          priority: "medium",
        },
        {
          name: "Multi-language Support",
          desc: "Real-time translation for patient communication in multiple languages",
          priority: "medium",
        },
        {
          name: "Voice-to-Text Notes",
          desc: "Transcribe doctor dictations into structured clinical notes",
          priority: "low",
        },
      ],
    },
    {
      category: "Scheduling Intelligence",
      status: "planned",
      features: [
        {
          name: "Smart Scheduling",
          desc: "AI-optimized appointment slots based on doctor efficiency, patient preferences, and treatment duration",
          priority: "high",
        },
        {
          name: "No-Show Prediction",
          desc: "Predict appointment no-shows and trigger automated reminders or overbooking",
          priority: "high",
        },
        {
          name: "Optimal Time Suggestions",
          desc: "Recommend best appointment times based on patient behavior patterns",
          priority: "medium",
        },
        {
          name: "Resource Optimization",
          desc: "Balance room, equipment, and staff utilization across the schedule",
          priority: "low",
        },
      ],
    },
    {
      category: "Sales & Marketing AI",
      status: "planned",
      features: [
        {
          name: "Lead Scoring",
          desc: "AI-powered lead qualification based on engagement, demographics, and behavior",
          priority: "high",
        },
        {
          name: "Conversion Prediction",
          desc: "Predict deal close probability and optimal follow-up timing",
          priority: "high",
        },
        {
          name: "Dynamic Pricing Suggestions",
          desc: "Recommend pricing adjustments based on demand, seasonality, and competition",
          priority: "medium",
        },
        {
          name: "Campaign Performance AI",
          desc: "Analyze marketing campaigns and suggest optimizations",
          priority: "medium",
        },
        {
          name: "Upsell/Cross-sell Recommendations",
          desc: "Suggest additional services based on patient treatment history",
          priority: "medium",
        },
      ],
    },
    {
      category: "Clinical AI",
      status: "planned",
      features: [
        {
          name: "Before/After Analysis",
          desc: "AI-powered analysis of treatment results from photos",
          priority: "high",
        },
        {
          name: "Treatment Planning Assistant",
          desc: "AI suggestions for treatment plans based on patient goals and medical history",
          priority: "high",
        },
        {
          name: "Complication Risk Assessment",
          desc: "Flag potential contraindications and risk factors before procedures",
          priority: "high",
        },
        {
          name: "Progress Tracking",
          desc: "Automated tracking and visualization of treatment progress over time",
          priority: "medium",
        },
        {
          name: "Clinical Note Summarization",
          desc: "Generate concise summaries from lengthy clinical documentation",
          priority: "low",
        },
      ],
    },
    {
      category: "Operational AI",
      status: "planned",
      features: [
        {
          name: "Aliice Chat Assistant",
          desc: "Conversational AI for staff to query patient data, schedule, and tasks",
          priority: "high",
          implemented: true,
        },
        {
          name: "Automated Task Creation",
          desc: "AI creates follow-up tasks based on appointments and patient interactions",
          priority: "high",
        },
        {
          name: "Workflow Optimization",
          desc: "Analyze workflow performance and suggest improvements",
          priority: "medium",
        },
        {
          name: "Inventory Prediction",
          desc: "Predict product/supply needs based on scheduled treatments",
          priority: "low",
        },
        {
          name: "Staff Performance Analytics",
          desc: "AI insights into staff productivity and patient satisfaction correlation",
          priority: "low",
        },
      ],
    },
    {
      category: "Document AI",
      status: "planned",
      features: [
        {
          name: "Smart Document Organization",
          desc: "Auto-categorize and tag uploaded documents using AI",
          priority: "high",
        },
        {
          name: "OCR & Data Extraction",
          desc: "Extract structured data from scanned documents and forms",
          priority: "high",
        },
        {
          name: "Consent Form Intelligence",
          desc: "Track consent status and auto-generate required forms",
          priority: "medium",
        },
        {
          name: "Document Search",
          desc: "Natural language search across all patient documents",
          priority: "medium",
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
        <h2 className="text-sm font-semibold text-violet-800 mb-2">AI Development Roadmap</h2>
        <p className="text-xs text-violet-600">
          This roadmap outlines planned AI features for the Aliice platform. Features are prioritized based on 
          business impact, technical feasibility, and customer demand. Implementation timeline depends on resources 
          and strategic priorities.
        </p>
      </div>

      {aiFeatures.map((category) => (
        <div key={category.category} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">{category.category}</h2>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              category.status === "partial" 
                ? "bg-amber-100 text-amber-700" 
                : "bg-slate-100 text-slate-600"
            }`}>
              {category.status === "partial" ? "Partially Implemented" : "Planned"}
            </span>
          </div>
          <div className="space-y-3">
            {category.features.map((feature) => (
              <div 
                key={feature.name} 
                className={`flex items-start gap-3 rounded-lg p-3 ${
                  feature.implemented ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50"
                }`}
              >
                <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                  feature.implemented 
                    ? "bg-emerald-500" 
                    : feature.priority === "high" 
                      ? "bg-rose-500" 
                      : feature.priority === "medium" 
                        ? "bg-amber-500" 
                        : "bg-slate-400"
                }`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-slate-800">{feature.name}</h3>
                    {feature.implemented && (
                      <span className="text-[10px] font-medium bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded">
                        LIVE
                      </span>
                    )}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      feature.priority === "high" 
                        ? "bg-rose-100 text-rose-700" 
                        : feature.priority === "medium" 
                          ? "bg-amber-100 text-amber-700" 
                          : "bg-slate-200 text-slate-600"
                    }`}>
                      {feature.priority.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ApiSection() {
  const endpoints = [
    {
      category: "Authentication",
      routes: [
        { method: "POST", path: "/api/auth/login", desc: "User login with email/password" },
        { method: "POST", path: "/api/auth/logout", desc: "User logout" },
        { method: "GET", path: "/api/auth/user", desc: "Get current authenticated user" },
      ],
    },
    {
      category: "Patients",
      routes: [
        { method: "GET", path: "/api/patients", desc: "List all patients with filters" },
        { method: "POST", path: "/api/patients", desc: "Create new patient" },
        { method: "GET", path: "/api/patients/[id]", desc: "Get patient details" },
        { method: "PUT", path: "/api/patients/[id]", desc: "Update patient" },
        { method: "DELETE", path: "/api/patients/[id]", desc: "Delete patient" },
      ],
    },
    {
      category: "Appointments",
      routes: [
        { method: "GET", path: "/api/appointments", desc: "List appointments with date range" },
        { method: "POST", path: "/api/appointments", desc: "Create appointment" },
        { method: "PUT", path: "/api/appointments/[id]", desc: "Update appointment" },
        { method: "DELETE", path: "/api/appointments/[id]", desc: "Cancel appointment" },
      ],
    },
    {
      category: "Tasks",
      routes: [
        { method: "GET", path: "/api/tasks", desc: "List tasks for user" },
        { method: "POST", path: "/api/tasks", desc: "Create task" },
        { method: "PUT", path: "/api/tasks/[id]", desc: "Update task" },
        { method: "POST", path: "/api/tasks/[id]/comments", desc: "Add comment to task" },
      ],
    },
    {
      category: "Users",
      routes: [
        { method: "GET", path: "/api/users/list", desc: "List platform users" },
        { method: "GET", path: "/api/users/me", desc: "Get current user profile" },
        { method: "PUT", path: "/api/users/me", desc: "Update current user profile" },
      ],
    },
    {
      category: "AI",
      routes: [
        { method: "POST", path: "/api/ai/email-generate", desc: "Generate email with AI" },
        { method: "POST", path: "/api/ai/chat", desc: "Chat with Aliice assistant" },
      ],
    },
    {
      category: "Integrations",
      routes: [
        { method: "POST", path: "/api/email/send", desc: "Send email via Resend" },
        { method: "GET", path: "/api/whatsapp/messages", desc: "Fetch WhatsApp messages" },
        { method: "POST", path: "/api/crisalix/session", desc: "Create Crisalix 3D session" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-sm font-semibold text-blue-800 mb-2">API Reference</h2>
        <p className="text-xs text-blue-600">
          Internal API endpoints for the Aliice platform. All endpoints require authentication unless otherwise noted.
          Base URL: <code className="bg-blue-100 px-1 rounded">/api</code>
        </p>
      </div>

      {endpoints.map((category) => (
        <div key={category.category} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{category.category}</h2>
          <div className="space-y-2">
            {category.routes.map((route) => (
              <div key={route.path} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                  route.method === "GET" 
                    ? "bg-emerald-100 text-emerald-700" 
                    : route.method === "POST" 
                      ? "bg-blue-100 text-blue-700" 
                      : route.method === "PUT" 
                        ? "bg-amber-100 text-amber-700" 
                        : "bg-rose-100 text-rose-700"
                }`}>
                  {route.method}
                </span>
                <code className="text-xs font-mono text-slate-700">{route.path}</code>
                <span className="text-xs text-slate-500 ml-auto">{route.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DatabaseSection() {
  const tables = [
    {
      name: "patients",
      desc: "Core patient records",
      columns: ["id", "first_name", "last_name", "email", "phone", "date_of_birth", "gender", "address", "contact_owner_id", "contact_label", "created_at"],
    },
    {
      name: "appointments",
      desc: "Scheduled appointments",
      columns: ["id", "patient_id", "start_time", "end_time", "status", "reason", "location", "doctor_id", "created_at"],
    },
    {
      name: "deals",
      desc: "Sales pipeline deals",
      columns: ["id", "patient_id", "title", "stage_id", "pipeline", "service_id", "contact_label", "location", "created_at"],
    },
    {
      name: "deal_stages",
      desc: "Pipeline stage definitions",
      columns: ["id", "name", "order_index", "pipeline", "color"],
    },
    {
      name: "tasks",
      desc: "Task management",
      columns: ["id", "patient_id", "name", "content", "status", "priority", "type", "assigned_user_id", "activity_date", "created_at"],
    },
    {
      name: "task_comments",
      desc: "Comments on tasks",
      columns: ["id", "task_id", "author_user_id", "author_name", "body", "created_at"],
    },
    {
      name: "patient_notes",
      desc: "Internal patient notes",
      columns: ["id", "patient_id", "author_user_id", "author_name", "body", "created_at"],
    },
    {
      name: "patient_note_mentions",
      desc: "User mentions in notes",
      columns: ["id", "note_id", "patient_id", "mentioned_user_id", "read_at", "created_at"],
    },
    {
      name: "patient_emails",
      desc: "Email communication",
      columns: ["id", "patient_id", "direction", "from_address", "to_address", "subject", "body_html", "sent_at", "created_at"],
    },
    {
      name: "services",
      desc: "Treatment/service catalog",
      columns: ["id", "name", "description", "price", "duration_minutes", "category", "active"],
    },
    {
      name: "platform_users",
      desc: "Staff/admin users",
      columns: ["id", "email", "full_name", "role", "created_at"],
    },
    {
      name: "workflow_definitions",
      desc: "Automation workflow configs",
      columns: ["id", "name", "trigger_type", "steps_json", "active", "created_at"],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <h2 className="text-sm font-semibold text-green-800 mb-2">Database Schema</h2>
        <p className="text-xs text-green-600">
          PostgreSQL database hosted on Supabase. All tables use UUID primary keys and include 
          standard audit columns (created_at, updated_at).
        </p>
      </div>

      <div className="grid gap-4">
        {tables.map((table) => (
          <div key={table.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <code className="text-sm font-mono font-semibold text-violet-700 bg-violet-50 px-2 py-1 rounded">
                {table.name}
              </code>
              <span className="text-xs text-slate-500">{table.desc}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {table.columns.map((col) => (
                <span key={col} className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">
                  {col}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
