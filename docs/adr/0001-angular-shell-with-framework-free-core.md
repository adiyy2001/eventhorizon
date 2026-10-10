# 1. Angular shell around a framework-free core

Status: accepted

## Context

The project needs an Angular control panel, and Angular is the framework I use every day, so the interface is an Angular application. The rest of the project has different needs. The CPU reference integrator has to run in Node for the tests, in a Web Worker for the no-WebGPU fallback and in the bench scripts. The WebGPU code has to be testable without a component tree. Neither of them should know that Angular exists.

## Decision

One Angular CLI project (Angular 22, standalone components, signals, zoneless, OnPush, built-in control flow) with three layers that only depend downwards:

- `src/core`: pure TypeScript, no DOM, no Angular. Physics, color, procedural background, settings schema, CPU tracing.
- `src/gpu`: WebGPU resources, passes and the WGSL sources. Imports `core`, never Angular.
- `src/app`: the Angular shell. Imports `gpu` and `core`.
- `src/workers`: Web Worker entry points. Import `core` only.

The direction is enforced twice. `tsconfig.core.json` compiles `src/core` with `lib: ["ES2023"]` and no DOM types, so a stray `window` or `document` fails the type check. ESLint `no-restricted-imports` overrides per directory reject imports that point up the stack.

There is no Nx workspace. The repo has one deployable and four directories, and the lint rules above give the same boundary protection without the extra tooling.

## Alternatives

- Vanilla TypeScript with Vite. Lighter, but the panel, the URL state and the keyboard handling are exactly where Angular's signals earn their keep, and the project is meant to show the stack I work in.
- Nx monorepo with `core` and `gpu` as libraries. Module boundaries come for free, at the price of a heavier setup, slower CI and a repo layout that is mostly configuration for a single application.

## Consequences

- The Angular runtime adds about 60 kB transferred to the first load (measured on a blank Angular 22 zoneless build: 217 kB raw, 59.5 kB transferred). Acceptable for a demo that downloads a shader pipeline anyway.
- Angular 22.2.1 was released on 2026-09-30. If a blocking defect shows up, the fallback is Angular 21.2.x on TypeScript 5.9, recorded here if it ever happens.
- Physics code stays reusable and testable at the cost of one extra mapping layer between settings signals and renderer parameters.
