# 4. Vitest for unit tests, Playwright for everything in a browser

Status: accepted

## Context

The default rules say Jest for unit tests unless the current Angular CLI default is clearly the better fit, and Cypress for end-to-end tests unless the brief says otherwise.

Angular 22 ships `@angular/build:unit-test` with Vitest as the runner. The brief itself names Playwright for screenshots and for the demo recording, and several tests here need things Cypress makes awkward: launching Chromium with WebGPU flags, running a compute pipeline and reading buffers back inside the page, and comparing rendered frames.

## Decision

- Unit and component tests: Vitest 5 through the Angular builder, with `@vitest/coverage-v8` and jsdom for component tests. The pure physics and color code runs in the same runner, with no DOM involved.
- End-to-end, GPU parity and visual regression: Playwright Test 1.63 with its pinned Chromium (153) in headless mode, started with the SwiftShader WebGPU flags documented in `PLAN.md`. The same tool records the fallback video and the demo GIF frames.
- No Jest and no Cypress.

## Alternatives

- Jest with `jest-preset-angular`. A well-trodden path, but it adds a second transform pipeline next to the Angular builder and does nothing for ES modules and workers that Vitest does not.
- Cypress for e2e. It can pass Chrome launch flags, but running a page-side GPU readback loop and keeping one tool for e2e, parity and recording is simpler in Playwright.

## Consequences

- One runner for the math tests and the component tests, started with `ng test`, and one browser tool for everything else.
- Visual regression is pinned to the Chromium that the lockfile resolves, which is what makes SwiftShader output comparable between this machine and CI.
- `@axe-core/playwright` is not used (MPL-2.0). Accessibility is measured with Lighthouse (Apache-2.0), which bundles axe itself.
