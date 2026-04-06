import path from "path";
import {fileURLToPath} from "url";
import fs from "fs-extra";
import {standaloneCudaExtChunkManifestFileName} from "./utils/standaloneCudaExtChunking.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageLockPath = path.join(__dirname, "..", "package-lock.json");
const standalonePackagesDirectory = path.join(__dirname, "..", "packages", "@realtimex");
const repositoryUrl = "git+https://github.com/therealtimex/node-llama-cpp.git";
const issuesUrl = "https://github.com/therealtimex/node-llama-cpp/issues";

const packageJson = await fs.readJson(packageJsonPath);
const versionArgIndex = process.argv.indexOf("--version");
const currentVersion = versionArgIndex >= 0
    ? process.argv[versionArgIndex + 1]
    : packageJson.version;

if (typeof currentVersion !== "string" || currentVersion.length === 0)
    throw new Error("A non-empty version is required");

packageJson.version = currentVersion;
packageJson.publishConfig ??= {};
packageJson.publishConfig.access = "public";
packageJson.repository = {
    type: "git",
    url: repositoryUrl
};
packageJson.bugs = {url: issuesUrl};

if (packageJson.optionalDependencies != null) {
    for (const packageName of Object.keys(packageJson.optionalDependencies)) {
        if (!packageName.startsWith("@realtimex/"))
            continue;

        console.info(`Updating optional dependency "${packageName}" to version "${currentVersion}"`);
        packageJson.optionalDependencies[packageName] = currentVersion;
    }
}

await fs.writeJson(packageJsonPath, packageJson, {spaces: 2});

if (await fs.pathExists(packageLockPath)) {
    const packageLock = await fs.readJson(packageLockPath);

    packageLock.name = packageJson.name;
    packageLock.version = currentVersion;

    if (packageLock.packages?.[""] != null) {
        packageLock.packages[""].name = packageJson.name;
        packageLock.packages[""].version = currentVersion;
        packageLock.packages[""].optionalDependencies = packageJson.optionalDependencies;
    }

    for (const packageName of Object.keys(packageLock.packages ?? {})) {
        if (!packageName.startsWith("node_modules/@node-llama-cpp/"))
            continue;

        delete packageLock.packages[packageName];
    }

    for (const packageName of Object.keys(packageLock.packages ?? {})) {
        if (!packageName.startsWith("node_modules/@realtimex/node-llama-cpp-"))
            continue;

        delete packageLock.packages[packageName];
    }

    for (const packageName of Object.keys(packageJson.optionalDependencies ?? {})) {
        packageLock.packages ??= {};
        packageLock.packages[`node_modules/${packageName}`] = {
            version: currentVersion,
            optional: true
        };
    }

    await fs.writeJson(packageLockPath, packageLock, {spaces: 2});
}

if (await fs.pathExists(standalonePackagesDirectory)) {
    for (const packageDirectoryName of await fs.readdir(standalonePackagesDirectory)) {
        const packageDirectoryPath = path.join(standalonePackagesDirectory, packageDirectoryName);
        if ((await fs.stat(packageDirectoryPath)).isFile())
            continue;

        const standalonePackageJsonPath = path.join(packageDirectoryPath, "package.json");
        const standalonePackageLockPath = path.join(packageDirectoryPath, "package-lock.json");

        if (!(await fs.pathExists(standalonePackageJsonPath)))
            continue;

        const standalonePackageJson = await fs.readJson(standalonePackageJsonPath);

        standalonePackageJson.version = currentVersion;
        standalonePackageJson.publishConfig ??= {};
        standalonePackageJson.publishConfig.access = "public";
        standalonePackageJson.repository = {
            type: "git",
            url: repositoryUrl
        };
        standalonePackageJson.bugs = {url: issuesUrl};

        const chunkManifestPath = path.join(packageDirectoryPath, standaloneCudaExtChunkManifestFileName);
        if (await fs.pathExists(chunkManifestPath)) {
            const chunkManifest = await fs.readJson(chunkManifestPath);
            standalonePackageJson.dependencies = Object.fromEntries(
                (chunkManifest.chunks ?? []).map((chunk: {packageName: string}) => [chunk.packageName, currentVersion])
            );
        }

        await fs.writeJson(standalonePackageJsonPath, standalonePackageJson, {spaces: 2});

        if (!(await fs.pathExists(standalonePackageLockPath)))
            continue;

        const standalonePackageLock = await fs.readJson(standalonePackageLockPath);
        standalonePackageLock.name = standalonePackageJson.name;
        standalonePackageLock.version = currentVersion;

        if (standalonePackageLock.packages?.[""] != null) {
            standalonePackageLock.packages[""].name = standalonePackageJson.name;
            standalonePackageLock.packages[""].version = currentVersion;
        }

        await fs.writeJson(standalonePackageLockPath, standalonePackageLock, {spaces: 2});
    }
}
