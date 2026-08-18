'use client';

interface StudioStepsProps {
  hasLayers: boolean;
  hasOutputs: boolean;
  publishedCid: string | null;
}

const STEPS = [
  { n: '01', jp: '一', title: 'import', hint: 'drop your trait folders' },
  { n: '02', jp: '二', title: 'tune', hint: 'weights, rules, preview' },
  { n: '03', jp: '三', title: 'generate', hint: 'render the collection' },
  { n: '04', jp: '四', title: 'publish', hint: 'pin to IPFS, get a CID' },
] as const;

export function StudioSteps({ hasLayers, hasOutputs, publishedCid }: StudioStepsProps) {
  const currentIndex = publishedCid
    ? 3
    : hasOutputs
    ? 3
    : hasLayers
    ? 1
    : 0;

  return (
    <nav
      aria-label="studio workflow"
      className="uru-shell-tight studio-steps"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
        padding: '10px 12px',
      }}
    >
      {STEPS.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending';
        const bg =
          state === 'active'
            ? 'var(--pink-hot)'
            : state === 'done'
            ? 'var(--mint)'
            : 'var(--paper-white)';
        const fg = state === 'active' ? '#fff' : 'var(--anchor)';
        const border = state === 'active' ? 'var(--anchor)' : state === 'done' ? 'var(--mint-hot)' : 'var(--anchor)';
        return (
          <div
            key={step.n}
            data-state={state}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              background: bg,
              color: fg,
              border: `1.5px solid ${border}`,
              borderRadius: 10,
              boxShadow: state === 'active' ? '2px 2px 0 var(--anchor)' : 'none',
            }}
            title={step.hint}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: state === 'active' ? '#fff' : state === 'done' ? 'var(--mint-hot)' : 'var(--cream)',
                color: state === 'active' ? 'var(--pink-hot)' : 'var(--anchor)',
                border: `1px solid ${state === 'active' ? 'var(--pink-hot)' : 'var(--anchor)'}`,
                fontFamily: 'var(--font-jp), DotGothic16, monospace',
                fontSize: 14,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {step.jp}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span
                className="uru-eyebrow"
                style={{ color: fg, fontSize: 10, lineHeight: 1 }}
              >
                step <span className="uru-num">{step.n}</span>
                {state === 'done' ? ' ✓' : ''}
              </span>
              <strong
                style={{
                  fontFamily: 'var(--font-round), Klee One, cursive',
                  fontSize: 14,
                  lineHeight: 1.2,
                  color: fg,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.title}
              </strong>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
