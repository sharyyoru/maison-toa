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

-- Seed Maison Toa service categories
INSERT INTO service_categories (id, name, description, sort_order)
VALUES 
  (gen_random_uuid(), 'Consultations', 'Initial consultations, follow-ups, and discussions', 1),
  (gen_random_uuid(), 'Laser Treatments', 'Laser and light-based treatments', 2),
  (gen_random_uuid(), 'Injectables', 'Botox, fillers, PRP and other injectables', 3),
  (gen_random_uuid(), 'Body Contouring', 'Non-invasive body sculpting treatments', 4),
  (gen_random_uuid(), 'Skin Treatments', 'Peels, microneedling and skin rejuvenation', 5),
  (gen_random_uuid(), 'Surgery', 'Surgical procedures', 6),
  (gen_random_uuid(), 'Wellness', 'IV therapy and wellness treatments', 7)
ON CONFLICT (name) DO NOTHING;

-- Seed Maison Toa services
INSERT INTO services (name, description, category_id, base_price)
SELECT '1ère consultation', 'First consultation', id, 150 FROM service_categories WHERE name = 'Consultations'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Contrôle', 'Follow-up appointment', id, 80 FROM service_categories WHERE name = 'Consultations'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Discussion', 'Discussion appointment', id, 0 FROM service_categories WHERE name = 'Consultations'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Vectra', '3D imaging consultation', id, 100 FROM service_categories WHERE name = 'Consultations'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Laser', 'Laser treatment', id, 300 FROM service_categories WHERE name = 'Laser Treatments'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Laser CO2', 'CO2 laser resurfacing', id, 500 FROM service_categories WHERE name = 'Laser Treatments'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Injection (botox; acide hyaluronic)', 'Botox and hyaluronic acid injections', id, 400 FROM service_categories WHERE name = 'Injectables'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'PRP', 'Platelet-rich plasma therapy', id, 350 FROM service_categories WHERE name = 'Injectables'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Coolsculpting', 'Fat freezing treatment', id, 600 FROM service_categories WHERE name = 'Body Contouring'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'ONDA', 'Coolwaves body contouring', id, 400 FROM service_categories WHERE name = 'Body Contouring'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Ultraformer III', 'HIFU skin tightening', id, 500 FROM service_categories WHERE name = 'Body Contouring'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Miradry', 'Sweat reduction treatment', id, 1500 FROM service_categories WHERE name = 'Body Contouring'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Peeling', 'Chemical peel treatment', id, 200 FROM service_categories WHERE name = 'Skin Treatments'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Dermapen', 'Microneedling treatment', id, 250 FROM service_categories WHERE name = 'Skin Treatments'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'SOIN SIGNATURE', 'Signature facial treatment', id, 300 FROM service_categories WHERE name = 'Skin Treatments'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'Bloc op', 'Surgical procedure', id, 0 FROM service_categories WHERE name = 'Surgery'
ON CONFLICT DO NOTHING;
INSERT INTO services (name, description, category_id, base_price)
SELECT 'IV THERAPY', 'Intravenous vitamin therapy', id, 200 FROM service_categories WHERE name = 'Wellness'
ON CONFLICT DO NOTHING;
