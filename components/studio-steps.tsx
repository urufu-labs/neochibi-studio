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
  title: string;
  hint: string;
}

const STEPS: readonly StepDef[] = [
  { id: 'import',   n: '1', title: 'Import',   hint: 'Drop trait folders, order layers' },
  { id: 'tune',     n: '2', title: 'Tune',     hint: 'Weights, rules, random rolls' },
  { id: 'generate', n: '3', title: 'Generate', hint: 'Render, download, publish to IPFS' },
] as const;

/// Import / Tune / Generate step bar. Segmented like the launchpad's create steps:
/// the number turns into a check once a step has what it needs.
export function StudioSteps({ activeTab, onTabChange, hasLayers, hasOutputs }: StudioStepsProps) {
  const isDone = (id: StudioMainTab): boolean => {
    if (id === 'import') return hasLayers;
    if (id === 'tune') return hasLayers && hasOutputs;
    return false;
  };

  return (
    <nav aria-label="Studio workflow" className="studio-tabs">
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
          >
            <span aria-hidden className="studio-tab-num">{done ? '✓' : step.n}</span>
            <span className="studio-tab-body">
              <strong className="studio-tab-title">{step.title}</strong>
              <span className="studio-tab-eyebrow">{step.hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
