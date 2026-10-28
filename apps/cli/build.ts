// Bun inlines process.env.NODE_ENV in the bundle, as "development" when it isn't set.
// Default to production so errors print only their message, as in src/index.ts;
// build with NODE_ENV=development to get the full error with its stack.
const define = {
    "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV ?? "production",
    ),
};

// build for npm package
await Bun.build({
    banner: "#!/usr/bin/env node",
    define,
    entrypoints: ["./src/index.ts"],
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
            define,
            entrypoints: ["./src/index.ts"],
            minify: true,
            sourcemap: "linked",
            target: "bun",
        }),
    ),
);

export {};
