import { describe, expect, it } from 'vitest';
import {
  demoActions,
  demoFrameName,
  demoSpec,
  gifArguments,
  type DemoAction,
} from '../bench/demo-plan.ts';

function switchesIn(actions: DemoAction[]) {
  return actions.flatMap((action) => (action.kind === 'switch' ? [action] : []));
}

describe('demo plan', () => {
  const actions = demoActions();

  it('lasts between 12 and 30 seconds', () => {
    const seconds = actions.length / demoSpec.framesPerSecond;
    expect(seconds).toBeGreaterThan(12);
    expect(seconds).toBeLessThan(30);
  });

  it('starts with the full model orbiting before any switch is touched', () => {
    const firstSwitch = actions.findIndex((action) => action.kind === 'switch');
    expect(actions.slice(0, firstSwitch).some((action) => action.kind === 'move')).toBe(true);
  });

  it('turns the compare view on first and off last', () => {
    const switches = switchesIn(actions);
    expect(switches[0]).toEqual({
      kind: 'switch',
      label: 'Compare with the full model',
      checked: true,
    });
    expect(switches.at(-1)).toEqual({
      kind: 'switch',
      label: 'Compare with the full model',
      checked: false,
    });
  });

  it('switches Doppler beaming and lensing off and then back on', () => {
    const effects = switchesIn(actions).filter(
      (action) => action.label !== 'Compare with the full model',
    );
    expect(effects.map((action) => [action.label, action.checked])).toEqual([
      ['Doppler beaming', false],
      ['Doppler beaming', true],
      ['Gravitational lensing', false],
      ['Gravitational lensing', true],
    ]);
  });

  it('balances every press with a release and keeps pointers inside the canvas', () => {
    let down = false;
    for (const action of actions) {
      if (action.kind === 'press') {
        expect(down).toBe(false);
        down = true;
      }
      if (action.kind === 'release') {
        expect(down).toBe(true);
        down = false;
      }
      if (action.kind === 'press' || action.kind === 'move') {
        expect(action.fractionX).toBeGreaterThan(0);
        expect(action.fractionX).toBeLessThan(1);
        expect(action.fractionY).toBeGreaterThan(0);
        expect(action.fractionY).toBeLessThan(1);
      }
    }
    expect(down).toBe(false);
  });

  it('presses the divider where the previous sweep left it', () => {
    const firstSwitch = actions.findIndex((action) => action.kind === 'switch');
    const dividerPresses = actions
      .slice(firstSwitch)
      .flatMap((action) => (action.kind === 'press' ? [action.fractionX] : []));
    expect(dividerPresses).toEqual([0.5, 0.82, 0.18, 0.5, 0.82, 0.18]);
  });
});

describe('demo encoding', () => {
  it('names frames with four digits', () => {
    expect(demoFrameName(7)).toBe('frame-0007.png');
  });

  it('builds a palette based two pass filter graph at the requested size', () => {
    const joined = gifArguments({
      framesDirectory: '/tmp/frames',
      output: 'out.gif',
      spec: demoSpec,
    }).join(' ');
    expect(joined).toContain('/tmp/frames/frame-%04d.png');
    expect(joined).toContain(`palettegen=max_colors=${String(demoSpec.colors)}`);
    expect(joined).toContain(
      `crop=${String(demoSpec.viewport.width)}:${String(demoSpec.cropHeight)}:0:0`,
    );
    expect(joined).toContain(`scale=${String(demoSpec.gifWidth)}:-1`);
    expect(joined.endsWith('out.gif')).toBe(true);
  });
});
