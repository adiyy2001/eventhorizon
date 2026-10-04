import { type PostSettings, defaultPost } from './post';
import { defaultView, type ViewDescription } from './view';

export interface OverlaySettings {
  photonSphere: boolean;
  isco: boolean;
  shadowEdge: boolean;
}

export interface SplitSettings {
  enabled: boolean;
  position: number;
}

export interface RenderSettings {
  view: ViewDescription;
  exposure: number;
  bloomStrength: number;
  overlays: OverlaySettings;
  split: SplitSettings;
}

export interface Range {
  min: number;
  max: number;
}

const degrees = (value: number): number => (value * Math.PI) / 180;

export const settingRanges = {
  inclination: { min: degrees(1), max: degrees(179) },
  azimuth: { min: -2 * Math.PI, max: 2 * Math.PI },
  distance: { min: 8, max: 200 },
  verticalFieldOfView: { min: degrees(10), max: degrees(90) },
  diskOuterRadius: { min: 8, max: 40 },
  peakTemperature: { min: 1500, max: 30000 },
  exposure: { min: -4, max: 4 },
  bloomStrength: { min: 0, max: 0.5 },
  splitPosition: { min: 0.02, max: 0.98 },
} as const satisfies Record<string, Range>;

export const defaultSettings: RenderSettings = {
  view: defaultView,
  exposure: defaultPost.exposure,
  bloomStrength: defaultPost.bloomStrength,
  overlays: { photonSphere: false, isco: false, shadowEdge: false },
  split: { enabled: false, position: 0.5 },
};

export function clampToRange(value: number, range: Range, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(range.max, Math.max(range.min, value));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

type NumericViewKey =
  | 'distance'
  | 'inclination'
  | 'azimuth'
  | 'verticalFieldOfView'
  | 'diskOuterRadius'
  | 'peakTemperature';

function sanitizeView(input: Record<string, unknown>): ViewDescription {
  const base = defaultView;
  const ranged = (key: NumericViewKey): number =>
    clampToRange(numberOr(input[key], base[key]), settingRanges[key], base[key]);
  return {
    distance: ranged('distance'),
    inclination: ranged('inclination'),
    azimuth: ranged('azimuth'),
    verticalFieldOfView: ranged('verticalFieldOfView'),
    diskOuterRadius: ranged('diskOuterRadius'),
    peakTemperature: ranged('peakTemperature'),
    lensing: booleanOr(input['lensing'], base.lensing),
    higherOrderImages: booleanOr(input['higherOrderImages'], base.higherOrderImages),
    gravitationalRedshift: booleanOr(input['gravitationalRedshift'], base.gravitationalRedshift),
    doppler: booleanOr(input['doppler'], base.doppler),
  };
}

export function sanitizeSettings(input: unknown): RenderSettings {
  const source = recordOf(input);
  const overlays = recordOf(source['overlays']);
  const split = recordOf(source['split']);
  return {
    view: sanitizeView(recordOf(source['view'])),
    exposure: clampToRange(
      numberOr(source['exposure'], defaultSettings.exposure),
      settingRanges.exposure,
      defaultSettings.exposure,
    ),
    bloomStrength: clampToRange(
      numberOr(source['bloomStrength'], defaultSettings.bloomStrength),
      settingRanges.bloomStrength,
      defaultSettings.bloomStrength,
    ),
    overlays: {
      photonSphere: booleanOr(overlays['photonSphere'], defaultSettings.overlays.photonSphere),
      isco: booleanOr(overlays['isco'], defaultSettings.overlays.isco),
      shadowEdge: booleanOr(overlays['shadowEdge'], defaultSettings.overlays.shadowEdge),
    },
    split: {
      enabled: booleanOr(split['enabled'], defaultSettings.split.enabled),
      position: clampToRange(
        numberOr(split['position'], defaultSettings.split.position),
        settingRanges.splitPosition,
        defaultSettings.split.position,
      ),
    },
  };
}

export function mergeSettings(
  base: RenderSettings,
  change: {
    view?: Partial<ViewDescription>;
    exposure?: number;
    bloomStrength?: number;
    overlays?: Partial<OverlaySettings>;
    split?: Partial<SplitSettings>;
  },
): RenderSettings {
  return sanitizeSettings({
    view: { ...base.view, ...change.view },
    exposure: change.exposure ?? base.exposure,
    bloomStrength: change.bloomStrength ?? base.bloomStrength,
    overlays: { ...base.overlays, ...change.overlays },
    split: { ...base.split, ...change.split },
  });
}

export function settingsPost(settings: RenderSettings): PostSettings {
  return {
    ...defaultPost,
    exposure: settings.exposure,
    bloomStrength: settings.bloomStrength,
  };
}

export function fullModelView(view: ViewDescription): ViewDescription {
  return {
    ...view,
    lensing: true,
    higherOrderImages: true,
    gravitationalRedshift: true,
    doppler: true,
  };
}

function viewEqual(left: ViewDescription, right: ViewDescription): boolean {
  return (
    left.distance === right.distance &&
    left.inclination === right.inclination &&
    left.azimuth === right.azimuth &&
    left.verticalFieldOfView === right.verticalFieldOfView &&
    left.diskOuterRadius === right.diskOuterRadius &&
    left.peakTemperature === right.peakTemperature &&
    left.lensing === right.lensing &&
    left.higherOrderImages === right.higherOrderImages &&
    left.gravitationalRedshift === right.gravitationalRedshift &&
    left.doppler === right.doppler
  );
}

export function settingsEqual(left: RenderSettings, right: RenderSettings): boolean {
  return (
    viewEqual(left.view, right.view) &&
    left.exposure === right.exposure &&
    left.bloomStrength === right.bloomStrength &&
    left.overlays.photonSphere === right.overlays.photonSphere &&
    left.overlays.isco === right.overlays.isco &&
    left.overlays.shadowEdge === right.overlays.shadowEdge &&
    left.split.enabled === right.split.enabled &&
    left.split.position === right.split.position
  );
}

const fnvOffset = 0x811c9dc5;
const fnvPrime = 0x01000193;
const quantization = 1e6;

function mixWord(hash: number, word: number): number {
  let mixed = hash;
  for (let shift = 0; shift < 32; shift += 8) {
    mixed ^= (word >>> shift) & 0xff;
    mixed = Math.imul(mixed, fnvPrime);
  }
  return mixed >>> 0;
}

function quantized(value: number): number {
  return Math.round(value * quantization) | 0;
}

function hashWords(words: readonly number[]): number {
  return words.reduce(mixWord, fnvOffset);
}

function viewWords(view: ViewDescription): number[] {
  return [
    quantized(view.distance),
    quantized(view.inclination),
    quantized(view.azimuth),
    quantized(view.verticalFieldOfView),
    quantized(view.diskOuterRadius),
    quantized(view.peakTemperature),
    Number(view.lensing),
    Number(view.higherOrderImages),
    Number(view.gravitationalRedshift),
    Number(view.doppler),
  ];
}

export function cameraHash(settings: RenderSettings): number {
  const { view } = settings;
  return hashWords([
    quantized(view.distance),
    quantized(view.inclination),
    quantized(view.azimuth),
    quantized(view.verticalFieldOfView),
  ]);
}

export function sceneHash(settings: RenderSettings): number {
  return hashWords([
    ...viewWords(settings.view),
    Number(settings.overlays.photonSphere),
    Number(settings.overlays.isco),
    Number(settings.split.enabled),
    settings.split.enabled ? quantized(settings.split.position) : 0,
  ]);
}

export function settingsHash(settings: RenderSettings): number {
  return hashWords([
    sceneHash(settings),
    quantized(settings.exposure),
    quantized(settings.bloomStrength),
    Number(settings.overlays.shadowEdge),
  ]);
}
