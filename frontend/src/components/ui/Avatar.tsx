export function Avatar({ name, src, size = 36 }: { name: string; src: string | null; size?: number }) {
  const style = { width: size, height: size };
  return src ? (
    <img src={src} alt={name} referrerPolicy="no-referrer" style={style} className="rounded-full object-cover" />
  ) : (
    <div style={style} className="flex items-center justify-center rounded-full bg-brand text-sm font-medium text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
