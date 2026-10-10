import { SystemStatus } from '@/components/SystemStatus';

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-12">
      <h1 className="mb-2 text-6xl font-light tracking-tight">Start</h1>
      <p className="mb-10 text-muted">Skeleton check: the web app talking to the API and database.</p>
      <SystemStatus />
    </main>
  );
}
