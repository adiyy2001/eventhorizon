import {
  commandForKey,
  isTypingTarget,
  type KeyInput,
  largeOrbitStepRadians,
  orbitStepRadians,
  zoomStepFactor,
} from './keyboard-map';

function press(key: string, overrides: Partial<KeyInput> = {}): KeyInput {
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null,
    ...overrides,
  };
}

describe('commandForKey', () => {
  it('orbits with the arrow keys', () => {
    expect(commandForKey(press('ArrowLeft'))).toEqual({
      kind: 'orbit',
      azimuth: -orbitStepRadians,
      inclination: 0,
    });
    expect(commandForKey(press('ArrowRight'))).toEqual({
      kind: 'orbit',
      azimuth: orbitStepRadians,
      inclination: 0,
    });
    expect(commandForKey(press('ArrowUp'))).toEqual({
      kind: 'orbit',
      azimuth: 0,
      inclination: -orbitStepRadians,
    });
    expect(commandForKey(press('ArrowDown'))).toEqual({
      kind: 'orbit',
      azimuth: 0,
      inclination: orbitStepRadians,
    });
  });

  it('takes larger steps with shift', () => {
    expect(commandForKey(press('ArrowRight', { shiftKey: true }))).toEqual({
      kind: 'orbit',
      azimuth: largeOrbitStepRadians,
      inclination: 0,
    });
  });

  it('zooms with plus, minus, PageUp and PageDown', () => {
    for (const key of ['+', '=', 'PageUp']) {
      expect(commandForKey(press(key))).toEqual({ kind: 'zoom', factor: 1 / zoomStepFactor });
    }
    for (const key of ['-', '_', 'PageDown']) {
      expect(commandForKey(press(key))).toEqual({ kind: 'zoom', factor: zoomStepFactor });
    }
  });

  it('resets on Home and opens help on the question mark', () => {
    expect(commandForKey(press('Home'))).toEqual({ kind: 'reset' });
    expect(commandForKey(press('?', { shiftKey: true }))).toEqual({ kind: 'help' });
  });

  it('ignores other keys', () => {
    expect(commandForKey(press('a'))).toBeNull();
    expect(commandForKey(press('Enter'))).toBeNull();
    expect(commandForKey(press('Tab'))).toBeNull();
  });

  it('leaves browser shortcuts alone', () => {
    expect(commandForKey(press('ArrowLeft', { ctrlKey: true }))).toBeNull();
    expect(commandForKey(press('-', { metaKey: true }))).toBeNull();
    expect(commandForKey(press('+', { altKey: true }))).toBeNull();
  });

  it('does not capture keys while typing or using a slider', () => {
    for (const target of [
      { tagName: 'INPUT', type: 'range' },
      { tagName: 'INPUT', type: 'number' },
      { tagName: 'INPUT', type: 'text' },
      { tagName: 'TEXTAREA' },
      { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true },
    ]) {
      expect(commandForKey(press('ArrowLeft', { target }))).toBeNull();
    }
  });

  it('still works while a button or checkbox has focus', () => {
    expect(commandForKey(press('ArrowLeft', { target: { tagName: 'BUTTON' } }))).not.toBeNull();
    expect(
      commandForKey(press('ArrowLeft', { target: { tagName: 'INPUT', type: 'checkbox' } })),
    ).not.toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('handles missing targets and inputs without a type', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget('text')).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({})).toBe(false);
  });
});
