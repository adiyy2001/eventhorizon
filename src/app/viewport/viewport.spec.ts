import { TestBed } from '@angular/core/testing';
import { defaultSettings, mergeSettings } from '../../core/render/settings';
import {
  RENDER_SESSION_FACTORY,
  type RenderSession,
  type RenderSessionFactory,
  viewportSize,
} from './render-session';
import { Viewport } from './viewport';

function fakeSession(overrides: Partial<RenderSession> = {}): RenderSession {
  return {
    setSettings: vi.fn(),
    exportImage: vi.fn(() => Promise.resolve({ width: 2, height: 2, rgba: new Uint8Array(16) })),
    resolutionLog: () => [],
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
});
