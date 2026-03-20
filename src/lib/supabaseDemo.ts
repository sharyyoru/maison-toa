import { isDemoUser } from "./demoMode";

const DEMO_TABLES = [
  "patients",
  "appointments",
  "deals",
  "emails",
  "whatsapp_messages",
  "documents",
  "patient_notes",
  "tasks",
  "consultations",
  "workflows",
  "email_templates",
  "providers",
  "deal_stages",
  "chat_conversations",
  "chat_messages",
];

export async function addDemoFlag(data: any): Promise<any> {
  const isDemo = await isDemoUser();
  
  if (Array.isArray(data)) {
    return data.map(item => ({ ...item, is_demo: isDemo }));
  }
  
  return { ...data, is_demo: isDemo };
}
