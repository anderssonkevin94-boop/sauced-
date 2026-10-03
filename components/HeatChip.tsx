import type { SVGProps } from "react";
import { applianceInfo, heatLabel, timeLabel, type Appliance, type Heat } from "@/lib/step";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

const ICONS: Record<Appliance, (p: P) => React.ReactNode> = {
  oven: (p) => (
    <Svg {...p}>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 8.5h17M7 6.3h.01M10 6.3h.01" />
      <rect x="7" y="11.5" width="10" height="5.5" rx="1" />
    </Svg>
  ),
  airfryer: (p) => (
    <Svg {...p}>
      <path d="M6 20h12a1.5 1.5 0 001.5-1.6L18.6 6A2.5 2.5 0 0016.1 3.5H7.9A2.5 2.5 0 005.4 6l-.9 12.4A1.5 1.5 0 006 20z" />
      <path d="M7.5 12h9M12 7v.01" />
    </Svg>
  ),
  sousvide: (p) => (
    <Svg {...p}>
      <path d="M4 10v7a3 3 0 003 3h10a3 3 0 003-3v-7" />
      <path d="M4 13.5c2 1 4-1 6 0s4-1 6 0 2.7.6 4 0" />
      <rect x="13.5" y="2.5" width="3.5" height="11" rx="1.2" />
    </Svg>
  ),
  pan: (p) => (
    <Svg {...p}>
      <path d="M2.5 11h13v1.5a4.5 4.5 0 01-4.5 4.5H7a4.5 4.5 0 01-4.5-4.5V11zM15.5 12.5h6" />
    </Svg>
  ),
  pot: (p) => (
    <Svg {...p}>
      <path d="M4.5 9h15v7a4 4 0 01-4 4h-7a4 4 0 01-4-4V9zM2.5 9h2M19.5 9h2M9 5.5c0-1 1-1 1-2M14 5.5c0-1 1-1 1-2" />
    </Svg>
  ),
};

export function ApplianceIcon({ appliance, ...p }: P & { appliance: Appliance }) {
  return ICONS[appliance](p);
}

/** "Oven · 200°C fan · 25 min", shown under a step. */
export function HeatChip({ heat, large }: { heat: Heat; large?: boolean }) {
  const parts = [heatLabel(heat), timeLabel(heat)].filter(Boolean);
  return (
    <p className={`heat-chip${large ? " lg" : ""}`}>
      <ApplianceIcon appliance={heat.appliance} size={large ? 22 : 16} />
      <span className="appl">{applianceInfo(heat.appliance).label}</span>
      {parts.map((p) => (
        <span key={p} className="part">{p}</span>
      ))}
    </p>
  );
}
