-- Migration 002 — add push_token column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
