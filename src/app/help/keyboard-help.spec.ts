import { TestBed } from '@angular/core/testing';
import { keyboardHelp } from '../state/keyboard-map';
import { KeyboardHelp } from './keyboard-help';

function create(open: boolean) {
  TestBed.configureTestingModule({ imports: [KeyboardHelp] });
  const fixture = TestBed.createComponent(KeyboardHelp);
  document.body.append(fixture.nativeElement as HTMLElement);
  fixture.componentRef.setInput('open', open);
  fixture.detectChanges();
  return fixture;
}

describe('KeyboardHelp', () => {
  it('renders nothing while closed', () => {
    const fixture = create(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('section')).toBeNull();
  });

  it('lists every key binding and takes focus when opened', () => {
    const fixture = create(true);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('dt').length).toBe(keyboardHelp.length);
    fixture.detectChanges();
    expect(document.activeElement).toBe(root.querySelector('[data-testid="close-help"]'));
    root.remove();
  });

  it('emits when closed', () => {
    const fixture = create(true);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="close-help"]')
      ?.click();
    expect(closed).toHaveBeenCalledOnce();
    (fixture.nativeElement as HTMLElement).remove();
  });
});
