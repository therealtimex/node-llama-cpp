import path from "path";
import {fileURLToPath} from "url";
import fs from "fs-extra";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import {
    getPrebuiltBinariesGithubReleaseAssets
} from "../src/bindings/utils/prebuiltBinariesGithubReleaseAssets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binsDirectory = path.join(__dirname, "..", "bins");
const githubRepo = "therealtimex/node-llama-cpp";

const argv = await yargs(hideBin(process.argv))
    .option("releaseTag", {
        type: "string",
        demandOption: true
    })
    .strict()
    .parse();

const {releaseTag} = argv;

if (releaseTag.length === 0)
    throw new Error("releaseTag is empty");

for (const asset of getPrebuiltBinariesGithubReleaseAssets()) {
    const downloadUrl = (
        `https://github.com/${githubRepo}/releases/download/` +
        `${encodeURIComponent(releaseTag)}/${encodeURIComponent(asset.assetFileName)}`
    );
    const targetPath = path.join(binsDirectory, asset.folderName, "fallback", asset.fallbackBinaryName);
    const tempTargetPath = targetPath + `.${process.pid}.download`;

    console.info(`Downloading "${asset.assetFileName}" from "${downloadUrl}"`);

    await fs.ensureDir(path.dirname(targetPath));
    await fs.remove(tempTargetPath);

    const res = await fetch(downloadUrl);
    if (!res.ok)
        throw new Error(`Failed to download "${asset.assetFileName}" from "${downloadUrl}" (${res.status} ${res.statusText})`);

    await fs.writeFile(tempTargetPath, Buffer.from(await res.arrayBuffer()));
    await fs.move(tempTargetPath, targetPath, {overwrite: true});
    console.info(`Saved "${asset.assetFileName}" to "${targetPath}"`);
}
