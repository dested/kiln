# KILN — the site

A static site that hosts **KILN**, an infinite crafting ecology: a deterministic
artificial-life sandbox where no recipe is authored anywhere. `combine(a, b)` is a hash of the
two parents and the world seed, so the recipe tree is effectively infinite and different in
every world.

The site is three things:

| Route     | What it is                                                                 |
| --------- | -------------------------------------------------------------------------- |
| `/`       | The live console, then a plain-language explainer written for a cold reader |
| `/design` | The full design document, rendered from `content/KILN-design.md`            |
| `/source` | `src/kiln.jsx` itself, highlighted, with copy + download                    |
| `/play`   | The console alone, no site chrome                                          |

## The two artifacts are verbatim

`src/kiln.jsx` and `content/KILN-design.md` are the originals, byte-for-byte. Nothing on the
site paraphrases them in place — the explainer on `/` is additional writing that sits alongside
them, and `/source` renders the same file the app imports, so what you read is what runs.

Because of that, **don't reformat or "clean up" `src/kiln.jsx`.** It is both the running
simulation and the published document. It has one quirk worth knowing: the `step` button
advances the world but does not push React state, so the readouts only refresh from the
`requestAnimationFrame` loop. That is upstream behaviour, deliberately left alone.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
npm run preview
```

## Notes

- **Tailwind v4** via `@tailwindcss/vite`. The console supplies its own inline styles but does
  rely on a handful of utility classes (`flex`, `grid`, …), so Tailwind must stay.
- **No `StrictMode`.** The console owns a rAF loop and a single mutable `World`, so the
  intentional double-mount would boot two worlds.
- `/design` and `/source` are lazy-loaded, keeping `react-markdown` and `prismjs` off the
  landing page.
- The palette, fonts and hairline ruling are lifted from the console so the whole page reads as
  one instrument: bone card stock, IBM Plex Sans/Mono, Fraunces for display.
- The simulation only advances while the tab is **visible** — browsers suspend
  `requestAnimationFrame` in hidden tabs. A frozen tick counter in a background tab is not a bug.

## Deploy

Static site on [Drydock](../aws-render-replacement). `drydock.yaml` is the manifest; CI builds
the image and deploys on push to `master`. The generated static server falls back to
`index.html`, so the client-side routes above resolve on a hard refresh.
