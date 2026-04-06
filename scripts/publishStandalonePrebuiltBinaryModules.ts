import path from "path";
import {fileURLToPath} from "url";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import fs from "fs-extra";
import {$, cd} from "zx";
import envVar from "env-var";

const env = envVar.from(process.env);
const GH_RELEASE_REF = env.get("GH_RELEASE_REF")
    .required()
    .asString();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.join(__dirname, "..", "packages");
const packageScope = "@realtimex";
const subPackagesDirectory = path.join(packageDirectory, packageScope);
const skippedPackages = new Set([
    "node-llama-cpp-linux-x64-cuda-ext",
    "node-llama-cpp-win-x64-cuda-ext"
]);
const allowSkippedPackages = env.get("ALLOW_SKIPPED_PACKAGES")
    .default("false")
    .asBoolStrict();
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
        if (a.endsWith("-ext"))
            return -1;
        else if (b.endsWith("-ext"))
            return 1;

        return a.localeCompare(b);
    });

for (const packageName of packageNames) {
    if (
        selectedPackages.size > 0 &&
        !selectedPackages.has(packageName) &&
        !selectedPackages.has(`${packageScope}/${packageName}`)
    ) {
        console.info(`Skipping "${packageScope}/${packageName}" because it is not in STANDALONE_PACKAGES`);
        continue;
    }

    if (!allowSkippedPackages && skippedPackages.has(packageName)) {
        console.info(`Skipping "${packageScope}/${packageName}" because the tarball exceeds npm's publish size limit`);
        continue;
    }

    const packagePath = path.join(subPackagesDirectory, packageName);
    const packagePackageJsonPath = path.join(packagePath, "package.json");

    if ((await fs.stat(packagePath)).isFile())
        continue;

    const packageJson = await fs.readJson(packagePackageJsonPath);
    packageJson.version = packageVersion;
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
