-- Keep the PREMIUM row on the same multiplier as the other reference bands.
update budget_reference_bands
set low_per_sqm = 53.60,
    high_per_sqm = 107.20
where item_key = 'MEASURES'
  and finish_level = 'PREMIUM';
