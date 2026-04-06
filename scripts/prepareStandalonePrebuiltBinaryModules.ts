import path from "path";
import {fileURLToPath} from "url";
import fs from "fs-extra";
import {$, cd} from "zx";
import envVar from "env-var";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.join(__dirname, "..", "packages");
const packageScope = "@realtimex";
const subPackagesDirectory = path.join(packageDirectory, packageScope);
const env = envVar.from(process.env);
const selectedPackages = new Set(
    env.get("STANDALONE_PACKAGES")
        .default("")
        .asString()
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
);

for (const packageName of await fs.readdir(subPackagesDirectory)) {
    const packagePath = path.join(subPackagesDirectory, packageName);
    const packagePackageJsonPath = path.join(packagePath, "package.json");

    if ((await fs.stat(packagePath)).isFile())
        continue;

    const packageJson = await fs.readJson(packagePackageJsonPath);
    if (
        selectedPackages.size > 0 &&
        !selectedPackages.has(packageName) &&
        !selectedPackages.has(packageJson.name)
    ) {
        console.info(`Skipping "${packageJson.name}" because it is not in STANDALONE_PACKAGES`);
        continue;
    }

    $.verbose = true;
    cd(packagePath);
    await $`npm ci -f --ignore-scripts`;
    await $`npm run build`;

    delete packageJson.devDependencies;
    const postinstall = packageJson.scripts?.postinstall;
    delete packageJson.scripts;

    if (postinstall != null)
        packageJson.scripts = {postinstall};

    await fs.writeJson(packagePackageJsonPath, packageJson, {spaces: 2});
}
