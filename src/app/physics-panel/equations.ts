export interface PhysicsSection {
  heading: string;
  anchor: string;
}

export interface PhysicsEquation {
  id: string;
  title: string;
  latex: string;
  caption: string;
  section: PhysicsSection;
}

export const physicsDocumentUrl =
  'https://github.com/adiyy2001/eventhorizon/blob/main/docs/physics.md';

export function githubAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-');
}

function section(heading: string): PhysicsSection {
  return { heading, anchor: githubAnchor(heading) };
}

const geodesics = section('2. Null geodesics and the Binet equation');
const vectorForm = section('3. The vector form and the conserved angular momentum');
const shadow = section('7. Critical impact parameter and the shadow');
const deflection = section('8. Deflection angle');
const redshift = section('9. Circular orbits and the redshift factor');
const temperature = section('10. Temperature profile and what is simplified');
const observed = section('11. What the observer sees: Planck invariance and scaling');
const color = section('14. From temperature to display color');
const overlays = section('16. Overlays');

export const physicsEquations: readonly PhysicsEquation[] = [
  {
    id: 'metric',
    title: 'Schwarzschild metric',
    latex: String.raw`ds^2 = -\left(1 - \frac{r_s}{r}\right)dt^2 + \frac{dr^2}{1 - r_s/r} + r^2\,d\Omega^2`,
    caption: 'Units G = c = M = 1, so the Schwarzschild radius is 2.',
    section: geodesics,
  },
  {
    id: 'binet',
    title: 'Light path in the orbital plane',
    latex: String.raw`\frac{d^2u}{d\varphi^2} + u = 3M\,u^2, \qquad u = \frac{1}{r}`,
    caption: 'Every light ray stays in one plane. This equation gives its shape.',
    section: geodesics,
  },
  {
    id: 'vector-form',
    title: 'Vector form used by the integrator',
    latex: String.raw`\mathbf{x}'' = -\frac{3}{2}\,r_s\,h^2\,\frac{\mathbf{x}}{|\mathbf{x}|^5}, \qquad h = |\mathbf{x}\times\mathbf{x}'|`,
    caption: 'The quantity h stays constant along the ray, which the tests check.',
    section: vectorForm,
  },
  {
    id: 'critical-impact-parameter',
    title: 'Critical impact parameter',
    latex: String.raw`b_c = 3\sqrt{3}\,M \approx 5.196\,M`,
    caption: 'Rays with a smaller impact parameter fall in. The rest escape.',
    section: shadow,
  },
  {
    id: 'shadow-radius',
    title: 'Apparent radius of the shadow',
    latex: String.raw`\alpha_c = \arcsin\!\left(\frac{b_c}{D}\sqrt{1 - \frac{r_s}{D}}\right)`,
    caption: 'For an observer at rest at distance D. The shadow edge overlay draws this circle.',
    section: shadow,
  },
  {
    id: 'weak-deflection',
    title: 'Weak-field deflection',
    latex: String.raw`\hat\alpha = \frac{4M}{b} + \frac{15\pi}{4}\frac{M^2}{b^2} + \frac{128}{3}\frac{M^3}{b^3} + O(b^{-4})`,
    caption: 'The leading term is the weak-field limit, checked against the integrator.',
    section: deflection,
  },
  {
    id: 'redshift',
    title: 'Redshift factor of the disk',
    latex: String.raw`g = \frac{\sqrt{1 - 3M/r}}{1 - \Omega\lambda}, \qquad \Omega = \sqrt{\frac{M}{r^3}}`,
    caption: 'Gravitational redshift, Doppler shift and time dilation in one factor.',
    section: redshift,
  },
  {
    id: 'redshift-split',
    title: 'The two parts behind the switches',
    latex: String.raw`g_\infty = g_\text{grav}\cdot g_\text{dopp}, \quad g_\text{grav} = \sqrt{1 - \frac{r_s}{r}}, \quad g_\text{dopp} = \frac{1}{\gamma\,(1 - \Omega\lambda)}`,
    caption: 'The switches for gravitational redshift and Doppler beaming set one part each to 1.',
    section: redshift,
  },
  {
    id: 'photon-angular-momentum',
    title: 'Angular momentum of a photon about the disk axis',
    latex: String.raw`\lambda = -(\mathbf{x}\times\mathbf{x}')_y`,
    caption:
      'Positive when the photon travels with the orbiting gas, which makes that side brighter.',
    section: redshift,
  },
  {
    id: 'disk-temperature',
    title: 'Disk temperature profile',
    latex: String.raw`T(r) \propto r^{-3/4}\left(1 - \sqrt{r_\text{in}/r}\right)^{1/4}`,
    caption: 'A thin disk with its inner edge at the innermost stable orbit, 6 M from the center.',
    section: temperature,
  },
  {
    id: 'observed-spectrum',
    title: 'What the observer sees',
    latex: String.raw`I_\nu^\text{obs}(\nu) = g^3 B_{\nu/g}(T) = B_\nu(gT), \qquad I_\text{bol} \propto g^4 T^4`,
    caption: 'A Planck spectrum stays a Planck spectrum at the temperature gT.',
    section: observed,
  },
  {
    id: 'color-matching',
    title: 'From spectrum to color',
    latex: String.raw`X = \int B_\lambda\,\bar x(\lambda)\,d\lambda,\quad Y = \int B_\lambda\,\bar y(\lambda)\,d\lambda,\quad Z = \int B_\lambda\,\bar z(\lambda)\,d\lambda`,
    caption: 'Integrated against the CIE 1931 matching functions, then converted to linear sRGB.',
    section: color,
  },
  {
    id: 'shadow-overlay',
    title: 'Shadow edge in the image plane',
    latex: String.raw`\rho = \tan\alpha_c = \tan\arcsin\!\left(\frac{b_c}{D}\sqrt{1 - \frac{r_s}{D}}\right)`,
    caption: 'The radius of the drawn circle, in units of the half height of the image.',
    section: overlays,
  },
];
