import {execFileSync} from "child_process";
import path from "path";
import {fileURLToPath} from "url";
import fs from "fs-extra";
import {getPrebuiltBinariesGithubReleaseAssets} from "../src/bindings/utils/prebuiltBinariesGithubReleaseAssets.js";
import {getLlamaServerGithubReleaseAssetFileNameForBuildMetadata} from "../src/bindings/utils/llamaServerGithubReleaseAssets.js";
import {buildMetadataFileName} from "../src/config.js";
import {type BuildMetadataFile} from "../src/bindings/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binsDirectory = path.join(__dirname, "..", "bins");
const releaseAssetsDirectory = path.join(__dirname, "..", ".release-assets");

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

for (const folderName of await fs.readdir(binsDirectory)) {
    const folderPath = path.join(binsDirectory, folderName);
    if (!(await fs.pathExists(folderPath)) || !(await fs.stat(folderPath)).isDirectory())
        continue;

    const buildMetadataPath = path.join(folderPath, buildMetadataFileName);
    if (!(await fs.pathExists(buildMetadataPath)))
        continue;

    const buildMetadata = await fs.readJson(buildMetadataPath) as BuildMetadataFile;
    const assetFileName = getLlamaServerGithubReleaseAssetFileNameForBuildMetadata(buildMetadata.buildOptions);
    if (assetFileName == null)
        continue;

    const targetPath = path.join(releaseAssetsDirectory, assetFileName);
    await fs.remove(targetPath);

    const hasLlamaServer = (await fs.readdir(folderPath)).some((fileName) => (
        fileName === "llama-server" ||
        fileName === "llama-server.exe"
    ));
    if (!hasLlamaServer) {
        console.info(`Skipping release asset "${assetFileName}" because "${folderPath}" does not contain llama-server`);
        continue;
    }

    createZipArchive(folderPath, targetPath);
    console.info(`Prepared release asset "${assetFileName}"`);
}
