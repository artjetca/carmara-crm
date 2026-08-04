-- Hands-free quick capture for salespeople who are driving.
--
-- A note recorded from the car is saved immediately as a draft so the
-- salesperson never has to look at the screen. Drafts are kept apart from
-- reviewed notes and deliberately do NOT create follow-up reminders until a
-- human has checked them, because an unreviewed AI date could be wrong.

ALTER TABLE public.sales_visit_notes
    ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'reviewed';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sales_visit_notes_review_status_check'
    ) THEN
        ALTER TABLE public.sales_visit_notes
            ADD CONSTRAINT sales_visit_notes_review_status_check
            CHECK (review_status IN ('pending_review', 'reviewed'));
    END IF;
END $$;

-- Everything created before this migration was confirmed on screen.
UPDATE public.sales_visit_notes SET review_status = 'reviewed' WHERE review_status IS NULL;

-- How the customer was identified, so the review screen can show why we
-- picked that client and how confident the match was.
ALTER TABLE public.sales_visit_notes
    ADD COLUMN IF NOT EXISTS match_method TEXT,
    ADD COLUMN IF NOT EXISTS match_confidence TEXT,
    ADD COLUMN IF NOT EXISTS captured_lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS captured_lng DOUBLE PRECISION;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sales_visit_notes_match_confidence_check'
    ) THEN
        ALTER TABLE public.sales_visit_notes
            ADD CONSTRAINT sales_visit_notes_match_confidence_check
            CHECK (match_confidence IS NULL OR match_confidence IN ('high', 'medium', 'low', 'none'));
    END IF;
END $$;

-- Pending drafts are the first thing the review screen loads.
CREATE INDEX IF NOT EXISTS idx_sales_visit_notes_pending_review
    ON public.sales_visit_notes (salesperson_id, created_at DESC)
    WHERE review_status = 'pending_review';

NOTIFY pgrst, 'reload schema';
