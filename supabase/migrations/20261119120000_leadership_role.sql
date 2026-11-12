-- V1.19 — a read-only role for the Ketua BTN and the Dewan Pengawas (supervisory board).
-- Step 1 of 2: the new role value. It must be committed before any function uses it (step 2 is the next file).
-- Only adds an enum value; nothing else changes.
alter type public.app_role add value if not exists 'leadership';
