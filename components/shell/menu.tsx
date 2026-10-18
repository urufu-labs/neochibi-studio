'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/// Click-to-open popover menu (the launchpad's ui/Menu without GSAP). Closes on
/// outside click, Escape and route change. `trigger` receives the open state.
export function Menu({
  trigger,
  children,
  align = 'end',
  width = 220,
  label,
}: {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  width?: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={wrap} className="ui-menu">
      <span
        className="ui-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setOpen(true);
        }}
      >
        {trigger(open)}
      </span>
      {open && (
        <div role="menu" aria-label={label} className="ui-menu-panel" data-align={align} style={{ width }}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
