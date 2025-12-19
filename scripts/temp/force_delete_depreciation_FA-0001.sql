-- =============================================
-- ⚠️ TEMPORARY SCRIPT - FOR SPECIFIC ASSET ONLY ⚠️
-- سكريبت مؤقت - لأصل محدد فقط
-- =============================================
-- ⚠️ WARNING: This script is hardcoded for:
--    Company ID: 3a663f6b-0689-4952-93c1-6d958c737089
--    Asset Code: FA-0001
-- ⚠️ DO NOT USE IN PRODUCTION FOR OTHER ASSETS
-- ⚠️ This is a one-time debugging script
-- =============================================
-- Force Delete ALL Depreciation Schedules for FA-0001
-- حذف قسري لجميع جداول الإهلاك للأصل FA-0001
-- =============================================

-- This script is a copy of scripts/131_force_delete_all_depreciation_schedules.sql
-- with hardcoded values for testing purposes only.
-- For production use, use the general script with parameters.

\i ../131_force_delete_all_depreciation_schedules.sql

