-- Migration: Dynamic Money Counter
-- Description: Creates tables for denominations and cash counts with RLS policies.

-- 1. Create denominations table
CREATE TABLE IF NOT EXISTS public.denominations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    currency_code TEXT DEFAULT 'QAR' NOT NULL,
    value NUMERIC NOT NULL,
    label TEXT NOT NULL,
    type TEXT CHECK (type IN ('bill', 'coin')) NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.denominations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own denominations"
    ON public.denominations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own denominations"
    ON public.denominations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own denominations"
    ON public.denominations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own denominations"
    ON public.denominations FOR DELETE
    USING (auth.uid() = user_id);

-- 2. Create cash_counts table
CREATE TABLE IF NOT EXISTS public.cash_counts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    total_amount NUMERIC NOT NULL,
    currency_code TEXT DEFAULT 'QAR' NOT NULL,
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.cash_counts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own cash counts"
    ON public.cash_counts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cash counts"
    ON public.cash_counts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cash counts"
    ON public.cash_counts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cash counts"
    ON public.cash_counts FOR DELETE
    USING (auth.uid() = user_id);
