-- Rollback: Remove encrypted API key storage columns
-- Purpose: Revert the encrypted key storage feature
-- Date: 2025-11-22

ALTER TABLE api_keys
DROP COLUMN IF EXISTS encrypted_key,
DROP COLUMN IF EXISTS encryption_iv;
