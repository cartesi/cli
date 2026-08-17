// native addons resolve their platform binary at runtime, so they can never be
// bundled: they are left as imports, resolved from node_modules
const external = ["@cartesi/machine", "@deroll/genext2fs"];

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
// are gone. A single file executable has no node_modules, and the emulator and
// ext2 bindings resolve their platform specific .node at runtime, so they
// cannot be embedded — not even for the host platform. The npm package is the
// only distribution now, and the homebrew formula has to install it from there.

export {};
