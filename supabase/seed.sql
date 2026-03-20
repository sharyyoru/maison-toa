-- Seed file for Maison Toa
-- This file contains initial data setup (no patient/client data - clean copy)

-- Seed default deal stages
INSERT INTO deal_stages (id, name, type, sort_order, is_default)
VALUES 
  (gen_random_uuid(), 'New Lead', 'lead', 1, true),
  (gen_random_uuid(), 'Contacted', 'lead', 2, false),
  (gen_random_uuid(), 'Consultation Scheduled', 'consultation', 3, false),
  (gen_random_uuid(), 'Consultation Complete', 'consultation', 4, false),
  (gen_random_uuid(), 'Quote Sent', 'consultation', 5, false),
  (gen_random_uuid(), 'Surgery Scheduled', 'surgery', 6, false),
  (gen_random_uuid(), 'Surgery Complete', 'surgery', 7, false),
  (gen_random_uuid(), 'Post-Op Care', 'post_op', 8, false),
  (gen_random_uuid(), 'Follow-Up', 'follow_up', 9, false),
  (gen_random_uuid(), 'Closed Won', 'other', 10, false),
  (gen_random_uuid(), 'Closed Lost', 'other', 11, false)
ON CONFLICT DO NOTHING;

-- Seed default service categories
INSERT INTO service_categories (id, name, description, sort_order)
VALUES 
  (gen_random_uuid(), 'Aesthetics', 'Aesthetic and cosmetic procedures', 1),
  (gen_random_uuid(), 'Reconstructive', 'Reconstructive surgery procedures', 2),
  (gen_random_uuid(), 'Non-Surgical', 'Non-surgical treatments and procedures', 3)
ON CONFLICT (name) DO NOTHING;
