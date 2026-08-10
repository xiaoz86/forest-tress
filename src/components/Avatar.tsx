type Props = {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
};

const gradients = [
  'from-coral-soft to-warmth',
  'from-sky to-[#a5cce0]',
  'from-leaf to-sage',
  'from-[#b088c9] to-[#d4b4e8]',
  'from-gold to-gold-light',
];

function hashPick(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return gradients[h % gradients.length];
}

function firstChar(name: string): string {
  return (name || '').trim().charAt(0) || '·';
}

export default function Avatar({
  name,
  url,
  size = 128,
  className = '',
}: Props) {
  const dimension = `${size}px`;
  const initial = firstChar(name);
  const gradient = hashPick(name || 'x');

  return (
    <div
      className={`relative rounded-full overflow-hidden ring-1 ring-black/[0.06] shadow-[0_8px_36px_rgba(0,0,0,0.10)] ${className}`}
      style={{ width: dimension, height: dimension }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold`}
          style={{ fontSize: size * 0.42 }}
        >
          {initial}
        </div>
      )}
    </div>
  );
}
