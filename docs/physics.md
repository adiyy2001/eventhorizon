# Physics

This file derives every equation the renderer uses, says where each one comes from, and points at the test that checks it. Units are G = c = M = 1, so the Schwarzschild radius is $r_s = 2$, the photon sphere sits at $r = 3$ and the ISCO at $r = 6$. Code lives in `src/core/physics`. The GPU shaders implement the same equations with the same constants.

Sources are cited by author and year. The full references are at the end.

## 1. Conventions

- The disk lies in the plane $y = 0$ and its axis points along $+y$. Emitters orbit counter-clockwise seen from $+y$, so their angular momentum vector is $+\hat y$.
- Camera inclination is the angle between the line from the hole to the camera and $+y$. Zero is face-on, 90 degrees is edge-on.
- The ray parameter $\lambda$ is the affine parameter, normalised so that the photon energy at infinity is $E = 1$. Primes mean $d/d\lambda$.
- The tracer runs backwards from the camera into the scene. The traced tangent $\mathbf{x}'$ points away from the camera. The photon itself travels the other way, with momentum along $-\mathbf{x}'$. Section 9 shows why this matters for one sign.

## 2. Null geodesics and the Binet equation

The Schwarzschild metric in $(t, r, \theta, \varphi)$ is

$$ds^2 = -\left(1 - \frac{r_s}{r}\right)dt^2 + \frac{dr^2}{1 - r_s/r} + r^2\,d\Omega^2.$$

Spherical symmetry keeps every geodesic in one plane through the centre, so take it as $\theta = \pi/2$. Two quantities are conserved along a photon path (Misner, Thorne and Wheeler 1973, chapter 25):

$$E = \left(1 - \frac{r_s}{r}\right)\frac{dt}{d\lambda}, \qquad L = r^2\frac{d\varphi}{d\lambda}.$$

The null condition $g_{\mu\nu}k^\mu k^\nu = 0$ then reads

$$\left(\frac{dr}{d\lambda}\right)^2 = E^2 - \left(1 - \frac{r_s}{r}\right)\frac{L^2}{r^2}.$$

Define the impact parameter $b = L/E$ and $u = 1/r$. Since $dr/d\lambda = -L\,du/d\varphi$,

$$\left(\frac{du}{d\varphi}\right)^2 = \frac{1}{b^2} - u^2 + r_s u^3.$$

Differentiating and dividing by $du/d\varphi$ gives the Binet form:

$$\frac{d^2u}{d\varphi^2} + u = \frac{3}{2}\,r_s\,u^2 = 3M u^2.$$

Test: `deflection.spec.ts` integrates this form with RK4 in $\varphi$ (`deflectionByBinet`).

## 3. The vector form and the conserved angular momentum

Let $\mathbf{x} = r\hat n$ with $\hat n$ the unit radial vector of the pseudo-Cartesian coordinates built from $(r, \theta, \varphi)$. Differentiating the radial equation of section 2 gives

$$r'' = \frac{L^2}{r^3} - \frac{3}{2}\frac{r_s L^2}{r^4}.$$

In Cartesian form the acceleration is $\mathbf{x}'' = (r'' - r\varphi'^2)\hat n + (2r'\varphi' + r\varphi'')\hat\tau$. Conservation of $L$ makes the tangential part vanish and gives $r\varphi'^2 = L^2/r^3$. So

$$\mathbf{x}'' = -\frac{3}{2}\,r_s\,h^2\,\frac{\mathbf{x}}{|\mathbf{x}|^5}, \qquad h = |\mathbf{x}\times\mathbf{x}'|.$$

The force points along $\mathbf{x}$, so $(\mathbf{x}\times\mathbf{x}')' = \mathbf{x}\times\mathbf{x}'' = 0$. The whole vector $\mathbf{x}\times\mathbf{x}'$ is conserved, direction included. Two consequences are used in the code:

- The ray stays in the plane perpendicular to $\mathbf{x}\times\mathbf{x}'$.
- The component of $\mathbf{x}\times\mathbf{x}'$ along the disk axis is constant along the whole ray, so every disk crossing of one ray has the same photon angular momentum $\lambda$ (section 9).

With $E = 1$ the constant $h$ equals $L$ and equals $b$ at infinity (Binet and vector forms are the same physics, as ADR 2 explains). RK4 does not preserve a quadratic invariant exactly, so the code measures the drift (section 12).

Tests: `geodesic.spec.ts` (acceleration factor by hand, $h = 3$ at $r = 3$ gives $-1/9$), `trace.spec.ts` (conservation along rays, constant $\lambda$ at every crossing), `deflection.spec.ts` (Binet against vector form to 1e-9).

## 4. The affine parameter invariant

Adding the radial and tangential speeds with $E = 1$:

$$|\mathbf{x}'|^2 = r'^2 + r^2\varphi'^2 = \left(1 - \frac{L^2}{r^2} + \frac{r_s L^2}{r^3}\right) + \frac{L^2}{r^2} = 1 + \frac{r_s h^2}{r^3}.$$

The quantity $|\mathbf{x}'|^2 - r_s h^2/r^3 - 1$ is the null condition drift. It is zero for exact initial data and measured along the integration. Nothing in these equations is singular at $r = r_s$, which is why the integrator needs no coordinate tricks at the horizon. The capture margin $\varepsilon$ in section 12 only decides when to stop.

Test: `geodesic.spec.ts` (zero drift for an exact initial state).

## 5. Impact parameter at a finite distance

Starting a ray at distance $D$ with unit speed would put $|\mathbf{x}'| = 1$ instead of $\sqrt{1 + r_s h^2/D^3}$, which biases $b$ by about 2e-5 at $D = 200$. The invariant removes the bias:

$$b = \frac{h}{\sqrt{|\mathbf{x}'|^2 - r_s h^2/r^3}}.$$

Test: `geodesic.spec.ts` (`impactParameter`), `observer.spec.ts` (the formula for $h$ in section 6).

## 6. The static observer frame

A static observer at radius $D$ has four-velocity $u = (1 - r_s/D)^{-1/2}\partial_t$ and the orthonormal spatial triad $\hat e_r = \sqrt{1 - r_s/D}\,\partial_r$, $\hat e_\theta = D^{-1}\partial_\theta$, $\hat e_\varphi = (D\sin\theta)^{-1}\partial_\varphi$ (Bardeen 1973, James et al. 2015 for the image formation conventions). The photon energy and tangential momentum this observer measures are

$$E_\text{loc} = \frac{E}{\sqrt{1 - r_s/D}}, \qquad p_{\hat\varphi} = \frac{L}{D}.$$

A photon seen at angle $\alpha$ from the direction of the hole has $\sin\alpha = p_{\hat\varphi}/E_\text{loc}$, so with $E = 1$

$$h = \frac{D\sin\alpha}{\sqrt{1 - r_s/D}}.$$

In coordinate terms the traced ray starts at $\mathbf{x} = D\hat n$ with tangential speed $r\varphi' = h/D$ and radial speed $dr/d\lambda = \pm\sqrt{1 + r_s h^2/D^3 - h^2/D^2}$, positive towards the hole when $\cos\alpha > 0$. The radial speed comes from the radial equation of section 2, which is the same as the invariant of section 4. At $\alpha = 90$ degrees it vanishes, as it must.

A pinhole camera in this frame needs no aberration correction because the observer is at rest. A pixel direction is a unit vector in the triad, built from the camera basis (`cameraBasis`, `pixelDirection`), and `staticObserverRay` turns it into position and coordinate velocity.

Tests: `observer.spec.ts` (orthonormal basis, field of view, null condition and $h$ for angles from 0 to 89 degrees, no radial motion at 90 degrees).

## 7. Critical impact parameter and the shadow

A photon with $E = 1$ reaches radius $r$ only if $1 \ge (1 - r_s/r)\,b^2/r^2$. The function $(1 - 2/r)/r^2$ has its maximum at $r = 3$ (set the derivative to zero) with value $1/27$. Rays with $b^2 < 27$ pass over the maximum and fall in, so

$$b_c = 3\sqrt{3}\,M \approx 5.19615.$$

The photon sphere at $r = 3M$ is where the maximum sits. $b_c$ is an impact parameter, and on the screen it shows up as an angle. For the static observer of section 6 the shadow edge appears at the angular radius

$$\alpha_c = \arcsin\!\left(\frac{b_c}{D}\sqrt{1 - \frac{r_s}{D}}\right),$$

which is 27.69 degrees at $D = 10$, 9.633 degrees at $D = 30$ and 2.949 degrees at $D = 100$, and tends to $b_c/D$ for a distant observer.

Tests: `shadow.spec.ts` (the three angles, capture at $0.999\,\alpha_c$ and escape at $1.001\,\alpha_c$ for $D \in \{10, 30, 100\}$, bisection of $b_c$ within 1e-6). `pnpm validate:physics` reports the bisection error, 5e-8 at $D = 30$.

## 8. Deflection angle

The full deflection of a ray with $b > b_c$ is

$$\hat\alpha = 2\int_0^{u_0}\frac{du}{\sqrt{b^{-2} - u^2 + r_s u^3}} - \pi,$$

where $u_0$ is the smallest positive root of the radicand (the turning point, between 0 and 1/3). Factoring out the root,

$$b^{-2} - u^2 + 2u^3 = (u_0 - u)\big[(1 - 2u_0)(u + u_0) - 2u^2\big].$$

Substituting $u = u_0 - s^2$ removes the square-root singularity at the turning point:

$$\int_0^{u_0}\frac{du}{\sqrt{\cdots}} = \int_0^{\sqrt{u_0}}\frac{2\,ds}{\sqrt{(1 - 2u_0)(2u_0 - s^2) - 2(u_0 - s^2)^2}}.$$

The integrand is smooth, and `deflectionByQuadrature` integrates it with composite Gauss-Legendre rules until successive refinements agree to a relative 1e-15.

For large $b$ the expansion is (Darwin 1959, Keeton and Petters 2005)

$$\hat\alpha = \frac{4M}{b} + \frac{15\pi}{4}\frac{M^2}{b^2} + \frac{128}{3}\frac{M^3}{b^3} + O(b^{-4}).$$

The leading term $4M/b$ is the weak-field limit. Its relative error is $(15\pi/16)\,M/b$, so it shrinks only like $1/b$: 2.97 percent at $b = 100$ and 1.47 percent at $b = 200$. The test therefore compares against the three-term series and checks that the error of the leading term falls with $b$ at the predicted rate.

Three independent computations of $\hat\alpha$ agree: RK4 of the Binet form, the quadrature, and the vector-form integrator (Dormand-Prince at tolerance 1e-13, started and stopped at $r = 10^5$ with a tail correction of section 12). `pnpm validate:physics` gives a worst disagreement of 5e-12 radians for $b$ from 5.3 to 500. At $b = 100$ the deflection is 0.04122 radians against 0.04 for the leading term.

The deflection also has a closed form in elliptic integrals (Darwin 1959, Keeton and Petters 2005). With $P = 1/u_0$ the periastron radius, $Q^2 = (P - 2M)(P + 6M)$, $k^2 = (Q - P + 6M)/(2Q)$ and $\sin^2\zeta = (Q - P + 2M)/(Q - P + 6M)$,

$$\hat\alpha = -\pi + 4\sqrt{\frac{P}{Q}}\,\big[K(k) - F(\zeta, k)\big],$$

where $K$ and $F$ are the complete and incomplete elliptic integrals of the first kind. `deflectionByElliptic` evaluates them with Carlson's symmetric form $R_F$ and matches the quadrature to 1e-10 radians for $b$ from 5.2 to 500. It is an extra check of the same number, computed without any numerical integration along the ray.

Tests: `deflection.spec.ts`, `elliptic.spec.ts`.

## 9. Circular orbits and the redshift factor

A circular geodesic at radius $r$ has the coordinate angular velocity $\Omega = \sqrt{M/r^3}$ and four-velocity $u = u^t(\partial_t + \Omega\partial_\varphi)$ with $u^t = (1 - 3M/r)^{-1/2}$ (Bardeen, Press and Teukolsky 1972; MTW chapter 25). A photon with conserved $E = -p_t$ and $L = p_\varphi$ has energy $E_\text{em} = -p\cdot u = u^t E(1 - \Omega\lambda)$ in the emitter frame, where $\lambda = L/E$. An observer at infinity measures $E$, so

$$g_\infty = \frac{E}{E_\text{em}} = \frac{\sqrt{1 - 3M/r}}{1 - \Omega\lambda}.$$

This is the standard factor for a circular emitter. It covers gravitational redshift, transverse Doppler shift and beaming in one expression.

### Decomposition

The speed of the emitter relative to a static observer at the same radius is $v = r\Omega/\sqrt{1 - r_s/r} = 1/\sqrt{r - 2}$, which is exactly 1/2 at the ISCO and 1 at the photon sphere. The Lorentz factor is $\gamma = \sqrt{(r - 2)/(r - 3)}$, and $u^t = \gamma/\sqrt{1 - r_s/r}$. Therefore

$$g_\infty = g_\text{grav}\cdot g_\text{dopp}, \qquad g_\text{grav} = \sqrt{1 - \frac{r_s}{r}}, \qquad g_\text{dopp} = \frac{1}{\gamma\,(1 - \Omega\lambda)}.$$

The product equals the combined factor to 1e-12 (the code checks it). The "gravitational redshift" switch sets $g_\text{grav} = 1$ and the "Doppler beaming" switch sets $g_\text{dopp} = 1$. The second one removes the transverse time dilation and the beaming together, which the interface says in its help text.

### Observer at finite distance

The camera is a static observer at $D$ and measures $E/\sqrt{1 - r_s/D}$, so the factor the camera sees is

$$g = g_\infty\cdot\frac{1}{\sqrt{1 - r_s/D}}.$$

The extra factor belongs to the gravitational switch. It is 1.054 at $D = 20$. Without it the image would be too dim by about 19 percent in intensity at that distance.

### Sign of $\lambda$ for backward rays

The photon's angular momentum about the disk axis is $\lambda = (\mathbf{x}\times\mathbf{p})_y/E$ with $\mathbf{p}$ along the photon's motion. The tracer integrates the reversed path, so $\mathbf{p} \propto -\mathbf{x}'$ and

$$\lambda = -(\mathbf{x}\times\mathbf{x}')_y = -(z\,x'_x - x\,x'_z).$$

A positive $\lambda$ means the photon travels with the emitter's orbital motion, which raises $g$ above its $\lambda = 0$ value $\sqrt{1 - 3M/r}$. Getting this sign wrong swaps the bright and dim sides of the disk. By section 3, $\lambda$ is the same at every crossing of one ray.

Tests: `disk.spec.ts` (hand-computed values $g = \sqrt{1/2}$ at $r = 6$ with $\lambda = 0$, and 0.9114, 0.6980 at $r = 8$ and 0.9334, 0.8077 at $r = 12$ for $\lambda = \pm3$; parts multiply to the total; observer factor 1.0541 at $D = 20$; $g$ grows with $\lambda$; switches), `geodesic.spec.ts` (sign of the axis angular momentum), `trace.spec.ts` (physical sign test: on a tilted view the side moving towards the camera has $\Omega\lambda > 0$ and the receding side $\Omega\lambda < 0$).

## 10. Temperature profile and what is simplified

A steady, thin, optically thick disk with zero torque at the inner edge radiates the flux $F(r) \propto r^{-3}(1 - \sqrt{r_\text{in}/r})$ (Shakura and Sunyaev 1973). With $F = \sigma T^4$,

$$T(r) \propto r^{-3/4}\left(1 - \sqrt{r_\text{in}/r}\right)^{1/4}.$$

The maximum follows from $d/dx\,[x^{-3}(1 - x^{-1/2})] = 0$ with $x = r/r_\text{in}$, which gives $x^{-1/2} = 6/7$, so the profile peaks at $r = (49/36)\,r_\text{in} \approx 8.1667$ for $r_\text{in} = 6$. The peak temperature is the control in the interface, and `diskTemperature` normalises to it.

What this leaves out, on purpose:

- The relativistic correction factor of Page and Thorne (1974). It changes $F$ by tens of percent near the inner edge and keeps the same shape.
- Emission inside $r_\text{in}$ (zero here), limb darkening (the surface radiates isotropically), light that returns to the disk after bending, scattering and colour correction of the spectrum.
- Real stellar-mass disks peak in X-rays. The temperature range is a visualization choice.

Tests: `disk.spec.ts` (zero at and inside the inner edge, maximum at 49/36, the $r^{-3/4}$ tail, linear scaling).

## 11. What the observer sees: Planck invariance and scaling

Liouville's theorem makes $I_\nu/\nu^3$ constant along a light ray (Rybicki and Lightman 1979, chapter 4), and frequencies scale by the redshift factor, $\nu_\text{obs} = g\,\nu_\text{em}$. For a blackbody of temperature $T$ the quantity $B_\nu/\nu^3 = (2h/c^2)/(e^{h\nu/kT} - 1)$ depends only on $\nu/T$. Hence the observed intensity is

$$I_\nu^\text{obs}(\nu) = g^3 B_{\nu/g}(T) = B_\nu(gT),$$

which is again a Planck spectrum, at the temperature $gT$. Its bolometric integral scales as $(gT)^4$, so the displayed radiance is proportional to $g^4 T^4$ and the chromaticity comes from the colour of a blackbody at $gT$. So the observed temperature is $gT$ and the intensity scales with $g^4$. The visible-band luminance grows more slowly than $g^4$ for hot gas, which section 14 returns to.

Code: `observedTemperature`, `observedIntensityScale` in `disk.ts`. Test: `disk.spec.ts`.

## 12. Numerical method

### Step rule

RK4 with a step that scales with the radius and shrinks where the ray turns fast:

$$\Delta\lambda = \operatorname{clamp}\!\left(\frac{\kappa\,r}{1 + w\,h^2/r^2},\ \Delta_\min,\ \Delta_\max\right).$$

The term $h^2/r^2$ is the squared angular speed of the ray, so the swept angle per step stays bounded. For straight rays (lensing off) only $\kappa r$ is used. Constants: $\kappa = 0.03$, $w = 0.5$, $\Delta_\min = 10^{-4}$, $\Delta_\max = 4$. They come from `pnpm validate:steps` (results in `bench/results/step-rule-sweep.json`, camera at $D = 30$, 64 by 64 pixels at 80 degrees inclination):

| $\kappa$ | $w$ | error of $b_c$ | deflection error at $b = 5.3$ | mean steps per ray |
| --- | --- | --- | --- | --- |
| 0.1 | 0.5 | 7.1e-6 | 7.1e-5 | 33 |
| 0.05 | 1 | 1.9e-7 | 1.9e-6 | 79 |
| 0.03 | 0 | 3.8e-7 | 3.5e-6 | 84 |
| 0.03 | 0.5 | 5.2e-8 | 5.2e-7 | 108 |
| 0.03 | 2 | 1.1e-8 | 1.1e-7 | 179 |
| 0.01 | 0.5 | 9.2e-10 | 6.3e-9 | 323 |
| 0.003 | 0.5 | 2.2e-10 | 5.0e-11 | 1075 |

The chosen row keeps the error of the shadow edge three orders of magnitude below a target of 1e-4 and costs about 108 steps per ray. The GPU port kept this row: it agrees with the float64 reference on every parity ray (see Single precision on the GPU), so no cheaper row was needed.

### Convergence and reference

The fixed-step RK4 error falls with order four against a Dormand-Prince 5(4) reference (Dormand and Prince 1980) at tolerance 1e-14. The test halves the step twice and requires an observed order between 3.7 and 4.4.

### Conservation

RK4 conserves linear invariants exactly and quadratic ones only up to its truncation error, so $h$ and the null condition drift slowly. Measured over a 128 by 128 view at 80 degrees inclination (16384 rays): the relative drift of $h$ stays below 4.4e-10 and the null drift below 6.1e-8. The tests state the bounds as 1e-8 for $h$ and 1e-6 for the null condition with the production step, and 1e-12 and 1e-10 with a step ten times smaller, which also shows the order.

### Termination

- Capture: $r < r_s(1 + \varepsilon)$ with $\varepsilon = 10^{-3}$, or $r < 3$ while moving inwards. The second condition is exact: for $r < 3$ the potential $(1 - 2/r)/r^2$ decreases inwards, so a photon moving inwards there has no turning point. It saves the many small steps near the horizon.
- Escape: $r > R_\text{esc}$ while moving outwards, with $R_\text{esc} = \max(100, 2D)$. The background is sampled along the velocity direction at that point. The remaining bending from $R_\text{esc}$ to infinity is perpendicular acceleration $\tfrac32 r_s h^3/r^5$ integrated outwards, which is $\tfrac38 r_s h^3/R_\text{esc}^4$ (for $h = 10$ and $R_\text{esc} = 100$: 7.5e-6 radians). `trace.spec.ts` checks the size of this tail against a run with $R_\text{esc} = 20000$.
- Step limit: a ray that uses 20000 steps (rays that wind around the photon sphere many times) counts as captured and is flagged.
- Lensing off: rays are straight lines in the same code path, the hole is an opaque sphere of radius $r_s$, and the capture test uses the exact segment-sphere distance, so a ray is captured exactly when its impact parameter is below $r_s(1 + \varepsilon)$.

### Corrections applied to the vector-form deflection

The deflection test starts and ends rays at the same large radius. The angle between the initial and final velocity misses the bending outside that radius, so the code adds $\tfrac38 r_s h^3/R^4$ for the start radius and for the radius where the integrator stopped.

### Single precision on the GPU

The WGSL tracer (`src/gpu/shaders`) runs the same algorithm in float32 with the same constants: step rule, capture margin, early capture below $r = 3$, escape radius, Hermite crossing. Three differences are worth knowing.

- The observer setup uses the radial speed $\cos\alpha$ directly. From section 6, the tangential speed is $\sin\alpha/\sqrt{1 - r_s/D}$ and $|x'|^2 = 1 + r_s h^2/D^3$, so the radial speed squared is $1 - \sin^2\alpha = \cos^2\alpha$. The float64 code evaluates the longer form and the two agree to rounding. In float32 the short form avoids subtracting two nearly equal numbers.
- The plane crossing uses 24 safeguarded Newton iterations and stops when the fraction changes by less than 1e-6.
- The tracer stops after 4096 steps and reports the ray as captured with a flag. The reference needs at most 496 steps on the parity set.

A float32 twin of the tracer on the CPU (`trace-float32.ts`, rounding every operation with `Math.fround`) separates algorithm error from precision error: it needs no GPU, and it follows the shader operation by operation.

The parity set (`parity-rays.ts`, seed 20261004) has 4096 rays from observers at $D = 10, 30, 60$ and inclinations from 5 to 88 degrees, with impact parameters from $0.5\,b_c$ to 40. It leaves out rays with $|b - b_c| < 0.02$, since float32 cannot be expected to agree with float64 where the outcome depends on the last digits of $b$, and rays with a plane crossing within 0.002 of the disk edges, where the hit test itself flips. The set holds 1064 captured, 1271 escaped and 1761 disk rays, 246 of them with two or more plane crossings and 104 that hit on a later crossing.

Measured on the SwiftShader adapter (`pnpm bench:parity`, `bench/results/gpu-parity-swiftshader.json`):

| Comparison | Outcomes equal | Direction, max (rad) | Hit radius, max relative | $\lambda$, max absolute |
| --- | --- | --- | --- | --- |
| GPU against float64 | 4096 of 4096 | 1.6e-4 | 1.4e-4 | 1.8e-5 |
| float32 twin against float64 | 4096 of 4096 | 1.7e-4 | 1.1e-4 | 1.7e-5 |
| GPU against float32 twin | 4096 of 4096 | 7.1e-5 | 7.0e-5 | 7.6e-6 |

The same run on the hardware adapters of the development laptop (Chrome 154 on Windows, `bench/results/gpu-parity-ampere.json` and `gpu-parity-gen-12lp.json`, produced by `bench/windows/bundle-parity.mjs` and `bench/gpu-parity.ts`), GPU against float64:

| Adapter | Outcomes equal | Direction, max (rad) | Hit radius, max relative | $\lambda$, max absolute |
| --- | --- | --- | --- | --- |
| RTX 3070 Ti Laptop (`ampere`) | 4096 of 4096 | 1.5e-04 | 8.1e-05 | 1.9e-05 |
| Intel Iris Xe (`gen-12lp`) | 4096 of 4096 | 1.6e-04 | 1.5e-04 | 1.5e-05 |

Both pass the same tolerances, and the 128 by 128 image again has the same outcome in all 16384 pixels.

The tolerances are 1e-3 for each. The twin explains the GPU error: both sit near the same distance from the float64 answer, so the error is the cost of float32 and not a bug in the port. The 128 by 128 image at the default view has the same outcome in all 16384 pixels, and the disk radiance differs from the CPU by 8.0e-5 on average (largest 2.2e-3, on pixels next to the inner edge where the temperature tends to zero).

## 13. Disk crossings and higher-order images

A crossing is a sign change of $y$ between two steps. Inside the step the position is a cubic Hermite interpolant of the end states and their velocities, and the root of $y(s) = 0$ comes from a safeguarded Newton iteration (`locatePlaneCrossing`). The radius at the root decides whether the ray hit the annulus. The location error against a run with steps 1000 times smaller is below 1e-6 (tested on four rays that hit the disk). One crossing per step is assumed; a ray that crosses and recrosses inside a single step of length $0.03\,r$ would be missed, and none shows up in the tests.

The disk is opaque. A ray that crosses the plane outside the annulus continues, and the first crossing inside the annulus ends it. Rays that wind around the hole cross the plane again, which produces the secondary images. At 80 degrees inclination the 96 by 96 test view contains rays with two and three crossings and rays that miss on the first crossing and hit on the second. With "higher-order images" off only the first crossing counts, and those rays end in the background or the hole.

Tests: `trace.spec.ts` (location error, annulus bounds, multi-crossing rays, late hits that disappear when higher orders are off).

## 14. From temperature to display color

The disk emits a blackbody spectrum at the temperature the observer sees, $T_\text{obs} = gT$ (section 11). Turning that into a pixel takes four steps.

Spectrum. Planck's law in wavelength form,

$$B_\lambda(T) = \frac{2hc^2}{\lambda^5}\,\frac{1}{e^{c_2/\lambda T} - 1},\qquad c_2 = \frac{hc}{k}.$$

$c_2$ is computed from the CODATA 2022 constants, which are exact, and is not typed in as a rounded number. Tests: `planck.spec.ts` (the constant against the exact SI value, the spectral peak within 1.5 nm of the Wien displacement law, monotonic growth with temperature, the $T^4$ scaling of the bolometric flux).

Colour matching. The tristimulus values are

$$X = \int B_\lambda\,\bar x(\lambda)\,d\lambda,\quad Y = \int B_\lambda\,\bar y(\lambda)\,d\lambda,\quad Z = \int B_\lambda\,\bar z(\lambda)\,d\lambda,$$

summed at 1 nm steps from 360 to 830 nm. The matching functions come from the multi-lobe piecewise Gaussian fit of Wyman, Sloan and Shirley (2013), because the official CIE table is licensed CC BY-SA (ADR 3). Each function is a sum of lobes $a\,\exp(-\tfrac12 (s(\lambda - \mu))^2)$ with a different slope $s$ on each side of the center $\mu$. Against the CIE 1931 table the largest absolute difference in any function is 0.022 where $\bar y$ peaks at 1. The chromaticity $(x, y)$ of a blackbody at 2000, 3000, 4000, 5000, 6500 and 10000 K agrees with the Planckian locus within 3e-3, and at 1500 K within 6e-3 (`color/planck.spec.ts`). The fit approximates the measured observer, and an error of this size is invisible in the rendered image.

Linear sRGB. The CSS Color 4 matrix takes XYZ to linear sRGB with the D65 white point,

$$\begin{pmatrix}R\\G\\B\end{pmatrix} = \begin{pmatrix}3.2409699 & -1.5373832 & -0.4986108\\ -0.9692436 & 1.8759675 & 0.0415551\\ 0.0556301 & -0.2039770 & 1.0569715\end{pmatrix}\begin{pmatrix}X\\Y\\Z\end{pmatrix}.$$

Cool blackbodies fall outside the sRGB gamut (negative blue). The color is scaled to unit luminance, the negative channels are clipped to zero and the result is rescaled to unit luminance again (`clipToGamutAtUnitLuminance`), so a clipped color keeps its brightness and only loses saturation.

Lookup table. Integrating at every pixel is too slow, so a 1024 entry table holds the unit-luminance color at temperatures spaced logarithmically from 1000 K to 100000 K. Lookup interpolates linearly in $\ln T$. On the GPU the table is an `rgba16float` texture sampled with a linear sampler (the CPU packs it with a round-half-even float16 encoder that is tested on every finite bit pattern). The GPU values agree with the CPU function within 4.3e-4 relative. Temperatures outside the range clamp, which matters only for the glowing edge of the disk where $T \to 0$ and the radiance below goes to zero anyway.

Radiance scale. The picture is scaled bolometrically: radiance is the table color times $(T_\text{obs}/6500\,\text{K})^4$, so a 6500 K surface has luminance 1 and $gT$ enters through its fourth power, which is the $g^4$ scaling. A camera that integrates only the visible band would see a flatter dependence for hot gas, because most of the energy of a 30000 K blackbody is in the ultraviolet. The choice and its consequence are in ADR 12.

Tone mapping. Scene radiance is linear and unbounded. Display encoding multiplies by $2^{\text{EV}}$, applies the ACES filmic fit of Stephen Hill (input matrix, the rational curve $\dfrac{v(v + 0.0245786) - 0.000090537}{v(0.983729\,v + 0.4329510) + 0.238081}$, output matrix, clamp to $[0, 1]$) and the sRGB transfer function,

$$E = \begin{cases}12.92\,L & L \le 0.0031308\\ 1.055\,L^{1/2.4} - 0.055 & \text{otherwise.}\end{cases}$$

The fit compresses hot, very bright regions toward white. A disk peaking at 9000 K with exposure 0 is therefore nearly white across its width, and the defaults (6500 K at -1.5 EV, ADR 15) were chosen so the gradient and the beamed side remain visible. Test: `tonemap.spec.ts`, and the GPU kernel against the CPU on 200 random inputs, largest difference 2.9e-7.

Accumulation and bloom. Each frame is traced with a sub-pixel offset from the R2 sequence, $(\{0.5 + n\,\alpha_1\} - 0.5,\ \{0.5 + n\,\alpha_2\} - 0.5)$ with $\alpha_1 = 0.75488$ and $\alpha_2 = 0.56984$, and blended into the history with weight $1/(n+1)$, which is the running mean. Bloom is a 13-tap downsample chain with a luminance-weighted first level and a tent upsample, added to the resolved image at a small strength before tone mapping. Bloom is an artistic effect, so the radiance returned by the capture path is taken before it.

## 15. The background

The sky has two parts, both procedural and both written once in TypeScript and once in WGSL.

Hash. A 32-bit PCG output function, chained over three integer coordinates and a seed. On the CPU `Math.imul` gives the same wraparound multiplication as `u32` in WGSL, and the GPU output is bit-exact against the CPU on 500 random inputs. A float in $[0, 1)$ takes the top 24 bits, $(h \gg 8)/2^{24}$, which float32 represents exactly.

Stars. A star is a Gaussian spot in the direction of the escaped ray, of angular width $\sigma = 7\times10^{-4}$ rad, with the radiance of a blackbody at its temperature. Cells are a $96\times96$ grid on each cube face (about 14300 stars in total). A cell holds a star with probability $0.5\,(1 + u^2 + v^2)^{-3/2}$, which cancels the cube projection's solid-angle distortion, so the density on the sphere is uniform (checked by counting stars in caps). Peak brightness follows a Pareto law, $P(>s) = (s_0/s)^{1.25}$ (peak $= s_0\,(1-u)^{-0.8}$ for a uniform $u$, i.e. flux exponent $-0.8$) with $s_0 = 0.06$ and a cap of 6. Temperature is log-uniform between 2600 K and 18000 K. The test against a brute-force sum over all stars confirms that the 3 by 3 cell search misses nothing, including across cube edges.

Why per ray. Gravitational lensing maps one sky direction to several image positions and stretches each. Evaluating the star profile at the final direction of every ray reproduces both: a point-like star near the photon ring turns into an arc after accumulation, and a star behind the hole appears as a second image. Baked into a cubemap, stars would blur when magnified.

Nebula. Radiance is the sum of a diffuse band (a Gaussian in the angle from a fixed galactic plane) and clouds from three fractional Brownian motion fields: one warps the coordinates, one gives the density through a smoothstep, one mixes a warm and a cool tint. Value noise on an integer lattice with smooth interpolation, five octaves, lacunarity 2.02 and gain 0.5. The result is baked once into a $512^2$ cube. The GPU bake matches the CPU function at texel centers within 1.6e-2 relative on the smallest values (float16 storage) and the face orientation is verified by that same comparison, since a wrong axis convention would put the pattern on the wrong face.

Tests: `hash.spec.ts`, `noise.spec.ts`, `cube-faces.spec.ts`, `nebula.spec.ts`, `stars.spec.ts` on the CPU, and `e2e/color-pipeline.spec.ts` for the GPU against the CPU.

## 16. Overlays

Three overlays mark the radii that matter in the picture. They are drawn as thin lines, and each has its own line style so that color is never the only signal: the photon sphere is dotted, the ISCO is dashed, the shadow edge is solid.

Photon sphere, $r = 3M$. A ray crosses the sphere when $|x|$ passes through 3. The tracer tests every step for an inward crossing of $r = 3$, interpolates the crossing point along the step, and marks the pixel if that point lies within about one pixel of one of three orthogonal great circles (the planes $x = 0$, $y = 0$, $z = 0$ of the black hole frame), with a dotted pattern along the circle. The band width is $0.9$ pixel of world size at the observer distance divided by the sine of the angle between the ray and the circle's axis, so the line keeps a constant screen width where the ray grazes the sphere. Only the inward crossing is tested. A ray that leaves again would otherwise draw every circle twice.

ISCO, $r = 6M$. The ring lies in the disk plane. The tracer checks the plane crossings it already computes for the disk and marks the pixel when the crossing radius is within the same pixel-wide band of $r = 6$, with a dashed pattern along the angle. The ring is therefore visible through the disk, behind the hole and in the lensed secondary image, because it is found where light actually crosses the plane.

Shadow edge. This one is analytic and is drawn in the present pass. For the static observer at distance $D$, the critical ray leaves the camera at the angle $\alpha_c$ from section 7. The pinhole camera places a ray at angle $\alpha$ at the tangent-plane radius $\tan\alpha$, so the circle has the radius

$$\rho = \tan\alpha_c = \tan\arcsin\!\left(\frac{b_c}{D}\sqrt{1 - \frac{r_s}{D}}\right)$$

in the same units as the vertical half extent $\tan(\mathrm{fov}/2)$ of the image plane. The present pass converts the distance of a pixel from the image center to that unit and draws a line where it equals $\rho$, antialiased over about one pixel. Using $\tan\alpha_c$ and not $\alpha_c$ keeps the circle exact at wide fields of view.

The overlay masks are accumulated the same way as the radiance, in a separate texture pair, so the dotted and dashed lines are antialiased by the sub-pixel jitter. They are composited after tone mapping so exposure does not change them.

Tests: `shadow-overlay.spec.ts` (the radius $\rho$ against the radius of the captured region in the CPU reference image, within 1 percent for $D = 30$ and $50$), `shadow.spec.ts` (the formula), and `e2e/interactive.spec.ts` (the drawn circle on the GPU against both $\rho$ and the captured area, within 1 percent).

## References

- Bardeen, J. M. (1973). Timelike and null geodesics in the Kerr metric. In *Black Holes* (Les Houches 1972), DeWitt and DeWitt (eds.), Gordon and Breach.
- Bardeen, J. M., Press, W. H. and Teukolsky, S. A. (1972). Rotating black holes: locally nonrotating frames, energy extraction, and scalar synchrotron radiation. *Astrophysical Journal* 178, 347.
- Darwin, C. (1959). The gravity field of a particle. *Proceedings of the Royal Society A* 249, 180.
- Dormand, J. R. and Prince, P. J. (1980). A family of embedded Runge-Kutta formulae. *Journal of Computational and Applied Mathematics* 6, 19.
- Hill, S. ACES fit in `ACES.hlsl`, BakingLab (MIT), commit 0f66f50.
- James, O., von Tunzelmann, E., Franklin, P. and Thorne, K. S. (2015). Gravitational lensing by spinning black holes in astrophysics, and in the movie Interstellar. *Classical and Quantum Gravity* 32, 065001.
- Jarzynski, M. and Olano, M. (2020). Hash functions for GPU rendering. *Journal of Computer Graphics Techniques* 9(3), 21.
- Jimenez, J. (2014). Next generation post processing in Call of Duty: Advanced Warfare. SIGGRAPH 2014 Advances in Real-Time Rendering course.
- Keeton, C. R. and Petters, A. O. (2005). Formalism for testing theories of gravity using lensing by compact objects. I. Static, spherically symmetric black holes. *Physical Review D* 72, 104006.
- Luminet, J.-P. (1979). Image of a spherical black hole with thin accretion disk. *Astronomy and Astrophysics* 75, 228.
- Misner, C. W., Thorne, K. S. and Wheeler, J. A. (1973). *Gravitation*. W. H. Freeman.
- Page, D. N. and Thorne, K. S. (1974). Disk-accretion onto a black hole. *Astrophysical Journal* 191, 499.
- Roberts, M. (2018). The unreasonable effectiveness of quasirandom sequences. extremelearning.com.au.
- Rybicki, G. B. and Lightman, A. P. (1979). *Radiative Processes in Astrophysics*. Wiley.
- Shakura, N. I. and Sunyaev, R. A. (1973). Black holes in binary systems. Observational appearance. *Astronomy and Astrophysics* 24, 337.
- W3C (2022). CSS Color Module Level 4, section on sRGB and the XYZ conversion matrices.
- Wyman, C., Sloan, P.-P. and Shirley, P. (2013). Simple analytic approximations to the CIE XYZ color matching functions. *Journal of Computer Graphics Techniques* 2(2), 1.
