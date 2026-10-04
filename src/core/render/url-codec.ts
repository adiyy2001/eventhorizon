import {
  defaultSettings,
  mergeSettings,
  type OverlaySettings,
  type RenderSettings,
  type SplitSettings,
} from './settings';
import { type ViewDescription } from './view';

export const urlStateVersion = 1;

const versionKey = 'v';
const numericKeys = ['inc', 'dist', 'az', 'fov', 'ro', 't', 'ev', 'bl', 'sp'] as const;
const flagKeys = ['off', 'ov'] as const;
const ownKeys: readonly string[] = [versionKey, ...numericKeys, ...flagKeys];

type Switch = 'lensing' | 'doppler' | 'gravitationalRedshift' | 'higherOrderImages';

const switchLetters: readonly { letter: string; key: Switch }[] = [
  { letter: 'l', key: 'lensing' },
  { letter: 'd', key: 'doppler' },
  { letter: 'g', key: 'gravitationalRedshift' },
  { letter: 'h', key: 'higherOrderImages' },
];

const overlayLetters: readonly { letter: string; key: keyof OverlaySettings }[] = [
  { letter: 'p', key: 'photonSphere' },
  { letter: 'i', key: 'isco' },
  { letter: 'e', key: 'shadowEdge' },
];

const decimalPattern = /^-?\d+(\.\d+)?$/;

const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
const fromDegrees = (degrees: number): number => (degrees * Math.PI) / 180;

function formatted(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

function parseNumber(text: string | undefined): number | undefined {
  return text !== undefined && decimalPattern.test(text) ? Number(text) : undefined;
}

function splitQuery(query: string): [string, string][] {
  const trimmed = query.startsWith('?') ? query.slice(1) : query;
  return trimmed
    .split('&')
    .filter((part) => part.length > 0)
    .map((part) => {
      const separator = part.indexOf('=');
      return separator < 0 ? [part, ''] : [part.slice(0, separator), part.slice(separator + 1)];
    });
}

function readableValue(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function pairsOf(settings: RenderSettings): [string, string][] {
  const { view } = settings;
  const base = defaultSettings;
  const candidates: [string, string, string][] = [
    [
      'inc',
      formatted(toDegrees(view.inclination), 2),
      formatted(toDegrees(base.view.inclination), 2),
    ],
    ['dist', formatted(view.distance, 2), formatted(base.view.distance, 2)],
    ['az', formatted(toDegrees(view.azimuth), 2), formatted(toDegrees(base.view.azimuth), 2)],
    [
      'fov',
      formatted(toDegrees(view.verticalFieldOfView), 2),
      formatted(toDegrees(base.view.verticalFieldOfView), 2),
    ],
    ['ro', formatted(view.diskOuterRadius, 2), formatted(base.view.diskOuterRadius, 2)],
    ['t', formatted(view.peakTemperature, 0), formatted(base.view.peakTemperature, 0)],
    ['ev', formatted(settings.exposure, 2), formatted(base.exposure, 2)],
    ['bl', formatted(settings.bloomStrength, 3), formatted(base.bloomStrength, 3)],
  ];
  const pairs = candidates
    .filter(([, value, fallback]) => value !== fallback)
    .map(([key, value]): [string, string] => [key, value]);
  const disabled = switchLetters
    .filter(({ key }) => !view[key])
    .map(({ letter }) => letter)
    .join('');
  if (disabled.length > 0) {
    pairs.push(['off', disabled]);
  }
  const overlays = overlayLetters
    .filter(({ key }) => settings.overlays[key])
    .map(({ letter }) => letter)
    .join('');
  if (overlays.length > 0) {
    pairs.push(['ov', overlays]);
  }
  if (settings.split.enabled) {
    pairs.push(['sp', formatted(settings.split.position, 3)]);
  }
  return pairs;
}

export function encodeSettings(settings: RenderSettings): string {
  const pairs = pairsOf(settings);
  if (pairs.length === 0) {
    return '';
  }
  return [[versionKey, String(urlStateVersion)], ...pairs]
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function degreesOf(values: Map<string, string>, key: string): number | undefined {
  const parsed = parseNumber(values.get(key));
  return parsed === undefined ? undefined : fromDegrees(parsed);
}

function viewChange(values: Map<string, string>): Partial<ViewDescription> {
  const change: Partial<ViewDescription> = {};
  const assign = <K extends keyof ViewDescription>(
    key: K,
    value: ViewDescription[K] | undefined,
  ) => {
    if (value !== undefined) {
      change[key] = value;
    }
  };
  assign('inclination', degreesOf(values, 'inc'));
  assign('azimuth', degreesOf(values, 'az'));
  assign('verticalFieldOfView', degreesOf(values, 'fov'));
  assign('distance', parseNumber(values.get('dist')));
  assign('diskOuterRadius', parseNumber(values.get('ro')));
  assign('peakTemperature', parseNumber(values.get('t')));
  const disabled = values.get('off');
  if (disabled !== undefined) {
    for (const { letter, key } of switchLetters) {
      change[key] = !disabled.includes(letter);
    }
  }
  return change;
}

function overlayChange(values: Map<string, string>): Partial<OverlaySettings> {
  const enabled = values.get('ov') ?? '';
  return Object.fromEntries(
    overlayLetters.map(({ letter, key }) => [key, enabled.includes(letter)]),
  );
}

function splitChange(values: Map<string, string>): Partial<SplitSettings> {
  if (!values.has('sp')) {
    return { enabled: false };
  }
  const position = parseNumber(values.get('sp'));
  return position === undefined ? { enabled: true } : { enabled: true, position };
}

export function decodeSettings(query: string): RenderSettings {
  const values = new Map<string, string>();
  for (const [key, raw] of splitQuery(query)) {
    if (ownKeys.includes(key) && !values.has(key)) {
      values.set(key, readableValue(raw));
    }
  }
  if (values.get(versionKey) !== String(urlStateVersion)) {
    return defaultSettings;
  }
  const exposure = parseNumber(values.get('ev'));
  const bloomStrength = parseNumber(values.get('bl'));
  return mergeSettings(defaultSettings, {
    view: viewChange(values),
    ...(exposure === undefined ? {} : { exposure }),
    ...(bloomStrength === undefined ? {} : { bloomStrength }),
    overlays: overlayChange(values),
    split: splitChange(values),
  });
}

export function settingsQuery(search: string, settings: RenderSettings): string {
  const foreign = splitQuery(search)
    .filter(([key]) => !ownKeys.includes(key))
    .map(([key, value]) => (value === '' ? key : `${key}=${value}`));
  const own = encodeSettings(settings);
  const parts = own === '' ? foreign : [...foreign, own];
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}
