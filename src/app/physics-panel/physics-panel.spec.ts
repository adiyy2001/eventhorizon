import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Equation } from './equation';
import { githubAnchor, physicsDocumentUrl, physicsEquations } from './equations';
import { KatexRenderer } from './katex-renderer';
import { PhysicsPanel } from './physics-panel';

async function renderPanel(): Promise<HTMLElement> {
  TestBed.configureTestingModule({ imports: [PhysicsPanel] });
  const fixture = TestBed.createComponent(PhysicsPanel);
  fixture.detectChanges();
  await TestBed.inject(KatexRenderer).load();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PhysicsPanel', () => {
  it('renders every equation with KaTeX and no error', async () => {
    const root = await renderPanel();
    const items = root.querySelectorAll('li');
    expect(items.length).toBe(physicsEquations.length);
    expect(root.querySelectorAll('.katex-error').length).toBe(0);
    for (const equation of root.querySelectorAll('app-equation')) {
      expect(equation.getAttribute('data-state')).toBe('rendered');
      expect(equation.querySelector('.katex')).not.toBeNull();
      expect(equation.querySelector('math')).not.toBeNull();
    }
  });

  it('gives each equation a title, a caption and a link to its derivation', async () => {
    const root = await renderPanel();
    for (const [index, equation] of physicsEquations.entries()) {
      const item = root.querySelectorAll('li')[index];
      expect(item?.querySelector('h3')?.textContent).toBe(equation.title);
      expect(item?.querySelector('.caption')?.textContent).toBe(equation.caption);
      const link = item?.querySelector('a');
      expect(link?.getAttribute('href')).toBe(`${physicsDocumentUrl}#${equation.section.anchor}`);
      expect(link?.getAttribute('rel')).toContain('noopener');
    }
  });

  it('shows a loading note until KaTeX is available', () => {
    TestBed.configureTestingModule({ imports: [PhysicsPanel] });
    const fixture = TestBed.createComponent(PhysicsPanel);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading the equations');
  });
});

describe('Equation', () => {
  @Component({
    selector: 'app-equation-host',
    imports: [Equation],
    template: '<app-equation [latex]="latex" label="Broken" />',
  })
  class Host {
    latex = String.raw`\frac{1}{`;
  }

  it('falls back to the source text when KaTeX rejects the input', async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    await TestBed.inject(KatexRenderer).load();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = (fixture.nativeElement as HTMLElement).querySelector('app-equation');
    expect(element?.getAttribute('data-state')).toBe('failed');
    expect(element?.textContent).toBe(String.raw`\frac{1}{`);
  });

  it('can be reached by keyboard so a wide equation scrolls', async () => {
    const root = await renderPanel();
    const equation = root.querySelector('app-equation');
    expect(equation?.getAttribute('tabindex')).toBe('0');
    expect(equation?.getAttribute('role')).toBe('group');
    expect(equation?.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('physicsEquations', () => {
  it('has unique ids', () => {
    const ids = physicsEquations.map((equation) => equation.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds the anchors the way GitHub does', () => {
    expect(githubAnchor('2. Null geodesics and the Binet equation')).toBe(
      '2-null-geodesics-and-the-binet-equation',
    );
    expect(githubAnchor('11. What the observer sees: Planck invariance and scaling')).toBe(
      '11-what-the-observer-sees-planck-invariance-and-scaling',
    );
    expect(githubAnchor('16. Overlays')).toBe('16-overlays');
  });
});
