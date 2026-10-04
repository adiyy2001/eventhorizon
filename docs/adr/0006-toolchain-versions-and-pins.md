# 6. Toolchain versions and pins

Status: accepted

## Context

The brief says to use the latest stable version of everything it names and to check it on the official registry. On 2026-10-04 that check produced two surprises.

- TypeScript's `latest` tag on npm is 7.0.2 (the native compiler). Angular 22.2.1 declares `typescript: >=6.0 <6.1` as a peer of both `@angular/build` and `@angular/compiler-cli`.
- `@angular/build` 22.2.1 requires Node `^22.22.3 || ^24.15.0 || >=26`. The default Node on this machine is 24.13.0, which does not satisfy it. Version 24.21.0 is installed next to it.

## Decision

- Node 24 LTS, at least 24.15 (`engines` and `.nvmrc`). On this machine: `export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH`. CI uses `node-version: 24`.
- TypeScript 6.0.3, because the Angular compiler will not accept 7.0.2. TypeScript 6 also turns `strict` on by default; the tsconfig sets it explicitly anyway, together with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noImplicitOverride`.
- Angular 22.2.1 with `@ngrx/signals` 22.0.1 for the settings store.
- pnpm 11.5.3, the version installed here, recorded in `packageManager`. The npm registry already has pnpm 12.9.1; moving to it is a one-line change once the machine is upgraded, and nothing in the repo depends on the difference.
- pnpm 11 refuses to run dependency build scripts until they are approved. `pnpm-workspace.yaml` carries an `allowBuilds` map with `esbuild` and `@parcel/watcher` set to true and `lmdb` and `msgpackr-extract` set to false. The Angular build works with that set (checked on a throwaway app).
- Versions are written as caret ranges in `package.json` and frozen by `pnpm-lock.yaml`. CI installs with `--frozen-lockfile`.

The full table of checked versions, with sources, is in `PLAN.md`.

## Alternatives

- Angular 21.2.25 on TypeScript 5.9. Supported on Node 24.13, but it is the previous major.
- TypeScript 7 for the framework-free packages and 6 for Angular. Two compilers would double the type check work for a small gain in speed.

## Consequences

- The Node requirement is stricter than the default on the machine. Every agent and the README have to say so.
- TypeScript 7 is not used. It can be tried later as an extra type check over `src/core` only, since that code has no Angular dependency.
