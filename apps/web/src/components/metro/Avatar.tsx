import { initials } from '@/lib/format';

/** Square initials avatar (Metro style); a photo when the user has one. */
export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external avatar URLs
    return <img src={url} alt="" style={style} className="object-cover" />;
  }
  return (
    <span aria-hidden style={style} className="inline-flex shrink-0 items-center justify-center bg-accent text-accent-fg">
      {initials(name)}
    </span>
  );
}
