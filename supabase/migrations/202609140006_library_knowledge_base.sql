-- Migration: 202609140006_library_knowledge_base.sql
-- Add textual pre-processed knowledge base columns to assets for single-vision architecture

ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS content_hash text,
ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS processing_error text,
ADD COLUMN IF NOT EXISTS processed_at timestamptz,
ADD COLUMN IF NOT EXISTS processor_model text,
ADD COLUMN IF NOT EXISTS processing_version integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS textual_interpretation jsonb,
ADD COLUMN IF NOT EXISTS summary_text text;

-- Create indexes for fast lookup and delta checks
CREATE INDEX IF NOT EXISTS idx_assets_content_hash ON public.assets(content_hash);
CREATE INDEX IF NOT EXISTS idx_assets_processing_status ON public.assets(processing_status);
CREATE INDEX IF NOT EXISTS idx_assets_workspace_status ON public.assets(workspace_id, processing_status);
