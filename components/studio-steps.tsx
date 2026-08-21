'use client';

export type StudioMainTab = 'import' | 'tune' | 'generate';

interface StudioStepsProps {
  activeTab: StudioMainTab;
  onTabChange: (tab: StudioMainTab) => void;
  hasLayers: boolean;
  hasOutputs: boolean;
}

interface StepDef {
  id: StudioMainTab;
  n: string;
  jp: string;
  title: string;
  hint: string;
}

const STEPS: readonly StepDef[] = [
  { id: 'import',   n: '01', jp: '一', title: 'import',   hint: 'drop trait folders, order layers' },
  { id: 'tune',     n: '02', jp: '二', title: 'tune',     hint: 'weights, rules, random rolls' },
  { id: 'generate', n: '03', jp: '三', title: 'generate', hint: 'render, download, publish to IPFS' },
] as const;

export function StudioSteps({ activeTab, onTabChange, hasLayers, hasOutputs }: StudioStepsProps) {
  const isDone = (id: StudioMainTab): boolean => {
    if (id === 'import') return hasLayers;
    if (id === 'tune') return hasLayers && hasOutputs;
    return false;
  };

  return (
    <nav aria-label="studio workflow" className="studio-tabs">
      {STEPS.map((step) => {
        const active = step.id === activeTab;
        const done = !active && isDone(step.id);
        const state = active ? 'active' : done ? 'done' : 'pending';
        return (
          <button
            key={step.id}
            type="button"
            data-state={state}
            className="studio-tab"
            aria-current={active ? 'step' : undefined}
            onClick={() => onTabChange(step.id)}
            title={step.hint}
          >
            <span aria-hidden className="studio-tab-jp">{step.jp}</span>
            <span className="studio-tab-body">
              <span className="uru-eyebrow studio-tab-eyebrow">
                step <span className="uru-num">{step.n}</span>{done ? ' ✓' : ''}
              </span>
              <strong className="studio-tab-title">{step.title}</strong>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
