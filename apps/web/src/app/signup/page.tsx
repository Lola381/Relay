'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { useRouter } from 'next/navigation';
import { registerSchema, SIGNUP_ROLES, type RegisterInput } from '@pm/shared';
import { MessageBand } from '@/components/metro/MessageBand';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { btn, inputClass } from '@/lib/ui';

const ROLE_INFO: Record<(typeof SIGNUP_ROLES)[number], { label: string; hint: string }> = {
  PROJECT_MANAGER: { label: 'Project manager', hint: 'Can be made manager of projects: add people, create and assign tasks.' },
  TEAM_MEMBER: { label: 'Team member', hint: 'Works on assigned tasks: update status, describe progress, comment.' },
  VIEWER: { label: 'Viewer', hint: 'Read-only access to the projects you are added to.' },
};

type Errors = Partial<Record<keyof RegisterInput, string>>;

/** Self-service sign-up. Admin is never offered: the seeded admin is the only administrator. */
export default function SignupPage() {
  const { state, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<RegisterInput>({ name: '', email: '', password: '', role: 'TEAM_MEMBER' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.status === 'authenticated') router.replace('/dashboard');
  }, [state.status, router]);

  const set = (key: keyof RegisterInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof RegisterInput] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await register(parsed.data);
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const next: Errors = {};
        for (const d of err.details as { path: string; message: string }[]) next[d.path as keyof RegisterInput] = d.message;
        setErrors(next);
      }
      setFormError(err instanceof ApiError ? err.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  const field = (key: 'name' | 'email' | 'password', label: string, type = 'text', autoComplete?: string) => (
    <label className="block">
      <span className="mb-1.5 block text-[15px]">{label}</span>
      <input
        type={type}
        value={form[key]}
        onChange={set(key)}
        autoComplete={autoComplete}
        aria-invalid={errors[key] ? true : undefined}
        className={inputClass(Boolean(errors[key]))}
      />
      {errors[key] && <span className="mt-1 block text-sm text-danger">{errors[key]}</span>}
    </label>
  );

  return (
    <main className="relative grid min-h-screen md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ThemeToggle className="absolute top-3 right-3 z-10" />
      <section className="hidden flex-col justify-between bg-accent px-14 py-14 text-accent-fg md:sticky md:top-0 md:flex md:h-screen">
        <p className="text-3xl font-light">relay</p>
        <h1 className="text-6xl leading-[1.15] font-light lg:text-7xl">
          Join
          <br />
          the team.
        </h1>
        <p className="text-sm">A project manager or admin adds you to projects after you sign up.</p>
      </section>
      <header className="bg-accent px-4 py-4 text-2xl font-light text-accent-fg md:hidden">relay</header>

      <section className="px-4 py-10 sm:px-12 md:px-16 md:py-20 lg:px-24">
        <div className="max-w-[560px]">
          <h2 className="text-5xl font-light sm:text-6xl">Create account</h2>
          <p className="mt-6 mb-8 text-muted">Pick the role that fits how you&apos;ll work.</p>

          <form onSubmit={submit} noValidate className="space-y-5">
            {formError && <MessageBand tone="error">{formError}</MessageBand>}
            {field('name', 'Full name', 'text', 'name')}
            {field('email', 'Email', 'email', 'email')}
            {field('password', 'Password (at least 8 characters)', 'password', 'new-password')}

            <fieldset>
              <legend className="mb-2 text-[15px]">Role</legend>
              <div className="space-y-2">
                {SIGNUP_ROLES.map((role) => (
                  <label
                    key={role}
                    className={`flex cursor-pointer gap-3 border-2 p-3 ${form.role === role ? 'border-accent' : 'border-border'}`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role}
                      checked={form.role === role}
                      onChange={() => setForm((f) => ({ ...f, role }))}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <span>
                      <span className="block">{ROLE_INFO[role].label}</span>
                      <span className="block text-sm text-muted">{ROLE_INFO[role].hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <button type="submit" className={`${btn.primary} w-full`} disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-8 text-muted">
            Already have an account?{' '}
            <Link href="/login" className="text-accent-text underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
