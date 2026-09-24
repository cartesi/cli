import { rollupsContracts } from "@cartesi/wagmi-plugin";
import { defineConfig } from "@wagmi/cli";

// rollups-node #798 moved ROLLUPS_PRT_CONTRACTS_VERSION to dave 3.0.0-alpha.5,
// but @cartesi/wagmi-plugin@1.0.0-alpha.6 still defaults to alpha.4. Point the
// prt option at the alpha.5 release explicitly until a plugin release ships
// with that default, then drop this object and go back to `prt: true`.
// The rollups-contracts side keeps the plugin default (3.0.0-alpha.10), which
// is what #798 pins; the plugin fails generation if the two releases disagree
// on an address they both publish.
const DAVE = "https://github.com/cartesi/dave/releases/download/v3.0.0-alpha.5";

export default defineConfig({
    out: "src/contracts.ts",
    plugins: [
        rollupsContracts({
            prt: {
                artifacts: {
                    url: `${DAVE}/cartesi-rollups-prt-3.0.0-alpha.5-contract-artifacts.tar.gz`,
                    sha256: "10673f0d8cf83988e172b1b4baebb9c74a0dda0d6b3f77c89950638b63dae4ee",
                },
                deployments: {
                    url: `${DAVE}/cartesi-rollups-prt-3.0.0-alpha.5-deployment-addresses.tar.gz`,
                    sha256: "435c11b8d6c6cfe864e4a3eb5c311ea02492cb976db757394f7da7084af90efa",
                },
                anvil: {
                    url: `${DAVE}/cartesi-rollups-prt-3.0.0-alpha.5-anvil-1.5.1.tar.gz`,
                    sha256: "7e6b6a402b5e384fd6aa56387726cf4cc08783b6350b1c16a71a2e6ff454e583",
                },
            },
        }),
    ],
});
