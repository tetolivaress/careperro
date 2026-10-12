/**
 * Unit definitions for the unit converter. Each quantity has a base unit; linear units store
 * the factor to that base, the rest (temperature, fuel economy) supply their own functions.
 */

export const QUANTITIES = ["length", "mass", "temperature", "volume", "area", "speed", "time", "data", "pressure", "energy", "fuel"] as const;
export type Quantity = (typeof QUANTITIES)[number];

export interface UnitDef {
  /** Message key under `productivity.units.names` and stable id in the URL-free state. */
  id: string;
  symbol: string;
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
}

function linear(id: string, symbol: string, factor: number): UnitDef {
  return { id, symbol, toBase: (v) => v * factor, fromBase: (v) => v / factor };
}

const US_GAL_L = 3.785411784;
const MILE_KM = 1.609344;

export const UNITS: Record<Quantity, UnitDef[]> = {
  // base: metre
  length: [
    linear("micrometer", "µm", 1e-6),
    linear("millimeter", "mm", 1e-3),
    linear("centimeter", "cm", 1e-2),
    linear("meter", "m", 1),
    linear("kilometer", "km", 1e3),
    linear("inch", "in", 0.0254),
    linear("foot", "ft", 0.3048),
    linear("yard", "yd", 0.9144),
    linear("mile", "mi", 1609.344),
    linear("nauticalMile", "nmi", 1852),
  ],
  // base: kilogram
  mass: [
    linear("milligram", "mg", 1e-6),
    linear("gram", "g", 1e-3),
    linear("kilogram", "kg", 1),
    linear("tonne", "t", 1e3),
    linear("ounce", "oz", 0.028349523125),
    linear("pound", "lb", 0.45359237),
    linear("stone", "st", 6.35029318),
    linear("shortTon", "US ton", 907.18474),
  ],
  // base: kelvin
  temperature: [
    { id: "celsius", symbol: "°C", toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
    { id: "fahrenheit", symbol: "°F", toBase: (v) => ((v - 32) * 5) / 9 + 273.15, fromBase: (v) => ((v - 273.15) * 9) / 5 + 32 },
    { id: "kelvin", symbol: "K", toBase: (v) => v, fromBase: (v) => v },
  ],
  // base: litre (US customary kitchen units)
  volume: [
    linear("milliliter", "mL", 1e-3),
    linear("liter", "L", 1),
    linear("cubicMeter", "m³", 1e3),
    linear("teaspoon", "tsp", 0.00492892159375),
    linear("tablespoon", "tbsp", 0.01478676478125),
    linear("fluidOunce", "fl oz", 0.0295735295625),
    linear("cup", "cup", 0.2365882365),
    linear("pint", "pt", 0.473176473),
    linear("quart", "qt", 0.946352946),
    linear("gallon", "gal", US_GAL_L),
    linear("imperialGallon", "imp gal", 4.54609),
  ],
  // base: square metre
  area: [
    linear("squareCentimeter", "cm²", 1e-4),
    linear("squareMeter", "m²", 1),
    linear("hectare", "ha", 1e4),
    linear("squareKilometer", "km²", 1e6),
    linear("squareInch", "in²", 0.00064516),
    linear("squareFoot", "ft²", 0.09290304),
    linear("squareYard", "yd²", 0.83612736),
    linear("acre", "ac", 4046.8564224),
    linear("squareMile", "mi²", 2589988.110336),
  ],
  // base: metre per second
  speed: [
    linear("meterPerSecond", "m/s", 1),
    linear("kilometerPerHour", "km/h", 1 / 3.6),
    linear("milePerHour", "mph", 0.44704),
    linear("knot", "kn", 1852 / 3600),
    linear("footPerSecond", "ft/s", 0.3048),
  ],
  // base: second; month and year are Gregorian averages
  time: [
    linear("millisecond", "ms", 1e-3),
    linear("second", "s", 1),
    linear("minute", "min", 60),
    linear("hour", "h", 3600),
    linear("day", "d", 86400),
    linear("week", "wk", 604800),
    linear("month", "mo", 2629746),
    linear("year", "yr", 31556952),
  ],
  // base: byte
  data: [
    linear("bit", "bit", 1 / 8),
    linear("byte", "B", 1),
    linear("kilobyte", "kB", 1e3),
    linear("megabyte", "MB", 1e6),
    linear("gigabyte", "GB", 1e9),
    linear("terabyte", "TB", 1e12),
    linear("kibibyte", "KiB", 1024),
    linear("mebibyte", "MiB", 1024 ** 2),
    linear("gibibyte", "GiB", 1024 ** 3),
    linear("tebibyte", "TiB", 1024 ** 4),
  ],
  // base: pascal
  pressure: [
    linear("pascal", "Pa", 1),
    linear("kilopascal", "kPa", 1e3),
    linear("bar", "bar", 1e5),
    linear("psi", "psi", 6894.757293168),
    linear("atmosphere", "atm", 101325),
    linear("mmHg", "mmHg", 133.322387415),
  ],
  // base: joule
  energy: [
    linear("joule", "J", 1),
    linear("kilojoule", "kJ", 1e3),
    linear("calorie", "cal", 4.184),
    linear("kilocalorie", "kcal", 4184),
    linear("wattHour", "Wh", 3600),
    linear("kilowattHour", "kWh", 3.6e6),
    linear("btu", "BTU", 1055.05585262),
  ],
  // base: kilometres per litre; L/100 km is inverse, so 0 maps to Infinity and is shown as "—"
  fuel: [
    linear("kmPerLiter", "km/L", 1),
    { id: "litersPer100km", symbol: "L/100 km", toBase: (v) => 100 / v, fromBase: (v) => 100 / v },
    linear("mpgUs", "mpg (US)", MILE_KM / US_GAL_L),
    linear("mpgUk", "mpg (UK)", MILE_KM / 4.54609),
  ],
};

/** Sensible starting pair per quantity (from, to). */
export const DEFAULT_PAIR: Record<Quantity, [string, string]> = {
  length: ["centimeter", "inch"],
  mass: ["kilogram", "pound"],
  temperature: ["celsius", "fahrenheit"],
  volume: ["liter", "gallon"],
  area: ["squareMeter", "squareFoot"],
  speed: ["kilometerPerHour", "milePerHour"],
  time: ["hour", "minute"],
  data: ["megabyte", "mebibyte"],
  pressure: ["bar", "psi"],
  energy: ["kilocalorie", "kilojoule"],
  fuel: ["litersPer100km", "mpgUs"],
};

export function findUnit(q: Quantity, id: string): UnitDef {
  return UNITS[q].find((u) => u.id === id) ?? UNITS[q][0];
}

export function convert(value: number, from: UnitDef, to: UnitDef): number {
  return from.id === to.id ? value : to.fromBase(from.toBase(value));
}

/**
 * Parses what people type in either decimal convention: "1.5", "1,5", "1 234,5", "1,234.5", "-3e-4".
 * With both marks, the last one is the decimal mark. A lone comma follows the locale ("1,5" is 1.5 in
 * Spanish, "1,500" is 1500 in English); a lone dot is always a decimal mark.
 */
export function parseNumber(raw: string, locale: string): number | null {
  let s = raw.trim().replace(/[\s\u00a0\u202f']/g, "");
  if (!s) return null;
  const dot = s.lastIndexOf("."), comma = s.lastIndexOf(",");
  const commaIsDecimal = new Intl.NumberFormat(locale).format(1.5).includes(",");
  if (dot >= 0 && comma >= 0) s = dot > comma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  else if (comma >= 0) s = commaIsDecimal && s.indexOf(",") === comma ? s.replace(",", ".") : s.replace(/,/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Localized number with up to 10 significant digits; scientific notation for extremes. */
export function formatNumber(n: number, locale: string): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const scientific = abs !== 0 && (abs >= 1e15 || abs < 1e-6);
  return new Intl.NumberFormat(locale, {
    maximumSignificantDigits: 10,
    notation: scientific ? "scientific" : "standard",
  }).format(n);
}
