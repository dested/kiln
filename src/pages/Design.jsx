import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import raw from '../../content/KILN-design.md?raw';

/** GitHub-compatible heading slugs, so deep links from the explainer resolve. */
const slug = (s) =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

const textOf = (node) =>
  typeof node === 'string'
    ? node
    : Array.isArray(node)
      ? node.map(textOf).join('')
      : node?.props?.children
        ? textOf(node.props.children)
        : '';

function Heading({ level, children }) {
  const Tag = `h${level}`;
  const id = slug(textOf(children));
  return (
    <Tag id={id} className="group scroll-mt-16">
      {children}
      <a
        href={`#${id}`}
        aria-label="Link to this section"
        className="ml-2 align-middle font-mono text-[13px] text-rule opacity-0 transition-opacity group-hover:opacity-100"
      >
        §
      </a>
    </Tag>
  );
}

const components = {
  h1: ({ children }) => <h1>{children}</h1>,
  h2: ({ children }) => <Heading level={2}>{children}</Heading>,
  h3: ({ children }) => <Heading level={3}>{children}</Heading>,
  /* GFM tables need their own scroll container on narrow screens. */
  table: ({ children }) => (
    <div className="tablewrap">
      <table>{children}</table>
    </div>
  ),
};

export default function Design() {
  const { hash } = useLocation();
  const [active, setActive] = useState('');

  const toc = useMemo(
    () =>
      raw
        .split('\n')
        .filter((l) => l.startsWith('## '))
        .map((l) => l.slice(3).trim())
        .map((t) => ({ t, id: slug(t) })),
    []
  );

  const mdUrl = useMemo(
    () => URL.createObjectURL(new Blob([raw], { type: 'text/markdown;charset=utf-8' })),
    []
  );
  useEffect(() => () => URL.revokeObjectURL(mdUrl), [mdUrl]);

  useEffect(() => {
    document.title = 'KILN — design document';
    return () => {
      document.title = 'KILN — an infinite crafting ecology that runs forever';
    };
  }, []);

  /* Deep links arrive before the markdown has painted, so scroll on hash change. */
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) el.scrollIntoView({ block: 'start' });
  }, [hash]);

  /* Highlight the section currently under the top of the viewport. */
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    document.querySelectorAll('.doc h2[id]').forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, []);

  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-8">
      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_236px]">
        {/* --- the document --- */}
        <article className="min-w-0 lg:order-1">
          <p className="eyebrow">Design document · verbatim</p>
          <div className="doc mt-4">
            <Markdown remarkPlugins={[remarkGfm]} components={components}>
              {raw}
            </Markdown>
          </div>

          <div className="rule-t mt-14 flex flex-wrap items-center gap-2 pt-6">
            <a
              href={mdUrl}
              download="KILN-design.md"
              className="rounded-[2px] border border-rule px-3 py-2 font-mono text-[11px] tracking-[0.05em] hover:bg-ink/10"
            >
              ↓ download the raw .md
            </a>
            <Link
              to="/source"
              className="rounded-[2px] border border-rule px-3 py-2 font-mono text-[11px] tracking-[0.05em] hover:bg-ink/10"
            >
              read the source →
            </Link>
            <Link
              to="/"
              className="rounded-[2px] border border-ink bg-ink px-3 py-2 font-mono text-[11px] tracking-[0.05em] text-bone hover:bg-ink/85"
            >
              back to the console
            </Link>
          </div>
        </article>

        {/* --- contents rail --- */}
        <nav className="hidden lg:order-2 lg:block">
          <div className="sticky top-16 pb-10">
            <p className="eyebrow">Contents</p>
            <ol className="mt-3 space-y-[3px] border-l border-rule/50">
              {toc.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={
                      '-ml-px block border-l-2 py-[3px] pl-3 text-[12.5px] leading-snug transition-colors ' +
                      (active === s.id
                        ? 'border-verd font-medium text-ink'
                        : 'border-transparent text-dim hover:border-rule hover:text-ink')
                    }
                  >
                    {s.t}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
      </div>
    </main>
  );
}
