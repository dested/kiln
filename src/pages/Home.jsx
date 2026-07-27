import { Link } from 'react-router-dom';
import SimWell from '../components/SimWell.jsx';
import { Shell, Section, Steps, Ledger, K, Figures, Note, BtnLink, P } from '../components/ui.jsx';

/* ------------------------------------------------------------------ *
   Legend. The swatch colours reproduce the renderer's own rule:
   saturation and lightness both climb with tier, so refined matter is
   vivid and raw gravel is nearly invisible.
 * ------------------------------------------------------------------ */
const MATTER = [
  { c: 'hsl(30 10% 24%)', t: 'Tier 0', d: 'Raw gravel. Rains from the sky. Barely food.' },
  { c: 'hsl(44 41% 39%)', t: 'Tier 2', d: 'Two smashes in. Worth carrying.' },
  { c: 'hsl(158 72% 52%)', t: 'Tier 4', d: 'Sixteen motes bound into one object.' },
  { c: 'hsl(272 92% 66%)', t: 'Tier 6', d: 'Sixty-four motes. Very few ever exist.' },
];

function Agent({ halo, ring }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      {halo && <circle cx="12" cy="12" r="8.5" fill="#93c9a8" opacity="0.28" />}
      {ring && <circle cx="12" cy="12" r="8" fill="none" stroke="#C08A2E" strokeWidth="1.6" />}
      <rect x="9" y="9" width="6" height="6" fill="#DAD5C5" />
    </svg>
  );
}

const AGENTS = [
  { el: <Agent />, t: 'An agent', d: 'Tinted by what it digests, sized by how much energy it has.' },
  { el: <Agent halo />, t: 'Halo', d: 'Carrying a refined artifact. This is what wealth looks like.' },
  { el: <Agent ring />, t: 'Ring', d: 'Carrying a tool. Nobody wrote a tool into the game.' },
];

function Legend() {
  return (
    <div className="mt-4 overflow-hidden rounded-[3px] border border-ink/85 bg-well">
      <div className="grid gap-px bg-bone/10 sm:grid-cols-2">
        <div className="bg-well p-4">
          <p className="eyebrow text-bone2/70">Matter · colour is the element, vividness is refinement</p>
          <ul className="mt-3 space-y-2.5">
            {MATTER.map((m) => (
              <li key={m.t} className="flex items-start gap-3">
                <span
                  className="mt-[3px] h-4 w-4 shrink-0 rounded-[1px]"
                  style={{ background: m.c }}
                />
                <span className="min-w-0 text-[13px] leading-snug text-bone2">
                  <span className="font-mono text-[11px] tracking-[0.06em] text-bone">{m.t}</span>
                  <span className="mx-1.5 text-rule/60">·</span>
                  {m.d}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-well p-4">
          <p className="eyebrow text-bone2/70">Agents</p>
          <ul className="mt-3 space-y-2.5">
            {AGENTS.map((a) => (
              <li key={a.t} className="flex items-start gap-2">
                {a.el}
                <span className="min-w-0 pt-[3px] text-[13px] leading-snug text-bone2">
                  <span className="font-mono text-[11px] tracking-[0.06em] text-bone">{a.t}</span>
                  <span className="mx-1.5 text-rule/60">·</span>
                  {a.d}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-bone/15 pt-3 text-[12.5px] leading-relaxed text-rule">
            Mostly you will see a dull field with bright dots moving through it. That is the
            headline result, not a rendering problem: the technology lives in their hands, not on
            the floor.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const SIX = [
  {
    body: (
      <>
        Six kinds of raw matter rain onto a grid in patches, forever — every mote paid for out of
        one global energy budget. Nothing here is free.
      </>
    ),
  },
  {
    body: (
      <>
        Small agents walk around. Each has <strong>two hands</strong> and can hold one thing per
        hand.
      </>
    ),
  },
  {
    body: (
      <>
        When both hands are full, an agent may smash the two things together. It gets one new
        thing.
      </>
    ),
  },
  {
    body: (
      <>
        <strong>What it gets is not on any list.</strong> <K>combine(a, b)</K> is a hash of the two
        parents and the world's seed. There is no recipe table to write, to balance, or to finish.
        Every world has different chemistry.
      </>
    ),
  },
  {
    body: (
      <>
        Raw gravel is <em>barely</em> food — 6 to 17 percent digestible. Refined things are real
        food. Sixteen raw motes are worth about 1.3 energy; one tier-4 artifact built from those
        same sixteen motes is worth about 5.1. <strong>Refining pays roughly four to one.</strong>
      </>
    ),
  },
  {
    body: (
      <>
        Agents that happen to be born wanting the right things eat, reproduce, and pass those wants
        on — sixteen numbers, slightly mutated. Nothing learns anything during its own lifetime.
      </>
    ),
  },
];

const FAILURES = [
  [
    'It settles into a pattern and stops',
    <>
      Energy flows <em>through</em> the world — in as sunlight, out as heat — instead of pooling in
      it. There is no resting state to fall into.
    </>,
  ],
  [
    'Something starts breeding without limit',
    <>
      Matter is minted only from a finite pool, one charge per mote. Population is not capped by a
      rule; it is capped by arithmetic.
    </>,
  ],
  [
    'Players find all 200 recipes and leave',
    <>
      There is no list of 200. Recipes are hash-derived, so the space is not enumerable. A
      200,000-tick run passed through 3.29 million distinct elements.
    </>,
  ],
  [
    'Evolution finds the best genome and freezes',
    <>
      The environment is largely made of the other agents. Mine a rich branch and you deplete it,
      and the optimum moves somewhere else.
    </>,
  ],
  [
    'New patterns appear but change nothing',
    <>
      Everything discovered is either food, or a tool, or neither. Novelty is immediately
      economic — it pays or it doesn't.
    </>,
  ],
];

const EMERGED = [
  {
    h: 'The tech tree is climbable by a population, but not by any individual',
    body: (
      <>
        Two hands means the only way to build something big is to hold it in one hand and feed it
        single motes with the other. Reaching mass 64 takes 63 lucky finds while also eating and
        breeding — almost nobody manages it. The escape hatch is the floor: an agent can{' '}
        <em>put something down</em>. Babies are born next to their parent, so caches
        disproportionately fall to relatives, which is the only reason a habit as apparently
        generous as leaving good things lying around can be selected for at all. Handing unfinished
        work to your descendants is the sole route upward. Nobody designed that; it is what two
        hands and a shared floor produce.
      </>
    ),
  },
  {
    h: 'Tools invented themselves',
    body: (
      <>
        Somewhere in the hash space, hardness and catalysis happen to co-occur. Objects from that
        region make crafting cheaper and more efficient, and evolution found them and started
        equipping them. Stick and stone really do make a hammer here — except nobody wrote down
        that they do. A dropped tool also accelerates chemistry in the cells around it by up to
        ten times, so an abandoned tool becomes a workshop and matter refines nearby on its own.
      </>
    ),
  },
  {
    h: 'Crafting is what makes them peaceful',
    body: (
      <>
        The clearest result in the whole model. Early versions where refining didn't pay converged
        on predation drive 0.90–0.96 within a few thousand ticks — the agents became each other's
        food supply, because a neighbour was worth about seven raw motes. Once the refinement
        premium made crafting the better living, predation fell to 0.07 with{' '}
        <strong>no rule change at all</strong>. A cheap path to prosperity is what makes a
        population non-violent. You can switch it off yourself: drag{' '}
        <em>Refinement premium</em> to zero and watch.
      </>
    ),
  },
  {
    h: 'A food chain three or four levels deep, and then it stops',
    body: (
      <>
        Flesh counts as two tiers above the body that produced it. So a predator eating a tier-2
        grazer is eating tier-4 material and needs a digestion centred near tier 4 — at which point
        it can no longer eat gravel and is an obligate carnivore. Its own predator would need tier
        6. The ladder runs out after three or four levels, for the same reason real ones do.
      </>
    ),
  },
  {
    h: 'Evolvability regulates itself',
    body: (
      <>
        How mutable a genome is, is itself in the genome. It climbs during turbulence and sinks
        toward its floor during stable stretches, then climbs again when the resource vents drift
        and the niches move.
      </>
    ),
  },
  {
    h: 'The technology ceiling was never set',
    body: (
      <>
        Volatility rises with refinement, so sufficiently refined things rot faster than they can
        be built. That lands the ceiling around tier 7. Nobody typed 7 anywhere — it is where
        lifespan, find-rate and decay happen to intersect.
      </>
    ),
  },
];

const TRY = [
  {
    h: 'Turn civilisation off',
    body: (
      <>
        Drag <em>Refinement premium</em> to 0 — or load the <strong>Flat World</strong> preset.
        Crafting stops paying, and within a few thousand ticks they turn on each other. This is the
        control condition, and it is worth watching precisely because nothing happens.
      </>
    ),
  },
  {
    h: 'Double the sunlight and watch nothing get richer',
    body: (
      <>
        Population roughly doubles; the amount of stuff lying on the ground barely moves. Density
        equilibrates at upkeep ÷ value-per-item, which does not depend on how much sun there is. If
        you want a <em>richer-looking</em> world, raise <em>Metabolism</em> instead. This is a
        genuinely counterintuitive prediction of the model, and it holds up in testing.
      </>
    ),
  },
  {
    h: 'Read the Codex for thirty seconds',
    body: (
      <>
        It is the live table of the most abundant elements right now, with tier, mass, parents and
        property bars. It never stops rewriting itself. Click an element to light up every instance
        of it in the grid. This is the panel that shows you the economy.
      </>
    ),
  },
  {
    h: 'Break it, then undo the damage exactly',
    body: (
      <>
        Mark a safe point, shove a slider until everything dies, then restore. Restores are
        bit-exact, because one deterministic random stream drives the entire world.
      </>
    ),
  },
];

const SEEDS = [
  ['1', '33%', '0.07', '0.07', 'Tool-using, peaceful, consumes what it makes'],
  ['77', '0%', '0.13 → 0.85', '0.61', 'No tool tradition; hoards; violent under pressure'],
  ['909', '34%', '0.07', '0.61', 'Tool-using and hoarding — closest to a settled economy'],
];

const LIMITS = [
  {
    h: 'Culture is a negative result',
    body: (
      <>
        There is a whole regional-tradition layer: 96 neighbourhoods each keep score of which
        combinations paid off locally, agents can weight their choices toward local opinion, and the
        tables diffuse into neighbouring regions. It works mechanically. It also{' '}
        <strong>never evolves</strong> — social drive settles at 0.02–0.03 on every seed tested,
        because genes already carry recipe knowledge well enough that a second channel earns
        nothing. It ships as a slider so you can force it on and watch traditions form, but as an
        evolved outcome it failed, and the design doc says so.
      </>
    ),
  },
  {
    h: 'Specialisation is narrower than intended',
    body: (
      <>
        Diets converge hard on tier 3 with a secondary cluster at tier 4, rather than radiating
        across many niches. The likely cause is that the digestion curve makes intermediate diets
        strictly worse than the popular one, so there is no advantage to being different.
      </>
    ),
  },
  {
    h: 'They cache, but they do not build',
    body: (
      <>
        No structures. Given that dropped catalysts already create workshop hotspots by accident,
        letting agents deliberately place items into patterns is a small change with a potentially
        large payoff.
      </>
    ),
  },
  {
    h: 'No signalling, so no real cooperation',
    body: (
      <>
        Agents can read the ground but cannot signal each other. Getting past tier 7 probably needs
        division of labour or trade, which is the obvious next mechanic and the most interesting
        one left.
      </>
    ),
  },
];

/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <main>
      {/* ---------- the thing itself, first ---------- */}
      <Shell className="pt-7 pb-2">
        <p className="max-w-[74ch] text-[17.5px] leading-[1.6] text-ink/90">
          A grid world rains gravel. Small things with two hands pick up two pieces, mash them
          together, and eat the result.{' '}
          <strong>Nobody wrote down what makes what</strong> — every recipe is a hash of the
          world's seed, so there are effectively infinite recipes and every world's are different.
          That one fact is the whole engine.
        </p>
        <div className="mt-5">
          <SimWell />
        </div>
        <Legend />
      </Shell>

      {/* ---------- plain english ---------- */}
      <Shell>
        <Section
          id="plain"
          eyebrow="Plain english"
          kicker="No jargon. This is genuinely all of it."
          title="The whole thing in six sentences"
        >
          <Steps items={SIX} />
          <P className="mt-8 border-l-2 border-verd pl-4 text-ink/90">
            That is all of it. There is no planner, no neural network, no learning within a
            lifetime, no scripted event, and no recipe list. Everything in the next two sections
            was <strong>not programmed</strong>. It fell out of those six rules.
          </P>
        </Section>

        {/* ---------- the hard problem ---------- */}
        <Section
          id="why"
          eyebrow="The hard part"
          kicker="Most of these demos are beautiful for ninety seconds."
          title="Why artificial life usually gets boring, and what stops it here"
          lead="The goal was never complexity. It was non-stationarity — making sure that whatever strategy worked at tick 40,000 does not work at tick 90,000."
        >
          <Ledger head={['The usual way these die', "KILN's answer"]} rows={FAILURES} />
          <Note label="Runs forever, literally">
            An element whose properties are a pure function of its parents and the seed can be
            forgotten and later re-derived identically. So the registry is a cache, not a ledger:
            6,000 elements live at a time, mark-and-sweep over the grid and everyone's hands, dead
            slots reused. Memory is flat while the reachable space never closes.
          </Note>
        </Section>

        {/* ---------- emergence ---------- */}
        <Section
          id="emerged"
          eyebrow="Nobody programmed this"
          kicker="Measured, not hoped for. All runs at default settings."
          title="Six things the rules did not ask for"
        >
          <Steps items={EMERGED} />
        </Section>

        {/* ---------- numbers ---------- */}
        <Section
          id="numbers"
          eyebrow="Evidence"
          kicker="One 200,000-tick run on a 176×110 grid."
          title="The long run"
        >
          <Figures
            items={[
              { v: '200,000', k: 'ticks, unattended' },
              { v: '3.29', unit: 'million', k: 'elements discovered' },
              { v: '6,000', k: 'held in memory at once' },
              { v: 'flat', k: 'memory growth' },
              { v: '516–561', k: 'population band' },
              { v: '896', k: 'generations deep' },
              { v: '7', k: 'highest tier reached' },
              { v: '0', k: 'collapses or explosions' },
            ]}
          />
          <P className="mt-7">
            And because one deterministic stream drives everything, a world's entire history
            compresses to <K>{'{seed, size, tick, journal}'}</K> — the journal being the list of
            slider edits and when they happened. A few hundred bytes describe a hundred thousand
            ticks. The share code hands someone <em>your</em> world, not one like it.
          </P>
        </Section>

        {/* ---------- seeds ---------- */}
        <Section
          id="seeds"
          eyebrow="Divergence"
          kicker="Identical rules. Different 32-bit integer."
          title="Three seeds, three civilisations"
          lead="Seeds are not cosmetic. Measured at 40,000 ticks, from exactly the same code:"
        >
          <Ledger
            head={['Seed', 'Tool use', 'Predation', 'Stockpiling', 'Character']}
            rows={SEEDS.map((r) => [
              <span className="font-mono tabular-nums">{r[0]}</span>,
              <span className="font-mono tabular-nums">{r[1]}</span>,
              <span className="font-mono tabular-nums">{r[2]}</span>,
              <span className="font-mono tabular-nums">{r[3]}</span>,
              r[4],
            ])}
          />
          <P className="mt-6 text-dim">
            Two of the three independently evolved caching to 0.61; one never did. One never
            discovered a tool tradition at all and stayed violent. These are divergent outcomes,
            not noise.
          </P>
        </Section>

        {/* ---------- try this ---------- */}
        <Section
          id="try"
          eyebrow="Sixty seconds"
          kicker="Everything below is a slider on the console above."
          title="Things worth doing right now"
        >
          <Steps items={TRY} />
        </Section>

        {/* ---------- limits ---------- */}
        <Section
          id="limits"
          eyebrow="What it doesn't do"
          kicker="The failures are the interesting part."
          title="Honest limitations"
          lead="Four things that either did not work or were never built. They are in the design document too, at the same length."
        >
          <Steps items={LIMITS} />
        </Section>

        {/* ---------- read on ---------- */}
        <Section eyebrow="Go deeper" kicker="Both are the originals, unedited." title="Read the real thing">
          <P>
            The write-up above is the plain-language version. The design document is the full
            account — every formula, every parameter, the results tables, and the sections on what
            failed. The source is one React file with no backend: the deterministic simulation core,
            the element table, the agent loop, and the renderer.
          </P>
          <div className="mt-6 flex flex-wrap gap-2">
            <BtnLink to="/design" solid>
              Design document →
            </BtnLink>
            <BtnLink to="/source">Read kiln.jsx (1,502 lines)</BtnLink>
            <BtnLink to="/play">Console, no chrome</BtnLink>
          </div>
          <p className="mt-5 max-w-[66ch] text-[14px] leading-relaxed text-dim">
            Prefer to skim?{' '}
            <Link className="lnk" to="/design#7-what-actually-emerged">
              Section 7
            </Link>{' '}
            of the document is the measured results, and{' '}
            <Link className="lnk" to="/design#9-limitations-and-what-id-do-next">
              section 9
            </Link>{' '}
            is what the author would do next.
          </p>
        </Section>
      </Shell>
    </main>
  );
}
