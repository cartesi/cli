// build for npm package
await Bun.build({
    entrypoints: ["./src/index.ts"],
    minify: true,
    outdir: "dist",
    sourcemap: true,
    target: "node",
});

// build bun binaries for all supported platforms
const targets: Bun.Build.Target[] = [
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
            minify: true,
            sourcemap: "linked",
            target: "bun",
        }),
    ),
);

export {};
