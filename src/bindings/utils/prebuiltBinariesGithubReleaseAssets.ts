import path from "path";
import fs from "fs-extra";
import {cliHomedirDirectory} from "../../config.js";
import {getConsoleLogPrefix} from "../../utils/getConsoleLogPrefix.js";
import {getModuleVersion} from "../../utils/getModuleVersion.js";
import {BuildGpu} from "../types.js";
import {BinaryPlatform} from "./getPlatform.js";

const builtinPrebuiltBinariesGitHubRepo = "therealtimex/node-llama-cpp";
const prebuiltBinariesGithubReleaseAssetsCacheDirectory = path.join(cliHomedirDirectory, "githubReleaseAssets");

type PrebuiltBinariesGithubReleaseAsset = {
    platform: BinaryPlatform,
    arch: typeof process.arch,
    gpu: BuildGpu,
    folderName: string,
    fallbackBinaryName: string,
    assetFileName: string
};

const prebuiltBinariesGithubReleaseAssets: readonly PrebuiltBinariesGithubReleaseAsset[] = Object.freeze([
    {
        platform: "linux",
        arch: "x64",
        gpu: "cuda",
        folderName: "linux-x64-cuda",
        fallbackBinaryName: "libggml-cuda.so",
        assetFileName: "linux-x64-cuda-ext-libggml-cuda.so"
    },
    {
        platform: "win",
        arch: "x64",
        gpu: "cuda",
        folderName: "win-x64-cuda",
        fallbackBinaryName: "ggml-cuda.dll",
        assetFileName: "win-x64-cuda-ext-ggml-cuda.dll"
    }
] as const);

export function getPrebuiltBinariesGithubReleaseAssets() {
    return [...prebuiltBinariesGithubReleaseAssets];
}

export function getPrebuiltBinariesGithubReleaseAssetForBuildOptions(buildOptions: {
    platform: BinaryPlatform,
    arch: typeof process.arch,
    gpu: BuildGpu
}) {
    return prebuiltBinariesGithubReleaseAssets.find((asset) => (
        asset.platform === buildOptions.platform &&
        asset.arch === buildOptions.arch &&
        asset.gpu === buildOptions.gpu
    )) ?? null;
}

export function getPrebuiltBinariesGithubReleaseTag(packageVersion: string) {
    return `realtimex-v${packageVersion}`;
}

export function getPrebuiltBinariesGithubReleaseAssetDownloadUrl(packageVersion: string, assetFileName: string) {
    const releaseTag = getPrebuiltBinariesGithubReleaseTag(packageVersion);

    return (
        `https://github.com/${builtinPrebuiltBinariesGitHubRepo}/releases/download/` +
        `${encodeURIComponent(releaseTag)}/${encodeURIComponent(assetFileName)}`
    );
}

export async function ensurePrebuiltBinariesGithubReleaseAssetForBuildOptions(buildOptions: {
    platform: BinaryPlatform,
    arch: typeof process.arch,
    gpu: BuildGpu,
    progressLogs?: boolean
}) {
    const asset = getPrebuiltBinariesGithubReleaseAssetForBuildOptions(buildOptions);
    if (asset == null)
        return null;

    const packageVersion = await getModuleVersion();
    const extBinsDir = path.join(prebuiltBinariesGithubReleaseAssetsCacheDirectory, packageVersion);
    const fallbackBinaryPath = path.join(extBinsDir, asset.folderName, "fallback", asset.fallbackBinaryName);

    if (await fs.pathExists(fallbackBinaryPath))
        return extBinsDir;

    const downloadUrl = getPrebuiltBinariesGithubReleaseAssetDownloadUrl(packageVersion, asset.assetFileName);
    const tempFallbackBinaryPath = fallbackBinaryPath + `.${process.pid}.download`;

    if (buildOptions.progressLogs === true)
        console.info(getConsoleLogPrefix() + `Downloading CUDA fallback backend from "${downloadUrl}"`);

    try {
        await fs.ensureDir(path.dirname(fallbackBinaryPath));
        await fs.remove(tempFallbackBinaryPath);

        const res = await fetch(downloadUrl);
        if (!res.ok)
            return null;

        const assetContents = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(tempFallbackBinaryPath, assetContents);
        await fs.move(tempFallbackBinaryPath, fallbackBinaryPath, {overwrite: true});

        return extBinsDir;
    } catch (err) {
        if (buildOptions.progressLogs === true)
            console.warn(getConsoleLogPrefix() + `Failed to download CUDA fallback backend "${asset.assetFileName}"`, err);

        return null;
    } finally {
        await fs.remove(tempFallbackBinaryPath);
    }
}
