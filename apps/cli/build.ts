// Bun inlines process.env.NODE_ENV in the bundle, as "development" when it isn't set.
// Default to production so errors print only their message, as in src/index.ts;
// build with NODE_ENV=development to get the full error with its stack.
const define = {
    "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV ?? "production",
    ),
};

// the postgres binaries of the environment come in a package per platform,
// which can't be bundled: they are found at runtime, in node_modules, and are
// not there for the standalone binaries, which use the postgres of the host
const postgres = [
    "@embedded-postgres/darwin-arm64",
    "@embedded-postgres/darwin-x64",
    "@embedded-postgres/linux-arm64",
    "@embedded-postgres/linux-x64",
];

// build for npm package: the CLI entrypoint (executable) and the library entrypoint
await Bun.build({
    banner: "#!/usr/bin/env node",
    define,
    entrypoints: ["./src/index.ts"],
    external: postgres,
    minify: true,
    outdir: "dist",
    sourcemap: true,
    target: "node",
});

// the library loads its dependencies from node_modules instead of bundling its
// own copies, so a consumer shares them: an error thrown from viem is an
// instance of the consumer's viem classes, and viem isn't shipped twice. Keep
// in sync with the dependencies of package.json. The CLI and the binaries stay
// self-contained
const external = [
    ...["execa", "semver", "smol-toml", "viem"].flatMap((name) => [
        name,
        `${name}/*`,
    ]),
    ...postgres,
];

await Bun.build({
    define,
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
            define,
            entrypoints: ["./src/index.ts"],
            external: postgres,
            minify: true,
            sourcemap: "linked",
            target: "bun",
        }),
    ),
);

export {};
