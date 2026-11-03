alter table public.aircraft_models
  add column if not exists performance_speeds jsonb;

comment on column public.aircraft_models.performance_speeds is
  'Model-level reference speeds stored as {unit: KIAS|MPH, values: {Vx, Vy, ...}}.';

alter table public.aircraft_models
  drop constraint if exists aircraft_models_performance_speeds_shape;

alter table public.aircraft_models
  add constraint aircraft_models_performance_speeds_shape
  check (
    performance_speeds is null
    or (
      jsonb_typeof(performance_speeds) = 'object'
      and coalesce(performance_speeds ->> 'unit', 'KIAS') in ('KIAS', 'MPH')
      and (
        performance_speeds -> 'values' is null
        or jsonb_typeof(performance_speeds -> 'values') = 'object'
      )
    )
  );
