// jiti transpiles TypeScript configuration files on node versions that cannot
// import them directly, and lazily requires its own transform at runtime, so it
// must be resolved from node_modules instead of being bundled
const external = ["jiti"];

// build for npm package: the CLI entrypoint (executable) and the library entrypoint
await Bun.build({
    banner: "#!/usr/bin/env node",
    entrypoints: ["./src/index.ts"],
    external,
    minify: true,
    outdir: "dist",
    sourcemap: true,
    target: "node",
});

await Bun.build({
    entrypoints: ["./src/lib.ts", "./src/defineConfig.ts"],
    external,
    minify: true,
    outdir: "dist",
    sourcemap: true,
    target: "node",
});

// build bun binaries for all supported platforms
const targets: Bun.Build.CompileTarget[] = [
    "bun-darwin-arm64",
    "bun-darwin-x64",
    "bun-linux-arm64",
    "bun-linux-x64",
];

await Promise.all(
    targets.map((target) =>
        Bun.build({
            bytecode: true,
            compile: {
                outfile: `bin/cartesi-${target.replace("bun-", "")}`,
                target,
            },
            entrypoints: ["./src/index.ts"],
            // the bun runtime imports TypeScript configuration files on its
            // own, so the jiti fallback is never reached in these binaries
            external,
            minify: true,
            sourcemap: "linked",
            target: "bun",
        }),
    ),
);

export {};
