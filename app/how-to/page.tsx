import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'how to · urufulabs studio',
  description: 'A friendly walkthrough for making your first NFT collection with urufulabs studio.',
};

const steps = [
  {
    n: '01',
    jp: '一',
    title: 'name your collection',
    tape: 'uru-tape-mizuiro',
    tapeRotate: -4,
    tapeOffset: { top: -10, left: 24 },
    body: (
      <>
        <p>
          click the <strong style={{ fontFamily: 'var(--font-pixel), monospace' }}>✿ untitled collection</strong>{' '}
          stamp at the top of the studio and give your set a name. this becomes the collection title in every token&apos;s
          metadata later ✿
        </p>
        <ul className="uru-list-flower" style={{ marginTop: 8 }}>
          <li>press <kbd>enter</kbd> to save</li>
          <li>press <kbd>esc</kbd> to cancel and keep the old name</li>
          <li>you can rename it any time, even after generating</li>
        </ul>
      </>
    ),
  },
  {
    n: '02',
    jp: '二',
    title: 'drop your trait folders',
    tape: 'uru-tape-pink',
    tapeRotate: 5,
    tapeOffset: { top: -8, right: 30 },
    body: (
      <>
        <p>
          drag a folder of subfolders into the pink dashed zone. each subfolder becomes a{' '}
          <strong>layer</strong> (background, body, eyes, hat…) and each png inside becomes a{' '}
          <strong>trait</strong>.
        </p>
        <p style={{ marginTop: 8 }}>
          folder structure it expects:
        </p>
        <pre
          className="uru-num"
          style={{
            marginTop: 6,
            padding: '10px 12px',
            background: 'var(--paper-white)',
            border: '1.5px solid var(--anchor)',
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.5,
            overflowX: 'auto',
          }}
        >{`my-collection/
├─ background/
│   ├─ sky.png
│   └─ dusk.png
├─ body/
│   ├─ pink.png
│   └─ mint.png
└─ hat/
    ├─ beanie.png
    └─ crown.png`}</pre>
        <p style={{ marginTop: 8 }}>
          no folders? click <strong>+ add layer / files</strong> instead and pick pngs one at a time.
        </p>
      </>
    ),
  },
  {
    n: '03',
    jp: '三',
    title: 'rename, reorder, delete',
    tape: 'uru-tape-mint',
    tapeRotate: -3,
    tapeOffset: { top: -8, left: 40 },
    body: (
      <>
        <p>
          you own everything you upload. click any layer or trait name to rename it — the pretty name shows up in
          the token metadata; the filename stays hidden.
        </p>
        <ul className="uru-list-flower" style={{ marginTop: 8 }}>
          <li>use the <span className="uru-chip" style={{ padding: '2px 8px' }}>↑</span>{' '}
              <span className="uru-chip" style={{ padding: '2px 8px' }}>↓</span> chips to reorder layers back-to-front</li>
          <li>hover a trait row to reveal <span className="uru-eyebrow">delete</span> — it warns you first if any
              rule references it</li>
          <li>delete a whole layer with the danger button on the layer card. same warning shows what breaks</li>
        </ul>
      </>
    ),
  },
  {
    n: '04',
    jp: '四',
    title: 'tune weights & rules',
    tape: 'uru-tape-yolk',
    tapeRotate: 4,
    tapeOffset: { top: -10, right: 24 },
    body: (
      <>
        <p>
          not every trait should be equally common. bump the{' '}
          <strong>weight</strong> on a rare trait, drop it on a common one. the studio biases the roll toward higher
          weights when it generates.
        </p>
        <p style={{ marginTop: 8 }}>
          use <strong>rules</strong> to keep pairings sensible:
        </p>
        <ul className="uru-list-flower" style={{ marginTop: 6 }}>
          <li><strong>require</strong> — this trait must appear with that one (crown → cape)</li>
          <li><strong>forbid</strong> — never let these two show up together (sunglasses + monocle)</li>
          <li><strong>must-pair</strong> — treat two layers as a locked combo</li>
        </ul>
      </>
    ),
  },
  {
    n: '05',
    jp: '五',
    title: 'generate up to 10,000',
    tape: 'uru-tape-mizuiro',
    tapeRotate: -5,
    tapeOffset: { top: -8, left: 30 },
    body: (
      <>
        <p>
          scroll to <strong>generate collection ✿</strong>. set your target size (any number up to 10,000), hit
          the big button, and watch the counters climb.
        </p>
        <p style={{ marginTop: 8 }}>
          during the run you get:
        </p>
        <ul className="uru-list-flower" style={{ marginTop: 6 }}>
          <li>live <span className="uru-num">done / total</span> counters</li>
          <li>rate / second and estimated time remaining</li>
          <li>a tape reel of the last 6 tokens rendered</li>
          <li>a big <span className="uru-eyebrow">cancel</span> button — nothing is destroyed if you stop mid-run</li>
        </ul>
        <p style={{ marginTop: 8, color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive' }}>
          runs entirely in your browser. nothing uploads until you say so.
        </p>
      </>
    ),
  },
  {
    n: '06',
    jp: '六',
    title: 'publish to ipfs',
    tape: 'uru-tape-pink',
    tapeRotate: 6,
    tapeOffset: { top: -8, right: 40 },
    body: (
      <>
        <p>
          happy with the results? hit <strong>publish to ipfs</strong>. every token image gets pinned, then every
          matching ERC-721 metadata file gets pinned right after.
        </p>
        <p style={{ marginTop: 8 }}>
          you get back two{' '}
          <strong style={{ color: 'var(--pink-hot)' }}>CIDs</strong>:
        </p>
        <ul className="uru-list-flower" style={{ marginTop: 6 }}>
          <li>collection manifest — points at every png</li>
          <li>metadata index — the one you plug into your launchpad or contract</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          copy either as <span className="uru-num">ipfs://…</span> or open it through a gateway to preview the folder.
          that&apos;s it — your collection lives on the network づ｡◕‿‿◕｡)づ
        </p>
      </>
    ),
  },
  {
    n: '07',
    jp: '七',
    title: 'review your collection',
    tape: 'uru-tape-mint',
    tapeRotate: -6,
    tapeOffset: { top: -10, left: 22 },
    body: (
      <>
        <p>
          after generation, scroll to <strong>collection browser ✿</strong>. every finished token
          lives here — filter by trait, sort, or jump to a specific token id.
        </p>
        <p style={{ marginTop: 8 }}>
          click any tile to open it. from there you can:
        </p>
        <ul className="uru-list-flower" style={{ marginTop: 6 }}>
          <li><strong>reroll</strong> — pick a new random combination for that same token id</li>
          <li><strong>swap traits</strong> — hand-pick a specific trait per layer, live preview, save</li>
          <li><strong>delete</strong> — drop it entirely if it&apos;s a dud</li>
        </ul>
        <p style={{ marginTop: 8, color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive' }}>
          all edits happen locally. nothing re-uploads until you re-publish.
        </p>
      </>
    ),
  },
  {
    n: '08',
    jp: '八',
    title: 'one-of-a-kind bonus tokens',
    tape: 'uru-tape-yolk',
    tapeRotate: 5,
    tapeOffset: { top: -8, right: 40 },
    body: (
      <>
        <p>
          want a special token outside the algorithm? click{' '}
          <strong>Add 1-of-1 ✿</strong> in the browser toolbar.
        </p>
        <p style={{ marginTop: 8 }}>two ways to add one:</p>
        <ul className="uru-list-flower" style={{ marginTop: 6 }}>
          <li><strong>upload</strong> — drop in a finished png you made outside the studio</li>
          <li><strong>compose from traits</strong> — hand-pick a specific combination from your layers</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          give it a name, a description, and any custom attributes you like. 1-of-1s{' '}
          <strong>append to the end</strong> (highest token ids) and{' '}
          <strong>survive regeneration</strong> — if you re-generate the algorithm collection later, your bonus
          tokens stay untouched ♡
        </p>
      </>
    ),
  },
];

const tips = [
  { jp: '✿', text: 'transparent pngs stack correctly — save each layer with a clean alpha channel.' },
  { jp: '❁', text: 'keep every trait the same canvas size (e.g. 512×512). traits with different dimensions will misalign.' },
  { jp: '✦', text: 'refresh the page any time — everything lives in your browser storage, nothing is lost.' },
  { jp: '☆', text: 'change your mind about a layer name? rename it. metadata still uses the new name on your next generate.' },
  { jp: '♡', text: 'the shuffle button re-rolls the preview with the current traits and weights. use it to sanity-check before generating 10k.' },
  { jp: '❋', text: 'don’t like a token you got? open the collection browser, click it, hit reroll or swap traits. no need to regenerate the whole set.' },
  { jp: '❉', text: '1-of-1 bonus tokens live outside the algorithm — perfect for founder editions, ultra-rares, or story-driven picks.' },
];

export default function HowToPage() {
  return (
    <div
      className="uru-home-shell"
      style={{
        width: 'min(100% - 32px, 1120px)',
        margin: '28px auto 64px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Hero */}
      <section style={{ position: 'relative', paddingTop: 8 }}>
        <span
          className="uru-tape uru-tape-yolk"
          aria-hidden
          style={{ position: 'absolute', top: -6, left: 40, transform: 'rotate(-5deg)' }}
        />
        <span
          className="uru-tape uru-tape-pink"
          aria-hidden
          style={{ position: 'absolute', top: -6, right: 60, transform: 'rotate(4deg)' }}
        />
        <div className="uru-shell" style={{ textAlign: 'center' }}>
          <p className="uru-eyebrow">the urufulabs studio ✿ how-to</p>
          <h1
            className="uru-h1"
            style={{ margin: '10px 0 8px', fontSize: 'clamp(32px, 6vw, 56px)' }}
          >
            make your first{' '}
            <span style={{ color: 'var(--pink-hot)' }}>collection</span>
            <span
              style={{
                display: 'inline-block',
                fontFamily: 'var(--font-jp), DotGothic16, monospace',
                color: 'var(--mint-hot)',
                marginLeft: 8,
              }}
            >
              ♡
            </span>
          </h1>
          <p
            style={{
              margin: '0 auto',
              maxWidth: 620,
              fontFamily: 'var(--font-round), Klee One, cursive',
              color: 'var(--anchor-soft)',
              fontSize: 15,
              lineHeight: 1.55,
            }}
          >
            eight little steps — drop your art, tune the weights, generate up to 10,000 tokens right in your browser,
            review and rework any of them, and publish the whole set to IPFS with a click. no wallet needed to create ✿
          </p>
          <div
            className="uru-shell-inner"
            style={{
              marginTop: 14,
              maxWidth: 680,
              marginLeft: 'auto',
              marginRight: 'auto',
              padding: '12px 14px',
              textAlign: 'left',
              fontFamily: 'var(--font-body), Georgia, serif',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: 0 }}>
              <strong>how it works:</strong> urufulabs studio produces the whole collection <em>combinatorially</em>.
              you don&apos;t draw each token — you upload trait layers (background, body, eyes, hat…) and the
              studio combines them into thousands of unique tokens for you.
            </p>
            <p style={{ margin: '8px 0 0' }}>
              <strong>how big can it be?</strong> the math is trait count per layer, multiplied.
              <span className="uru-num"> 5×6 = 7,776</span> possible.{' '}
              <span className="uru-num">5×10 = 100,000</span>.{' '}
              <span className="uru-num">6×8 = 262,144</span>. want 10k? aim for at least ~2× headroom
              so the generator doesn&apos;t exhaust unique combinations.
            </p>
          </div>
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              justifyContent: 'center',
            }}
          >
            <Link href="/studio" className="uru-btn uru-btn-primary">
              open the studio →
            </Link>
            <a href="#step-01" className="uru-btn uru-btn-cream">
              read the walkthrough
            </a>
          </div>
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
            }}
          >
            <span className="uru-stamp uru-stamp-mint">100% in-browser</span>
            <span className="uru-stamp uru-stamp-mizuiro">
              up to <span className="uru-num">10,000</span> tokens
            </span>
            <span className="uru-stamp uru-stamp-yolk">ERC-721 metadata</span>
            <span className="uru-stamp uru-stamp-pink">IPFS ready</span>
          </div>
        </div>
      </section>

      {/* Numbered polaroid steps */}
      <section
        aria-label="walkthrough steps"
        style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        }}
      >
        {steps.map((step) => (
          <article
            key={step.n}
            id={`step-${step.n}`}
            className="uru-polaroid"
            style={{ position: 'relative', padding: '20px 20px 28px' }}
          >
            <span
              className={`uru-tape ${step.tape}`}
              aria-hidden
              style={{
                position: 'absolute',
                transform: `rotate(${step.tapeRotate}deg)`,
                ...step.tapeOffset,
              }}
            />
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span
                aria-hidden
                className="inline-flex items-center justify-center"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'var(--pink-hot)',
                  color: '#fff',
                  border: '1.5px solid var(--anchor)',
                  boxShadow: '2px 2px 0 var(--anchor)',
                  fontFamily: 'var(--font-jp), DotGothic16, monospace',
                  fontSize: 22,
                  lineHeight: 1,
                }}
              >
                {step.jp}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="uru-eyebrow">step <span className="uru-num">{step.n}</span></span>
                <h2 className="uru-h2" style={{ margin: 0 }}>
                  {step.title}
                </h2>
              </div>
            </header>
            <div
              style={{
                fontFamily: 'var(--font-body), Georgia, serif',
                fontSize: 14.5,
                lineHeight: 1.6,
                color: 'var(--anchor)',
              }}
            >
              {step.body}
            </div>
          </article>
        ))}
      </section>

      {/* Tips shell */}
      <section className="uru-shell" style={{ position: 'relative' }}>
        <span
          className="uru-tape uru-tape-mint"
          aria-hidden
          style={{ position: 'absolute', top: -8, right: 30, transform: 'rotate(4deg)' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span
            aria-hidden
            className="uru-stamp uru-stamp-mizuiro"
            style={{ transform: 'rotate(-4deg)' }}
          >
            pro tips
          </span>
          <h2 className="uru-h2" style={{ margin: 0 }}>
            little things that help ✿
          </h2>
        </div>
        <ul className="uru-list-flower" style={{ margin: 0, display: 'grid', gap: 6 }}>
          {tips.map((tip) => (
            <li key={tip.text} style={{ fontFamily: 'var(--font-body), Georgia, serif', fontSize: 14.5, lineHeight: 1.55 }}>
              <span
                aria-hidden
                style={{
                  fontFamily: 'var(--font-jp), DotGothic16, monospace',
                  color: 'var(--pink-hot)',
                  marginRight: 6,
                }}
              >
                {tip.jp}
              </span>
              {tip.text}
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="uru-shell" style={{ position: 'relative' }}>
        <span
          className="uru-tape uru-tape-pink"
          aria-hidden
          style={{ position: 'absolute', top: -8, left: 40, transform: 'rotate(-4deg)' }}
        />
        <p className="uru-eyebrow" style={{ marginBottom: 4 }}>frequently curious</p>
        <h2 className="uru-h2" style={{ marginTop: 0, marginBottom: 14 }}>
          quick questions
        </h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            {
              q: 'does my art leave my computer?',
              a: 'no. every trait, weight, rule, and generated token lives in your browser storage until you press publish. we do not upload anything before then ✿',
            },
            {
              q: 'is there a maximum collection size?',
              a: 'the target field caps at 10,000 to keep things smooth. below that, generate as many or as few as you like.',
            },
            {
              q: 'do i need a wallet to create?',
              a: 'no wallet needed to design or generate. you only need one later when a launchpad or contract asks you to plug in the metadata CID.',
            },
            {
              q: 'what happens if i close the tab mid-generate?',
              a: 'anything already rendered stays saved in your browser. cancel or refresh — you can resume with the same seed and pick up where you left off.',
            },
            {
              q: 'can i come back tomorrow?',
              a: 'yes. layers, traits, rules, weights, and finished tokens persist between sessions on the same device.',
            },
            {
              q: 'do i have to create each nft one by one?',
              a: "no — the studio is generative. you upload trait layers once, and it combines them algorithmically into your whole collection. you don't hand-craft individual tokens.",
            },
            {
              q: 'can i fix a bad token after generation?',
              a: 'yes. open the collection browser, click any token, and either reroll it (new random combo, same token id), or swap traits to hand-pick which trait from each layer it uses.',
            },
            {
              q: 'can i add a special one-of-a-kind?',
              a: "yes. in the collection browser, click Add 1-of-1 ✿. upload a fully-composed png or compose one from your traits. it appends to the end of the collection with a '1 of 1' marker and survives future full-collection regenerations.",
            },
            {
              q: 'what happens to my 1-of-1s if i regenerate the collection?',
              a: 'when you press Generate again with 1-of-1s in the collection, the studio asks whether to keep them. keep = 1-of-1s untouched, algorithm tokens redone. wipe = everything cleared and restarted.',
            },
          ].map((item) => (
            <details
              key={item.q}
              className="uru-shell-inner"
              style={{ borderRadius: 10 }}
            >
              <summary
                className="uru-h2"
                style={{
                  cursor: 'pointer',
                  listStyle: 'none',
                  fontSize: 16,
                  color: 'var(--anchor)',
                }}
              >
                <span style={{ color: 'var(--pink-hot)', marginRight: 6 }}>✿</span>
                {item.q}
              </summary>
              <p
                style={{
                  marginTop: 8,
                  fontFamily: 'var(--font-body), Georgia, serif',
                  fontSize: 14.5,
                  lineHeight: 1.6,
                }}
              >
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section
        className="uru-shell-tight"
        style={{
          textAlign: 'center',
          padding: '18px 20px',
          borderColor: 'var(--pink-hot)',
          background: 'var(--pink-warm)',
        }}
      >
        <p className="uru-eyebrow" style={{ marginBottom: 6 }}>ready?</p>
        <h2 className="uru-h1" style={{ margin: 0, fontSize: 'clamp(22px, 4vw, 32px)' }}>
          let&apos;s make some art ✿
        </h2>
        <div style={{ marginTop: 12 }}>
          <Link href="/studio" className="uru-btn uru-btn-primary">
            open urufulabs studio →
          </Link>
        </div>
      </section>
    </div>
  );
}
