import path from "path";
import {fileURLToPath} from "url";
import fs from "fs-extra";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import envVar from "env-var";
import {createHash} from "node:crypto";
import {
    getAllStandaloneCudaExtChunkPackageDirectoryNames,
    getStandaloneCudaExtChunkPackageDirectoryName,
    getStandaloneCudaExtChunkPackageName,
    matchesSelectedStandalonePackage,
    maxStandaloneCudaExtChunks,
    standaloneCudaExtChunkManifestFileName,
    standaloneCudaExtChunkPackageConfigs,
    standaloneCudaExtChunkSizeBytes,
    type StandaloneCudaExtChunkPackageConfig
} from "./utils/standaloneCudaExtChunking.js";

type ChunkManifest = {
    version: 1,
    folderName: string,
    fallbackBinaryName: string,
    finalSize: number,
    sha256: string,
    chunks: {
        packageName: string,
        fileName: string,
        size: number,
        sha256: string
    }[]
};

const env = envVar.from(process.env);
const selectedPackages = new Set(
    env.get("STANDALONE_PACKAGES")
        .default("")
        .asString()
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDirectory = path.join(__dirname, "..", "packages", "@realtimex");

const argv = await yargs(hideBin(process.argv))
    .option("packageVersion", {
        type: "string",
        demandOption: true
    })
    .strict()
    .parse();

const {packageVersion} = argv;

if (packageVersion.length === 0)
    throw new Error("packageVersion is empty");

for (const config of standaloneCudaExtChunkPackageConfigs) {
    for (const packageDirectoryName of getAllStandaloneCudaExtChunkPackageDirectoryNames(config))
        await fs.remove(path.join(packagesDirectory, packageDirectoryName));
}

for (const config of standaloneCudaExtChunkPackageConfigs) {
    if (!matchesSelectedStandalonePackage(selectedPackages, config.packageDirectoryName, config.extPackageName)) {
        console.info(`Skipping "${config.extPackageName}" because it is not in STANDALONE_PACKAGES`);
        continue;
    }

    await prepareStandaloneCudaExtChunkPackages(config, packageVersion);
}

async function prepareStandaloneCudaExtChunkPackages(
    config: StandaloneCudaExtChunkPackageConfig,
    packageVersion: string
) {
    const extPackagePath = path.join(packagesDirectory, config.packageDirectoryName);
    const extPackageJsonPath = path.join(extPackagePath, "package.json");
    const fallbackBinaryPath = path.join(extPackagePath, "bins", config.folderName, "fallback", config.fallbackBinaryName);
    const chunkManifestPath = path.join(extPackagePath, standaloneCudaExtChunkManifestFileName);

    if (!(await fs.pathExists(fallbackBinaryPath))) {
        console.warn(`Skipping "${config.extPackageName}" because "${fallbackBinaryPath}" does not exist`);
        await fs.remove(chunkManifestPath);
        return;
    }

    const extPackageJson = await fs.readJson(extPackageJsonPath);
    const fallbackBinaryContents = await fs.readFile(fallbackBinaryPath);
    const finalSha256 = createHash("sha256")
        .update(fallbackBinaryContents)
        .digest("hex");

    const chunks: ChunkManifest["chunks"] = [];

    for (let startIndex = 0; startIndex < fallbackBinaryContents.length; startIndex += standaloneCudaExtChunkSizeBytes) {
        const chunkIndex = chunks.length;
        if (chunkIndex >= maxStandaloneCudaExtChunks) {
            throw new Error(
                `"${config.extPackageName}" requires more than ${maxStandaloneCudaExtChunks} chunk packages; ` +
                "increase maxStandaloneCudaExtChunks before releasing"
            );
        }

        const chunkContents = fallbackBinaryContents.subarray(startIndex, Math.min(
            fallbackBinaryContents.length,
            startIndex + standaloneCudaExtChunkSizeBytes
        ));
        const chunkPackageName = getStandaloneCudaExtChunkPackageName(config, chunkIndex);
        const chunkPackageDirectoryName = getStandaloneCudaExtChunkPackageDirectoryName(config, chunkIndex);
        const chunkPackagePath = path.join(packagesDirectory, chunkPackageDirectoryName);
        const chunkFileName = `${config.folderName}.part-${String(chunkIndex + 1).padStart(2, "0")}.bin`;
        const chunkFilePath = path.join(chunkPackagePath, "chunks", chunkFileName);

        await fs.ensureDir(path.dirname(chunkFilePath));
        await fs.writeFile(chunkFilePath, chunkContents);
        await writeStandaloneCudaExtChunkPackageFiles({
            config,
            packageVersion,
            chunkIndex,
            totalChunkCount: Math.ceil(fallbackBinaryContents.length / standaloneCudaExtChunkSizeBytes),
            chunkPackageName,
            chunkPackagePath
        });

        chunks.push({
            packageName: chunkPackageName,
            fileName: chunkFileName,
            size: chunkContents.length,
            sha256: createHash("sha256")
                .update(chunkContents)
                .digest("hex")
        });
    }

    extPackageJson.version = packageVersion;
    extPackageJson.dependencies = Object.fromEntries(
        chunks.map((chunk) => [chunk.packageName, packageVersion])
    );
    await fs.writeJson(extPackageJsonPath, extPackageJson, {spaces: 2});

    await fs.writeJson(chunkManifestPath, {
        version: 1,
        folderName: config.folderName,
        fallbackBinaryName: config.fallbackBinaryName,
        finalSize: fallbackBinaryContents.length,
        sha256: finalSha256,
        chunks
    } satisfies ChunkManifest, {spaces: 2});

    await fs.remove(path.join(extPackagePath, "bins"));

    console.info(
        `Prepared "${config.extPackageName}" as ${chunks.length} chunk packages ` +
        `(${fallbackBinaryContents.length} bytes total)`
    );
}

async function writeStandaloneCudaExtChunkPackageFiles(details: {
    config: StandaloneCudaExtChunkPackageConfig,
    packageVersion: string,
    chunkIndex: number,
    totalChunkCount: number,
    chunkPackageName: string,
    chunkPackagePath: string
}) {
    const {
        config,
        packageVersion,
        chunkIndex,
        totalChunkCount,
        chunkPackageName,
        chunkPackagePath
    } = details;

    const packageJson = {
        name: chunkPackageName,
        version: packageVersion,
        description: `${config.description} (${chunkIndex + 1}/${totalChunkCount})`,
        type: "module",
        files: [
            "chunks/",
            "package.json",
            "README.md",
            "LICENSE"
        ],
        engines: {
            node: ">=20.0.0"
        },
        os: config.os,
        cpu: config.cpu,
        ...(config.libc != null ? {libc: config.libc} : {}),
        repository: {
            type: "git",
            url: "git+https://github.com/therealtimex/node-llama-cpp.git"
        },
        author: "Gilad S.",
        license: "MIT",
        preferUnplugged: true,
        bugs: {
            url: "https://github.com/therealtimex/node-llama-cpp/issues"
        },
        homepage: "https://node-llama-cpp.withcat.ai",
        publishConfig: {
            access: "public"
        }
    };

    await fs.writeJson(path.join(chunkPackagePath, "package.json"), packageJson, {spaces: 2});
    await fs.writeFile(
        path.join(chunkPackagePath, "README.md"),
        [
            `# ${chunkPackageName}`,
            "",
            "Internal chunk package used to assemble the large CUDA fallback backend for `@realtimex/node-llama-cpp`.",
            "It is not meant to be installed directly."
        ].join("\n"),
        "utf8"
    );
    await fs.copyFile(path.join(packagesDirectory, config.packageDirectoryName, "LICENSE"), path.join(chunkPackagePath, "LICENSE"));
}
