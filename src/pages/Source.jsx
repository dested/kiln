import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Prism from 'prismjs';
import 'prismjs/components/prism-jsx';
import raw from '../kiln.jsx?raw';

/** Descriptions for the top-level declarations, keyed by name. */
const NOTES = {
  RNG: 'One xorshift32 stream drives the entire world. No Math.random anywhere.',
  hash3: 'The mixing function. Element properties come out of here, not out of a table.',
  ElementTable: 'Parallel typed arrays for 6,000 live elements, plus the mark-and-sweep collector.',
  World: 'The simulation: matter rain, decay, ambient chemistry, the agent loop, demes, snapshots.',
  hsl32: 'Packs a colour into a uint32 for the offscreen pixel buffer.',
  Trace: 'Sparkline instrument.',
  Bar: 'Property bar in the Codex.',
  Panel: 'Instrument frame.',
  KilnConsole: 'The dashboard: canvas renderer, views, sliders, presets, safe points, share codes.',
};

export default function Source() {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  /* Drop the trailing newline so the gutter doesn't invent a final empty line. */
  const lines = useMemo(() => raw.replace(/\n$/, '').split('\n'), []);

  /* Highlight the whole file once. Rendered with `white-space: pre` and no
     wrapping, so one source line is always exactly one visual line — which is
     what lets the line-number gutter stay aligned without splitting tokens. */
  const html = useMemo(
    () => Prism.highlight(lines.join('\n'), Prism.languages.jsx, 'jsx'),
    [lines]
  );

  const outline = useMemo(() => {
    const out = [];
    lines.forEach((l, i) => {
      const m = /^(?:export default )?(?:function|class)\s+([A-Za-z_$][\w$]*)/.exec(l);
      if (m) out.push({ name: m[1], line: i + 1, kind: l.includes('class ') ? 'class' : 'fn' });
    });
    return out;
  }, [lines]);

  const fileUrl = useMemo(
    () => URL.createObjectURL(new Blob([raw], { type: 'text/plain;charset=utf-8' })),
    []
  );
  useEffect(() => () => URL.revokeObjectURL(fileUrl), [fileUrl]);

  useEffect(() => {
    document.title = 'KILN — source';
    return () => {
      document.title = 'KILN — an infinite crafting ecology that runs forever';
      clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  /* The gutter has one real element per line at the correct vertical offset,
     so it doubles as the scroll target — no anchor elements needed. */
  const jump = (line) => {
    const el = document.querySelector(`[data-line="${line}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-8 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-3">
        <div>
          <p className="eyebrow">The whole thing</p>
          <h1 className="mt-1.5 font-display text-[clamp(26px,4vw,38px)] leading-none font-semibold tracking-[-0.02em]">
            kiln.jsx
          </h1>
          <p className="mt-2.5 max-w-[62ch] text-[14.5px] leading-relaxed text-dim">
            {lines.length.toLocaleString()} lines. One file, one import, no backend, no
            dependencies beyond React. The simulation core is pure and does no DOM work; the
            console at the bottom is the only part that touches a canvas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-[2px] border border-rule px-3 py-2 font-mono text-[11px] tracking-[0.05em] hover:bg-ink/10"
          >
            {copied ? '✓ copied' : 'copy all'}
          </button>
          <a
            href={fileUrl}
            download="kiln.jsx"
            className="rounded-[2px] border border-rule px-3 py-2 font-mono text-[11px] tracking-[0.05em] hover:bg-ink/10"
          >
            ↓ download
          </a>
          <Link
            to="/design"
            className="rounded-[2px] border border-ink bg-ink px-3 py-2 font-mono text-[11px] tracking-[0.05em] text-bone hover:bg-ink/85"
          >
            design doc →
          </Link>
        </div>
      </header>

      {/* --- outline --- */}
      <div className="mt-5 mb-5">
        <p className="eyebrow">Outline</p>
        <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-2">
          {outline.map((o) => (
            <button
              key={o.name}
              type="button"
              onClick={() => jump(o.line)}
              title={NOTES[o.name] || `line ${o.line}`}
              className="group rounded-[2px] border border-rule/70 px-2.5 py-1.5 text-left hover:border-ink hover:bg-ink/[0.06]"
            >
              <span className="font-mono text-[11.5px] font-medium">{o.name}</span>
              <span className="ml-2 font-mono text-[10px] text-dim tabular-nums">
                {o.kind === 'class' ? 'class' : 'fn'} · L{o.line}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* --- the code: fixed gutter + horizontally scrolling pane --- */}
      <div className="flex overflow-hidden rounded-[3px] border border-ink/85 bg-well">
        <div
          aria-hidden="true"
          className="code-well shrink-0 border-r border-bone/10 py-3.5 pr-2.5 pl-3 text-right text-[#4b5c54] select-none"
        >
          {lines.map((_, i) => (
            <div key={i} data-line={i + 1} className="scroll-mt-24 tabular-nums">
              {i + 1}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto py-3.5">
          <pre className="code-well m-0 px-3.5" style={{ whiteSpace: 'pre' }}>
            <code
              className="language-jsx"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </pre>
        </div>
      </div>
    </main>
  );
}
