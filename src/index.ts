interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * coolprop — thermophysical fluid properties (PropsSI-style: give two
 * independent state variables, get density, viscosity, conductivity,
 * enthalpy, entropy, phase, ...), computed in-process by CoolProp
 * (open-source, MIT — Bell et al.), not looked up from a tabulated source.
 * Fleet #3349.
 *
 * WHY THIS IS COMPUTED RATHER THAN A STANDARD UPSTREAM-PROXY PACK: the
 * CoolProp WebAssembly module is ~4 MiB gzip, which does not fit the shared
 * gateway bundle's remaining headroom (measured 2026-10-19 against
 * scripts/check-gateway-bundle-size.mjs's ceilings — fleet #2754's "never
 * raise the ceiling" rule). It runs in its own Worker (workers/coolprop-service)
 * reached ONLY through a Cloudflare service binding (_coolprop) — the same
 * shape as vc-finder's `_vcIndex` / pod-researcher's `_podIndex`. A standalone
 * npm build of this pack has no binding and must say so, never silently
 * return nothing (feedback_gated_refusal_wording: the refusal must SAY what
 * is required).
 *
 * ALIASES: there are none in this build's fluid list — "CarbonDioxide", not
 * "CO2"; call coolprop_list_fluids for the exact 124 canonical names.
 */

// ── The RPC surface a service-binding-shaped `_coolprop` must expose. Typed
// narrowly (not `Fetcher`) because this pack calls named RPC methods on the
// bound object, never HTTP verbs — same convention as vc-finder's
// VcIndexBinding / pod-researcher's precedent.
export interface CoolPropServiceBinding {
  props(args: {
    fluid: string;
    input1_name: string;
    input1_value: number;
    input2_name: string;
    input2_value: number;
    outputs: string[];
  }): Promise<{
    fluid: string;
    inputs: { name: string; value: number }[];
    outputs: Record<string, number | string>;
    failed_outputs?: Record<string, string>;
    source: string;
  }>;
  fluids(): Promise<{ count: number; fluids: string[]; source: string }>;
}

function coolprop(args: Record<string, unknown>): CoolPropServiceBinding {
  const svc = args._coolprop as CoolPropServiceBinding | undefined;
  if (!svc) {
    throw new Error('coolprop requires its COOLPROP_SERVICE service binding, which this deployment has not enabled — an operator must wire it (workers/coolprop-service).');
  }
  return svc;
}

const tools: McpToolExport['tools'] = [
  {
    name: 'coolprop_fluid_properties',
    description:
      'Thermophysical properties of a pure fluid, computed from two independent state variables (PropsSI-style — give e.g. temperature + pressure, get density, enthalpy, entropy, viscosity, thermal conductivity, specific heat, phase, ...). Covers ~124 fluids (water, refrigerants, hydrocarbons, cryogens, ...) via CoolProp (open-source, MIT), computed in-process rather than looked up from a table — valid over each fluid\'s full equation-of-state range, not just tabulated points. No aliases: call coolprop_list_fluids for exact names (e.g. "CarbonDioxide", not "CO2").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fluid: { type: 'string', description: 'Exact CoolProp fluid name, e.g. "Water", "Nitrogen", "R134a", "CarbonDioxide" — see coolprop_list_fluids for the full list (no aliases)' },
        input1_name: { type: 'string', description: 'First independent state variable code: T (temperature, K), P (pressure, Pa), D (mass density, kg/m3), H (mass enthalpy, J/kg), S (mass entropy, J/kg/K), U (mass internal energy, J/kg), or Q (vapor quality, 0-1)' },
        input1_value: { type: 'number', description: 'Value for input1_name, SI units' },
        input2_name: { type: 'string', description: 'Second independent state variable code — must differ from input1_name. Same code set as input1_name.' },
        input2_value: { type: 'number', description: 'Value for input2_name, SI units' },
        outputs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Property codes to compute, up to 12 per call: T, P, D (density kg/m3), H (enthalpy J/kg), S (entropy J/kg/K), U (internal energy J/kg), Q (vapor quality), CPMASS (isobaric specific heat J/kg/K), CVMASS (isochoric specific heat J/kg/K), VISCOSITY (Pa·s), CONDUCTIVITY (W/m/K), PRANDTL, M (molar mass kg/mol), Phase (liquid/gas/supercritical/twophase/...)',
        },
      },
      required: ['fluid', 'input1_name', 'input1_value', 'input2_name', 'input2_value', 'outputs'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        fluid: { type: 'string' },
        inputs: { type: 'array', items: { type: 'object' } },
        outputs: { type: 'object' },
        failed_outputs: { type: 'object' },
        source: { type: 'string' },
      },
    },
  },
  {
    name: 'coolprop_list_fluids',
    description: 'The exact canonical fluid names this CoolProp build recognizes for coolprop_fluid_properties (~124 fluids: water, common refrigerants, hydrocarbons, cryogens, siloxanes, ...). No aliases — e.g. "CarbonDioxide", not "CO2"; use this list rather than guessing a short name.',
    inputSchema: { type: 'object' as const, properties: {} },
    outputSchema: {
      type: 'object' as const,
      properties: {
        count: { type: 'number' },
        fluids: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'coolprop_fluid_properties': {
      const svc = coolprop(args);
      if (!args.fluid || typeof args.fluid !== 'string') throw new Error('fluid is required (e.g. "Water")');
      if (!Array.isArray(args.outputs) || args.outputs.length === 0) throw new Error('outputs must be a non-empty array of property codes');
      return await svc.props({
        fluid: args.fluid,
        input1_name: String(args.input1_name ?? ''),
        input1_value: Number(args.input1_value),
        input2_name: String(args.input2_name ?? ''),
        input2_value: Number(args.input2_value),
        outputs: (args.outputs as unknown[]).map(String),
      });
    }
    case 'coolprop_list_fluids': {
      const svc = coolprop(args);
      return await svc.fluids();
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 2 } } satisfies McpToolExport;
