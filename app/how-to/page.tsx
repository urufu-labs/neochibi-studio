import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { GuideToc } from '@/components/guide-toc';
import styles from '@/styles/guide.module.css';

export const metadata: Metadata = {
  title: 'How it works · urufulabs studio',
  description: 'A walkthrough for making your first generative NFT collection with urufulabs studio.',
};

/// Guide for the studio, laid out like the launchpad's /docs page: contents rail,
/// one reading column, a notes rail. Plain words, sentence case, no em dashes.

const SECTIONS = [
  { id: 'overview', label: 'How it works' },
  { id: 'import', label: '1. Import your art' },
  { id: 'tune', label: '2. Tune rarity and rules' },
  { id: 'generate', label: '3. Generate' },
  { id: 'review', label: 'Fix and add tokens' },
  { id: 'publish', label: 'Publish or download' },
  { id: 'tips', label: 'Tips' },
  { id: 'faq', label: 'FAQ' },
];

const IMPORT_STEPS = [
  {
    title: 'Name your collection',
    body: 'Click the collection name under the Trait forge title and type a new one. Enter saves, Esc cancels. You can rename it any time, even after generating.',
  },
  {
    title: 'Drop your trait folders',
    body: 'Drag one folder that holds a subfolder per layer onto the import strip, or click Add traits to pick them. Each subfolder becomes a layer and each image inside becomes a trait.',
  },
  {
    title: 'Put the layers in order',
    body: 'Layers stack top to bottom, so the first layer is drawn first (the background). Drag a layer card or use the up and down arrows, then press Save order.',
  },
  {
    title: 'Rename, replace or delete',
    body: 'Rename a layer or trait right on its card. The name you type is what shows up in token metadata. Replace swaps a trait image in place, and Delete warns you first if a rule uses it.',
  },
  {
    title: 'Check it in the preview',
    body: 'Pick a trait per layer, or press Shuffle in the single-token preview to roll a random one. Effects (outlines, grain, color tweaks) are optional and only apply to the preview export.',
  },
];

const RULES = [
  { name: 'Always, Optional, Never', what: 'Per layer. Always means every token gets one, Never skips the layer, Optional gives it a chance to appear that you set in percent.' },
  { name: 'Skips when present', what: 'When an optional layer rolls, it can switch off other layers. Example: a hood that hides the hair layer.' },
  { name: 'Trait subset', what: 'Limit a layer to only some of its traits without deleting the rest.' },
  { name: 'Trait pairs', what: 'Two traits that always go together. When A rolls, B is forced on its layer. Good for matching colorways.' },
  { name: 'Trait conflicts', what: 'Two traits that never go together. If both roll, the second is dropped and its layer rolls again.' },
  { name: 'Layer exclusions', what: 'Extra skip rules that apply every time a source layer rolls.' },
];

const PUBLISH_OPTIONS = [
  {
    title: 'Publish to IPFS',
    body: 'Pins your images as one folder, then the ERC-721 metadata as a second folder. You get one metadata CID to use as baseURI, plus buttons that open the urufu labs launchpad with the NFT or DN404 form already filled in.',
  },
  {
    title: 'Download bundle',
    body: 'One zip with images/, metadata/ and a README. Host it anywhere (your own server, S3, Arweave). Set the image URL prefix before you download, or leave the placeholder and find-and-replace it later.',
  },
];

const TIPS = [
  'Save every layer as a transparent PNG so the stack lines up cleanly.',
  'Keep every trait the same canvas size, for example 1024 x 1024. Mixed sizes will misalign.',
  'Your work lives in this browser. Refreshing is safe, but clearing site data or switching browsers starts you fresh.',
  'Use Random rolls on the Tune tab to sanity-check rarity before you generate 10,000.',
  'Collection stats show how many unique combinations your rules allow. Aim for at least 2x your target size.',
  'A bad token does not mean regenerating everything. Open it in the collection browser and reroll or swap traits.',
];

const FAQ = [
  {
    q: 'Does my art leave my computer?',
    a: 'No. Every trait, weight, rule and generated token stays in your browser until you press Publish to IPFS. Download bundle never uploads anything.',
  },
  {
    q: 'Is there a maximum collection size?',
    a: 'The target caps at 10,000 to keep generation smooth. Below that, make as many or as few as you like.',
  },
  {
    q: 'Do I need a wallet?',
    a: 'Not to design or generate. You only need one when you launch the collection on urufu labs or another launchpad.',
  },
  {
    q: 'How many unique tokens can my layers make?',
    a: 'Multiply the trait count of every layer. Five layers with six traits each give 7,776 combinations. Optional layers and rules change the number, so check Collection stats on the Tune tab.',
  },
  {
    q: 'What if I close the tab while it generates?',
    a: 'Tokens that already finished stay saved in your browser. Start Generate again when you are back.',
  },
  {
    q: 'What happens to my 1-of-1s if I regenerate?',
    a: 'The studio asks first. Keep leaves your 1-of-1s untouched and only redoes the generated tokens. Wipe clears everything and starts over.',
  },
];

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {sub ? <p className={styles.sub}>{sub}</p> : null}
      {children}
    </section>
  );
}

function Steps({ items }: { items: Array<{ title: string; body: string }> }) {
  return (
    <ol className={styles.steps}>
      {items.map((step, i) => (
        <li key={step.title}>
          <span className={styles.stepNum}>{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function HowToPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header} aria-labelledby="howto-title">
        <div>
          <p className={styles.eyebrow}>Guide</p>
          <h1 id="howto-title" className={styles.title}>Make your first collection</h1>
          <p className={styles.lede}>
            Upload your trait layers, set how rare each one is, and generate up to 10,000 unique tokens right in
            your browser. Then publish to IPFS and launch on urufu labs, or download a zip you host yourself.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/studio" className="ui-btn" data-variant="primary" data-size="lg">
            Open the studio
          </Link>
        </div>
      </header>

      <div className={styles.layout}>
        <GuideToc label="Contents" items={SECTIONS} />

        <article className={styles.content}>
          <Section id="overview" title="How it works">
            <p className={styles.prose}>
              You don&apos;t draw each token. You draw the parts (backgrounds, bodies, eyes, hats) as separate
              layers, and the studio combines them into unique tokens for you. The studio has three tabs that
              follow the same order as this guide: <strong>Import</strong>, <strong>Tune</strong> and{' '}
              <strong>Generate</strong>.
            </p>
            <div className={styles.metrics}>
              <div className={styles.metric}>
                <span>Max tokens</span>
                <b>10,000</b>
              </div>
              <div className={styles.metric}>
                <span>Runs on</span>
                <b>Your device</b>
              </div>
              <div className={styles.metric}>
                <span>Metadata</span>
                <b>ERC-721</b>
              </div>
            </div>
          </Section>

          <Section
            id="import"
            title="1. Import your art"
            sub="Get your layers in, in the right order, and check a few combinations by eye."
          >
            <p className={styles.groupTitle}>Folder layout</p>
            <pre className={styles.code}>{`my-collection/
├─ background/
│  ├─ sky.png
│  └─ dusk.png
├─ body/
│  ├─ pink.png
│  └─ mint.png
└─ hat/
   ├─ beanie.png
   └─ crown.png`}</pre>
            <Steps items={IMPORT_STEPS} />
            <div className={styles.callout} data-tone="info">
              <span className={styles.calloutLabel}>Paste from anywhere</span>
              Press Paste new on a layer, then Ctrl+V (Cmd+V on Mac) an image to add it as a new trait. Replace works
              the same way for an existing trait.
            </div>
          </Section>

          <Section
            id="tune"
            title="2. Tune rarity and rules"
            sub="Decide how common each trait is and which combinations are allowed."
          >
            <p className={styles.prose}>
              <strong>Trait rarities</strong> are weights. A trait with weight 10 shows up about ten times as often
              as one with weight 1 on the same layer. Set them per trait under Trait rarities.
            </p>
            <p className={styles.groupTitle}>Collection rules</p>
            <div className={styles.rows}>
              {RULES.map((rule) => (
                <div key={rule.name} className={styles.row}>
                  <p className={styles.rowName}>{rule.name}</p>
                  <p className={styles.rowWhat}>{rule.what}</p>
                </div>
              ))}
            </div>
            <p className={styles.note} style={{ marginTop: 14 }}>
              Collection stats and Random rolls on the same tab update as you change things, so you can see the
              effect before you generate.
            </p>
          </Section>

          <Section
            id="generate"
            title="3. Generate"
            sub="Render the real collection. It runs in the background on your machine."
          >
            <ul className={styles.list}>
              <li>Set the collection name, description and ticker. These go into every token&apos;s metadata.</li>
              <li>Pick a target size, up to 10,000, and press Generate.</li>
              <li>You see live progress, speed and time left, plus the last few tokens as they finish.</li>
              <li>Cancel any time. Tokens that already finished are kept.</li>
            </ul>
          </Section>

          <Section
            id="review"
            title="Fix and add tokens"
            sub="Every finished token shows up in the collection browser on the Generate tab."
          >
            <div className={styles.cards}>
              <div className={styles.card}>
                <h3>Reroll</h3>
                <p>Give one token a new random combination. It keeps its token number.</p>
              </div>
              <div className={styles.card}>
                <h3>Swap traits</h3>
                <p>Hand-pick the trait for each layer with a live preview, then save.</p>
              </div>
              <div className={styles.card}>
                <h3>Delete</h3>
                <p>Remove a token you don&apos;t want in the final set.</p>
              </div>
              <div className={styles.card}>
                <h3>Add a 1-of-1</h3>
                <p>
                  Upload a finished image or compose one from your traits. 1-of-1s go at the end of the collection
                  and survive regeneration.
                </p>
              </div>
            </div>
          </Section>

          <Section id="publish" title="Publish or download" sub="Nothing leaves your browser until you press one of these.">
            <Steps items={PUBLISH_OPTIONS} />
            <p className={styles.prose}>
              Token metadata lives at <code>ipfs://METADATA_CID/{'{tokenId}'}.json</code>. The launchpad reads the
              same layout for both the NFT and DN404 lanes, so one publish works for either.
            </p>
          </Section>

          <Section id="tips" title="Tips">
            <ul className={styles.list}>
              {TIPS.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </Section>

          <Section id="faq" title="FAQ">
            <div className={styles.faq}>
              {FAQ.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <div>{item.a}</div>
                </details>
              ))}
            </div>
          </Section>
        </article>

        <aside className={styles.rail} aria-label="Notes">
          <div className={styles.railCard}>
            <b>Before you start</b>
            <ul className={styles.list}>
              <li>Transparent PNGs, one folder per layer</li>
              <li>Same canvas size for every trait</li>
              <li>About 2x more combinations than tokens</li>
            </ul>
          </div>
          <div className={styles.railCard}>
            <b>Ready to launch?</b>
            <p>
              After you publish, the studio hands your metadata straight to the urufu labs launchpad as an NFT
              collection or a DN404.
            </p>
            <a href="https://www.urufulabs.xyz" target="_blank" rel="noopener noreferrer" className="ui-btn" data-size="sm">
              Visit the launchpad ↗
            </a>
          </div>
        </aside>
      </div>
    </main>
  );
}
