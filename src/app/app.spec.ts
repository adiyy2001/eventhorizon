import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { defaultSettings } from '../core/render/settings';
import type { GpuProbeResult } from '../gpu/probe';
import { App } from './app';
import { CPU_SESSION_FACTORY } from './fallback/cpu-session';
import { GPU_PROBE } from './gpu-status';
import { SettingsStore } from './state/settings.store';
import { RENDER_SESSION_FACTORY, type RenderSession } from './viewport/render-session';

function idleSession(): RenderSession {
  return {
    setSettings: () => undefined,
    exportImage: () => Promise.reject(new Error('unused')),
    resolutionLog: () => [],
    progress: signal(null).asReadonly(),
    failure: signal(null).asReadonly(),
    destroy: () => undefined,
  };
}

async function mount(result: GpuProbeResult | 'pending'): Promise<ComponentFixture<App>> {
  const probe =
    result === 'pending'
      ? () => new Promise<GpuProbeResult>(() => undefined)
      : () => Promise.resolve(result);
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      { provide: GPU_PROBE, useValue: probe },
      { provide: RENDER_SESSION_FACTORY, useValue: () => Promise.resolve(idleSession()) },
      { provide: CPU_SESSION_FACTORY, useValue: () => Promise.resolve(idleSession()) },
    ],
  });
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

async function render(result: GpuProbeResult | 'pending'): Promise<HTMLElement> {
  return (await mount(result)).nativeElement as HTMLElement;
}

const readyProbe: GpuProbeResult = {
  status: 'ready',
  adapter: { vendor: 'acme', architecture: 'gen-9', device: '', description: '' },
  smoke: { total: 1000, correct: 1000 },
};

function canvasBackend(root: HTMLElement): string | null {
  return root.querySelector('canvas')?.getAttribute('data-backend') ?? null;
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

  it('shows the graphics viewport when WebGPU is ready', async () => {
    const root = await render(readyProbe);
    expect(root.querySelector('app-viewport')).not.toBeNull();
    expect(canvasBackend(root)).toBe('gpu');
    expect(root.querySelector('[data-testid="fallback-banner"]')).toBeNull();
  });

  it('shows no viewport while the check is running', async () => {
    const root = await render('pending');
    expect(root.querySelector('app-viewport')).toBeNull();
    expect(root.querySelector('[data-testid="fallback-banner"]')).toBeNull();
  });

  it('shows a reason when WebGPU is unsupported', async () => {
    const root = await render({ status: 'unsupported', reason: 'no-api', detail: 'none' });
    expect(statusText(root)).toBe('This browser does not expose WebGPU.');
    expect(root.querySelector('[data-testid="gpu-status"]')?.getAttribute('data-state')).toBe(
      'unsupported',
    );
    expect(root.querySelector('[data-testid="smoke-result"]')).toBeNull();
  });

  it('names each reason in words', async () => {
    const reasons = {
      'no-adapter': 'WebGPU is present but no graphics adapter is available.',
      'device-failed': 'A graphics adapter was found but a device could not be created.',
      'kernel-failed': 'The test compute kernel failed to run.',
    } as const;
    for (const [reason, message] of Object.entries(reasons)) {
      TestBed.resetTestingModule();
      const root = await render({
        status: 'unsupported',
        reason: reason as keyof typeof reasons,
        detail: 'boom',
      });
      expect(statusText(root)).toBe(message);
    }
  });
});

describe('App without WebGPU', () => {
  const unsupported: GpuProbeResult = { status: 'unsupported', reason: 'no-adapter', detail: '' };

  it('draws in software and folds the graphics check into the banner', async () => {
    const root = await render(unsupported);
    expect(canvasBackend(root)).toBe('cpu');
    expect(root.querySelector('[data-testid="fallback-banner"]')).not.toBeNull();
    expect(root.querySelector('#gpu-heading')).toBeNull();
    expect(root.querySelector('.status')).toBeNull();
  });

  it('shows the same controls and physics as the graphics version', async () => {
    const fixture = await mount(unsupported);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-control-panel')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-testid="show-physics"]')?.click();
    fixture.detectChanges();
    expect(root.querySelector('app-physics-panel')).not.toBeNull();
  });

  it('reacts to the keyboard', async () => {
    await mount(unsupported);
    const store = TestBed.inject(SettingsStore);
    const before = store.view().azimuth;
    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(store.view().azimuth).toBeGreaterThan(before);
  });

  it('keeps the first reason and the browser detail in the banner and offers the preview video', async () => {
    const root = await render({ ...unsupported, detail: 'requestAdapter returned null' });
    expect(statusText(root)).toBe('WebGPU is present but no graphics adapter is available.');
    expect(root.querySelector('[data-testid="fallback-detail"]')?.textContent).toContain(
      'requestAdapter returned null',
    );
    const video = root.querySelector('[data-testid="preview-video"]');
    expect(video?.getAttribute('poster')).toBe('media/preview-poster.jpg');
    expect(video?.hasAttribute('autoplay')).toBe(false);
  });
});

describe('App when the graphics path fails at run time', () => {
  async function mountWithSession(session: RenderSession | Promise<RenderSession>) {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: GPU_PROBE, useValue: () => Promise.resolve(readyProbe) },
        { provide: RENDER_SESSION_FACTORY, useValue: () => Promise.resolve(session) },
        { provide: CPU_SESSION_FACTORY, useValue: () => Promise.resolve(idleSession()) },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('moves to software rendering when the device is lost', async () => {
    const failure = signal<string | null>(null);
    const fixture = await mountWithSession({ ...idleSession(), failure: failure.asReadonly() });
    const root = fixture.nativeElement as HTMLElement;
    expect(canvasBackend(root)).toBe('gpu');
    failure.set('GPU hung');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(canvasBackend(root)).toBe('cpu');
    expect(statusText(root)).toBe('The graphics device was lost while rendering.');
    expect(root.querySelector('[data-testid="fallback-banner"]')).not.toBeNull();
  });

  it('moves to software rendering when the renderer cannot start', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: GPU_PROBE, useValue: () => Promise.resolve(readyProbe) },
        {
          provide: RENDER_SESSION_FACTORY,
          useValue: () => Promise.reject(new Error('no pipeline')),
        },
        { provide: CPU_SESSION_FACTORY, useValue: () => Promise.resolve(idleSession()) },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(canvasBackend(root)).toBe('cpu');
    expect(statusText(root)).toBe('The graphics renderer could not start.');
  });
});

function key(name: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe('App interface', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('shows the control panel next to the viewport when ready', async () => {
    const root = await render(readyProbe);
    expect(root.querySelector('app-control-panel')).not.toBeNull();
    expect(root.querySelector('app-physics-panel')).toBeNull();
  });

  it('shows no panel before WebGPU is confirmed', async () => {
    const root = await render('pending');
    expect(root.querySelector('app-control-panel')).toBeNull();
  });

  it('switches to the physics panel and back', async () => {
    const fixture = await mount(readyProbe);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="show-physics"]')?.click();
    fixture.detectChanges();
    expect(root.querySelector('app-physics-panel')).not.toBeNull();
    expect(root.querySelector('app-control-panel')).toBeNull();
    expect(root.querySelector('[data-testid="show-physics"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    root.querySelector<HTMLButtonElement>('[data-testid="show-controls"]')?.click();
    fixture.detectChanges();
    expect(root.querySelector('app-control-panel')).not.toBeNull();
  });

  it('opens and closes the settings sheet with the right aria state', async () => {
    const fixture = await mount(readyProbe);
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLButtonElement>('[data-testid="sheet-toggle"]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    toggle?.click();
    fixture.detectChanges();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('.sidebar')?.classList.contains('sheet-open')).toBe(true);
  });

  it('orbits, tilts and zooms from the keyboard and announces the result', async () => {
    const fixture = await mount(readyProbe);
    const store = TestBed.inject(SettingsStore);
    const before = store.view();
    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(store.view().azimuth).toBeGreaterThan(before.azimuth);
    key('ArrowUp');
    expect(store.view().inclination).toBeLessThan(before.inclination);
    key('PageUp');
    expect(store.view().distance).toBeLessThan(before.distance);
    key('-');
    key('-');
    expect(store.view().distance).toBeGreaterThan(before.distance * 0.9);
    fixture.detectChanges();
    const announcer = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="announcer"]',
    );
    expect(announcer?.getAttribute('aria-live')).toBe('polite');
    expect(announcer?.textContent).toContain('Inclination');
  });

  it('resets on Home', async () => {
    await mount(readyProbe);
    const store = TestBed.inject(SettingsStore);
    store.update({ exposure: 2 });
    key('Home');
    expect(store.settings()).toEqual(defaultSettings);
    expect(store.announcement()).toContain('reset');
  });

  it('leaves the keys alone while a slider has focus', async () => {
    const fixture = await mount(readyProbe);
    const store = TestBed.inject(SettingsStore);
    const slider = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#distance',
    );
    const before = store.view().azimuth;
    const event = key('ArrowRight', {}, slider ?? document.body);
    expect(event.defaultPrevented).toBe(false);
    expect(store.view().azimuth).toBe(before);
  });

  it('does not react to keys before WebGPU is confirmed', async () => {
    await mount('pending');
    const store = TestBed.inject(SettingsStore);
    expect(key('ArrowRight').defaultPrevented).toBe(false);
    expect(store.view().azimuth).toBe(0);
  });

  it('opens the keyboard help with the question mark and closes it with Escape', async () => {
    const fixture = await mount(readyProbe);
    const root = fixture.nativeElement as HTMLElement;
    key('?', { shiftKey: true });
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="keyboard-help"]')).not.toBeNull();
    key('Escape');
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="keyboard-help"]')).toBeNull();
    key('?', { shiftKey: true });
    fixture.detectChanges();
    key('?', { shiftKey: true });
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="keyboard-help"]')).toBeNull();
  });

  it('opens the help from the button on the controls', async () => {
    const fixture = await mount(readyProbe);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="open-help"]')?.click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="keyboard-help"]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-testid="close-help"]')?.click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="keyboard-help"]')).toBeNull();
  });

  it('applies gestures from the viewport to the store', async () => {
    const fixture = await mount(readyProbe);
    const store = TestBed.inject(SettingsStore);
    const app = fixture.componentInstance as unknown as {
      onGesture: (delta: unknown) => void;
    };
    app.onGesture({ kind: 'orbit', azimuth: 0.2, inclination: -0.1 });
    expect(store.view().azimuth).toBeCloseTo(0.2, 12);
    app.onGesture({ kind: 'zoom', factor: 0.5 });
    expect(store.view().distance).toBe(25);
    app.onGesture({ kind: 'split', position: 0.3 });
    expect(store.split().position).toBeCloseTo(0.3, 12);
  });

  it('starts from the state in the address', async () => {
    window.history.replaceState(null, '', '/?v=1&dist=33');
    await mount(readyProbe);
    expect(TestBed.inject(SettingsStore).view().distance).toBe(33);
  });
});
