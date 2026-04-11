import path from "path";
import process from "process";
import fs from "fs-extra";
import {
    defaultLlamaCppGitHubRepo,
    defaultLlamaCppGpuSupport,
    llamaLocalBuildBinsDirectory,
    llamaPrebuiltBinsDirectory,
    buildMetadataFileName
} from "../config.js";
import {type BuildGpu, type BuildMetadataFile, parseNodeLlamaCppGpuOption} from "../bindings/types.js";
import {DownloadLlamaCppCommand} from "../cli/commands/source/commands/DownloadCommand.js";
import {BuildLlamaCppCommand} from "../cli/commands/source/commands/BuildCommand.js";
import {getClonedLlamaCppRepoReleaseInfo, isLlamaCppRepoCloned} from "../bindings/utils/cloneLlamaCppRepo.js";

export const llamaServerBinaryNames = Object.freeze([
    "llama-server",
    "llama-server.exe"
] as const);

export const llamaServerRequiredCmakeOptions = Object.freeze({
    LLAMA_BUILD_COMMON: "ON",
    LLAMA_BUILD_EXAMPLES: "ON",
    LLAMA_BUILD_SERVER: "ON",
    LLAMA_BUILD_TESTS: "OFF",
    LLAMA_BUILD_TOOLS: "ON",
    LLAMA_CURL: "OFF",
    LLAMA_HTTPLIB: "ON",
    LLAMA_OPENSSL: "OFF",
    LLAMA_BUILD_BORINGSSL: "OFF"
} as const);

export type LlamaServerBinaryOptions = {
    repo?: string,
    release?: string,
    gpu?: BuildGpu | "auto",
    env?: NodeJS.ProcessEnv,
    searchRoots?: string[]
};

export function getLlamaServerBuildDefaults(env: NodeJS.ProcessEnv = process.env) {
    const repo = String(env.NODE_LLAMA_CPP_SERVER_REPO || env.NODE_LLAMA_CPP_REPO || defaultLlamaCppGitHubRepo);
    const release = String(
        env.NODE_LLAMA_CPP_SERVER_REPO_RELEASE ||
        env.NODE_LLAMA_CPP_REPO_RELEASE ||
        "latest"
    );
    const gpu = resolveLlamaServerGpuOption(
        env.NODE_LLAMA_CPP_SERVER_GPU ??
        env.NODE_LLAMA_CPP_GPU ??
        defaultLlamaCppGpuSupport
    );

    return {
        repo,
        release,
        gpu
    };
}

export function getLlamaServerBuildEnvironment({
    repo,
    release,
    gpu,
    env = process.env
}: LlamaServerBinaryOptions = {}) {
    const defaults = getLlamaServerBuildDefaults(env);
    const buildEnv: NodeJS.ProcessEnv = {
        ...env,
        NODE_LLAMA_CPP_REPO: repo ?? defaults.repo,
        NODE_LLAMA_CPP_REPO_RELEASE: release ?? defaults.release,
        NODE_LLAMA_CPP_GPU: stringifyLlamaServerGpuOption(gpu ?? defaults.gpu)
    };

    for (const [optionKey, optionValue] of Object.entries(llamaServerRequiredCmakeOptions))
        buildEnv[`NODE_LLAMA_CPP_CMAKE_OPTION_${optionKey}`] = optionValue;

    return buildEnv;
}

export async function resolveLlamaServerBinaryPath({
    repo,
    release,
    gpu,
    env = process.env,
    searchRoots = [
        llamaLocalBuildBinsDirectory,
        llamaPrebuiltBinsDirectory
    ]
}: LlamaServerBinaryOptions = {}) {
    const defaults = getLlamaServerBuildDefaults(env);
    const expectedRepo = repo ?? defaults.repo;
    const expectedRelease = release ?? defaults.release;
    const expectedGpu = gpu ?? defaults.gpu;
    const candidates = await getLlamaServerBinaryCandidates(searchRoots);

    const exactCandidate = candidates.find(({buildMetadata}) =>
        buildMetadata != null &&
        buildMetadataMatchesServerBuildRequirements(buildMetadata, {
            repo: expectedRepo,
            release: expectedRelease,
            gpu: expectedGpu
        })
    );
    if (exactCandidate != null)
        return exactCandidate.binaryPath;

    const compatibleCandidate = candidates.find(({buildMetadata}) =>
        buildMetadata != null &&
        buildMetadataHasRequiredServerCmakeOptions(buildMetadata)
    );
    if (compatibleCandidate != null)
        return compatibleCandidate.binaryPath;

    return candidates[0]?.binaryPath ?? null;
}

export async function buildLlamaServerBinary(options: LlamaServerBinaryOptions = {}) {
    const buildEnv = getLlamaServerBuildEnvironment(options);
    const shouldReuseClonedRepo = await canReuseClonedLlamaCppRepoForServerBuild({
        repo: buildEnv.NODE_LLAMA_CPP_REPO!,
        release: buildEnv.NODE_LLAMA_CPP_REPO_RELEASE!
    });

    await withTemporaryEnvironment(buildEnv, async () => {
        if (shouldReuseClonedRepo) {
            await BuildLlamaCppCommand({
                gpu: resolveLlamaServerGpuOption(buildEnv.NODE_LLAMA_CPP_GPU ?? "auto"),
                noUsageExample: true
            });
            return;
        }

        await DownloadLlamaCppCommand({
            repo: buildEnv.NODE_LLAMA_CPP_REPO,
            release: buildEnv.NODE_LLAMA_CPP_REPO_RELEASE,
            gpu: resolveLlamaServerGpuOption(buildEnv.NODE_LLAMA_CPP_GPU ?? "auto"),
            noUsageExample: true
        });
    });
}

export async function ensureLlamaServerBinary(options: LlamaServerBinaryOptions & {
    resolveBinaryPath?: typeof resolveLlamaServerBinaryPath,
    buildBinary?: typeof buildLlamaServerBinary
} = {}) {
    const {
        resolveBinaryPath = resolveLlamaServerBinaryPath,
        buildBinary = buildLlamaServerBinary,
        ...binaryOptions
    } = options;

    const existingBinaryPath = await resolveBinaryPath(binaryOptions);
    if (existingBinaryPath != null)
        return existingBinaryPath;

    await buildBinary(binaryOptions);

    const resolvedBinaryPath = await resolveBinaryPath(binaryOptions);
    if (resolvedBinaryPath != null)
        return resolvedBinaryPath;

    const defaults = getLlamaServerBuildDefaults(binaryOptions.env);
    throw new Error(
        `Could not find a managed llama-server binary after building ` +
        `${binaryOptions.repo ?? defaults.repo}@${binaryOptions.release ?? defaults.release}.`
    );
}

function resolveLlamaServerGpuOption(gpu: BuildGpu | "auto" | string | false) {
    if (gpu === false || gpu === "auto")
        return gpu;

    return parseNodeLlamaCppGpuOption(
        String(gpu) as Parameters<typeof parseNodeLlamaCppGpuOption>[0]
    );
}

function stringifyLlamaServerGpuOption(gpu: BuildGpu | "auto") {
    return gpu === false
        ? "false"
        : String(gpu);
}

type LlamaServerBinaryCandidate = {
    binaryPath: string,
    buildMetadata?: BuildMetadataFile
};

async function getLlamaServerBinaryCandidates(searchRoots: string[]) {
    const candidates: LlamaServerBinaryCandidate[] = [];
    const queue = searchRoots
        .filter(Boolean)
        .map((rootDir) => ({rootDir, depth: 0}));
    const seen = new Set<string>();

    while (queue.length > 0) {
        const {rootDir, depth} = queue.shift()!;
        if (seen.has(rootDir))
            continue;
        seen.add(rootDir);

        if (!await fs.pathExists(rootDir))
            continue;

        for (const binaryName of llamaServerBinaryNames) {
            const binaryPath = path.join(rootDir, binaryName);
            if (!(await fs.pathExists(binaryPath)))
                continue;

            const buildMetadataPath = path.join(rootDir, buildMetadataFileName);
            const buildMetadata = await readBuildMetadataFile(buildMetadataPath);
            candidates.push({
                binaryPath,
                buildMetadata: buildMetadata ?? undefined
            });
        }

        if (depth >= 6)
            continue;

        const entries = await fs.readdir(rootDir, {withFileTypes: true});
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            if (entry.name === "node_modules" || entry.name.startsWith("."))
                continue;

            queue.push({
                rootDir: path.join(rootDir, entry.name),
                depth: depth + 1
            });
        }
    }

    return candidates;
}

async function readBuildMetadataFile(buildMetadataPath: string) {
    try {
        if (!await fs.pathExists(buildMetadataPath))
            return null;

        return await fs.readJson(buildMetadataPath) as BuildMetadataFile;
    } catch {
        return null;
    }
}

async function canReuseClonedLlamaCppRepoForServerBuild({
    repo,
    release
}: {
    repo: string,
    release: string
}) {
    if (!(await isLlamaCppRepoCloned()))
        return false;

    const clonedRepoInfo = await getClonedLlamaCppRepoReleaseInfo();
    if (clonedRepoInfo == null)
        return false;
    if (clonedRepoInfo.llamaCppGithubRepo !== repo)
        return false;

    return release === "latest" || clonedRepoInfo.tag === release;
}

function buildMetadataMatchesServerBuildRequirements(
    buildMetadata: BuildMetadataFile,
    {
        repo,
        release,
        gpu
    }: {
        repo: string,
        release: string,
        gpu: BuildGpu | "auto"
    }
) {
    const buildOptions = buildMetadata.buildOptions;
    if (!buildMetadataHasRequiredServerCmakeOptions(buildMetadata))
        return false;
    if (buildOptions.llamaCpp.repo !== repo)
        return false;
    if (release !== "latest" && buildOptions.llamaCpp.release !== release)
        return false;
    if (gpu !== "auto" && buildOptions.gpu !== gpu)
        return false;

    return true;
}

function buildMetadataHasRequiredServerCmakeOptions(buildMetadata: BuildMetadataFile) {
    const customCmakeOptions = buildMetadata.buildOptions.customCmakeOptions ?? {};

    for (const [optionKey, optionValue] of Object.entries(llamaServerRequiredCmakeOptions)) {
        if (customCmakeOptions[optionKey] !== optionValue)
            return false;
    }

    return true;
}

async function withTemporaryEnvironment<T>(overrides: NodeJS.ProcessEnv, callback: () => Promise<T>) {
    const previousEntries = new Map<string, string | undefined>();

    for (const [key, value] of Object.entries(overrides)) {
        previousEntries.set(key, process.env[key]);

        if (value == null)
            delete process.env[key];
        else
            process.env[key] = String(value);
    }

    try {
        return await callback();
    } finally {
        for (const [key, value] of previousEntries.entries()) {
            if (value == null)
                delete process.env[key];
            else
                process.env[key] = value;
        }
    }
}
