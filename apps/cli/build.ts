// build for npm package
await Bun.build({
    entrypoints: ["./src/index.ts"],
    target: "node",
    outdir: "dist",
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
            compile: {
                outfile: `bin/cartesi-${target.replace("bun-", "")}`,
                target,
            },
            entrypoints: ["./src/index.ts"],
            target: "bun",
        }),
    ),
);

export {};
