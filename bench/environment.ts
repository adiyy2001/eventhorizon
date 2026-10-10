import { arch, cpus, platform, release, totalmem } from 'node:os';
import { type Browser } from '@playwright/test';
import { webGpuLaunchArguments } from '../playwright.config';

export interface AdapterDescription {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}

export function describeHost(browser: Browser) {
  return {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    cores: cpus().length,
    memoryGigabytes: Math.round(totalmem() / 2 ** 30),
    chromium: browser.version(),
  };
}

export function describeEnvironment(browser: Browser, adapter: AdapterDescription) {
  return {
    ...describeHost(browser),
    chromiumFlags: webGpuLaunchArguments,
    adapter,
    software: /swiftshader|llvmpipe|software/i.test(
      `${adapter.architecture} ${adapter.description} ${adapter.vendor}`,
    ),
  };
}

export function adapterFileName(adapter: AdapterDescription): string {
  const label = adapter.architecture || adapter.vendor || 'unknown';
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
