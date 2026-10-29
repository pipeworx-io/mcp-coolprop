# @pipeworx/coolprop

Thermophysical properties of a pure fluid, computed from two independent
state variables (PropsSI-style: give e.g. temperature + pressure, get
density, enthalpy, entropy, viscosity, thermal conductivity, specific heat,
vapor quality, phase). Covers ~124 fluids — water, common refrigerants,
hydrocarbons, cryogens, siloxanes and more — computed in-process by CoolProp
rather than looked up from a table, so a query is valid anywhere inside each
fluid's full equation-of-state range, not just at tabulated points.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

- `coolprop_fluid_properties(fluid, input1_name, input1_value, input2_name, input2_value, outputs)`
  — two independent state variables (`T`, `P`, `D`, `H`, `S`, `U`, or `Q`,
  SI units) in, up to 12 requested properties out: `T`, `P`, `D` (density,
  kg/m3), `H` (enthalpy, J/kg), `S` (entropy, J/kg/K), `U` (internal energy,
  J/kg), `Q` (vapor quality), `CPMASS`/`CVMASS` (specific heats, J/kg/K),
  `VISCOSITY` (Pa·s), `CONDUCTIVITY` (W/m/K), `PRANDTL`, `M` (molar mass,
  kg/mol), `Phase` (liquid/gas/supercritical/twophase/...).
- `coolprop_list_fluids()` — the exact ~124 canonical fluid names this build
  recognizes. No aliases: use "CarbonDioxide", not "CO2" — this tool is how
  you find the exact spelling rather than guessing one.

## Auth

Keyless.

## Data sources

- **CoolProp** (Ian H. Bell and the CoolProp developers) — an open-source
  thermophysical property library (MIT licence). Every call computes the
  property in-process from CoolProp's own equations of state; nothing is
  looked up from a pre-built table of values, and nothing is fetched from a
  live upstream.

## Notes

- **No aliases.** This build's fluid list carries only canonical names (e.g.
  "CarbonDioxide", "Nitrogen", "R134a") — common short forms like "CO2" are
  not recognized and return a clear error rather than a wrong answer. Call
  `coolprop_list_fluids` to get the exact name.
- **`input1_name` and `input2_name` must be two different, independent state
  variables.** Asking for `T` twice (or any other repeated/dependent pair)
  returns a named error rather than a nonsense number.
- **A state CoolProp cannot resolve returns a named error, not a silent
  wrong value.** CoolProp's own low-level convention for an unresolvable
  state is the IEEE `Infinity` sentinel (not an exception) — this pack
  detects that and reports it as an error naming the fluid, inputs and valid
  input codes, rather than ever returning `Infinity` as though it were a
  real density or enthalpy.
- A small number of (fluid, state) combinations fail to resolve even when
  the state is physically unremarkable (observed live for pure
  CarbonDioxide across a range of atmospheric-pressure temperatures) — this
  reads as the same named error as an out-of-range state, since there is no
  way to distinguish a genuine CoolProp solver gap from an invalid input at
  the property-call level. If a fluid you expect to work returns this
  error, try a different input pair (e.g. density + temperature instead of
  pressure + temperature) before concluding the state is invalid.
- Mass-basis properties only (no molar-basis inputs/outputs in this
  version).

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "coolprop": {
      "url": "https://gateway.pipeworx.io/coolprop/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/coolprop/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/coolprop_fluid_properties \
  -H 'Content-Type: application/json' \
  -d '{"fluid":"Water","input1_name":"T","input1_value":298.15,"input2_name":"P","input2_value":101325,"outputs":["D","H","S","VISCOSITY","CONDUCTIVITY","Phase"]}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/coolprop_fluid_properties`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-coolprop` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/coolprop/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "coolprop": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-coolprop"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Coolprop data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
