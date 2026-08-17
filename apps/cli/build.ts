// the emulator binding resolves its platform binary at runtime, so it can never
// be bundled: it is left as an import, resolved from node_modules
const external = ["@cartesi/machine"];

// build for npm package
await Bun.build({
    banner: "#!/usr/bin/env node",
    entrypoints: ["./src/index.ts"],
    external,
    minify: true,
    outdir: "dist",
    sourcemap: true,
    target: "node",
});

// NOTE: the standalone binaries this used to cross-compile (bin/cartesi-*)
// are gone. A single file executable has no node_modules, and the emulator
// binding resolves its platform specific .node at runtime, so it cannot be
// embedded — not even for the host platform. The npm package is the only
// distribution now, and the homebrew formula has to install it from there.

export {};
