import { describe, expect, it } from 'vitest';
import {
  benchLaunchArguments,
  hardwareGpuLaunchArguments,
  webGpuLaunchArguments,
} from '../bench/launch-arguments.ts';

describe('benchLaunchArguments', () => {
  it('uses the software adapter flags by default', () => {
    expect(benchLaunchArguments({})).toEqual(webGpuLaunchArguments);
  });

  it('drops the software adapter flags when the hardware GPU is requested', () => {
    const flags = benchLaunchArguments({ EVENTHORIZON_HARDWARE_GPU: '1' });
    expect(flags).toEqual(hardwareGpuLaunchArguments);
    expect(flags.join(' ')).not.toContain('swiftshader');
  });

  it('appends extra flags split on spaces', () => {
    const flags = benchLaunchArguments({
      EVENTHORIZON_HARDWARE_GPU: '1',
      EVENTHORIZON_EXTRA_FLAGS: '--force_high_performance_gpu  --foo',
    });
    expect(flags.slice(-2)).toEqual(['--force_high_performance_gpu', '--foo']);
  });
});
