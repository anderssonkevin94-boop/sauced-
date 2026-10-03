"use client";
import { useEffect, useRef, useState } from "react";

// Drag-to-reorder for a list of rows, by a handle. Works with touch, mouse and pen (pointer
// events), scrolls the page or sheet when a row is held near its edge, and takes the arrow
// keys on the handle. Rows must carry `data-row` and share one parent.

type Drag = { from: number; over: number; dy: number; shift: number };

type Start = {
  y: number;
  lastY: number;
  mids: number[];
  from: number;
  scroller: HTMLElement;
  scroll0: number;
};

/** The nearest ancestor that scrolls, or the page. */
function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement as HTMLElement;
}

/**
 * `max` is the last index a row may land on (the blank row waiting at the end isn't one).
 * `move(from, to)` is called once, on drop.
 */
export function useDragSort(max: number, move: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<Drag | null>(null);
  const start = useRef<Start | null>(null);
  const frame = useRef(0);

  const update = (d: Drag | null) => {
    live.current = d;
    setDrag(d);
  };

  function track() {
    const s = start.current;
    const d = live.current;
    if (!s || !d) return;
    const scrolled = s.scroller.scrollTop - s.scroll0;
    const dy = s.lastY - s.y + scrolled;
    const center = s.mids[s.from] + dy;
    let over = s.from;
    while (over < max && center > s.mids[over + 1]) over++;
    while (over > 0 && center < s.mids[over - 1]) over--;
    if (dy !== d.dy || over !== d.over) update({ ...d, dy, over });
  }

  // Held near the top or bottom: keep scrolling while the finger stays there.
  function autoScroll() {
    const s = start.current;
    if (!s) return;
    const view = s.scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : s.scroller.getBoundingClientRect();
    const edge = 72;
    const up = s.lastY - view.top < edge;
    const down = view.bottom - s.lastY < edge;
    if (up || down) {
      const dist = up ? edge - (s.lastY - view.top) : edge - (view.bottom - s.lastY);
      s.scroller.scrollTop += (up ? -1 : 1) * Math.min(14, Math.max(2, dist / 5));
      track();
    }
    frame.current = requestAnimationFrame(autoScroll);
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function end(commit: boolean) {
    cancelAnimationFrame(frame.current);
    const d = live.current;
    start.current = null;
    update(null);
    if (commit && d && d.over !== d.from) move(d.from, d.over);
  }

  function handleProps(index: number) {
    return {
      onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        const row = e.currentTarget.closest<HTMLElement>("[data-row]");
        const items = row?.parentElement ? [...row.parentElement.children].filter((el) => el.hasAttribute("data-row")) : [];
        if (!row || !items.length) return;
        e.preventDefault();
        try {
          // Keeps the moves coming to the handle while the finger wanders off it.
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        const rects = items.map((el) => el.getBoundingClientRect());
        const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
        const scroller = scrollParent(row);
        start.current = {
          y: e.clientY,
          lastY: e.clientY,
          mids: rects.map((r) => r.top + r.height / 2),
          from: index,
          scroller,
          scroll0: scroller.scrollTop,
        };
        update({ from: index, over: index, dy: 0, shift: rects[index].height + gap });
        frame.current = requestAnimationFrame(autoScroll);
      },
      onPointerMove(e: React.PointerEvent<HTMLElement>) {
        if (!start.current) return;
        start.current.lastY = e.clientY;
        track();
      },
      onPointerUp: () => end(true),
      onPointerCancel: () => end(false),
      onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
        const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : null;
        if (to === null) return;
        e.preventDefault();
        if (to >= 0 && to <= max) move(index, to);
      },
    };
  }

  /** Style for row `index`: the held row follows the finger, the rows it passes make room. */
  function rowStyle(index: number): React.CSSProperties | undefined {
    if (!drag) return undefined;
    const { from, over, dy, shift } = drag;
    if (index === from) return { transform: `translateY(${dy}px)`, position: "relative", zIndex: 3, transition: "none" };
    if (from < over && index > from && index <= over) return { transform: `translateY(${-shift}px)` };
    if (from > over && index < from && index >= over) return { transform: `translateY(${shift}px)` };
    return { transform: "translateY(0)" };
  }

  return { handleProps, rowStyle, dragging: drag?.from ?? null };
}

/** Moves one item of an array to a new index. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
