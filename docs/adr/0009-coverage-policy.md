# 9. Coverage policy

Status: accepted

## Context

The definition of done asks for 90 percent line coverage of the core logic (domain, math, algorithms) and 80 percent of everything else. Code that talks to a GPU device cannot run in a jsdom unit test, and a coverage number gained from mocks of the WebGPU API would measure the mocks.

## Decision

- `src/core/**`: 90 percent of lines, enforced per directory by the Vitest thresholds.
- `src/app/**` and the unit-testable parts of `src/gpu/**`: 80 percent of lines.
- Files whose only job is to call WebGPU entry points (device acquisition, pipeline and bind group creation, the render loop) are listed in an explicit exclude list in the Vitest config. Everything decidable without a device lives in separate pure modules that are counted: uniform buffer packing, the dynamic resolution controller, accumulation state, resolution and mip chain sizing, shader module composition, settings validation, URL encoding.
- The excluded files are covered by Playwright against the production build, and the GPU against CPU parity run exercises the tracer shader itself.
- The exclude list is short, lives in one place, and a test fails if a file outside it imports `GPUDevice` types, so the list cannot grow quietly.

## Alternatives

- Mock the WebGPU API in unit tests and count everything. Reaches the number and tests very little.
- Lower the threshold for all of `src/gpu`. Hides the pure modules behind the device code.

## Consequences

The coverage report measures logic only. The README says in one line which files are excluded and why, and points at the parity and e2e results for the rest.

## Amendment from the first milestone

Device acquisition turned out to be testable with a fake `navigator.gpu`, so `src/gpu/device.ts` is counted and not excluded. The exclude list (`gpuDeviceBoundFiles` in `vitest.config.ts`) starts with `src/gpu/smoke-kernel.ts` only. The boundary check lives in `scripts/check-style.ts` and runs as part of `pnpm check:style`: a source file that calls a WebGPU entry point (`createShaderModule`, `createBuffer`, `requestAdapter`, `getContext('webgpu')` and similar) must be on the exclude list, with `src/gpu/device.ts` as the one named exception.

## Amendment from the fallback renderer

`src/workers/**` joins the thresholds at 90 percent of lines. The message protocol and the tile handler are pure and counted. The worker entry `src/workers/cpu-render.worker.ts` only wires `message` events to the handler, needs a worker global scope that jsdom does not provide, and is listed in `workerGlueFiles` in the Vitest config. The adapter-less Playwright project runs the real worker in Chromium and covers it. Test support under `src/**/testing/**`, such as the loopback worker pool, is not counted.
