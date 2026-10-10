'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRightRegular } from '@/components/icons';
import { ERROR_CODES, loginSchema, type LoginInput } from '@pm/shared';
import { FlyingDots } from '@/components/metro/FlyingDots';
import { MessageBand } from '@/components/metro/MessageBand';
import { ApiError, NETWORK_ERROR } from '@/lib/api/client';
import { safeNextPath, useAuth, type SignedOutReason } from '@/lib/auth/AuthProvider';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/demoAccounts';

type Band = { tone: 'error' | 'warning' | 'info'; text: string } | null;

const REASON_BANDS: Record<SignedOutReason, Band> = {
  expired: { tone: 'info', text: 'Your session expired. Sign in again to continue.' },
  deactivated: { tone: 'warning', text: 'This account is deactivated. Contact your administrator.' },
  'signed-out': { tone: 'info', text: 'You have signed out.' },
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, login } = useAuth();
  const [band, setBand] = useState<Band>(() => {
    const reason = searchParams.get('reason') as SignedOutReason | null;
    return (reason && REASON_BANDS[reason]) || null;
  });
  const [showPassword, setShowPassword] = useState(false);
  const ids = { email: useId(), password: useId(), show: useId() };

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // Already signed in (or just signed in) → go where the user was heading
  useEffect(() => {
    if (state.status === 'authenticated') router.replace(safeNextPath(searchParams.get('next')));
  }, [state.status, router, searchParams]);

  const onSubmit = handleSubmit(async (values) => {
    setBand(null);
    try {
      await login(values);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      switch (err.code) {
        case ERROR_CODES.INVALID_CREDENTIALS:
          // Keep the email, clear the password (it's never shown back)
          setValue('password', '');
          setFocus('password');
          setBand({ tone: 'error', text: err.message });
          break;
        case ERROR_CODES.ACCOUNT_DEACTIVATED:
        case ERROR_CODES.RATE_LIMITED:
          setBand({ tone: 'warning', text: err.message });
          break;
        case ERROR_CODES.VALIDATION_ERROR:
          for (const field of (err.details as { path: string; message: string }[] | undefined) ?? []) {
            if (field.path === 'email' || field.path === 'password') {
              setError(field.path, { message: field.message });
            }
          }
          break;
        case NETWORK_ERROR:
        default:
          setBand({ tone: 'error', text: err.message });
      }
    }
  });

  const fillDemoAccount = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
    setBand(null);
    setFocus('password');
  };

  const inputClass = (invalid: boolean) =>
    // The error colour wins over the focus colour, so an invalid field stays red while typing
    `w-full border-2 bg-surface px-3 py-2.5 text-[15px] outline-none ${
      invalid ? 'border-danger' : 'border-border focus:border-accent'
    }`;

  return (
    <>
      {band && (
        <div className="mb-6">
          <MessageBand tone={band.tone}>{band.text}</MessageBand>
        </div>
      )}

      <form noValidate onSubmit={onSubmit} className="space-y-5">
        <div>
          <label htmlFor={ids.email} className="mb-1.5 block text-[15px]">
            Email <span aria-hidden>*</span>
          </label>
          <input
            id={ids.email}
            type="email"
            autoComplete="username"
            autoFocus
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${ids.email}-error` : undefined}
            className={inputClass(!!errors.email)}
            {...register('email')}
          />
          {errors.email && (
            <p id={`${ids.email}-error`} className="mt-1.5 text-sm text-danger">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={ids.password} className="mb-1.5 block text-[15px]">
            Password <span aria-hidden>*</span>
          </label>
          <input
            id={ids.password}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? `${ids.password}-error` : undefined}
            className={inputClass(!!errors.password)}
            {...register('password')}
          />
          {errors.password && (
            <p id={`${ids.password}-error`} className="mt-1.5 text-sm text-danger">
              {errors.password.message}
            </p>
          )}
        </div>

        <label htmlFor={ids.show} className="flex w-fit cursor-pointer items-center gap-3 text-[15px]">
          <input
            id={ids.show}
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            className="size-4 accent-accent"
          />
          Show password
        </label>

        <div className="flex items-center gap-4 pt-1">
          {isSubmitting && <FlyingDots label="Signing in" />}
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-accent px-5 py-2.5 text-[15px] text-accent-fg hover:brightness-110 disabled:bg-disabled-bg disabled:text-disabled-fg"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>

      <section aria-labelledby="demo-heading" className="mt-12">
        <h3 id="demo-heading" className="mb-4 text-2xl font-light sm:text-3xl">
          Try a demo account
        </h3>
        <ul className="space-y-3">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => fillDemoAccount(account.email)}
                className="flex w-full items-center gap-4 border border-border bg-surface px-4 py-3 text-left hover:border-accent"
              >
                <span className="w-20 shrink-0 text-accent-text">{account.role}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{account.name}</span>
                  <span className="block truncate text-xs text-muted">{account.email}</span>
                  <span className="block truncate text-xs text-muted">{account.projects}</span>
                </span>
                <ArrowRightRegular aria-hidden fontSize={18} />
                <span className="sr-only">Fill in the {account.role} demo account</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Demo password for all accounts: {DEMO_PASSWORD} · inactive@demo.com is deactivated and cannot sign in.
        </p>
      </section>
    </>
  );
}
