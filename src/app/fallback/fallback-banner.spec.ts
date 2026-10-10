import { TestBed } from '@angular/core/testing';
import { poolSize } from '../../core/render/tile-scheduler';
import { viewportSize } from '../viewport/render-session';
import { FallbackBanner } from './fallback-banner';

function create(reason = 'WebGPU is present but no graphics adapter is available.') {
  TestBed.configureTestingModule({ imports: [FallbackBanner] });
  const fixture = TestBed.createComponent(FallbackBanner);
  fixture.componentRef.setInput('reason', reason);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('FallbackBanner', () => {
  it('names the detected reason in the status line', () => {
    const root = create('This browser does not expose WebGPU.');
    const status = root.querySelector('[data-testid="gpu-status"]');
    expect(status?.textContent.trim()).toBe('This browser does not expose WebGPU.');
    expect(status?.getAttribute('data-state')).toBe('unsupported');
    expect(status?.getAttribute('role')).toBe('status');
  });

  it('shows the detail the browser reported when there is one', () => {
    TestBed.configureTestingModule({ imports: [FallbackBanner] });
    const fixture = TestBed.createComponent(FallbackBanner);
    fixture.componentRef.setInput('reason', 'This browser does not expose WebGPU.');
    fixture.componentRef.setInput('detail', 'navigator.gpu is not available');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="fallback-detail"] code')?.textContent).toBe(
      'navigator.gpu is not available',
    );
  });

  it('leaves the detail line out when the browser gave none', () => {
    expect(create().querySelector('[data-testid="fallback-detail"]')).toBeNull();
  });

  it('explains what is drawn and with how many workers', () => {
    const text = create().querySelector('[data-testid="fallback-explanation"]')?.textContent;
    const edge = String(viewportSize);
    expect(text).toContain(`${edge} by ${edge} pixels`);
    expect(text).toContain(`${String(poolSize(navigator.hardwareConcurrency))} background`);
    expect(text).toContain('four passes');
  });

  it('uses the singular for a single worker', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
    const text = create().querySelector('[data-testid="fallback-explanation"]')?.textContent;
    vi.unstubAllGlobals();
    expect(text).toContain('1 background worker.');
  });

  it('says which overlays stay off', () => {
    const text = create().querySelector('[data-testid="fallback-overlays"]')?.textContent;
    expect(text).toContain('photon sphere');
    expect(text).toContain('innermost stable orbit');
    expect(text).toContain('shadow edge');
  });

  it('offers the recorded preview without starting it by itself', () => {
    const video = create().querySelector('video');
    expect(video?.getAttribute('poster')).toBe('media/preview-poster.jpg');
    expect(video?.querySelector('source')?.getAttribute('src')).toBe('media/preview.webm');
    expect(video?.querySelector('source')?.getAttribute('type')).toBe('video/webm');
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.hasAttribute('autoplay')).toBe(false);
    expect(video?.getAttribute('preload')).toBe('none');
    expect(video?.querySelector('track')?.getAttribute('kind')).toBe('captions');
  });

  it('describes the video for assistive technology', () => {
    const root = create();
    const describedBy = root.querySelector('video')?.getAttribute('aria-describedby');
    expect(root.querySelector(`#${describedBy ?? ''}`)?.textContent.trim().length).toBeGreaterThan(
      0,
    );
  });
});
