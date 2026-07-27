import { Link } from 'react-router-dom';

/* Shared page furniture. The visual language is inherited from the simulation
   itself: bone card stock, ink hairlines, Fraunces headings, mono for anything
   that is a label or a number. Think instrument manual, not landing page. */

export function Shell({ children, className = '' }) {
  return <div className={'mx-auto max-w-[1320px] px-4 ' + className}>{children}</div>;
}

/**
 * A titled section with the label in a left rail on wide screens — the layout
 * that lets a 1320px page still hold a readable 68ch column.
 */
export function Section({ id, eyebrow, kicker, title, lead, children }) {
  return (
    <section id={id} className="rule-t scroll-mt-14 py-11 md:py-14">
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-[196px_minmax(0,1fr)]">
        <div className="md:pt-1.5">
          <p className="eyebrow">{eyebrow}</p>
          {kicker && (
            <p className="mt-2 hidden max-w-[180px] text-[12.5px] leading-snug text-dim md:block">
              {kicker}
            </p>
          )}
        </div>
        <div className="min-w-0">
          {title && (
            <h2 className="font-display text-[clamp(24px,3.4vw,34px)] leading-[1.12] font-semibold tracking-[-0.015em]">
              {title}
            </h2>
          )}
          {lead && (
            <p className="mt-3 max-w-[64ch] text-[17px] leading-[1.62] text-ink/90">{lead}</p>
          )}
          <div className={title || lead ? 'mt-7' : ''}>{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Body copy at a sane measure. */
export function P({ children, className = '' }) {
  return (
    <p className={'max-w-[68ch] text-[16.5px] leading-[1.68] ' + className}>{children}</p>
  );
}

/** Numbered list with hanging mono numerals — the manual voice. */
export function Steps({ items, start = 1 }) {
  return (
    <ol className="space-y-6">
      {items.map((it, i) => (
        <li key={i} className="grid grid-cols-[30px_minmax(0,1fr)] gap-x-4">
          <span className="pt-[3px] font-mono text-[13px] font-semibold text-ochre tabular-nums">
            {String(start + i).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            {it.h && <h3 className="text-[16.5px] leading-snug font-semibold">{it.h}</h3>}
            <div
              className={
                'max-w-[66ch] text-[16px] leading-[1.66] ' + (it.h ? 'mt-1.5 text-ink/85' : '')
              }
            >
              {it.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Two-column ledger table: hairline ruling, no boxes. */
export function Ledger({ head, rows }) {
  return (
    <div className="overflow-x-auto border-y-[1.5px] border-ink">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="border-b border-rule pt-2 pb-[7px] pr-4 align-bottom font-mono text-[9.5px] font-semibold tracking-[0.13em] text-dim uppercase last:pr-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-rule/40 py-[11px] pr-4 align-top text-[15px] leading-[1.52] last:pr-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Inline code, for parameter names and formulae. */
export function K({ children }) {
  return (
    <code className="rounded-[2px] bg-rule/30 px-[0.34em] py-[0.1em] font-mono text-[0.86em] whitespace-nowrap">
      {children}
    </code>
  );
}

/** A run of hairline-separated figures. */
export function Figures({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-px bg-rule/50 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((it, i) => (
        <div key={i} className="bg-bone px-3.5 py-3.5">
          <dd className="font-mono text-[20px] leading-none font-semibold tabular-nums">
            {it.v}
            {it.unit && (
              <span className="ml-1 text-[11px] font-medium text-dim">{it.unit}</span>
            )}
          </dd>
          <dt className="mt-2 font-mono text-[9px] tracking-[0.13em] text-dim uppercase">
            {it.k}
          </dt>
        </div>
      ))}
    </dl>
  );
}

/** Aside for caveats and negative results — ochre rule, quieter type. */
export function Note({ label, children }) {
  return (
    <div className="border-l-2 border-ochre pl-4">
      {label && <p className="eyebrow text-ochre">{label}</p>}
      <div className="mt-1.5 max-w-[66ch] text-[15.5px] leading-[1.62] text-ink/85">
        {children}
      </div>
    </div>
  );
}

/** Primary / secondary button-links that match the console's .kbtn. */
export function BtnLink({ children, to, href, solid = false, ...rest }) {
  const cls =
    'inline-block rounded-[2px] px-3 py-2 font-mono text-[11px] tracking-[0.05em] transition-colors ' +
    (solid
      ? 'border border-ink bg-ink text-bone hover:bg-ink/85'
      : 'border border-rule text-ink hover:bg-ink/10');
  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...rest}>
      {children}
    </a>
  );
}
