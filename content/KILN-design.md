# KILN
### An infinite crafting ecology that runs forever

---

## 1. The idea in one paragraph

A grid world rains raw matter. Things lying next to each other sometimes fuse. Small
agents walk the grid, pick things up two at a time, mash them together, and eat what
comes out. Nothing about *what* combines into *what* is written down anywhere — the
entire recipe tree is a pure function of the world seed, so it is effectively infinite
and different in every world. Raw matter is almost inedible; refined matter is
nourishing. That single asymmetry is the engine. It means the only way to make a living
is to climb a tech tree nobody has mapped, and the only way to know which branches are
worth climbing is to be descended from someone who guessed right.

Everything else — tools, predators, hoarding, trophic levels, regional traditions,
booms, crashes, arms races — falls out of that.

---

## 2. The problem this is designed around

Most artificial life demos are gorgeous for ninety seconds and then stop being
interesting. They converge. A glider gun is a glider gun forever. The usual failure
modes, and what KILN does about each:

| Failure mode | Why it happens | KILN's answer |
|---|---|---|
| **Heat death** | The system finds its lowest-energy configuration and sits there | Energy flows *through* the world (sun in, heat out) rather than sitting in it. There is no equilibrium to fall into. |
| **Explosion** | Some pattern reproduces without bound | Matter is minted only from a finite energy pool. Every mote on the grid was paid for. |
| **Exhausted novelty** | The designer wrote 200 recipes and players find all 200 | Recipes are hash-derived. The space is not enumerable. |
| **Converged genomes** | Selection finds the optimum and stops | The environment is made of the agents. When they mine a rich branch, they deplete it, and the optimum moves. |
| **Novelty that doesn't matter** | New patterns appear but change nothing | Every discovery is edible, or a tool, or neither. Novelty is immediately economic. |

The design goal is not "complexity." It is **non-stationarity**: making sure the thing
that was adaptive at tick 40,000 is not adaptive at tick 90,000.

---

## 3. Matter

### 3.1 Elements are discovered, not authored

An element is a small bundle of scalar properties:

```
tier      how refined it is        = floor(log2(mass))
mass      raw motes bound up in it
hardness  resists decay; resists being eaten
volatility  chance per tick of falling apart
affinity  willingness to react with a neighbour
catalysis rare; speeds up nearby reactions        <- this is what a tool is
fertility very rare; copies itself into empty space
nutrition fraction of stored energy that is edible
```

There are six **primordials** at tier 0, derived from `hash(seed, i)`. Everything else
is minted on demand:

```
combine(a, b) -> c        deterministic, commutative, seeded

mass_c      = mass_a + mass_b                     (refuse if > 256)
tier_c      = floor(log2(mass_c))
prop_c      = mass-weighted blend of parents  +  hash-derived noise
```

Two design decisions carry most of the weight here:

**Tier is complexity, not chain length.** The first version defined `tier = max(parents)
+ 1`, and within 700 ticks the world contained tier-194 objects: gluing a pebble onto a
pebble onto a pebble forever. Defining tier by *mass* means climbing a tier requires
doubling the material investment. Tier 6 is sixty-four primordial motes bound into one
object. It has to be earned.

**Big things are inert.** Affinity is divided by `1 + 0.42·tier`. Large bodies stop
reacting. Without this, everything eventually agglomerates into one enormous rock.

### 3.2 The latent space is infinite; the registry is a cache

Element properties are a pure function of the parent pair and the world seed. That has a
consequence worth stating plainly: **an element that no longer exists anywhere in the
world can be forgotten, and later re-derived identically.**

So the element registry is not a ledger of history. It is a working set. KILN keeps up
to 6,000 elements live and runs a mark-and-sweep collector over the grid and every
agent's hands (retaining ancestors, so lineage chains stay readable). Anything with zero
references is freed and its slot reused.

This is what makes "runs forever" true rather than aspirational. In a 200,000-tick test
run the world discovered **3.29 million elements** while never holding more than 6,000 at
once. Memory is flat. The reachable space never closes.

### 3.3 Refinement is the whole economy

Primordials have nutrition 0.06–0.17. They are gravel. Combining pushes nutrition toward
a fixed point near 0.67 with wide variance, so some branches refine into food and others
into inedible durable stock.

The edible fraction of an item is:

```
edible(x) = nutrition(x) · (1 − 0.6·hardness(x)) · (1 + refineBonus · tier(x))
```

The third factor is the **refinement premium**, and it is the single most consequential
dial in the simulation. It represents concentration — a refined object is not just more
digestible, it saves you the foraging time of finding sixteen separate motes. Set it to
zero and there is no reason to ever craft anything; the world becomes a flat grazing
lawn. Turn it up and civilisation switches on. It is exposed as a slider because
watching that threshold get crossed is the most interesting thing in the dashboard.

Concretely, at default settings: sixteen raw motes yield about 1.3 energy. One tier-4
artifact built from those same sixteen motes yields about 5.1. Refining pays roughly 4×.

### 3.4 Decay closes the matter loop

Every item has a per-tick chance `volatility · decayRate · (1 − 0.85·hardness)` of
falling apart. It decays **into one of its parents**, at 45% of its charge, with the
remainder split between the energy pool and heat.

Two things follow. Hard things persist, so durable artifacts accumulate as a kind of
sediment. And volatility rises with tier (`+0.028` per tier), so the tech tree has a
natural ceiling — sufficiently refined objects rot faster than they can be built. Nobody
had to specify a maximum tier; it's a consequence.

---

## 4. Thermodynamics: why the population doesn't crash or explode

There is exactly one source of energy: a global pool topped up at `sunRate` per tick.

- Matter is minted **only** from the pool. Every mote costs 1 charge.
- Crafting conserves charge minus a small loss (`craftYield`, default 0.99).
- Eating transfers `charge · edible · digestion`; the rest becomes heat.
- Decay and death return part of their charge to the pool; the rest becomes heat.
- The pool drains at `sunRate + 8%` of its contents, so recycled energy re-enters the
  world as new matter instead of sitting idle.

Population is therefore not capped by a rule. It is capped by arithmetic: agents die
when income drops below upkeep, and income depends on how many other agents are
competing for the same motes. Doubling the sunlight roughly doubles the population and
leaves standing matter density almost unchanged — because density equilibrates at
`upkeep / value-per-item`, independent of influx. That's a genuinely counterintuitive
prediction of the model, and it holds in testing. If you want a *richer-looking* world,
you raise metabolism, not sunlight.

**Extinction guard.** If the population falls below 6 and the pool has energy, ten fresh
random genomes are seeded. This has never triggered at default settings past the opening
few hundred ticks, but it means an unattended installation cannot end up as an empty
grid.

---

## 5. Agents

### 5.1 Genome

Sixteen floats, all in [0,1], meaning applied at use:

```
 0–4  weights on hardness / volatility / affinity / catalysis / fertility
 5    weight on tier
 6    craft drive         how eagerly it combines what it holds
 7    hunger threshold    when to stop working and eat
 8    exploration noise
 9    thrift              tendency to put finished goods down
10    reproduction threshold
11    mutation rate       (itself mutable, log-normally, floored at 0.02)
12    predation drive
13    diet centre         which tier it digests best
14    diet breadth        generalist vs specialist
15    social drive        how much it follows local tradition
```

Digestion is a Gaussian over tier:

```
efficiency(t) = 0.92 · exp( −(t − centre)² / 2·width² )
width         = 0.5 + 2.0 · breadth
upkeep        = base · (1 + 0.14 · width)
```

Breadth costs upkeep. That single trade-off is what produces specialists.

### 5.2 The loop

Ten lines, run once per agent per tick:

1. Pay upkeep. If energy ≤ 0, die and drop everything.
2. Score the nine cells of the Moore neighbourhood: food value under this genome, plus
   trait preferences, plus a predation term for occupied cells, plus exploration noise.
3. Move to the best cell — or attack, if it's occupied and predation says so.
4. On arrival: eat what's underfoot, or equip it as a tool, or pick it up.
5. If both hands are full, roll against craft drive and combine them.
6. Eat the loose item when hungry. Eat the artifact only at the brink of death.
7. When comfortable and holding something tier 2+, roll against thrift and cache it.
8. Above the reproduction threshold, split: 45/45, 10% lost, child mutated.

That's the whole agent. There is no planner, no neural network, no learning within a
lifetime. Everything that looks like intelligence is selection acting on those sixteen
numbers.

### 5.3 Two hands

The inventory is two slots plus one tool slot. This is the most important constraint in
the design and it was very nearly an accident.

With two hands, an agent can *accrete* — hold an artifact in one hand and keep feeding it
single motes with the other — but reaching mass 64 takes 63 finds and several hundred
ticks of survival while also eating and reproducing. Very few individuals get there.

The escape hatch is the ground. An agent that caches a tier-4 artifact leaves something
another agent can pick up and build on. Because offspring are born adjacent to their
parent, caches disproportionately fall to kin, which is what allows an apparently
altruistic trait to be selected at all.

The result: **the tech tree is climbable by a population but not by an individual.**
Nobody designed that. It's what two hands and a shared floor produce.

### 5.4 Tools

The third slot holds a catalyst. An equipped tool:

- pushes craft yield from 0.99 toward ~0.997 (`1 − (1−yield)·(1 − 0.75·catalysis)`)
- cuts craft cost by up to 65%
- wears out with use, and is dropped on death for someone else to find

Catalysis is rare, correlates with hardness, and rises with tier — so tools are hard,
refined, and usually inedible. Stick and stone really do make a hammer, except nobody
wrote down that they do; it's a region of the hash space where hardness and catalysis
happen to co-occur, and evolution found it.

Catalysts also boost *ambient* chemistry in their neighbourhood by up to 10×. A tool
dropped on the ground becomes a workshop: matter around it refines on its own.

### 5.5 Predation and the trophic ladder

Attacking costs 0.22 energy regardless of outcome. Success probability is
`e / (e + e_target)`. Failure costs both parties more.

The important rule: **flesh sits two tiers above the body that produced it.** A predator
eating a tier-2 grazer is eating tier-4 material, and needs a diet centre near 4 to
digest it — at which point it can no longer eat raw motes and is an obligate carnivore.
Its own predator would need tier 6. The ladder runs out after three or four levels, for
the same reason real ones do.

Attack desire also scales with genetic distance, so close kin are largely spared and
groups of relatives are stable.

Predation is strongly parameter-dependent, which is the fun part. Where crafting pays,
predation collapses to ~0.07. Where it doesn't, the world becomes cannibals within a few
thousand ticks.

### 5.6 Regional traditions

An optional layer. The grid is divided into 96 demes, each holding a small table scored
by recipe pair. When an agent profits from a combination, that pair's score rises in its
deme. Agents with high social drive weight their pickups toward locally well-regarded
pairs. Tables decay slowly and diffuse into neighbouring demes.

This is knowledge that spreads faster than genes and is *spatially* rather than
genealogically inherited — a region can hold a tradition that outlives every individual
who learned it.

Honest result: **under default settings it does not evolve.** Social drive settles at
0.02–0.03 across every seed tested. The genetic channel is fast enough that the cultural
one earns nothing. It's exposed as a slider so you can force it on and watch traditions
form and diffuse, but as an evolved outcome it's a negative result, and section 10 says
so.

---

## 6. Determinism, seeds, and safe points

One xorshift32 stream drives everything. No `Math.random`, no wall clock, no iteration
over hash maps in undefined order. Same seed plus same parameter edits gives a
bit-identical world. This is verified in the test suite.

Three ways in:

**Seed.** A world is a 32-bit integer. The seed determines the primordials, every
element's properties, the vent layout, and the founding ninety genomes. Seeds are not
cosmetic — seed 77 and seed 1 produce recognisably different civilisations from identical
rules.

**Safe points.** Full state snapshots — grid, charges, agents, element registry, meme
tables, RNG position — taken automatically every 3,000 ticks into an eight-slot ring, plus
manual marks. Restoring is instant and bit-exact. Push a slider too far, watch everything
die, drop back to the last core sample and try a gentler value.

**Share codes.** Because the world is deterministic, its entire history compresses to
`{seed, size, tick, journal}` where the journal is the list of `(tick, parameter, value)`
edits. A few hundred bytes describe a hundred thousand ticks. Loading replays from
genesis at full speed. You can hand someone a short string and they get *your* world, not
a similar one.

---

## 7. What actually emerged

Measured, not hoped for. All runs at defaults, 176×110 grid, 40k–200k ticks.

**It is stable over the long run.** 200,000 ticks: population held 516–561, mean lineage
depth reached 896 generations, tier 7 was attained, 3.29M elements were discovered and
recycled, and memory stayed flat. No collapse, no explosion, no stagnation into a fixed
point.

**Seeds produce different civilisations.** From identical rules, at 40k ticks:

| Seed | Tool use | Predation | Stockpiling | Character |
|---|---|---|---|---|
| 1 | 33% | 0.07 | 0.07 | Tool-using, peaceful, consumes what it makes |
| 77 | 0% | 0.13 → 0.85 (unstable) | 0.61 | No tool tradition; hoards; violent under pressure |
| 909 | 34% | 0.07 | 0.61 | Tool-using *and* hoarding — the closest to a settled economy |

Tool use and stockpiling are genuinely divergent outcomes, not noise. Two of three seeds
independently evolved caching to 0.61; one never did.

**Crafting suppresses violence.** The clearest result in the whole model. Early versions
where refining didn't pay converged on predation drive 0.90–0.96 within a few thousand
ticks — the agents became each other's food supply, because a neighbour was worth seven
raw motes. Once the refinement premium made crafting the better living, predation fell to
0.07–0.13 without any rule change. A cheap path to prosperity is what makes a population
peaceful.

**Agents carry technology the ground never shows.** At any moment the grid is almost
entirely tier-0 gravel, while the population is holding tier 2–5 artifacts. Civilisation
lives in the hands, not the landscape. This is why the renderer draws carried artifacts on
the agent — otherwise you'd never see the economy at all.

**Specialisation is real but narrow.** Diet centre converges hard on tier 3 with a
secondary cluster at tier 4, and breadth settles near 0.48. The population specialises,
but into one or two niches rather than the broad radiation I was hoping for. See section
9.

**Evolvability regulates itself.** Mutation rate is itself heritable. It rises during
turbulence and falls toward the 0.02 floor during stable stretches, then climbs again when
the vents drift and the niches move.

---

## 8. The dashboard

A single instrument console. The simulation well on the left, instruments on the right,
transport along the bottom.

**Well.** The grid, drawn at one pixel per cell and scaled up hard, with no smoothing.
Item colour comes from the element's hue; saturation and brightness from tier, so refined
matter is vivid against dull gravel and you can read the technology level of a region at
a glance. Agents are drawn over the top, tinted by diet, sized by energy, with a halo
when carrying a tier-2+ artifact and a ring when carrying a tool.

**Views.** Matter (default) · Tier heat · Energy · Agents only · Tradition (deme meme
strength).

**Instruments.**
- *Vitals* — population, standing matter, energy pool, heat shed, tick, generation depth
- *Traces* — sparklines for population, max tier, discoveries, and mean trait values
- *Codex* — the live element table: the most abundant elements right now, each with tier,
  mass, parents, and property bars. This is the panel to watch. It rewrites itself
  constantly, and clicking an element highlights every instance of it in the well.
- *Log* — first-of-tier discoveries, collapses, garbage collections, reseeds

**Controls.** Sunlight · Metabolism · Refinement premium · Decay · Ambient chemistry ·
Craft yield · Craft cost · Mutation · Predation · Tradition · Fertility. Every change is
journaled, so the share code stays faithful.

**Presets.** Temperate (default) · Garden (abundant, gentle) · Hard Winter (scarce, fast
decay) · Toolmakers (high catalysis payoff) · Red Queen (high mutation, high predation) ·
Flat World (refinement premium zero — the control condition, and worth watching precisely
because nothing happens).

**Transport.** Play/pause, single step, speed 1–16 ticks per frame, seed field, new world,
and the core-sample strip of safe points.

---

## 9. Limitations, and what I'd do next

**Niche radiation is narrower than I want.** The population reliably specialises, but
into one or two diet niches rather than a spread. The likely cause is that the Gaussian
digestion curve makes intermediate diets strictly worse than the modal one, so there's no
frequency-dependent advantage to being different. The fix is to make abundance
frequency-dependent: an item type that lots of agents are eating should get scarcer
locally, which it does, but not fast enough to matter. Worth trying: a per-deme depletion
term.

**Culture doesn't pay.** Regional traditions work mechanically but earn nothing, so
social drive goes to zero. Genes carry recipe knowledge well enough that a second channel
is redundant. To make culture matter, the environment probably has to change faster than
generation time — tie vent drift speed to something aggressive and see if the cultural
channel starts outrunning the genetic one.

**The tech ceiling is ~tier 7.** Set by lifespan × find-rate against rising volatility.
Reaching tier 8+ needs genuine cooperation — division of labour, or a way to trade — which
is the obvious next mechanic and probably the most interesting one left. Agents can
already read the ground; what they can't do is signal.

**No spatial structures.** Agents cache, but they don't build. Given catalysts already
create workshop hotspots, letting agents deliberately place items into patterns is a
small change with a potentially large payoff.

**Rendering hides the economy.** Because refined matter lives in hands rather than on the
ground, the well undersells what's happening. The Codex compensates, but a proper
"artifact inspector" — click an agent, see its genome and what it's carrying and its
lineage — would help a lot.

---

## 10. Parameter reference

| Parameter | Default | Effect |
|---|---|---|
| `sunRate` | 200 | Energy entering per tick. Scales population; barely moves matter density. |
| `sunCap` | 1800 | Pool ceiling. |
| `upkeep` | 0.100 | Metabolism. **The real density control** — higher means fewer, hungrier agents in a richer world. |
| `refineBonus` | 0.22 | Refinement premium. At 0, crafting is pointless. The civilisation switch. |
| `craftYield` | 0.99 | Charge kept when two things become one. |
| `craftCost` | 0.05 | Energy per combination. |
| `decayRate` | 0.020 | Global decay multiplier. |
| `ambientChem` | 0.03 | Spontaneous reactions between adjacent items. |
| `nPrimordial` | 6 | Number of tier-0 elements. |
| `ventCount` | 5 | Spawn clusters per primordial. Creates biogeography. |
| `mutScale` | 1.0 | Multiplier on all mutation. |
| `predation` | 1.0 | Multiplier on predation drive. 0 disables it. |
| `cultureRate` | 1.0 | Strength of regional traditions. 0 disables them. |
| `fertilityOn` | 1.0 | Whether self-copying matter exists. |

Internal constants: 6,000 live elements, mass ceiling 256 (tier 8), 96 demes ×
256 recipe slots, 2 hands + 1 tool slot, 6-phase strided sweep.

---

## 11. Shipping it

The prototype is a single React file with no backend, which is most of the way to a site
already. To make it a destination rather than a demo:

- **A resident world.** One canonical instance, seeded once, running server-side, that
  everyone watches together. Ship diffs to clients over a socket. Visitors join a world
  that has been running for months and has a history, rather than one that starts when
  they arrive.
- **Sandbox alongside it.** The current build, for people who want to grab the sliders.
- **A public codex.** Elements that reach high tier or high abundance in the resident
  world get catalogued, named, and permanently listed with their discovery tick and
  parentage. An encyclopaedia of a place that didn't exist last year.
- **Share codes as URLs.** `/w/<code>` replays a world exactly. This is the growth
  mechanic: people will find seeds with strange civilisations and pass them around.
- **A slow feed.** "Tick 4,102,338 — the northern deme has been tool-using for 90,000
  ticks." Worlds are more interesting when you check on them than when you stare at them.
