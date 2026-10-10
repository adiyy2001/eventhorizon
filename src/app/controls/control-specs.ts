import {
  gpuOnlyOverlays,
  type RenderSettings,
  settingRanges,
  type OverlaySettings,
} from '../../core/render/settings';
import { type ViewDescription } from '../../core/render/view';
import { type SettingsChange } from '../state/settings.store';

export interface SliderSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  decimals: number;
  read: (settings: RenderSettings) => number;
  write: (value: number) => SettingsChange;
}

export interface SwitchSpec {
  id: string;
  label: string;
  hint: string;
  needsGpu?: boolean;
  read: (settings: RenderSettings) => boolean;
  write: (checked: boolean) => SettingsChange;
}

export interface ControlGroup {
  id: string;
  title: string;
  sliders: readonly SliderSpec[];
  switches: readonly SwitchSpec[];
}

const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
const fromDegrees = (degrees: number): number => (degrees * Math.PI) / 180;

type EffectKey = 'lensing' | 'doppler' | 'gravitationalRedshift' | 'higherOrderImages';

function effectSwitch(id: string, key: EffectKey, label: string, hint: string): SwitchSpec {
  return {
    id,
    label,
    hint,
    read: (settings) => settings.view[key],
    write: (checked) => ({ view: { [key]: checked } satisfies Partial<ViewDescription> }),
  };
}

function overlaySwitch(
  id: string,
  key: keyof OverlaySettings,
  label: string,
  hint: string,
): SwitchSpec {
  return {
    id,
    label,
    hint,
    needsGpu: gpuOnlyOverlays.includes(key),
    read: (settings) => settings.overlays[key],
    write: (checked) => ({ overlays: { [key]: checked } }),
  };
}

export const cameraGroup: ControlGroup = {
  id: 'camera',
  title: 'Camera',
  sliders: [
    {
      id: 'inclination',
      label: 'Inclination',
      min: Math.round(toDegrees(settingRanges.inclination.min)),
      max: Math.round(toDegrees(settingRanges.inclination.max)),
      step: 1,
      unit: 'degrees',
      decimals: 0,
      read: (settings) => toDegrees(settings.view.inclination),
      write: (value) => ({ view: { inclination: fromDegrees(value) } }),
    },
    {
      id: 'distance',
      label: 'Distance',
      min: settingRanges.distance.min,
      max: settingRanges.distance.max,
      step: 1,
      unit: 'M',
      decimals: 0,
      read: (settings) => settings.view.distance,
      write: (value) => ({ view: { distance: value } }),
    },
  ],
  switches: [],
};

export const diskGroup: ControlGroup = {
  id: 'disk',
  title: 'Accretion disk',
  sliders: [
    {
      id: 'outer-radius',
      label: 'Outer radius',
      min: settingRanges.diskOuterRadius.min,
      max: settingRanges.diskOuterRadius.max,
      step: 0.5,
      unit: 'M',
      decimals: 1,
      read: (settings) => settings.view.diskOuterRadius,
      write: (value) => ({ view: { diskOuterRadius: value } }),
    },
    {
      id: 'peak-temperature',
      label: 'Peak temperature',
      min: settingRanges.peakTemperature.min,
      max: settingRanges.peakTemperature.max,
      step: 100,
      unit: 'K',
      decimals: 0,
      read: (settings) => settings.view.peakTemperature,
      write: (value) => ({ view: { peakTemperature: value } }),
    },
  ],
  switches: [],
};

export const imageGroup: ControlGroup = {
  id: 'image',
  title: 'Image',
  sliders: [
    {
      id: 'exposure',
      label: 'Exposure',
      min: settingRanges.exposure.min,
      max: settingRanges.exposure.max,
      step: 0.1,
      unit: 'EV',
      decimals: 1,
      read: (settings) => settings.exposure,
      write: (value) => ({ exposure: value }),
    },
    {
      id: 'bloom',
      label: 'Bloom',
      min: settingRanges.bloomStrength.min,
      max: settingRanges.bloomStrength.max,
      step: 0.01,
      unit: '',
      decimals: 2,
      read: (settings) => settings.bloomStrength,
      write: (value) => ({ bloomStrength: value }),
    },
  ],
  switches: [],
};

export const effectsGroup: ControlGroup = {
  id: 'effects',
  title: 'Physics effects',
  sliders: [],
  switches: [
    effectSwitch(
      'lensing',
      'lensing',
      'Gravitational lensing',
      'Off draws straight rays and a plain dark sphere.',
    ),
    effectSwitch(
      'doppler',
      'doppler',
      'Doppler beaming',
      'Off also removes the transverse time dilation of the orbiting gas.',
    ),
    effectSwitch(
      'redshift',
      'gravitationalRedshift',
      'Gravitational redshift',
      'Includes the factor for the observer at a finite distance.',
    ),
    effectSwitch(
      'higher-order',
      'higherOrderImages',
      'Higher-order images',
      'The thin rings of the disk seen after one or more half turns.',
    ),
  ],
};

export const overlaysGroup: ControlGroup = {
  id: 'overlays',
  title: 'Overlays',
  sliders: [],
  switches: [
    overlaySwitch('overlay-photon', 'photonSphere', 'Photon sphere', 'Dotted line at r = 3 M.'),
    overlaySwitch('overlay-isco', 'isco', 'Innermost stable orbit', 'Dashed line at r = 6 M.'),
    overlaySwitch('overlay-shadow', 'shadowEdge', 'Shadow edge', 'Solid line at b = 3√3 M.'),
  ],
};

export const splitSlider: SliderSpec = {
  id: 'split-position',
  label: 'Divider position',
  min: Math.round(settingRanges.splitPosition.min * 100),
  max: Math.round(settingRanges.splitPosition.max * 100),
  step: 1,
  unit: 'percent',
  decimals: 0,
  read: (settings) => settings.split.position * 100,
  write: (value) => ({ split: { position: value / 100 } }),
};

export const splitSwitch: SwitchSpec = {
  id: 'split-enabled',
  label: 'Compare with the full model',
  hint: 'Left of the divider shows your selection, right of it the full model.',
  read: (settings) => settings.split.enabled,
  write: (checked) => ({ split: { enabled: checked } }),
};

export const controlGroups: readonly ControlGroup[] = [
  cameraGroup,
  diskGroup,
  imageGroup,
  effectsGroup,
  overlaysGroup,
];
