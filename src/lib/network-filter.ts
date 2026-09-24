import { channels, type Channel } from './domain';

export function parseNetworks(value?: string | null): Channel[] {
  return [...new Set((value || '').split(',').filter((v): v is Channel => Object.hasOwn(channels, v)))];
}

export function applicableNetworks(values: string[]): Channel[] {
  return Object.keys(channels).filter((c): c is Channel => values.includes(c));
}
