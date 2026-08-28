import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncStorageStateFromEnv } from "../src/oneassembly.mjs";

test("Railway session bootstrap does not overwrite a refreshed volume session", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "oneassembly-session-"));
  const storageStateFile = join(dataDir, "oneassembly-session.json");
  const initialState = JSON.stringify({ cookies: [{ name: "session", value: "initial" }] });
  const refreshedState = JSON.stringify({ cookies: [{ name: "session", value: "refreshed" }] });
  const storageStateBase64 = Buffer.from(initialState, "utf8").toString("base64");

  try {
    assert.equal(
      await syncStorageStateFromEnv({ storageStateBase64, storageStateFile }),
      true
    );
    await writeFile(storageStateFile, refreshedState, "utf8");

    assert.equal(
      await syncStorageStateFromEnv({ storageStateBase64, storageStateFile }),
      false
    );
    assert.equal(await readFile(storageStateFile, "utf8"), refreshedState);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("a changed Railway session is applied once", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "oneassembly-session-"));
  const storageStateFile = join(dataDir, "oneassembly-session.json");
  const firstState = JSON.stringify({ cookies: [{ name: "session", value: "first" }] });
  const secondState = JSON.stringify({ cookies: [{ name: "session", value: "second" }] });

  try {
    await syncStorageStateFromEnv({
      storageStateBase64: Buffer.from(firstState, "utf8").toString("base64"),
      storageStateFile
    });
    assert.equal(
      await syncStorageStateFromEnv({
        storageStateBase64: Buffer.from(secondState, "utf8").toString("base64"),
        storageStateFile
      }),
      true
    );
    assert.equal(await readFile(storageStateFile, "utf8"), secondState);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
