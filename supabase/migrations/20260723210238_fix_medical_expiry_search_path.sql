-- This pure legacy helper only uses pg_catalog functions. Pin its resolution
-- path so callers cannot influence object lookup through a mutable search_path.
alter function public.calculate_medical_expiry(date, date, integer)
set search_path = '';
