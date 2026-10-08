/**
 * Runs before the app starts (see Dockerfile). Checks the required settings,
 * waits for the database, then applies migrations. Problems are printed in
 * plain language, because this output is what shows in the hosting logs.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

function fail(lines: string[]): never {
  console.error("\n========== SETUP PROBLEM ==========");
  for (const l of lines) console.error(l);
  console.error("===================================\n");
  process.exit(1);
}

function checkSettings(): string {
  const problems: string[] = [];
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    problems.push(
      "DATABASE_URL is not set.",
      "  Fix: app service → Variables → add DATABASE_URL with the value ${{Postgres.DATABASE_URL}}",
      "  (if your database box has a different name, use that name instead of Postgres).",
    );
  } else if (url.includes("${{")) {
    problems.push(
      `DATABASE_URL still contains "${url}", so Railway couldn't fill it in.`,
      "  Fix: the name inside ${{ }} must match the database box's name exactly, e.g. ${{Postgres.DATABASE_URL}}.",
    );
  } else if (!/^postgres(ql)?:\/\//.test(url)) {
    problems.push("DATABASE_URL should start with postgresql:// — check the value.");
  }
  if (!process.env.APP_PASSWORD) {
    problems.push("APP_PASSWORD is not set. Fix: Variables → add APP_PASSWORD (the password you'll sign in with).");
  }
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) {
    problems.push(
      `SESSION_SECRET is ${secret ? `only ${secret.length} characters` : "not set"}; it needs at least 32.`,
      "  Fix: Variables → set SESSION_SECRET to a long random string of letters and numbers.",
    );
  }
  if (problems.length) fail(problems);
  return url!;
}

async function waitForDatabase(url: string) {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "(unreadable address)";
    }
  })();
  for (let attempt = 1; attempt <= 20; attempt++) {
    const sql = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
    try {
      await sql`select 1`;
      await sql.end();
      return;
    } catch (e) {
      await sql.end({ timeout: 1 }).catch(() => {});
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`Waiting for the database at ${host} (attempt ${attempt}/20): ${msg}`);
      if (attempt === 20) {
        fail([
          `Could not connect to the database at ${host}.`,
          `  Last error: ${msg}`,
          "  Check that the PostgreSQL box in Railway is running (green) and that DATABASE_URL",
          "  points to it: ${{Postgres.DATABASE_URL}}.",
        ]);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function main() {
  const url = checkSettings();
  await waitForDatabase(url);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql.end();
  console.log("Database ready.");
}

main().catch((e) => {
  fail(["The database setup failed:", `  ${e instanceof Error ? e.message : String(e)}`]);
});
