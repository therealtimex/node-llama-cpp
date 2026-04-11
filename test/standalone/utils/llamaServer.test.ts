import path from "path";
import fs from "fs-extra";
import {describe, expect, test} from "vitest";
import {
    ensureLlamaServerBinary,
    getLlamaServerBuildEnvironment,
    resolveLlamaServerBinaryPath,
    llamaServerRequiredCmakeOptions
} from "../../../src/utils/llamaServer.js";
import {getTempTestDir} from "../../utils/helpers/getTempTestDir.js";

describe("utils", () => {
    describe("llamaServer", () => {
        test("getLlamaServerBuildEnvironment defaults to latest release and server build flags", () => {
            const buildEnv = getLlamaServerBuildEnvironment({
                env: {}
            });

            expect(buildEnv.NODE_LLAMA_CPP_REPO_RELEASE).toBe("latest");
            expect(buildEnv.NODE_LLAMA_CPP_REPO).toBeDefined();
            expect(buildEnv.NODE_LLAMA_CPP_GPU).toBeDefined();

            for (const [optionKey, optionValue] of Object.entries(llamaServerRequiredCmakeOptions))
                expect(buildEnv[`NODE_LLAMA_CPP_CMAKE_OPTION_${optionKey}`]).toBe(optionValue);
        });

        test("resolveLlamaServerBinaryPath prefers a matching server-enabled build", async () => {
            const tempDir = await fs.mkdtemp(path.join(await getTempTestDir(), "llama-server-"));
            const staleBinaryPath = path.join(tempDir, "stale", "Release", "llama-server");
            const compatibleBinaryPath = path.join(tempDir, "compatible", "Release", "llama-server");

            await fs.outputFile(staleBinaryPath, "");
            await fs.writeJson(path.join(tempDir, "stale", "Release", "_nlcBuildMetadata.json"), {
                buildOptions: {
                    gpu: "metal",
                    llamaCpp: {
                        repo: "ggml-org/llama.cpp",
                        release: "b1000"
                    },
                    customCmakeOptions: {
                        LLAMA_BUILD_SERVER: "OFF"
                    }
                }
            });

            await fs.outputFile(compatibleBinaryPath, "");
            await fs.writeJson(path.join(tempDir, "compatible", "Release", "_nlcBuildMetadata.json"), {
                buildOptions: {
                    gpu: "metal",
                    llamaCpp: {
                        repo: "ggml-org/llama.cpp",
                        release: "b9999"
                    },
                    customCmakeOptions: Object.fromEntries(Object.entries(llamaServerRequiredCmakeOptions))
                }
            });

            await expect(resolveLlamaServerBinaryPath({
                repo: "ggml-org/llama.cpp",
                release: "latest",
                gpu: "metal",
                searchRoots: [tempDir]
            })).resolves.toBe(compatibleBinaryPath);
        });

        test("ensureLlamaServerBinary triggers a build when no binary exists", async () => {
            let buildInvocations = 0;

            await expect(ensureLlamaServerBinary({
                resolveBinaryPath: async () => (
                    buildInvocations === 0
                        ? null
                        : "/tmp/llama-server"
                ),
                buildBinary: async () => {
                    buildInvocations++;
                }
            })).resolves.toBe("/tmp/llama-server");

            expect(buildInvocations).toBe(1);
        });
    });
});
