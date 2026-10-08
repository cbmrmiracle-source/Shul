"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { passwordMatches } from "@/lib/auth/server";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth/session";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const password = String(form.get("password") ?? "");
  if (!passwordMatches(password)) return "Incorrect password.";
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  const next = String(form.get("next") ?? "/");
  // Only allow same-site relative paths.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
