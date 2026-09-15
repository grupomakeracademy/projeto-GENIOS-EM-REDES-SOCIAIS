-- Add scale_percent column for exact assets to configure overlay size as percentage of image width
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS scale_percent integer DEFAULT 20;
