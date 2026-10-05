-- Monthly rhythm, week 1: everyone records their goals for the month.
-- Added at the end of week 1 so existing check-offs (stored by position) stay on the right items.
update agencies
set monthly_rhythm = (
  select jsonb_agg(
    case when (w->>'week')::int = 1
      then jsonb_set(w, '{items}', (w->'items') || '[{"title": "Record your monthly goals", "detail": "On the Goals page, for the month ahead"}]'::jsonb)
      else w end
    order by ord)
  from jsonb_array_elements(monthly_rhythm) with ordinality as t(w, ord)
)
where jsonb_array_length(monthly_rhythm) > 0
  and not monthly_rhythm @> '[{"week": 1, "items": [{"title": "Record your monthly goals"}]}]'::jsonb;
