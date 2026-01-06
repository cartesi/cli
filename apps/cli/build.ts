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
                outfile: `dist/cartesi-${target.replace("bun-", "")}`,
                target,
            },
            entrypoints: ["./src/index.ts"],
            target: "bun",
        }),
    ),
);

export {};
