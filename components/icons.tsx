import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Back = (p: P) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
export const Plus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const Search = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></Svg>;
export const Close = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const Check = (p: P) => <Svg strokeWidth={2.6} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const Pencil = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></Svg>;
export const Share = (p: P) => <Svg {...p}><path d="M12 4v11M8 8l4-4 4 4M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6" /></Svg>;
export const Camera = (p: P) => (
  <Svg {...p}>
    <path d="M4 8.5A1.5 1.5 0 015.5 7h2l1.5-2h6L16.5 7h2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5v-9z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const Pot = (p: P) => (
  <Svg {...p}>
    <path d="M4 10h16v6a4 4 0 01-4 4H8a4 4 0 01-4-4v-6zM2 10h2M20 10h2M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2" />
  </Svg>
);
export const Person = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" />
  </Svg>
);
export const Sun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </Svg>
);
export const Clock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const Basket = (p: P) => (
  <Svg {...p}>
    <path d="M4 10h16l-1.6 8.2a2 2 0 01-2 1.8H7.6a2 2 0 01-2-1.8L4 10zM8 10l3-6M16 10l-3-6M9.5 14v2.5M14.5 14v2.5" />
  </Svg>
);
export const Play = (p: P) => <Svg {...p}><path d="M8 5.5v13l10-6.5-10-6.5z" /></Svg>;
export const Wand = (p: P) => (
  <Svg {...p}>
    <path d="M5 19L15.5 8.5M14 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6L19 12z" />
  </Svg>
);
export const Flame = (p: P) => (
  <Svg {...p}>
    <path d="M12 21c3.6 0 6-2.4 6-5.8 0-3.7-2.8-5.6-3.8-9.2-1.7 1.2-2.5 3.1-2.4 5-1.3-.6-2.2-1.9-2.3-3.5C7.4 9.5 6 11.9 6 15.2 6 18.6 8.4 21 12 21z" />
  </Svg>
);
export const Calendar = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </Svg>
);
export const Reorder = (p: P) => <Svg {...p}><path d="M8 4v16M4.5 7.5L8 4l3.5 3.5M16 20V4M12.5 16.5L16 20l3.5-3.5" /></Svg>;
export const Trash = (p: P) => <Svg {...p}><path d="M5 7h14M10 4h4M7 7l1 12.5a1.5 1.5 0 001.5 1.5h5a1.5 1.5 0 001.5-1.5L17 7M10 11v6M14 11v6" /></Svg>;
export const Copy = (p: P) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" />
  </Svg>
);
/** Drag handle: six dots. */
export const Grip = (p: P) => (
  <Svg {...p}>
    {[8, 12, 16].map((y) => (
      <g key={y}>
        <circle cx="9.5" cy={y} r=".9" fill="currentColor" />
        <circle cx="14.5" cy={y} r=".9" fill="currentColor" />
      </g>
    ))}
  </Svg>
);
export const Bowl = (p: P) => <Svg {...p}><path d="M3 11h18a9 9 0 01-18 0zM8 7c0-1.5 1.5-1.5 1.5-3M14 7c0-1.5 1.5-1.5 1.5-3" /></Svg>;

/** Experiment: a spark. Tried & true: a seal. Shapes carry the meaning, colour backs it up. */
export const Spark = ({ size = 14, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...p}>
    <path fill="currentColor" d="M8 0.5l1.6 4.6a2 2 0 001.3 1.3L15.5 8l-4.6 1.6a2 2 0 00-1.3 1.3L8 15.5l-1.6-4.6a2 2 0 00-1.3-1.3L.5 8l4.6-1.6a2 2 0 001.3-1.3z" />
  </svg>
);
export const Seal = ({ size = 14, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...p}>
    <circle cx="8" cy="8" r="7.5" fill="currentColor" />
    <path d="M4.8 8.2l2.1 2.1 4.3-4.6" stroke="var(--bg)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
