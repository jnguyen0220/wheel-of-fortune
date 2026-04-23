# Dev Container: Next.js + Rust

This dev container provides a ready-to-code environment for building a Next.js frontend and Rust backend (or Rust-based tooling like Wasm) in one workspace.

## Features

- Node.js 20 (TypeScript-ready) via `mcr.microsoft.com/devcontainers/typescript-node`
- Rust stable toolchain with `rustfmt` and `clippy`
- Helpful tools: `cargo-watch`, `wasm-pack`
- Ports forwarded: 3000 (Next.js), 8000 (Rust)
- VS Code extensions preinstalled: ESLint, Prettier, Rust Analyzer, TOML support, Crates, Docker

## Usage

1. Install the "Dev Containers" extension in VS Code.
2. Open this folder, then run: "Dev Containers: Reopen in Container".
3. Inside the container:
   - Next.js: `npm run dev` (or `pnpm dev` / `yarn dev`) — served on port 3000.
   - Rust: `cargo run` — expose your server on port 8000 if needed.

## Notes

- Corepack is enabled; you can use `pnpm` or `yarn` if you prefer.
- The container caches Cargo and npm directories for faster builds.
- Telemetry is disabled for Next.js via `NEXT_TELEMETRY_DISABLED=1`.
