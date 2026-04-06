import path from "path";
import {fileURLToPath} from "url";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";

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

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");
const binsDir = path.join(packageRoot, "bins");
const packageVersion: string = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")
).version;
const chunkManifestPath = path.join(packageRoot, "chunk-manifest.json");

export function getBinsDir() {
    ensureAssembledFallbackBinary();

    return {
        binsDir,
        packageVersion
    };
}

function ensureAssembledFallbackBinary() {
    const chunkManifest = readChunkManifest();
    if (chunkManifest == null)
        return;

    const fallbackBinaryPath = path.join(
        binsDir,
        chunkManifest.folderName,
        "fallback",
        chunkManifest.fallbackBinaryName
    );

    if (fs.existsSync(fallbackBinaryPath) && fs.statSync(fallbackBinaryPath).size === chunkManifest.finalSize)
        return;

    const tempFallbackBinaryPath = fallbackBinaryPath + `.${process.pid}.assemble`;
    const tempDir = path.dirname(tempFallbackBinaryPath);

    fs.mkdirSync(tempDir, {recursive: true});
    fs.rmSync(tempFallbackBinaryPath, {force: true});
    fs.rmSync(fallbackBinaryPath, {force: true});

    const outputFd = fs.openSync(tempFallbackBinaryPath, "w");
    const hash = createHash("sha256");
    let totalSize = 0;

    try {
        for (const chunk of chunkManifest.chunks) {
            const chunkPackageJsonPath = require.resolve(`${chunk.packageName}/package.json`);
            const chunkPackageRoot = path.dirname(chunkPackageJsonPath);
            const chunkFilePath = path.join(chunkPackageRoot, "chunks", chunk.fileName);
            const chunkContents = fs.readFileSync(chunkFilePath);

            if (chunkContents.byteLength !== chunk.size)
                throw new Error(`Chunk "${chunk.packageName}" has unexpected size`);

            const chunkSha256 = createHash("sha256")
                .update(chunkContents)
                .digest("hex");
            if (chunkSha256 !== chunk.sha256)
                throw new Error(`Chunk "${chunk.packageName}" has unexpected SHA-256`);

            fs.writeSync(outputFd, chunkContents);
            hash.update(chunkContents);
            totalSize += chunkContents.byteLength;
        }
    } finally {
        fs.closeSync(outputFd);
    }

    if (totalSize !== chunkManifest.finalSize) {
        cleanupFailedAssembly(tempFallbackBinaryPath);
        throw new Error("Assembled CUDA fallback backend has unexpected size");
    }

    const assembledSha256 = hash.digest("hex");
    if (assembledSha256 !== chunkManifest.sha256) {
        cleanupFailedAssembly(tempFallbackBinaryPath);
        throw new Error("Assembled CUDA fallback backend has unexpected SHA-256");
    }

    fs.renameSync(tempFallbackBinaryPath, fallbackBinaryPath);
}

function readChunkManifest() {
    if (!fs.existsSync(chunkManifestPath))
        return null;

    return JSON.parse(fs.readFileSync(chunkManifestPath, "utf8")) as ChunkManifest;
}

if (
    process.argv[1] != null &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
    process.argv.includes("--assemble")
) {
    ensureAssembledFallbackBinary();
}

function cleanupFailedAssembly(tempFallbackBinaryPath: string) {
    fs.rmSync(tempFallbackBinaryPath, {force: true});
}
