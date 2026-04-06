export const standaloneCudaExtChunkSizeBytes = 96 * 1024 * 1024;
export const maxStandaloneCudaExtChunks = 8;
export const standaloneCudaExtChunkManifestFileName = "chunk-manifest.json";

export type StandaloneCudaExtChunkPackageConfig = {
    extPackageName: string,
    packageDirectoryName: string,
    chunkPackageNamePrefix: string,
    folderName: string,
    fallbackBinaryName: string,
    os: string[],
    cpu: string[],
    libc?: string[],
    description: string
};

export const standaloneCudaExtChunkPackageConfigs: readonly StandaloneCudaExtChunkPackageConfig[] = Object.freeze([
    {
        extPackageName: "@realtimex/node-llama-cpp-linux-x64-cuda-ext",
        packageDirectoryName: "node-llama-cpp-linux-x64-cuda-ext",
        chunkPackageNamePrefix: "@realtimex/node-llama-cpp-linux-x64-cuda-ext-chunk",
        folderName: "linux-x64-cuda",
        fallbackBinaryName: "libggml-cuda.so",
        os: ["linux"],
        cpu: ["x64"],
        libc: ["glibc"],
        description: "Chunk package for the Linux x64 CUDA fallback backend used by node-llama-cpp"
    },
    {
        extPackageName: "@realtimex/node-llama-cpp-win-x64-cuda-ext",
        packageDirectoryName: "node-llama-cpp-win-x64-cuda-ext",
        chunkPackageNamePrefix: "@realtimex/node-llama-cpp-win-x64-cuda-ext-chunk",
        folderName: "win-x64-cuda",
        fallbackBinaryName: "ggml-cuda.dll",
        os: ["win32"],
        cpu: ["x64"],
        description: "Chunk package for the Windows x64 CUDA fallback backend used by node-llama-cpp"
    }
] as const);

export function getStandaloneCudaExtChunkPackageName(config: StandaloneCudaExtChunkPackageConfig, chunkIndex: number) {
    return `${config.chunkPackageNamePrefix}-${String(chunkIndex + 1).padStart(2, "0")}`;
}

export function getStandaloneCudaExtChunkPackageDirectoryName(config: StandaloneCudaExtChunkPackageConfig, chunkIndex: number) {
    return getStandaloneCudaExtChunkPackageName(config, chunkIndex).replace(/^@realtimex\//, "");
}

export function getAllStandaloneCudaExtChunkPackageDirectoryNames(config: StandaloneCudaExtChunkPackageConfig) {
    return Array.from({length: maxStandaloneCudaExtChunks}, (_, index) => (
        getStandaloneCudaExtChunkPackageDirectoryName(config, index)
    ));
}

export function matchesSelectedStandalonePackage(
    selectedPackages: ReadonlySet<string>,
    packageName: string,
    scopedPackageName: string
) {
    if (selectedPackages.size === 0)
        return true;

    if (selectedPackages.has(packageName) || selectedPackages.has(scopedPackageName))
        return true;

    for (const selectedPackage of selectedPackages) {
        const unscopedSelectedPackage = selectedPackage.replace(/^@realtimex\//, "");
        if (
            packageName.startsWith(unscopedSelectedPackage + "-chunk-") ||
            scopedPackageName.startsWith(selectedPackage + "-chunk-")
        )
            return true;
    }

    return false;
}
