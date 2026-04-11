import {describe, expect, test} from "vitest";
import {
    getLlamaServerGithubReleaseAssetDownloadUrl,
    getLlamaServerGithubReleaseAssetFileName,
    getLlamaServerGithubReleaseAssetFileNameForBuildMetadata,
    getLlamaServerGithubReleaseAssetForBuildOptions,
    getLlamaServerGithubReleaseTag
} from "../../src/bindings/utils/llamaServerGithubReleaseAssets.js";

describe("llamaServerGithubReleaseAssets", () => {
    test("resolves the macOS arm64 metal runtime asset", () => {
        expect(getLlamaServerGithubReleaseAssetForBuildOptions({
            platform: "mac",
            arch: "arm64",
            gpu: "metal"
        }))
            .toEqual({
                platform: "mac",
                arch: "arm64",
                gpu: "metal",
                runtimePlatform: "darwin",
                runtimeArch: "arm64"
            });
    });

    test("does not resolve non-primary GPU variants", () => {
        expect(getLlamaServerGithubReleaseAssetForBuildOptions({
            platform: "linux",
            arch: "x64",
            gpu: "cuda"
        }))
            .toBeNull();
    });

    test("maps 32-bit ARM runtime lookups to the armv7l asset filename", () => {
        expect(getLlamaServerGithubReleaseAssetForBuildOptions({
            platform: "linux",
            arch: "arm",
            gpu: false
        }))
            .toEqual({
                platform: "linux",
                arch: "arm",
                gpu: false,
                runtimePlatform: "linux",
                runtimeArch: "armv7l"
            });
    });

    test("builds the canonical runtime asset file name", () => {
        expect(getLlamaServerGithubReleaseAssetFileName("b8762", {
            platform: "mac",
            arch: "arm64",
            gpu: "metal"
        }))
            .toBe("llama-server-darwin-arm64-b8762.zip");
    });

    test("builds the canonical runtime asset file name from build metadata", () => {
        expect(getLlamaServerGithubReleaseAssetFileNameForBuildMetadata({
            platform: "win",
            arch: "x64",
            gpu: false,
            llamaCpp: {
                repo: "ggml-org/llama.cpp",
                release: "b8762"
            }
        }))
            .toBe("llama-server-win32-x64-b8762.zip");
    });

    test("builds the GitHub release asset download URL", () => {
        expect(getLlamaServerGithubReleaseTag("0.2.1"))
            .toBe("realtimex-v0.2.1");
        expect(getLlamaServerGithubReleaseAssetDownloadUrl("0.2.1", "llama-server-darwin-arm64-b8762.zip"))
            .toBe(
                "https://github.com/therealtimex/node-llama-cpp/releases/download/" +
                "realtimex-v0.2.1/llama-server-darwin-arm64-b8762.zip"
            );
    });
});
