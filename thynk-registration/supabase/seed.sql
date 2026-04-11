-- ================================================================
-- Thynk SaaS — Seed data
-- Creates: Thynk Success school + pricing + sample discount codes
-- Run AFTER 001_init.sql
-- ================================================================

-- Insert the Thynk Success school
insert into schools (school_code, name, org_name, branding, gateway_config, is_active)
values (
  'thynk',
  'Thynk Success',
  'Thynk Success',
  '{
    "primaryColor": "#4f46e5",
    "accentColor": "#8b5cf6",
    "redirectURL": "https://www.thynksuccess.com",
    "programDescription": "India''s premier advanced memory and intelligence program for students"
  }'::jsonb,
  '{
    "rzp_key_id": "rzp_live_SQTJFYmQGDno59",
    "cf_mode": "production",
    "eb_env": "production"
  }'::jsonb,
  true
);

-- Insert pricing for Thynk Success
insert into pricing (school_id, program_name, base_amount, currency, gateway_sequence, is_active)
select
  id,
  'Thynk Success Coaching Program',
  120000,          -- ₹1200 in paise
  'INR',
  array['cf','rzp','eb'],
  true
from schools where school_code = 'thynk';

-- Sample discount codes (add your real ones here)
insert into discount_codes (school_id, code, discount_amount, max_uses, is_active)
select id, 'EARLY200',  20000, 50,  true from schools where school_code = 'thynk';

insert into discount_codes (school_id, code, discount_amount, max_uses, is_active)
select id, 'THYNK100',  10000, 100, true from schools where school_code = 'thynk';

insert into discount_codes (school_id, code, discount_amount, max_uses, is_active)
select id, 'FRIEND300', 30000, 20,  true from schools where school_code = 'thynk';
