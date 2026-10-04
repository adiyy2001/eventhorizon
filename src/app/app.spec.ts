import { TestBed } from '@angular/core/testing';
import type { GpuProbeResult } from '../gpu/probe';
import { App } from './app';
import { GPU_PROBE } from './gpu-status';

async function render(result: GpuProbeResult | 'pending'): Promise<HTMLElement> {
  const probe =
    result === 'pending'
      ? () => new Promise<GpuProbeResult>(() => undefined)
      : () => Promise.resolve(result);
  TestBed.configureTestingModule({
    imports: [App],
    providers: [{ provide: GPU_PROBE, useValue: probe }],
  });
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function statusText(root: HTMLElement): string {
  return root.querySelector('[data-testid="gpu-status"]')?.textContent.trim() ?? '';
}

describe('App', () => {
  it('shows the heading and the checking state first', async () => {
    const root = await render('pending');
    expect(root.querySelector('h1')?.textContent).toContain('Event horizon');
    expect(statusText(root)).toBe('Checking WebGPU support.');
  });

  it('shows the adapter and the kernel result when ready', async () => {
    const root = await render({
      status: 'ready',
      adapter: { vendor: 'acme', architecture: 'gen-9', device: '', description: '' },
      smoke: { total: 1000, correct: 1000 },
    });
    expect(statusText(root)).toBe('WebGPU is ready.');
    expect(root.querySelector('[data-testid="adapter-architecture"]')?.textContent).toContain(
      'gen-9',
    );
    expect(root.querySelector('[data-testid="smoke-result"]')?.textContent).toContain(
      '1000 of 1000',
    );
  });

  it('shows a reason when WebGPU is unsupported', async () => {
    const root = await render({ status: 'unsupported', reason: 'no-api', detail: 'none' });
    expect(statusText(root)).toBe('This browser does not expose WebGPU.');
    expect(root.querySelector('[data-testid="smoke-result"]')).toBeNull();
  });

  it('falls back to the detail text for an unknown reason', async () => {
    const root = await render({ status: 'unsupported', reason: 'kernel-failed', detail: 'boom' });
    expect(statusText(root)).toBe('The test compute kernel failed to run.');
  });
});
