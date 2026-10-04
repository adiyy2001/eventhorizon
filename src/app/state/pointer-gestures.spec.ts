import { gestureModeAt, PointerGestures, type PointerSample } from './pointer-gestures';

const at = (x: number, y: number, width = 400): PointerSample => ({ x, y, fractionX: x / width });

describe('PointerGestures', () => {
  it('turns a one pointer drag into an orbit', () => {
    const gestures = new PointerGestures();
    gestures.down(1, at(100, 100), 'camera');
    expect(gestures.move(1, at(110, 90))).toEqual({
      kind: 'orbit',
      azimuth: -10 * 0.008,
      inclination: 10 * 0.008,
    });
    expect(gestures.move(1, at(110, 90))).toBeNull();
  });

  it('ignores pointers it does not track', () => {
    expect(new PointerGestures().move(7, at(1, 1))).toBeNull();
  });

  it('reports the active state and cancels', () => {
    const gestures = new PointerGestures();
    expect(gestures.active).toBe(false);
    gestures.down(1, at(0, 0), 'camera');
    expect(gestures.active).toBe(true);
    gestures.up(1);
    expect(gestures.active).toBe(false);
    gestures.down(2, at(0, 0), 'camera');
    gestures.cancel();
    expect(gestures.active).toBe(false);
  });

  it('zooms in when two pointers move apart and out when they close in', () => {
    const gestures = new PointerGestures();
    gestures.down(1, at(100, 100), 'camera');
    gestures.down(2, at(200, 100), 'camera');
    const apart = gestures.move(2, at(300, 100));
    expect(apart).toEqual({ kind: 'zoom', factor: 0.5 });
    const closer = gestures.move(2, at(200, 100));
    expect(closer).toEqual({ kind: 'zoom', factor: 2 });
  });

  it('gives no zoom for coincident pointers', () => {
    const gestures = new PointerGestures();
    gestures.down(1, at(100, 100), 'camera');
    gestures.down(2, at(100, 100), 'camera');
    expect(gestures.move(2, at(100, 100))).toBeNull();
  });

  it('moves the split to the pointer when the drag started on the divider', () => {
    const gestures = new PointerGestures();
    gestures.down(1, at(200, 50), 'split');
    expect(gestures.move(1, at(300, 80))).toEqual({ kind: 'split', position: 0.75 });
  });

  it('turns the wheel into a multiplicative zoom', () => {
    const gestures = new PointerGestures();
    const away = gestures.wheel(100);
    const closer = gestures.wheel(-100);
    expect(away.kind === 'zoom' && away.factor > 1).toBe(true);
    expect(closer.kind === 'zoom' && closer.factor < 1).toBe(true);
    if (away.kind === 'zoom' && closer.kind === 'zoom') {
      expect(away.factor * closer.factor).toBeCloseTo(1, 12);
    }
  });
});

describe('gestureModeAt', () => {
  const split = { enabled: true, position: 0.5 };

  it('grabs the divider only when the split is on and the pointer is close', () => {
    expect(gestureModeAt(0.51, split)).toBe('split');
    expect(gestureModeAt(0.6, split)).toBe('camera');
    expect(gestureModeAt(0.5, { enabled: false, position: 0.5 })).toBe('camera');
  });
});
