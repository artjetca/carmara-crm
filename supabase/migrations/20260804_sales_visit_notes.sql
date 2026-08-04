-- Voice visit notes for field salespeople.
-- Notes belong to the salesperson who created them; supervisors/administrators
-- can read everything. Raw transcripts are kept so an AI failure never loses
-- what the salesperson actually said.

-- The original schema declared user_profiles.role but the live database never
-- got it. Add it here (additive only, existing rows default to 'vendedor')
-- so the supervisor check below has something to read.
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'vendedor';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_check'
    ) THEN
        ALTER TABLE public.user_profiles
            ADD CONSTRAINT user_profiles_role_check
            CHECK (role IN ('vendedor', 'supervisor', 'administrador'));
    END IF;
END $$;

UPDATE public.user_profiles SET role = 'vendedor' WHERE role IS NULL;

CREATE TABLE IF NOT EXISTS public.sales_visit_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    salesperson_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    raw_transcript TEXT NOT NULL,
    visit_summary TEXT DEFAULT '',
    interested_products TEXT[] DEFAULT '{}',
    customer_feedback TEXT DEFAULT '',
    customer_issues TEXT DEFAULT '',
    next_action TEXT DEFAULT '',
    follow_up_date DATE,
    follow_up_priority TEXT DEFAULT 'medium'
        CHECK (follow_up_priority IN ('low', 'medium', 'high')),
    missing_information TEXT[] DEFAULT '{}',
    structuring_status TEXT DEFAULT 'ok'
        CHECK (structuring_status IN ('ok', 'manual', 'failed')),
    -- Client generated key so a double tap on "save" cannot create two rows.
    client_request_id TEXT,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_visit_notes_customer_id
    ON public.sales_visit_notes (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_visit_notes_salesperson_id
    ON public.sales_visit_notes (salesperson_id);
CREATE INDEX IF NOT EXISTS idx_sales_visit_notes_visit_date
    ON public.sales_visit_notes (visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_visit_notes_follow_up_date
    ON public.sales_visit_notes (follow_up_date)
    WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_visit_notes_created_at
    ON public.sales_visit_notes (created_at DESC);

-- Idempotency: the same client request can only produce one note.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sales_visit_notes_client_request
    ON public.sales_visit_notes (salesperson_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

-- Internal follow-up tasks. Deliberately not wired to any external calendar.
CREATE TABLE IF NOT EXISTS public.sales_follow_up_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    visit_note_id UUID REFERENCES public.sales_visit_notes(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    salesperson_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    next_action TEXT DEFAULT '',
    due_date DATE NOT NULL,
    remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_follow_up_tasks_salesperson
    ON public.sales_follow_up_tasks (salesperson_id);
CREATE INDEX IF NOT EXISTS idx_sales_follow_up_tasks_customer
    ON public.sales_follow_up_tasks (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_follow_up_tasks_due_date
    ON public.sales_follow_up_tasks (due_date);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sales_follow_up_tasks_note
    ON public.sales_follow_up_tasks (visit_note_id)
    WHERE visit_note_id IS NOT NULL;

ALTER TABLE public.sales_visit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_follow_up_tasks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_sales_supervisor(uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles p
        WHERE p.id = uid AND p.role IN ('supervisor', 'administrador')
    );
$$;

DO $$
BEGIN
    DROP POLICY IF EXISTS "visit_notes_select_own_or_supervisor" ON public.sales_visit_notes;
    DROP POLICY IF EXISTS "visit_notes_insert_own" ON public.sales_visit_notes;
    DROP POLICY IF EXISTS "visit_notes_update_own" ON public.sales_visit_notes;
    DROP POLICY IF EXISTS "visit_notes_delete_own" ON public.sales_visit_notes;
    DROP POLICY IF EXISTS "follow_up_tasks_select_own_or_supervisor" ON public.sales_follow_up_tasks;
    DROP POLICY IF EXISTS "follow_up_tasks_write_own" ON public.sales_follow_up_tasks;
END $$;

CREATE POLICY "visit_notes_select_own_or_supervisor" ON public.sales_visit_notes
    FOR SELECT TO authenticated
    USING (salesperson_id = auth.uid() OR public.is_sales_supervisor(auth.uid()));

CREATE POLICY "visit_notes_insert_own" ON public.sales_visit_notes
    FOR INSERT TO authenticated
    WITH CHECK (salesperson_id = auth.uid());

CREATE POLICY "visit_notes_update_own" ON public.sales_visit_notes
    FOR UPDATE TO authenticated
    USING (salesperson_id = auth.uid())
    WITH CHECK (salesperson_id = auth.uid());

CREATE POLICY "visit_notes_delete_own" ON public.sales_visit_notes
    FOR DELETE TO authenticated
    USING (salesperson_id = auth.uid());

CREATE POLICY "follow_up_tasks_select_own_or_supervisor" ON public.sales_follow_up_tasks
    FOR SELECT TO authenticated
    USING (salesperson_id = auth.uid() OR public.is_sales_supervisor(auth.uid()));

CREATE POLICY "follow_up_tasks_write_own" ON public.sales_follow_up_tasks
    FOR ALL TO authenticated
    USING (salesperson_id = auth.uid())
    WITH CHECK (salesperson_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_visit_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_follow_up_tasks TO authenticated;

NOTIFY pgrst, 'reload schema';
