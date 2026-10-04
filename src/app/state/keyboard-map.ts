export type CameraCommand =
  | { kind: 'orbit'; azimuth: number; inclination: number }
  | { kind: 'zoom'; factor: number }
  | { kind: 'reset' }
  | { kind: 'help' };

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: unknown;
}

export const orbitStepRadians = (3 * Math.PI) / 180;
export const largeOrbitStepRadians = (12 * Math.PI) / 180;
export const zoomStepFactor = 1.1;

const typingInputTypes = new Set([
  'text',
  'number',
  'range',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'date',
  'time',
]);

interface ElementLike {
  tagName?: unknown;
  type?: unknown;
  isContentEditable?: unknown;
}

export function isTypingTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) {
    return false;
  }
  const element = target as ElementLike;
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (tag === 'INPUT') {
    const type = typeof element.type === 'string' ? element.type.toLowerCase() : 'text';
    return typingInputTypes.has(type);
  }
  return element.isContentEditable === true;
}

export function commandForKey(input: KeyInput): CameraCommand | null {
  if (input.ctrlKey || input.metaKey || input.altKey || isTypingTarget(input.target)) {
    return null;
  }
  const step = input.shiftKey ? largeOrbitStepRadians : orbitStepRadians;
  switch (input.key) {
    case 'ArrowLeft':
      return { kind: 'orbit', azimuth: -step, inclination: 0 };
    case 'ArrowRight':
      return { kind: 'orbit', azimuth: step, inclination: 0 };
    case 'ArrowUp':
      return { kind: 'orbit', azimuth: 0, inclination: -step };
    case 'ArrowDown':
      return { kind: 'orbit', azimuth: 0, inclination: step };
    case '+':
    case '=':
    case 'PageUp':
      return { kind: 'zoom', factor: 1 / zoomStepFactor };
    case '-':
    case '_':
    case 'PageDown':
      return { kind: 'zoom', factor: zoomStepFactor };
    case 'Home':
      return { kind: 'reset' };
    case '?':
      return { kind: 'help' };
    default:
      return null;
  }
}

export const keyboardHelp: readonly { keys: string; action: string }[] = [
  { keys: 'Arrow left, arrow right', action: 'Orbit around the black hole' },
  { keys: 'Arrow up, arrow down', action: 'Tilt towards the pole or the disk plane' },
  { keys: 'Shift with an arrow', action: 'Larger steps' },
  { keys: '+ and PageUp', action: 'Move closer' },
  { keys: '- and PageDown', action: 'Move away' },
  { keys: 'Home', action: 'Reset every setting' },
  { keys: '?', action: 'Show or hide this list' },
];
