-- Onboarding order: "Share your account logins" comes before "Book your kickoff call".
-- Swaps the two positions (through a temporary one, since positions are unique per agency).
do $$
declare r record;
begin
  for r in
    select b.agency_id, b.id as booking_id, b.position as booking_pos, l.id as logins_id, l.position as logins_pos
    from onboarding_steps b
    join onboarding_steps l on l.agency_id = b.agency_id and l.kind = 'logins'
    where b.kind = 'booking' and b.position < l.position
  loop
    update onboarding_steps set position = -1 where id = r.booking_id;
    update onboarding_steps set position = r.booking_pos where id = r.logins_id;
    update onboarding_steps set position = r.logins_pos where id = r.booking_id;
  end loop;
end $$;
