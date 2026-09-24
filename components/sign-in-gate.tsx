import { LanguageSwitcher } from "@/components/language-switcher";
import { getDict } from "@/lib/i18n/server";

/**
 * What you see when Cadence doesn't know who you are.
 *
 * Deliberately not a login form. There are no Cadence passwords to get wrong —
 * identity comes from Telegram, and the only useful thing this screen can do
 * is say so and point at the bot.
 *
 * The development note is shown only in development, and says what to set
 * rather than offering a button that would bypass sign-in — a "continue as
 * owner" control is exactly the sort of thing that survives into production.
 */
export async function SignInGate() {
  const t = await getDict();
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-xl px-xl py-3xl">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h1 className="t-h1">{t.app.name}</h1>
          <p className="t-body text-fg-secondary">{t.app.description}</p>
        </div>
        <LanguageSwitcher />
      </div>

      <section className="flex flex-col gap-md rounded-md border border-line bg-surface p-lg">
        <h2 className="t-h3">{t.auth.heading}</h2>
        <p className="text-sm text-fg-secondary">{t.auth.body}</p>

        {bot && (
          <a
            href={`https://t.me/${bot}`}
            className="mt-xs inline-flex items-center justify-center rounded-sm bg-accent px-lg py-sm text-sm text-fg-inverse transition-colors hover:bg-accent-hover"
          >
            {t.auth.openInTelegram}
          </a>
        )}

        <p className="text-[11px] text-fg-muted">{t.auth.privacy}</p>
      </section>

      {isDev && (
        <p className="rounded-md border border-dashed border-line px-md py-sm text-[11px] text-fg-muted">
          {t.auth.devHint}
        </p>
      )}
    </main>
  );
}
