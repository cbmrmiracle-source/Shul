import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold text-navy">Shul Communications</h1>
      <p className="mb-6 text-sm text-stone-500">Sign in to continue.</p>
      <LoginForm next={next ?? "/"} />
    </div>
  );
}
