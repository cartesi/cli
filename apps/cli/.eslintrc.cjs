module.exports = {
    root: true,
    extends: [
        "@cartesi/eslint-config/library.js",
        "plugin:@typescript-eslint/recommended",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: [
            "./tsconfig.build.json",
            "./tsconfig.eslint.json",
            "./tsconfig.json",
        ],
        tsconfigRootDir: __dirname,
    },
};
