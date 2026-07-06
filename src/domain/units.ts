import type { WeightUnit } from './types';

export const KG_PER_LB = 0.45359237;

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return from === 'lb' ? value * KG_PER_LB : value / KG_PER_LB;
}

export function formatWeight(value: number, unit: WeightUnit): string {
  const rounded = Math.round(value * 10) / 10;
  const trimmed = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${trimmed} ${unit}`;
}
