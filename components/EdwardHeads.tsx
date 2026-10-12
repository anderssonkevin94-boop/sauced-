/**
 * A score shown as Edward's head, five in a row: 4.3 is four whole heads and a third of the
 * fifth; what's left of the five is a faint outline. Decoration next to the number ("4.3/5.0 Edwards").
 */
export function EdwardHeads({ value, size = 24 }: { value: number; size?: number }) {
  const width = Math.round((size * 79) / 96);
  return (
    <span className="edward-heads" aria-hidden="true" style={{ height: size }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, value - i));
        return (
          <span key={i} className="edward-head" style={{ width, height: size }}>
            <Head className="empty" />
            {fill > 0 && (
              <span className="fill" style={{ width: `${fill * 100}%` }}>
                <Head style={{ width, height: size }} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function Head(props: { className?: string; style?: React.CSSProperties }) {
  return (
    <picture>
      <source srcSet="/edward-head-dark.webp" media="(prefers-color-scheme: dark)" />
      <img src="/edward-head.webp" alt="" width={79} height={96} loading="lazy" {...props} />
    </picture>
  );
}
