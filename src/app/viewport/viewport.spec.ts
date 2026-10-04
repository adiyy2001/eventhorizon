import { TestBed } from '@angular/core/testing';
import { defaultView } from '../../core/render/view';
import { RENDER_SESSION_FACTORY, type RenderSessionFactory, viewportSize } from './render-session';
import { Viewport } from './viewport';

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
  it('passes its canvas, size and the default view to the session factory', async () => {
    const factory = vi.fn<RenderSessionFactory>(() => Promise.resolve({ destroy: vi.fn() }));
    const fixture = await create(factory);
    const root = fixture.nativeElement as HTMLElement;
    expect(factory).toHaveBeenCalledWith(root.querySelector('canvas'), viewportSize, defaultView);
    expect(canvasState(root)).toBe('rendered');
  });

  it('reports a failed first frame', async () => {
    const fixture = await create(() => Promise.reject(new Error('no device')));
    const root = fixture.nativeElement as HTMLElement;
    expect(canvasState(root)).toBe('failed');
    expect(root.querySelector('figcaption')?.textContent).toContain('could not be rendered');
  });

  it('destroys the session with the component', async () => {
    const destroy = vi.fn();
    const fixture = await create(() => Promise.resolve({ destroy }));
    fixture.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('destroys a session that finished starting after the component was gone', async () => {
    const destroy = vi.fn();
    let finish: (session: { destroy: () => void }) => void = () => undefined;
    const pending = new Promise<{ destroy: () => void }>((resolve) => {
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
    finish({ destroy });
    await pending;
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
