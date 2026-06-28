import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>["db"];

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    max: env.NODE_ENV === "production" ? 10 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false
  });

  return {
    db: drizzle(client, { schema }),
    close: () => client.end()
  };
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDatabase() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database operations");
  }

  database ??= createDatabase(env.DATABASE_URL);
  return database;
}
