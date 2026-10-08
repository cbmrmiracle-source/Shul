import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { shulDb?: Database };

/**
 * Connect on first use rather than at import, so `next build` (which loads
 * route modules without a database) works on hosting services.
 */
function connect(): Database {
  if (globalForDb.shulDb) return globalForDb.shulDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const instance = drizzle(postgres(url, { max: 10 }), { schema });
  globalForDb.shulDb = instance;
  return instance;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = connect();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
export type Db = Database;
export { schema };
