pen that newly created schema.sql file and drop in this exact database architecture:

SQL
-- 1. Create custom ENUM type for strict transit milestone validation
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transit_status_milestone') THEN
        CREATE TYPE transit_status_milestone AS ENUM (
            'ORIGIN_SCAN', 
            'HUB', 
            'OUT_FOR_DELIVERY', 
            'DELIVERED_SECURED'
        );
    END IF;
END $$;

-- 2. Construct the isolated transit logs tracking table
CREATE TABLE IF NOT EXISTS public.watch_transit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    listing_id UUID NOT NULL,
    tracking_number TEXT NOT NULL,
    carrier TEXT NOT NULL,
    status transit_status_milestone NOT NULL,
    location TEXT NOT NULL,
    details TEXT,
    updated_by UUID NOT NULL,

    -- Foreign key constraints tying directly to core tables without mutation bleed
    CONSTRAINT fk_listing 
        FOREIGN KEY(listing_id) 
        REFERENCES public.listings(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_user 
        FOREIGN KEY(updated_by) 
        REFERENCES auth.users(id) 
        ON DELETE SET NULL
);

-- 3. High-performance lookup indexes for dynamic buyer/seller queries
CREATE INDEX IF NOT EXISTS idx_watch_transit_logs_listing_id 
    ON public.watch_transit_logs(listing_id);

CREATE INDEX IF NOT EXISTS idx_watch_transit_logs_tracking_number 
    ON public.watch_transit_logs(tracking_number);

-- 4. Enable Row Level Security (RLS) to maintain strict data boundaries
ALTER TABLE public.watch_transit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated buyers or sellers can view tracking event details
CREATE POLICY "Allow transaction participants read access" ON public.watch_transit_logs
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND (
            EXISTS (
                SELECT 1 FROM public.listings 
                WHERE public.listings.id = public.watch_transit_logs.listing_id 
                AND (public.listings.seller_id = auth.uid() OR public.listings.buyer_id = auth.uid())
            )
        )
    );