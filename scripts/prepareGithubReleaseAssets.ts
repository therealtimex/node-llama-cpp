import path from "path";
import {fileURLToPath} from "url";
import fs from "fs-extra";
import {getPrebuiltBinariesGithubReleaseAssets} from "../src/bindings/utils/prebuiltBinariesGithubReleaseAssets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binsDirectory = path.join(__dirname, "..", "bins");
const releaseAssetsDirectory = path.join(__dirname, "..", ".release-assets");

await fs.emptyDir(releaseAssetsDirectory);

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
