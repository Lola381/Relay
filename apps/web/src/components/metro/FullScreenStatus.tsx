import { FlyingDots } from './FlyingDots';

/** Whole-page state while the session is restored, or when the API can't be reached. */
export function FullScreenStatus({
  title,
  message,
  action,
  loading = false,
}: {
  title?: string;
  message?: string;
  action?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <main className="flex min-h-screen flex-col items-start justify-center gap-6 px-4 sm:px-16">
      {title && <h1 className="text-5xl font-light">{title}</h1>}
      {message && <p className="max-w-xl text-muted">{message}</p>}
      {loading && <FlyingDots label={title ?? 'Loading'} />}
      {action}
    </main>
  );
}
