#!/usr/bin/env node

import process from "process";
import {spawn} from "cross-spawn";
import {ensureLlamaServerBinary} from "../utils/llamaServer.js";

void (async () => {
    try {
        const binaryPath = await ensureLlamaServerBinary();
        const child = spawn(binaryPath, process.argv.slice(2), {
            stdio: "inherit",
            env: process.env
        });

        child.on("error", (error) => {
            console.error(error);
            process.exit(1);
        });

        child.on("exit", (code, signal) => {
            if (signal != null) {
                process.kill(process.pid, signal);
                return;
            }

            process.exit(code ?? 0);
        });
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
})();
