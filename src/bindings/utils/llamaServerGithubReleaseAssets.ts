import {type BuildGpu, type BuildOptionsJSON} from "../types.js";
import {BinaryPlatform} from "./getPlatform.js";
import {
    getPrebuiltBinariesGithubReleaseAssetDownloadUrl,
    getPrebuiltBinariesGithubReleaseTag
} from "./prebuiltBinariesGithubReleaseAssets.js";

export type LlamaServerRuntimeGithubReleaseAsset = {
    platform: BinaryPlatform,
    arch: string,
    gpu: BuildGpu,
    runtimePlatform: NodeJS.Platform,
    runtimeArch: string
};

const llamaServerRuntimeGithubReleaseAssets: readonly LlamaServerRuntimeGithubReleaseAsset[] = Object.freeze([
    {
        platform: "mac",
        arch: "arm64",
        gpu: "metal",
        runtimePlatform: "darwin",
        runtimeArch: "arm64"
    },
    {
        platform: "mac",
        arch: "x64",
        gpu: false,
        runtimePlatform: "darwin",
        runtimeArch: "x64"
    },
    {
        platform: "linux",
        arch: "x64",
        gpu: false,
        runtimePlatform: "linux",
        runtimeArch: "x64"
    },
    {
        platform: "linux",
        arch: "arm64",
        gpu: false,
        runtimePlatform: "linux",
        runtimeArch: "arm64"
    },
    {
        platform: "linux",
        arch: "armv7l",
        gpu: false,
        runtimePlatform: "linux",
        runtimeArch: "armv7l"
    },
    {
        platform: "win",
        arch: "x64",
        gpu: false,
        runtimePlatform: "win32",
        runtimeArch: "x64"
    },
    {
        platform: "win",
        arch: "arm64",
        gpu: false,
        runtimePlatform: "win32",
        runtimeArch: "arm64"
    }
] as const);

export function getLlamaServerGithubReleaseAssets() {
    return [...llamaServerRuntimeGithubReleaseAssets];
}

export function getLlamaServerGithubReleaseAssetForBuildOptions(buildOptions: {
    platform: BinaryPlatform,
    arch: string,
    gpu: BuildGpu
}) {
    return llamaServerRuntimeGithubReleaseAssets.find((asset) => (
        asset.platform === buildOptions.platform &&
        asset.arch === buildOptions.arch &&
        asset.gpu === buildOptions.gpu
    )) ?? null;
}

export function getLlamaServerGithubReleaseAssetFileName(
    release: string,
    buildOptions: {
        platform: BinaryPlatform,
        arch: string,
        gpu: BuildGpu
    }
) {
    const asset = getLlamaServerGithubReleaseAssetForBuildOptions(buildOptions);
    if (asset == null)
        return null;

    return `llama-server-${asset.runtimePlatform}-${asset.runtimeArch}-${release}.zip`;
}

export function getLlamaServerGithubReleaseAssetFileNameForBuildMetadata(
    buildOptions: Pick<BuildOptionsJSON, "platform" | "arch" | "gpu" | "llamaCpp">
) {
    return getLlamaServerGithubReleaseAssetFileName(buildOptions.llamaCpp.release, {
        platform: buildOptions.platform,
        arch: buildOptions.arch,
        gpu: buildOptions.gpu
    });
}

export function getLlamaServerGithubReleaseAssetDownloadUrl(packageVersion: string, assetFileName: string) {
    return getPrebuiltBinariesGithubReleaseAssetDownloadUrl(packageVersion, assetFileName);
}

export {getPrebuiltBinariesGithubReleaseTag as getLlamaServerGithubReleaseTag};
