-- Removes push notification delivery.
--
-- The Expo Push Service integration (03_TechSpec §3.4, 12_Mobile_App_Spec §7) has
-- been dropped along with the `expo-notifications` client dependency. In-app
-- notifications in `notification_logs` are unaffected and remain the only channel.
--
-- Dropped here:
--   device_tokens        — existed only to hold Expo push tokens
--   "DevicePlatform"     — enum used only by device_tokens.platform
--   notification_logs.delivered_at — only ever written by the push delivery path

-- Dropping the table also drops its indexes, its FK to users, and the row-level
-- security policies applied to it by 20260814000100_supabase_storage_and_rls.
DROP TABLE IF EXISTS "device_tokens";

-- Safe only because device_tokens.platform was the sole reference. ClientPlatform
-- is a separate enum and is still used by audit_logs.client_platform.
DROP TYPE IF EXISTS "DevicePlatform";

ALTER TABLE "notification_logs" DROP COLUMN IF EXISTS "delivered_at";
