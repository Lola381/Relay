import { InfoRegular, WarningRegular } from '@/components/icons';

type Tone = 'error' | 'warning' | 'info';

const toneClass: Record<Tone, string> = {
  error: 'bg-danger text-white',
  warning: 'bg-warning text-white',
  info: 'bg-accent text-accent-fg',
};

/** Full-width Metro message band for page/form-level messages (not field errors). */
export function MessageBand({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = tone === 'info' ? InfoRegular : WarningRegular;
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={`flex items-center gap-3 px-6 py-3 text-[15px] ${toneClass[tone]}`}
    >
      <Icon aria-hidden fontSize={20} className="shrink-0" />
      <span>{children}</span>
    </div>
  );
}
