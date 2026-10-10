import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { defaultSettings, mergeSettings } from '../../core/render/settings';
import { CPU_SESSION_FACTORY } from '../fallback/cpu-session';
import { type GpuFailure } from '../gpu-status';
import {
  RENDER_SESSION_FACTORY,
  type RenderProgress,
  type RenderSession,
  type RenderSessionFactory,
  viewportSize,
} from './render-session';
import { progressSentence, Viewport } from './viewport';

function fakeSession(overrides: Partial<RenderSession> = {}): RenderSession {
  return {
    setSettings: vi.fn(),
    exportImage: vi.fn(() => Promise.resolve({ width: 2, height: 2, rgba: new Uint8Array(16) })),
    resolutionLog: () => [],
    progress: signal(null).asReadonly(),
    failure: signal(null).asReadonly(),
    destroy: vi.fn(),
    ...overrides,
  };
}

function canvasState(root: HTMLElement): string | null {
  return root.querySelector('canvas')?.getAttribute('data-state') ?? null;
}

async function create(factory: RenderSessionFactory) {
  TestBed.configureTestingModule({
    imports: [Viewport],
    providers: [{ provide: RENDER_SESSION_FACTORY, useValue: factory }],
  });
  const fixture = TestBed.createComponent(Viewport);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('Viewport', () => {
  it('passes its canvas, size and the default settings to the session factory', async () => {
    const factory = vi.fn<RenderSessionFactory>(() => Promise.resolve(fakeSession()));
    const fixture = await create(factory);
    const root = fixture.nativeElement as HTMLElement;
    expect(factory).toHaveBeenCalledWith(
      root.querySelector('canvas'),
      viewportSize,
      defaultSettings,
    );
    expect(canvasState(root)).toBe('rendered');
  });

  it('pushes new settings into the running session', async () => {
    const session = fakeSession();
    const fixture = await create(() => Promise.resolve(session));
    const next = mergeSettings(defaultSettings, { overlays: { photonSphere: true } });
    fixture.componentRef.setInput('settings', next);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(session.setSettings).toHaveBeenLastCalledWith(next);
  });

  it('shows the key for the active overlays', async () => {
    const fixture = await create(() => Promise.resolve(fakeSession()));
    fixture.componentRef.setInput(
      'settings',
      mergeSettings(defaultSettings, { overlays: { isco: true, shadowEdge: true } }),
    );
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const legend = root.querySelector('[data-testid="overlay-legend"]');
    expect(legend?.textContent).toContain('dashed');
    expect(legend?.textContent).toContain('solid');
  });

  it('describes the current inclination and distance', async () => {
    const fixture = await create(() => Promise.resolve(fakeSession()));
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('figcaption')?.textContent).toContain('75 degrees');
    expect(root.querySelector('figcaption')?.textContent).toContain('50 M');
  });

  it('reports a failed first frame', async () => {
    const fixture = await create(() => Promise.reject(new Error('no device')));
    const root = fixture.nativeElement as HTMLElement;
    expect(canvasState(root)).toBe('failed');
    expect(root.querySelector('figcaption')?.textContent).toContain('could not be rendered');
    expect(root.querySelector<HTMLButtonElement>('[data-testid="save-image"]')?.disabled).toBe(
      true,
    );
  });

  it('saves an image through the session and downloads it', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const session = fakeSession();
    const fixture = await create(() => Promise.resolve(session));
    const root = fixture.nativeElement as HTMLElement;
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { putImageData: () => undefined };
        }
        convertToBlob() {
          return Promise.resolve(new Blob([new Uint8Array([1, 2, 3])]));
        }
      },
    );
    vi.stubGlobal('ImageData', vi.fn());
    root.querySelector<HTMLButtonElement>('[data-testid="save-image"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(session.exportImage).toHaveBeenCalledWith({ width: 1024, height: 1024 });
    expect(click).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-testid="export-status"]')?.textContent).toContain('saved');
    vi.unstubAllGlobals();
    click.mockRestore();
  });

  it('reports a failed export', async () => {
    const session = fakeSession({ exportImage: () => Promise.reject(new Error('device lost')) });
    const fixture = await create(() => Promise.resolve(session));
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="save-image"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="export-status"]')?.textContent).toContain(
      'could not be saved',
    );
  });

  it('destroys the session with the component', async () => {
    const session = fakeSession();
    const fixture = await create(() => Promise.resolve(session));
    fixture.destroy();
    expect(session.destroy).toHaveBeenCalledOnce();
  });

  it('destroys a session that finished starting after the component was gone', async () => {
    const session = fakeSession();
    let finish: (value: RenderSession) => void = () => undefined;
    const pending = new Promise<RenderSession>((resolve) => {
      finish = resolve;
    });
    TestBed.configureTestingModule({
      imports: [Viewport],
      providers: [{ provide: RENDER_SESSION_FACTORY, useValue: () => pending }],
    });
    const fixture = TestBed.createComponent(Viewport);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.destroy();
    finish(session);
    await pending;
    await Promise.resolve();
    expect(session.destroy).toHaveBeenCalledOnce();
  });

  describe('pointer input', () => {
    function pointer(type: string, init: PointerEventInit): PointerEvent {
      return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
    }

    async function withCanvas() {
      const fixture = await create(() => Promise.resolve(fakeSession()));
      const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas');
      if (canvas === null) {
        throw new Error('no canvas');
      }
      canvas.setPointerCapture = vi.fn();
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 400,
        height: 400,
        right: 400,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      const gestures: unknown[] = [];
      fixture.componentInstance.gesture.subscribe((delta) => gestures.push(delta));
      return { fixture, canvas, gestures };
    }

    it('emits an orbit for a drag', async () => {
      const { canvas, gestures } = await withCanvas();
      canvas.dispatchEvent(pointer('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }));
      canvas.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 120, clientY: 100 }));
      canvas.dispatchEvent(pointer('pointerup', { pointerId: 1, clientX: 120, clientY: 100 }));
      canvas.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 140, clientY: 100 }));
      expect(gestures).toHaveLength(1);
      expect(gestures[0]).toMatchObject({ kind: 'orbit' });
    });

    it('drags the divider when the split is on and the pointer starts on it', async () => {
      const { fixture, canvas, gestures } = await withCanvas();
      fixture.componentRef.setInput(
        'settings',
        mergeSettings(defaultSettings, { split: { enabled: true, position: 0.5 } }),
      );
      fixture.detectChanges();
      canvas.dispatchEvent(pointer('pointerdown', { pointerId: 2, clientX: 200, clientY: 50 }));
      canvas.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 300, clientY: 60 }));
      expect(gestures).toEqual([{ kind: 'split', position: 0.75 }]);
    });

    it('stops tracking a cancelled pointer', async () => {
      const { canvas, gestures } = await withCanvas();
      canvas.dispatchEvent(pointer('pointerdown', { pointerId: 3, clientX: 10, clientY: 10 }));
      canvas.dispatchEvent(pointer('pointercancel', { pointerId: 3 }));
      canvas.dispatchEvent(pointer('pointermove', { pointerId: 3, clientX: 50, clientY: 50 }));
      expect(gestures).toEqual([]);
    });

    it('zooms with the wheel and keeps the page from scrolling', async () => {
      const { canvas, gestures } = await withCanvas();
      const event = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
      canvas.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(gestures[0]).toMatchObject({ kind: 'zoom' });
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE, bubbles: true }),
      );
      const [first, second] = gestures as { factor: number }[];
      expect(first?.factor).toBeCloseTo(Math.exp(0.1), 12);
      expect(second?.factor).toBeCloseTo(Math.exp(0.048), 12);
    });

    it('describes the current settings for assistive technology', async () => {
      const { fixture, canvas } = await withCanvas();
      expect(canvas.getAttribute('aria-label')).toContain('Inclination 75 degrees');
      fixture.componentRef.setInput(
        'settings',
        mergeSettings(defaultSettings, { view: { doppler: false } }),
      );
      fixture.detectChanges();
      expect(canvas.getAttribute('aria-label')).toContain('Doppler beaming off');
    });
  });
});

const refining: RenderProgress = {
  generation: 3,
  passesDone: 1,
  passesTotal: 4,
  fraction: 0.25,
  complete: false,
  firstImageMilliseconds: 120,
  fullImageMilliseconds: null,
};

const finished: RenderProgress = {
  generation: 3,
  passesDone: 4,
  passesTotal: 4,
  fraction: 1,
  complete: true,
  firstImageMilliseconds: 118.4,
  fullImageMilliseconds: 2412.6,
};

describe('progressSentence', () => {
  it('is empty without a software render', () => {
    expect(progressSentence(null)).toBe('');
  });

  it('counts the pass in progress', () => {
    expect(progressSentence(refining)).toBe('Refining, pass 2 of 4.');
    expect(progressSentence({ ...refining, passesDone: 0 })).toBe('Refining, pass 1 of 4.');
    expect(progressSentence({ ...refining, passesDone: 3 })).toBe('Refining, pass 4 of 4.');
  });

  it('reports the measured times once the render is complete', () => {
    expect(progressSentence(finished)).toBe(
      'Full resolution after 2.4 s, first image after 0.1 s.',
    );
  });
});

describe('Viewport with the software backend', () => {
  async function createSoftware(session: RenderSession, backend: 'cpu' | 'gpu' = 'cpu') {
    const cpuFactory = vi.fn<RenderSessionFactory>(() => Promise.resolve(session));
    const gpuFactory = vi.fn<RenderSessionFactory>(() => Promise.resolve(fakeSession()));
    TestBed.configureTestingModule({
      imports: [Viewport],
      providers: [
        { provide: CPU_SESSION_FACTORY, useValue: cpuFactory },
        { provide: RENDER_SESSION_FACTORY, useValue: gpuFactory },
      ],
    });
    const fixture = TestBed.createComponent(Viewport);
    fixture.componentRef.setInput('backend', backend);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cpuFactory, gpuFactory, root: fixture.nativeElement as HTMLElement };
  }

  it('starts the software session and not the graphics one', async () => {
    const { cpuFactory, gpuFactory, root } = await createSoftware(fakeSession());
    expect(cpuFactory).toHaveBeenCalledOnce();
    expect(gpuFactory).not.toHaveBeenCalled();
    expect(root.querySelector('canvas')?.getAttribute('data-backend')).toBe('cpu');
    expect(canvasState(root)).toBe('rendered');
  });

  it('starts the graphics session for the graphics backend', async () => {
    const { cpuFactory, gpuFactory } = await createSoftware(fakeSession(), 'gpu');
    expect(gpuFactory).toHaveBeenCalledOnce();
    expect(cpuFactory).not.toHaveBeenCalled();
  });

  it('shows the progress of a refining render with data attributes for tests', async () => {
    const progress = signal<RenderProgress | null>(refining);
    const { fixture, root } = await createSoftware(
      fakeSession({ progress: progress.asReadonly() }),
    );
    const canvas = root.querySelector('canvas');
    expect(canvas?.getAttribute('data-generation')).toBe('3');
    expect(canvas?.getAttribute('data-passes-done')).toBe('1');
    expect(canvas?.getAttribute('data-passes-total')).toBe('4');
    expect(canvas?.getAttribute('data-complete')).toBe('false');
    expect(canvas?.getAttribute('data-first-image-ms')).toBe('120');
    expect(canvas?.hasAttribute('data-full-image-ms')).toBe(false);
    expect(root.querySelector('[data-testid="render-progress-text"]')?.textContent).toContain(
      'Refining, pass 2 of 4.',
    );
    expect(root.querySelector('progress')?.value).toBe(0.25);
    progress.set(finished);
    fixture.detectChanges();
    expect(canvas?.getAttribute('data-complete')).toBe('true');
    expect(canvas?.getAttribute('data-first-image-ms')).toBe('118');
    expect(canvas?.getAttribute('data-full-image-ms')).toBe('2413');
    expect(root.querySelector('[data-testid="render-progress-text"]')?.textContent).toContain(
      'Full resolution after 2.4 s',
    );
  });

  it('shows no progress line for a session that reports none', async () => {
    const { root } = await createSoftware(fakeSession(), 'gpu');
    expect(root.querySelector('[data-testid="render-progress"]')).toBeNull();
    expect(root.querySelector('canvas')?.hasAttribute('data-generation')).toBe(false);
  });

  it('saves at the size of the software image', async () => {
    const session = fakeSession();
    const { root, fixture } = await createSoftware(session);
    expect(root.querySelector('[data-testid="save-image"]')?.textContent).toContain(
      `${String(viewportSize)} px`,
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { putImageData: () => undefined };
        }
        convertToBlob() {
          return Promise.resolve(new Blob([new Uint8Array([1])]));
        }
      },
    );
    vi.stubGlobal('ImageData', vi.fn());
    root.querySelector<HTMLButtonElement>('[data-testid="save-image"]')?.click();
    await fixture.whenStable();
    expect(session.exportImage).toHaveBeenCalledWith({
      width: viewportSize,
      height: viewportSize,
    });
    vi.unstubAllGlobals();
    click.mockRestore();
  });

  it('leaves out the overlays the software renderer cannot draw', async () => {
    const { fixture, root } = await createSoftware(fakeSession());
    fixture.componentRef.setInput(
      'settings',
      mergeSettings(defaultSettings, {
        overlays: { photonSphere: true, isco: true, shadowEdge: true },
      }),
    );
    fixture.detectChanges();
    const legend = root.querySelector('[data-testid="overlay-legend"]')?.textContent ?? '';
    expect(legend).toContain('Shadow edge');
    expect(legend).not.toContain('Photon sphere');
    expect(legend).not.toContain('Innermost');
    const label = root.querySelector('canvas')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Overlays: shadow edge.');
  });

  it('says what stopped the software renderer', async () => {
    const failure = signal<string | null>(null);
    const gpuFailed = vi.fn();
    const { fixture, root } = await createSoftware(fakeSession({ failure: failure.asReadonly() }));
    fixture.componentInstance.gpuFailed.subscribe(gpuFailed);
    failure.set('out of memory');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(canvasState(root)).toBe('failed');
    expect(root.querySelector('figcaption')?.textContent).toContain(
      'The software renderer stopped: out of memory.',
    );
    expect(gpuFailed).not.toHaveBeenCalled();
  });

  it('reports a software session that cannot start without asking for a fallback', async () => {
    TestBed.configureTestingModule({
      imports: [Viewport],
      providers: [
        { provide: CPU_SESSION_FACTORY, useValue: () => Promise.reject(new Error('no workers')) },
      ],
    });
    const fixture = TestBed.createComponent(Viewport);
    fixture.componentRef.setInput('backend', 'cpu');
    const gpuFailed = vi.fn();
    fixture.componentInstance.gpuFailed.subscribe(gpuFailed);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(canvasState(root)).toBe('failed');
    expect(root.querySelector('figcaption')?.textContent).toContain('no workers');
    expect(gpuFailed).not.toHaveBeenCalled();
  });

  it('shows the start message of the software renderer while it starts', () => {
    TestBed.configureTestingModule({
      imports: [Viewport],
      providers: [{ provide: CPU_SESSION_FACTORY, useValue: () => new Promise(() => undefined) }],
    });
    const fixture = TestBed.createComponent(Viewport);
    fixture.componentRef.setInput('backend', 'cpu');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('figcaption')?.textContent,
    ).toContain('Starting the software renderer.');
  });
});

describe('Viewport when the graphics path fails', () => {
  async function createGraphics(factory: RenderSessionFactory) {
    TestBed.configureTestingModule({
      imports: [Viewport],
      providers: [{ provide: RENDER_SESSION_FACTORY, useValue: factory }],
    });
    const fixture = TestBed.createComponent(Viewport);
    const failures: GpuFailure[] = [];
    fixture.componentInstance.gpuFailed.subscribe((failure) => failures.push(failure));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, failures, root: fixture.nativeElement as HTMLElement };
  }

  it('asks for the fallback when the session cannot start', async () => {
    const { failures, root } = await createGraphics(() => Promise.reject(new Error('no pipeline')));
    expect(failures).toEqual([{ reason: 'render-failed', detail: 'no pipeline' }]);
    expect(canvasState(root)).toBe('failed');
    expect(root.querySelector('figcaption')?.textContent).toContain('could not be rendered');
  });

  it('asks for the fallback when the device is lost later', async () => {
    const failure = signal<string | null>(null);
    const { fixture, failures } = await createGraphics(() =>
      Promise.resolve(fakeSession({ failure: failure.asReadonly() })),
    );
    expect(failures).toEqual([]);
    failure.set('GPU hung');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(failures).toEqual([{ reason: 'device-lost', detail: 'GPU hung' }]);
  });
});
