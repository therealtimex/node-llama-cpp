import yargs from "yargs";
import {hideBin} from "yargs/helpers";

type GithubRelease = {
    tag_name: string
};

const defaultRepo = "ggml-org/llama.cpp";
const argv = await yargs(hideBin(process.argv))
    .option("repo", {
        type: "string",
        default: defaultRepo
    })
    .option("currentRelease", {
        type: "string",
        default: ""
    })
    .option("githubOutput", {
        type: "boolean",
        default: false
    })
    .strict()
    .parse();

const currentRelease = argv.currentRelease.trim();
const latestRelease = await getLatestGithubRelease(argv.repo);
const updated = currentRelease !== latestRelease;

console.info("Current shipped llama.cpp release:", currentRelease || "<none>");
console.info("Latest llama.cpp release:", latestRelease);

if (argv.githubOutput)
    await writeGithubOutputs({
        currentRelease: currentRelease,
        latestRelease: latestRelease,
        updated: String(updated)
    });

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

    const fs = await import("fs-extra");
    await fs.appendFile(
        githubOutputPath,
        Object.entries(outputs)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n") + "\n",
        "utf8"
    );
}
