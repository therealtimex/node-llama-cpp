import {execFileSync} from "child_process";
import path from "path";
import {fileURLToPath} from "url";
import fs from "fs-extra";
import {getPrebuiltBinariesGithubReleaseAssets} from "../src/bindings/utils/prebuiltBinariesGithubReleaseAssets.js";
import {
    getLlamaServerGithubReleaseAssetFileName,
    getLlamaServerGithubReleaseAssetFileNameForBuildMetadata,
    getLlamaServerGithubReleaseAssets
} from "../src/bindings/utils/llamaServerGithubReleaseAssets.js";
import {buildMetadataFileName, llamaCppDirectoryInfoFilePath} from "../src/config.js";
import {type BuildMetadataFile} from "../src/bindings/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binsDirectory = path.join(__dirname, "..", "bins");
const llamaServerRuntimeBinsDirectory = path.join(__dirname, "..", "llama-server-runtime-bins");
const releaseAssetsDirectory = path.join(__dirname, "..", ".release-assets");
const requireAllLlamaServerReleaseAssets = process.env.REQUIRE_ALL_LLAMA_SERVER_RELEASE_ASSETS === "true";
const preparedLlamaServerAssetFileNames = new Set<string>();

await fs.emptyDir(releaseAssetsDirectory);

function createZipArchive(sourceDirectory: string, targetPath: string) {
    if (process.platform === "win32") {
        execFileSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Compress-Archive -Path (Join-Path $PWD '*') -DestinationPath $args[0] -Force",
                targetPath
            ],
            {
                cwd: sourceDirectory,
                stdio: "ignore"
            }
        );
        return;
    }

    execFileSync("zip", ["-r", targetPath, "."], {
        cwd: sourceDirectory,
        stdio: "ignore"
    });
}

for (const asset of getPrebuiltBinariesGithubReleaseAssets()) {
    const sourcePath = path.join(binsDirectory, asset.folderName, "fallback", asset.fallbackBinaryName);
    const targetPath = path.join(releaseAssetsDirectory, asset.assetFileName);

    if (!(await fs.pathExists(sourcePath))) {
        console.info(`Skipping release asset "${asset.assetFileName}" because "${sourcePath}" does not exist`);
        continue;
    }

    await fs.copyFile(sourcePath, targetPath);
    console.info(`Prepared release asset "${asset.assetFileName}"`);
}

for (const runtimeBinsDirectory of [llamaServerRuntimeBinsDirectory, binsDirectory]) {
    if (!(await fs.pathExists(runtimeBinsDirectory)))
        continue;

    for (const folderName of await fs.readdir(runtimeBinsDirectory)) {
        const folderPath = path.join(runtimeBinsDirectory, folderName);
        if (!(await fs.pathExists(folderPath)) || !(await fs.stat(folderPath)).isDirectory())
            continue;

        const buildMetadataPath = path.join(folderPath, buildMetadataFileName);
        if (!(await fs.pathExists(buildMetadataPath)))
            continue;

        const buildMetadata = await fs.readJson(buildMetadataPath) as BuildMetadataFile;
        const assetFileName = getLlamaServerGithubReleaseAssetFileNameForBuildMetadata(buildMetadata.buildOptions);
        if (assetFileName == null)
            continue;

        const hasLlamaServer = (await fs.readdir(folderPath)).some((fileName) => (
            fileName === "llama-server" ||
            fileName === "llama-server.exe"
        ));
        if (!hasLlamaServer) {
            console.info(`Skipping release asset "${assetFileName}" because "${folderPath}" does not contain llama-server`);
            continue;
        }

        const targetPath = path.join(releaseAssetsDirectory, assetFileName);
        await fs.remove(targetPath);
        createZipArchive(folderPath, targetPath);
        preparedLlamaServerAssetFileNames.add(assetFileName);
        console.info(`Prepared release asset "${assetFileName}"`);
    }
}

if (requireAllLlamaServerReleaseAssets) {
    const llamaCppInfo = await fs.readJson(llamaCppDirectoryInfoFilePath).catch(() => null) as {tag?: string} | null;
    const llamaCppRelease = llamaCppInfo?.tag;
    if (llamaCppRelease == null || llamaCppRelease === "")
        throw new Error(`Could not validate llama-server release assets because "${llamaCppDirectoryInfoFilePath}" does not contain a llama.cpp tag`);

    const expectedLlamaServerAssetFileNames = getLlamaServerGithubReleaseAssets()
        .map((asset) => getLlamaServerGithubReleaseAssetFileName(llamaCppRelease, {
            platform: asset.platform,
            arch: asset.arch,
            gpu: asset.gpu
        }))
        .filter((assetFileName): assetFileName is string => assetFileName != null);
    const missingLlamaServerAssetFileNames = expectedLlamaServerAssetFileNames
        .filter((assetFileName) => !preparedLlamaServerAssetFileNames.has(assetFileName));

    if (missingLlamaServerAssetFileNames.length > 0)
        throw new Error(
            "Missing managed llama-server release assets: " +
            missingLlamaServerAssetFileNames.join(", ")
        );

    console.info(`Validated ${expectedLlamaServerAssetFileNames.length} managed llama-server release assets`);
}
