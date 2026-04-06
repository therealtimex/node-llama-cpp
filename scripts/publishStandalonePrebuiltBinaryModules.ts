import path from "path";
import {fileURLToPath} from "url";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import fs from "fs-extra";
import {$, cd} from "zx";
import envVar from "env-var";
import {standaloneCudaExtChunkManifestFileName} from "./utils/standaloneCudaExtChunking.js";

const env = envVar.from(process.env);
const GH_RELEASE_REF = env.get("GH_RELEASE_REF")
    .required()
    .asString();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.join(__dirname, "..", "packages");
const packageScope = "@realtimex";
const subPackagesDirectory = path.join(packageDirectory, packageScope);
const selectedPackages = new Set(
    env.get("STANDALONE_PACKAGES")
        .default("")
        .asString()
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
);
const standaloneDistTag = env.get("STANDALONE_DIST_TAG")
    .default("")
    .asString()
    .trim();

const argv = await yargs(hideBin(process.argv))
    .option("packageVersion", {
        type: "string",
        demandOption: true
    })
    .argv;

const {packageVersion} = argv;
if (packageVersion === "")
    throw new Error("packageVersion is empty");

const packageNames = (await fs.readdir(subPackagesDirectory))
    .sort((a, b) => {
        const aIsChunk = a.includes("-cuda-ext-chunk-");
        const bIsChunk = b.includes("-cuda-ext-chunk-");

        if (aIsChunk && !bIsChunk)
            return -1;
        else if (!aIsChunk && bIsChunk)
            return 1;

        const aIsExt = a.endsWith("-ext");
        const bIsExt = b.endsWith("-ext");

        if (aIsExt && !bIsExt)
            return 1;
        else if (!aIsExt && bIsExt)
            return -1;

        return a.localeCompare(b);
    });

for (const packageName of packageNames) {
    if (!matchesSelectedPackageName(packageName)) {
        console.info(`Skipping "${packageScope}/${packageName}" because it is not in STANDALONE_PACKAGES`);
        continue;
    }

    const packagePath = path.join(subPackagesDirectory, packageName);
    const packagePackageJsonPath = path.join(packagePath, "package.json");

    if ((await fs.stat(packagePath)).isFile())
        continue;

    const packageJson = await fs.readJson(packagePackageJsonPath);
    packageJson.version = packageVersion;

    const chunkManifestPath = path.join(packagePath, standaloneCudaExtChunkManifestFileName);
    if (await fs.pathExists(chunkManifestPath)) {
        const chunkManifest = await fs.readJson(chunkManifestPath);
        packageJson.dependencies = Object.fromEntries(
            (chunkManifest.chunks ?? []).map((chunk: {packageName: string}) => [chunk.packageName, packageVersion])
        );
    }

    await fs.writeJson(packagePackageJsonPath, packageJson, {spaces: 2});
    console.info(`Updated "${packageScope}/${packageName}/package.json" to version "${packageVersion}"`);

    $.verbose = true;
    cd(packagePath);

    const distTag = standaloneDistTag !== ""
        ? standaloneDistTag
        : GH_RELEASE_REF === "refs/heads/beta"
            ? "beta"
            : null;

    if (distTag != null) {
        console.info(`Publishing "${packageScope}/${packageName}@${packageVersion}" to "${distTag}" tag`);
        await $`npm publish --access public --tag ${distTag}`;
    } else {
        console.info(`Publishing "${packageScope}/${packageName}@${packageVersion}"`);
        await $`npm publish --access public`;
    }
}

function matchesSelectedPackageName(packageName: string) {
    if (selectedPackages.size === 0)
        return true;

    if (selectedPackages.has(packageName) || selectedPackages.has(`${packageScope}/${packageName}`))
        return true;

    for (const selectedPackage of selectedPackages) {
        const unscopedSelectedPackage = selectedPackage.replace(/^@realtimex\//, "");
        if (
            packageName.startsWith(unscopedSelectedPackage + "-chunk-") ||
            `${packageScope}/${packageName}`.startsWith(selectedPackage + "-chunk-")
        )
            return true;
    }

    return false;
}
