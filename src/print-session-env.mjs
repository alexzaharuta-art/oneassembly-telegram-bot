import { readFile } from "node:fs/promises";
import { config } from "./config.mjs";

const body = await readFile(config.storageStateFile, "utf8");
console.log(Buffer.from(body, "utf8").toString("base64"));
