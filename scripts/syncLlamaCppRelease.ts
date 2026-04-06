import path from "path";
import fs from "fs-extra";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";

type GithubRelease = {
    tag_name: string
};

const defaultRepo = "ggml-org/llama.cpp";
const defaultBinariesGithubReleaseFile = "./llama/binariesGithubRelease.json";

const argv = await yargs(hideBin(process.argv))
    .option("repo", {
        type: "string",
        default: defaultRepo
    })
    .option("file", {
        type: "string",
        default: defaultBinariesGithubReleaseFile
    })
    .option("write", {
        type: "boolean",
        default: false
    })
    .option("githubOutput", {
        type: "boolean",
        default: false
    })
    .strict()
    .parse();

const releaseFilePath = path.resolve(process.cwd(), argv.file);
const trackedRelease = await getTrackedRelease(releaseFilePath);
const latestRelease = await getLatestGithubRelease(argv.repo);
const updated = trackedRelease !== latestRelease;

console.info("Tracked llama.cpp release:", trackedRelease);
console.info("Latest llama.cpp release:", latestRelease);

if (argv.write && updated) {
    await fs.writeJson(releaseFilePath, {
        release: latestRelease
    }, {spaces: 4});

    console.info("Updated tracked llama.cpp release file:", releaseFilePath);
} else if (argv.write) {
    console.info("Tracked llama.cpp release is already up to date");
}

if (argv.githubOutput)
    await writeGithubOutputs({
        tracked_release: trackedRelease,
        latest_release: latestRelease,
        updated: String(updated)
    });

async function getTrackedRelease(releaseFilePath: string) {
    const releaseJson = await fs.readJson(releaseFilePath) as {release?: string};
    const trackedRelease = releaseJson.release?.trim();

    if (trackedRelease == null || trackedRelease === "")
        throw new Error(`Could not read tracked llama.cpp release from "${releaseFilePath}"`);

    return trackedRelease;
}

async function getLatestGithubRelease(repo: string) {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
            "accept": "application/vnd.github+json",
            "user-agent": "therealtimex-node-llama-cpp-release-watcher"
        }
    });

    if (!response.ok)
        throw new Error(`Could not resolve latest GitHub release for "${repo}": ${response.status} ${response.statusText}`);

    const release = await response.json() as GithubRelease;
    const latestRelease = release.tag_name?.trim();

    if (latestRelease == null || latestRelease === "")
        throw new Error(`Could not resolve latest GitHub release tag for "${repo}"`);

    return latestRelease;
}

async function writeGithubOutputs(outputs: Record<string, string>) {
    const githubOutputPath = process.env.GITHUB_OUTPUT;
    if (githubOutputPath == null || githubOutputPath === "")
        throw new Error("Expected GITHUB_OUTPUT to be set when --githubOutput is used");

    await fs.appendFile(
        githubOutputPath,
        Object.entries(outputs)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n") + "\n",
        "utf8"
    );
}
