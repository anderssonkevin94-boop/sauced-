/**
 * A score shown as Edward's head, five in a row: 4.3 is four whole heads and a third of the
 * fifth; what's left of the five is a faint outline. Decoration next to the number ("4.3/5.0 Edwards").
 */
export function EdwardHeads({ value, size = 24 }: { value: number; size?: number }) {
  const width = Math.round((size * 87) / 96);
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

/** Both colours; the theme shows one (.only-light / .only-dark in globals.css), so the toggle on You applies. */
function Head({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <>
      <img src="/edward-head-2.webp" alt="" width={87} height={96} loading="lazy" className={`${className} only-light`} style={style} />
      <img src="/edward-head-dark-2.webp" alt="" width={87} height={96} loading="lazy" className={`${className} only-dark`} style={style} />
    </>
  );
}
