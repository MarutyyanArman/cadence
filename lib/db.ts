import postgres from "postgres";

let client: postgres.Sql | null = null;

/**
 * Lazy singleton. Created on first query, not at import time, so `next build`
 * and any module that merely imports types never needs a live database.
 */
export function db(): postgres.Sql {
  if (client) return client;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local — e.g. postgres://user:pass@host:5432/arc",
    );
  }

  client = postgres(url, {
    // snake_case in Postgres, camelCase in TypeScript, translated at the boundary
    transform: postgres.camel,
    max: 5,
    idle_timeout: 20,
  });

  return client;
}
