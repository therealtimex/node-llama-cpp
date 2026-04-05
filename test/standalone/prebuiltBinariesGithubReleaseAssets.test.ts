import {describe, expect, test} from "vitest";
import {
    getPrebuiltBinariesGithubReleaseAssetDownloadUrl,
    getPrebuiltBinariesGithubReleaseAssetForBuildOptions,
    getPrebuiltBinariesGithubReleaseTag
} from "../../src/bindings/utils/prebuiltBinariesGithubReleaseAssets.js";

describe("prebuiltBinariesGithubReleaseAssets", () => {
    test("resolves the linux CUDA fallback asset", () => {
        expect(getPrebuiltBinariesGithubReleaseAssetForBuildOptions({
            platform: "linux",
            arch: "x64",
            gpu: "cuda"
        }))
            .toEqual({
                platform: "linux",
                arch: "x64",
                gpu: "cuda",
                folderName: "linux-x64-cuda",
                fallbackBinaryName: "libggml-cuda.so",
                assetFileName: "linux-x64-cuda-ext-libggml-cuda.so"
            });
    });

    test("resolves the Windows CUDA fallback asset", () => {
        expect(getPrebuiltBinariesGithubReleaseAssetForBuildOptions({
            platform: "win",
            arch: "x64",
            gpu: "cuda"
        }))
            .toEqual({
                platform: "win",
                arch: "x64",
                gpu: "cuda",
                folderName: "win-x64-cuda",
                fallbackBinaryName: "ggml-cuda.dll",
                assetFileName: "win-x64-cuda-ext-ggml-cuda.dll"
            });
    });

    test("does not resolve a non-CUDA build", () => {
        expect(getPrebuiltBinariesGithubReleaseAssetForBuildOptions({
            platform: "mac",
            arch: "arm64",
            gpu: "metal"
        }))
            .toBeNull();
    });

    test("builds the GitHub release asset download URL", () => {
        expect(getPrebuiltBinariesGithubReleaseTag("0.2.1"))
            .toBe("realtimex-v0.2.1");
        expect(getPrebuiltBinariesGithubReleaseAssetDownloadUrl("0.2.1", "linux-x64-cuda-ext-libggml-cuda.so"))
            .toBe(
                "https://github.com/therealtimex/node-llama-cpp/releases/download/" +
                "realtimex-v0.2.1/linux-x64-cuda-ext-libggml-cuda.so"
            );
    });
});
