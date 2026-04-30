alter table booking.bookings
  add column if not exists provider_marked_done_at timestamptz,
  add column if not exists customer_marked_done_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists provider_completed_at timestamptz,
  add column if not exists completion_time timestamptz,
  add column if not exists status_timeline jsonb not null default '[]'::jsonb;

update booking.bookings
set status_timeline = jsonb_build_array(
  jsonb_build_object(
    'status', coalesce(nullif(status::text, ''), 'pending'),
    'label', case coalesce(nullif(status::text, ''), 'pending')
      when 'pending' then 'Request created'
      when 'confirmed' then 'Provider accepted your booking'
      when 'in_progress' then 'Provider is on the way'
      when 'completed' then 'Service completed'
      when 'cancelled' then 'Booking cancelled'
      when 'disputed' then 'Booking disputed'
      else coalesce(nullif(status::text, ''), 'pending')
    end,
    'timestamp', coalesce(created_at, now())
  )
)
where status_timeline = '[]'::jsonb;

update booking.bookings
set
  status = 'in_progress',
  provider_marked_done_at = coalesce(
    provider_marked_done_at,
    provider_completed_at,
    now()
)
where status::text = 'provider_done';

update booking.bookings
set
  customer_marked_done_at = coalesce(customer_marked_done_at, completion_time),
  completed_at = coalesce(completed_at, completion_time)
where status::text = 'completed';

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'booking.bookings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* '\mstatus\M'
  loop
    execute format(
      'alter table booking.bookings drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table booking.bookings
  add constraint bookings_status_check
  check (
    status::text in (
      'pending',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
      'disputed'
    )
  );
