import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import KilnConsole from '../kiln.jsx';

function requestFs(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  return fn ? fn.call(el) : Promise.reject(new Error('unsupported'));
}
function exitFs() {
  const fn =
    document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  return fn ? fn.call(document) : Promise.resolve();
}
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

/**
 * The console in a frame, with a real Fullscreen API toggle.
 *
 * kiln.jsx sizes its canvas off its wrapper's clientWidth on window `resize`.
 * Entering fullscreen does fire a resize, but we nudge one anyway on the next
 * frame so the grid always refits to the new viewport.
 */
export default function SimWell({ bare = false }) {
  const hostRef = useRef(null);
  const [full, setFull] = useState(false);
  const [noFs, setNoFs] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setFull(fsElement() === hostRef.current);
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggle = useCallback(() => {
    if (fsElement()) {
      exitFs();
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    requestFs(host).catch(() => setNoFs(true));
  }, []);

  /* `f` toggles fullscreen, unless the user is typing in the seed / share field. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <div
      ref={hostRef}
      className={
        'simhost bg-bone ' +
        (bare ? '' : 'overflow-hidden rounded-[3px] border border-ink/85 shadow-[0_1px_0_#12171a1a]')
      }
    >
      {/* Hidden while fullscreen (see .simhost:fullscreen .simchrome in index.css) */}
      <div className="simchrome flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule/60 bg-ink/[0.045] px-3 py-2">
        <span className="eyebrow">Live world · seed 909</span>

        <span className="hidden text-[11.5px] leading-snug text-dim md:inline">
          It is already running. Grab a slider and break something.
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          {noFs && (
            <span className="font-mono text-[10px] text-ox">
              fullscreen blocked — try{' '}
              <Link className="underline" to="/play">
                /play
              </Link>
            </span>
          )}
          {bare ? (
            <Link
              to="/"
              className="rounded-[2px] border border-rule px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.05em] hover:bg-ink/10"
            >
              ← back to the write-up
            </Link>
          ) : (
            <Link
              to="/play"
              className="hidden rounded-[2px] border border-rule px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.05em] hover:bg-ink/10 sm:inline-block"
              title="The console on its own page, no site chrome"
            >
              own page
            </Link>
          )}
          <button
            type="button"
            onClick={toggle}
            className="rounded-[2px] border border-ink bg-ink px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.05em] text-bone hover:bg-ink/85"
            title="Fullscreen (f)"
          >
            {full ? '⤡ exit fullscreen' : '⤢ fullscreen'}
          </button>
        </div>
      </div>

      <KilnConsole />
    </div>
  );
}
