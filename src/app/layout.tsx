import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { logout } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Shul Communications", template: "%s · Shul Communications" },
  description: "Weekly content and publishing for the shul",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {signedIn && (
          <header className="bg-navy text-white">
            <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
              <Link href="/" className="font-semibold tracking-tight">
                Shul Communications
              </Link>
              <nav className="flex gap-4 text-sm text-white/80">
                <Link href="/" className="hover:text-white">Weeks</Link>
                <Link href="/profiles" className="hover:text-white">Davening Profiles</Link>
                <Link href="/settings" className="hover:text-white">Settings</Link>
              </nav>
              <form action={logout} className="ml-auto">
                <button className="text-sm text-white/70 hover:text-white">Sign out</button>
              </form>
            </div>
            <div className="h-1 bg-gradient-to-r from-gold via-gold-light to-gold" />
          </header>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
