alter table public.aircraft_models
  add column if not exists max_weight numeric;

update public.aircraft_models
set
  max_weight = 1750,
  avg_fuel_burn_rate = 12,
  stations = '[
    {"id":"right_front_pilot","name":"Pilot - Right Front","arm":83.2,"latArm":12.8,"maxWeight":null,"fixedWeight":null,"weightPerGallon":null,"inputType":"number","crewRole":"pilot"},
    {"id":"left_front_copilot","name":"Co-Pilot - Left Front","arm":83.2,"latArm":-13.8,"maxWeight":null,"fixedWeight":null,"weightPerGallon":null,"inputType":"number","crewRole":"copilot"},
    {"id":"front_door_left_off","name":"Left Front Door Off","arm":74.0,"latArm":-24.4,"maxWeight":null,"fixedWeight":-5.0,"weightPerGallon":null,"inputType":"checkbox","crewRole":null},
    {"id":"front_door_right_off","name":"Right Front Door Off","arm":74.0,"latArm":24.4,"maxWeight":null,"fixedWeight":-5.0,"weightPerGallon":null,"inputType":"checkbox","crewRole":null},
    {"id":"glove_box","name":"Glove Box","arm":50.3,"latArm":0.0,"maxWeight":20.0,"fixedWeight":0.0,"weightPerGallon":null,"inputType":"number","crewRole":null},
    {"id":"fuel_main","name":"Main Fuel","arm":108.5,"latArm":-17.0,"maxWeight":195.0,"fixedWeight":null,"weightPerGallon":6.0,"inputType":"number","crewRole":null}
  ]'::jsonb
where id = '4b0c5434-4c1d-4880-b7c2-8e082e53051f';

update public.aircraft_models
set
  max_weight = 2400,
  avg_fuel_burn_rate = 16,
  stations = '[
    {"id":"right_front_pilot","name":"Pilot - Right Front","arm":49.5,"latArm":12.2,"maxWeight":300.0,"fixedWeight":null,"weightPerGallon":null,"inputType":"number","crewRole":"pilot"},
    {"id":"left_front_copilot","name":"Co-Pilot - Left Front","arm":49.5,"latArm":-10.4,"maxWeight":300.0,"fixedWeight":null,"weightPerGallon":null,"inputType":"number","crewRole":"copilot"},
    {"id":"front_door_left_off","name":"Left Front Door Off","arm":49.4,"latArm":-24.0,"maxWeight":null,"fixedWeight":-7.5,"weightPerGallon":null,"inputType":"checkbox","crewRole":null},
    {"id":"front_door_right_off","name":"Right Front Door Off","arm":49.4,"latArm":24.0,"maxWeight":null,"fixedWeight":-7.5,"weightPerGallon":null,"inputType":"checkbox","crewRole":null},
    {"id":"aft_door_left_off","name":"Left Aft Door Off","arm":75.4,"latArm":-23.0,"maxWeight":null,"fixedWeight":-7.0,"weightPerGallon":null,"inputType":"checkbox","crewRole":null},
    {"id":"aft_door_right_off","name":"Right Aft Door Off","arm":75.4,"latArm":23.0,"maxWeight":null,"fixedWeight":-7.0,"weightPerGallon":null,"inputType":"checkbox","crewRole":null},
    {"id":"collective_off","name":"Collective Off","arm":47.0,"latArm":-21.0,"maxWeight":null,"fixedWeight":-0.8,"weightPerGallon":null,"inputType":"checkbox","crewRole":null},
    {"id":"cyclic_off","name":"Cyclic Off","arm":35.8,"latArm":-8.0,"maxWeight":null,"fixedWeight":-0.6,"weightPerGallon":null,"inputType":"checkbox","crewRole":null},
    {"id":"pedals_off","name":"Pedals Off","arm":16.8,"latArm":-9.5,"maxWeight":null,"fixedWeight":-0.8,"weightPerGallon":null,"inputType":"checkbox","crewRole":null},
    {"id":"front_baggage_left","name":"Front Baggage - Left","arm":44.0,"latArm":-11.5,"maxWeight":50.0,"fixedWeight":null,"weightPerGallon":null,"inputType":"number","crewRole":null},
    {"id":"front_baggage_right","name":"Front Baggage - Right","arm":44.0,"latArm":11.5,"maxWeight":50.0,"fixedWeight":null,"weightPerGallon":null,"inputType":"number","crewRole":null},
    {"id":"rear_left_seat_bag","name":"Left Rear Seat / Bag","arm":79.5,"latArm":-12.2,"maxWeight":300.0,"fixedWeight":null,"weightPerGallon":null,"inputType":"number","crewRole":null},
    {"id":"rear_right_seat_bag","name":"Right Rear Seat / Bag","arm":79.5,"latArm":12.2,"maxWeight":300.0,"fixedWeight":null,"weightPerGallon":null,"inputType":"number","crewRole":null},
    {"id":"fuel_main","name":"Main Fuel","arm":106.0,"latArm":-13.5,"maxWeight":177.0,"fixedWeight":null,"weightPerGallon":6.0,"inputType":"number","crewRole":null},
    {"id":"fuel_aux","name":"Aux Fuel","arm":102.0,"latArm":13.0,"maxWeight":102.0,"fixedWeight":null,"weightPerGallon":6.0,"inputType":"number","crewRole":null}
  ]'::jsonb
where id = 'eb26e322-e38d-49bb-901a-b58f818c5f7b';

update public.aircraft
set
  empty_arm = 99.4021679807216,
  empty_lat_arm = 0.2811825654718423
where id = '49ef3c4e-64d6-4ead-a394-fe8b65398a7e';

update public.aircraft
set
  empty_arm = 105.66944702320887,
  empty_lat_arm = -0.30463303060881264
where id = '85a8b80e-2954-43cb-b26e-7e534a8e1d30';
