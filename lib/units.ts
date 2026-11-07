import type { Unit } from "./types";

// Same list as the database "units" table (used where no login is available, e.g. shared links)
export const DEFAULT_UNITS: Unit[] = [
  { code: "sqm", label: "Square Meter", is_lump_sum: false, sort_order: 1 },
  { code: "cum", label: "Cubic Meter", is_lump_sum: false, sort_order: 2 },
  { code: "rm", label: "Running Meter", is_lump_sum: false, sort_order: 3 },
  { code: "nos", label: "Numbers", is_lump_sum: false, sort_order: 4 },
  { code: "days", label: "Days", is_lump_sum: false, sort_order: 5 },
  { code: "hrs", label: "Hours", is_lump_sum: false, sort_order: 6 },
  { code: "kg", label: "Kilogram", is_lump_sum: false, sort_order: 7 },
  { code: "ton", label: "Ton", is_lump_sum: false, sort_order: 8 },
  { code: "ltr", label: "Liter", is_lump_sum: false, sort_order: 9 },
  { code: "trip", label: "Trip", is_lump_sum: false, sort_order: 10 },
  { code: "month", label: "Month", is_lump_sum: false, sort_order: 11 },
  { code: "ls", label: "Lump Sum", is_lump_sum: true, sort_order: 12 },
];
