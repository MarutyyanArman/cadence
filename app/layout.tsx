import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Notifier } from "@/components/notifier";
import { LocaleProvider } from "@/components/i18n-provider";
import { TelegramBootstrap } from "@/components/telegram-bootstrap";
import { getI18n } from "@/lib/i18n/server";
import { currentUserIdOrNull } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.app.name,
    description: t.app.description,
    // Telegram opens the app in a webview; this is also what makes it
    // installable to a home screen from a normal mobile browser.
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: t.app.name },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  width: "device-width",
  initialScale: 1,
  // viewportFit covers the notch; deliberately no maximumScale — locking zoom
  // is a real accessibility cost, and the 16px input rule in globals.css
  // already stops iOS zooming on focus, which is the reason people reach for it.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the cookie here rather than per-page so `lang` on <html> is right
  // too — a screen reader announcing Russian copy with lang="en" is the sort
  // of thing nobody notices until it is unusable.
  const { locale, t } = await getI18n();
  const signedIn = (await currentUserIdOrNull()) !== null;

  return (
    <html
      lang={t.htmlLang}
      data-theme="dark"
      className={`${GeistSans.variable} h-full antialiased`}
      // Telegram's SDK sets --tg-viewport-height on <html> before React
      // hydrates, so the server markup and the client tree differ here by
      // design. Scoped to this element only.
      suppressHydrationWarning
    >
      <head>
        {/* Telegram's SDK, from Telegram's own CDN — it has to load before the
            app renders, because the first thing the bootstrap does is ask it
            for initData. Outside Telegram, window.Telegram.WebApp exists but
            initData is empty, and the bootstrap does nothing. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="bg-canvas text-fg min-h-dvh">
        {/* Only the locale string crosses into the client bundle; the
            dictionaries are modules both sides import. */}
        <LocaleProvider locale={locale}>
          <TelegramBootstrap signedIn={signedIn} />
          {children}
          {/* Client-only, renders nothing, reads no data at render time — so the
              statically generated 404 still builds without a DATABASE_URL. */}
          <Notifier />
        </LocaleProvider>
      </body>
    </html>
  );
}
