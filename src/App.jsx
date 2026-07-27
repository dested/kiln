import { Suspense, lazy } from 'react';
import { Routes, Route, Link, NavLink, useLocation, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Play from './pages/Play.jsx';

/* The doc + source pages pull in react-markdown and prismjs. Split them out so
   the landing page ships nothing but React and the simulation itself. */
const Design = lazy(() => import('./pages/Design.jsx'));
const Source = lazy(() => import('./pages/Source.jsx'));

const TABS = [
  { to: '/', label: 'Console', hint: 'the live world' },
  { to: '/design', label: 'Design doc', hint: 'the full write-up' },
  { to: '/source', label: 'Source', hint: 'one file, 1,502 lines' },
];

function Nav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-ink/85 bg-bone/92 backdrop-blur-[6px]">
      <div className="mx-auto flex max-w-[1320px] items-center gap-4 px-4 py-2">
        <Link to="/" className="flex shrink-0 items-baseline gap-2.5">
          <span className="font-display text-[19px] leading-none font-semibold tracking-[-0.02em]">
            KILN
          </span>
          <span className="hidden font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase sm:inline">
            infinite crafting ecology
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              title={t.hint}
              className={({ isActive }) =>
                'rounded-[2px] px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.06em] whitespace-nowrap transition-colors ' +
                (isActive ? 'bg-ink text-bone' : 'text-ink/75 hover:bg-ink/10 hover:text-ink')
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-ink/85">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-start justify-between gap-8 px-4 py-9">
        <div className="max-w-[520px]">
          <p className="font-display text-[17px] leading-tight font-semibold">KILN</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-dim">
            A deterministic artificial-life sandbox. One seed, one energy budget, no authored
            recipes. Everything it does, it worked out on its own.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-5">
          <div>
            <p className="eyebrow">Read</p>
            <ul className="mt-2 space-y-1 text-[13.5px]">
              <li>
                <Link className="lnk" to="/design">
                  Design document
                </Link>
              </li>
              <li>
                <Link className="lnk" to="/source">
                  Full source
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="eyebrow">Run</p>
            <ul className="mt-2 space-y-1 text-[13.5px]">
              <li>
                <Link className="lnk" to="/">
                  The console
                </Link>
              </li>
              <li>
                <Link className="lnk" to="/play">
                  Console, no chrome
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Loading() {
  return (
    <div className="mx-auto max-w-[1320px] px-4 py-24">
      <p className="eyebrow">Loading</p>
      <div className="mt-3 h-px w-40 animate-pulse bg-rule" />
    </div>
  );
}

export default function App() {
  const bare = useLocation().pathname === '/play';

  return (
    <div className="grain relative min-h-screen">
      <div className="relative z-10">
        {!bare && <Nav />}
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/design" element={<Design />} />
            <Route path="/source" element={<Source />} />
            <Route path="/play" element={<Play />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        {!bare && <Footer />}
      </div>
    </div>
  );
}
