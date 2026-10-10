# 14. Interface state, address and accessibility decisions

Status: accepted

## Context

The interface needed decisions on where settings live, how they reach the address bar, how the keyboard and pointer share the camera, how the equations are rendered without hurting first load, and how the page meets the accessibility target.

## Decision

One store. `SettingsStore` is an NgRx SignalStore holding the validated `RenderSettings` from `core/render`. Every writer (sliders, keys, drag, wheel, reset) goes through the same sanitizing merge, so the viewport never sees an out-of-range value.

Address. The URL codec lives in `core/render/url-codec.ts`, free of Angular. It writes a versioned compact query (`v=1`, `inc`, `dist`, `ro`, `t`, `ev`, `bl`, `off` for disabled switches, `ov` for enabled overlays, `sp` for the split position). Only values that differ from the defaults are written, so the default view has an empty address. Unknown keys are kept, malformed or out-of-range values fall back to the default for that key, and an unknown version gives the defaults. The app writes with `history.replaceState` after a 150 ms pause, so a drag does not fill the history.

Keyboard. A pure key map in `app/state/keyboard-map.ts`. Arrows orbit and tilt, plus and minus or PageUp and PageDown change distance, Home resets, `?` opens the help. Keys are ignored when focus is in an input, a slider or any element that handles keys itself, and when a modifier is held, so browser shortcuts keep working. Pointer drag, wheel and pinch go through a separate pure gesture module and end in the same store calls.

Equations. KaTeX is loaded with a dynamic `import()` the first time the physics tab opens, so the initial bundle stays at the application and the renderer. Options are `htmlAndMathml`, `throwOnError: true` and `trust: false`. The CSS and fonts come from the package and are bundled by the build. Each equation links to its derivation in `docs/physics.md`, and a script test fails when a link points at a missing section.

Accessibility. Every slider has a visible label and an `aria-valuetext` with its unit. Switches are real checkbox inputs with the switch role and a description. State changes go to a polite live region. The canvas is `role="img"` and its label is rebuilt from the settings. Focus rings are always visible and tab order follows the visual order. On phone width the panel is a bottom sheet with an explicit show and hide button. `prefers-reduced-motion` removes transitions.

Lighthouse. `pnpm lighthouse` serves the production build, runs the mobile and desktop profiles in the same headless Chrome and writes `bench/results/lighthouse.json` with the hardware. Accessibility is 1 on both. Performance and SEO are recorded as measured. The run uses the software adapter, so the performance number says nothing about real GPUs.

## Alternatives

- Router query parameters. The app has one page, and the router would add weight and its own navigation entries for every slider move.
- Writing the address on every change. Simple, but it floods the history API and flickers on slow devices.
- Bundling KaTeX in the main chunk. It is 268 kB raw and most visitors never open the physics tab.
- A custom range slider. Native `input type="range"` already gives keyboard handling and assistive technology support.

## Consequences

The address is stable and human readable for the default view, and an old link keeps working because the version is part of it. The first open of the physics tab waits for one lazy chunk.
