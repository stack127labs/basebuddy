import { readdir, writeFile } from "node:fs/promises";
import store from "../../lib/basebuddy-config/store.ts";
const { writeBaseBuddyConfig } = store;

const workerId = process.argv[2];
await writeFile(`ready-${workerId}`, "ready");
const deadline = Date.now() + 8000;
while ((await readdir(".")).filter((name) => name.startsWith("ready-")).length < 2) {
  if (Date.now() > deadline) throw new Error("Second config writer did not start.");
  await new Promise((resolve) => setTimeout(resolve, 20));
}
for (let index = 0; index < 3; index += 1) {
  await writeBaseBuddyConfig(async (config) => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const now = new Date().toISOString();
    return {
      ...config,
      users: [...config.users, {
        id: `${workerId}-${index}`,
        email: `${workerId}-${index}@example.com`,
        name: workerId,
        avatarUrl: null,
        createdAt: now,
        updatedAt: now,
        passwordHash: "test-hash",
        passwordSalt: "test-salt",
        passwordHashParams: { keyLength: 64, name: "scrypt" },
      }],
    };
  });
}
