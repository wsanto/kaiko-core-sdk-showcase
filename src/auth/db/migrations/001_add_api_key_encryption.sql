-- Migration: Add encrypted API key storage columns
-- Purpose: Enable persistent API key visibility by storing encrypted keys
-- Date: 2025-11-22

-- Add columns to store encrypted API keys
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS encrypted_key TEXT,
ADD COLUMN IF NOT EXISTS encryption_iv VARCHAR(32);

-- Add comment explaining the columns
COMMENT ON COLUMN api_keys.encrypted_key IS 'AES-256-GCM encrypted API key for retrieval';
COMMENT ON COLUMN api_keys.encryption_iv IS 'Initialization vector for AES-256-GCM encryption';
