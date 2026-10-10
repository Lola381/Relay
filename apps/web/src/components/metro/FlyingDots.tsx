/** Metro indeterminate progress: five dots gliding across. Static dots when motion is reduced. */
export function FlyingDots({ label = 'Loading', className = '' }: { label?: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={`inline-flex items-center gap-2.5 ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          aria-hidden
          className="size-2 rounded-full bg-accent motion-safe:animate-flying-dot"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}
