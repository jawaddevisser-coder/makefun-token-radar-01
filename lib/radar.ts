// Token Launch Radar — the model, the board and the farm plans.
//
// Everything here is derived from the sealed DefiLlama snapshot: no protocol
// name is hardcoded anywhere. The implied value of a pre-token protocol is
// its TVL times a multiple taken from the live protocols that already trade
// (the median market-cap-to-TVL ratio of its own category), times three
// factors the snapshot itself supplies: seven-day TVL growth, how long the
// protocol has run with no token, and how many chains it runs on. A live
// protocol's implied value is its market cap — the market's own number — so
// the board ranks pre-token and live protocols on one scale and the page can
// separate them with a filter instead of hiding either side. Protocols the
// house's own rule identifies as wrapped, staked, bridged, versioned or
// exchange products are not launch candidates and are listed separately with
// the reason, never ranked: WBTC is Bitcoin on Ethereum, not a protocol
// waiting on a token of its own.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  pretoken_rank: number | null;
  implied_value_usd: number;
  farm_steps: string[];
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  live: boolean;
  mcap_usd: number | null;
  value_basis: 'model' | 'market-cap';
  multiple: number;
  growth_factor: number;
  maturity_factor: number;
  breadth_factor: number;
  watchlist: boolean;
  exclusion_note: string;
  farm_cost_usd: number;
  farm_weeks: number;
}

export interface RadarMeta {
  as_of: string;
  floor_usd: number;
  protocols_total: number;
  pretoken_total: number;
  excluded_total: number;
  watchlist_total: number;
  live_total: number;
  board_rows: number;
  live_rows: number;
}

export interface RadarModel {
  description: string;
  formula: string;
  global_multiple: number;
  multiple_low: number;
  multiple_high: number;
  category_multiples: { category: string; multiple: number; sample: number }[];
}

export interface ExcludedRow {
  slug: string;
  name: string;
  category: string;
  tvl_usd: number;
  reason: string;
}

export interface Radar {
  board: BoardRow[];
  excluded: ExcludedRow[];
  meta: RadarMeta;
  model: RadarModel;
  early_size: number;
  live_size: number;
}

const MULTIPLE_LOW = 0.05;
const MULTIPLE_HIGH = 1.5;
const LIVE_COMPARABLES = 60;
const MS_PER_DAY = 86_400_000;

/** The snapshot's own shape, checked field by field; anything else is refused. */
export function parseSnapshot(text: string): Snapshot {
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null) throw new Error('snapshot: not an object');
  const d = data as Record<string, unknown>;
  if (typeof d.as_of !== 'string' || typeof d.source !== 'string') throw new Error('snapshot: as_of/source missing');
  if (typeof d.floor_usd !== 'number' || !Array.isArray(d.protocols) || !Array.isArray(d.watchlist)) {
    throw new Error('snapshot: floor/protocols/watchlist missing');
  }
  const protocols: SnapshotProtocol[] = (d.protocols as unknown[]).map((p, i) => {
    if (typeof p !== 'object' || p === null) throw new Error(`snapshot: protocol ${i} is not an object`);
    const q = p as Record<string, unknown>;
    const str = (k: string): string => {
      if (typeof q[k] !== 'string') throw new Error(`snapshot: protocol ${i} field ${k} is not a string`);
      return q[k] as string;
    };
    const numOrNull = (k: string): number | null => {
      if (q[k] === null) return null;
      if (typeof q[k] !== 'number') throw new Error(`snapshot: protocol ${i} field ${k} is not a number`);
      return q[k] as number;
    };
    if (!Array.isArray(q.chains) || !(q.chains as unknown[]).every((c) => typeof c === 'string')) {
      throw new Error(`snapshot: protocol ${i} chains is not a string array`);
    }
    if (typeof q.tvl_usd !== 'number') throw new Error(`snapshot: protocol ${i} tvl_usd is not a number`);
    return {
      slug: str('slug'),
      name: str('name'),
      category: q.category === null ? null : str('category'),
      chains: q.chains as string[],
      tvl_usd: q.tvl_usd as number,
      change_7d: numOrNull('change_7d'),
      mcap_usd: numOrNull('mcap_usd'),
      listed_at: q.listed_at === null ? null : str('listed_at'),
      gecko_id: q.gecko_id === null ? null : str('gecko_id'),
      symbol: q.symbol === null ? null : str('symbol'),
    };
  });
  return {
    as_of: d.as_of as string,
    source: d.source as string,
    floor_usd: d.floor_usd as number,
    protocols,
    watchlist: (d.watchlist as unknown[]).map((w) => String(w)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

function clamp(v: number, low: number, high: number): number {
  return v < low ? low : v > high ? high : v;
}

/** Whole days between the snapshot date and the day DefiLlama began tracking a protocol. */
export function ageDays(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return 365;
  const listed = Date.parse(`${listedAt}T00:00:00Z`);
  const as = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(listed) || Number.isNaN(as)) return 365;
  return Math.max(0, Math.round((as - listed) / MS_PER_DAY));
}

/** Seven-day TVL growth, clamped: a hot week lifts value, a cold one trims it, neither dominates. */
export function growthFactor(change7d: number | null): number {
  const c = change7d === null ? 0 : change7d;
  return 1 + clamp(c, -25, 80) / 160;
}

/** Time running with no token: a longer clean record is worth more, capped at three years. */
export function maturityFactor(age: number): number {
  return 0.7 + 0.3 * Math.min(age / 1095, 1);
}

/** Running on more chains is worth a little more, capped at eleven chains. */
export function breadthFactor(chains: string[]): number {
  return 1 + 0.03 * Math.min(Math.max(chains.length - 1, 0), 10);
}

/**
 * The multiple for a category: the median market-cap-to-TVL ratio of the live
 * protocols in that category that report both numbers. Categories with fewer
 * than three such protocols fall back to the global median. Clamped so no
 * category's multiple can run away with the board.
 */
export function categoryMultiples(snapshot: Snapshot): { byCategory: Map<string, number>; global: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      all.push(ratio);
      if (p.category !== null) {
        const list = byCategory.get(p.category) ?? [];
        list.push(ratio);
        byCategory.set(p.category, list);
      }
    }
  }
  const global = clamp(median(all), MULTIPLE_LOW, MULTIPLE_HIGH);
  const out = new Map<string, number>();
  for (const [category, ratios] of byCategory) {
    out.set(category, ratios.length >= 3 ? clamp(median(ratios), MULTIPLE_LOW, MULTIPLE_HIGH) : global);
  }
  return { byCategory: out, global };
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * Whether a pre-token protocol is a wrapped, staked or bridged product of a
 * protocol whose token already trades, a versioned name, or an exchange
 * product — the house's own published rule for leaving a protocol out of the
 * watchlist, applied here to the ranking itself. Such a product is not a
 * protocol still waiting on a launch of its own (WBTC is Bitcoin on Ethereum,
 * a staked-ETH product is ETH in a staking wrapper), so the radar lists it
 * separately instead of ranking it as a launch candidate. No protocol name is
 * listed: the test reads only the snapshot's category and name fields.
 */
export function isLaunchExcluded(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_TAIL.test(p.name)) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return true;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Why a ranked pre-token protocol is not on the house watchlist: only the
 * floor is left to explain, since launch-excluded products are not ranked.
 */
export function exclusionNote(p: SnapshotProtocol, floorUsd: number): string {
  if (p.tvl_usd < floorUsd) return `Below the $${Math.round(floorUsd / 1_000_000)}M watchlist floor`;
  return '';
}

// ---------------------------------------------------------------- farm plans

const GAS_BY_CHAIN: Record<string, { text: string; mid: number }> = {
  Ethereum: { text: '$3–$12', mid: 7 },
  Solana: { text: '$0.05 or less', mid: 0.03 },
  Base: { text: '$0.10', mid: 0.1 },
  Arbitrum: { text: '$0.20', mid: 0.2 },
  Optimism: { text: '$0.15', mid: 0.15 },
  BSC: { text: '$0.30', mid: 0.3 },
  Polygon: { text: '$0.05', mid: 0.05 },
  Avalanche: { text: '$0.30', mid: 0.3 },
  Sui: { text: '$0.05 or less', mid: 0.03 },
  Aptos: { text: '$0.05 or less', mid: 0.03 },
};

function gasFor(chain: string): { text: string; mid: number } {
  return GAS_BY_CHAIN[chain] ?? { text: '$0.50', mid: 0.5 };
}

interface StepKit {
  name: string;
  chain: string;
  gas: string;
  weeks: number;
}

type StepTemplate = (k: StepKit) => string;

const CATEGORY_ACTIONS: Record<string, { weeks: number; actions: [StepTemplate, StepTemplate] }> = {
  Dexs: {
    weeks: 6,
    actions: [
      (k) => `Swap at least $25 through ${k.name} on ${k.chain} so the trade is recorded on-chain; one swap costs about ${k.gas} in gas and takes 2 minutes.`,
      (k) => `Add $25–$50 of liquidity to one of ${k.name}'s largest pools on ${k.chain} and hold the LP tokens; the deposit takes about 5 minutes plus ${k.gas} in gas.`,
    ],
  },
  Lending: {
    weeks: 6,
    actions: [
      (k) => `Supply $25–$50 of a major asset (ETH, USDC or wBTC) to ${k.name} on ${k.chain}; the supply costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Borrow a small amount against the supply, then repay it within a week, so the account shows both sides of the market; keep the health factor above 2 to avoid liquidation.`,
    ],
  },
  Yield: {
    weeks: 6,
    actions: [
      (k) => `Deposit $25–$50 into ${k.name}'s highest-TVL vault on ${k.chain}; the deposit costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Leave the deposit compounding for at least 4 weeks and harvest or re-deposit any rewards weekly; each harvest costs about ${k.gas}.`,
    ],
  },
  'Yield Aggregator': {
    weeks: 6,
    actions: [
      (k) => `Deposit $25–$50 into ${k.name}'s highest-TVL vault on ${k.chain}; the deposit costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Leave the deposit compounding for at least 4 weeks and harvest or re-deposit any rewards weekly; each harvest costs about ${k.gas}.`,
    ],
  },
  Bridge: {
    weeks: 4,
    actions: [
      (k) => `Bridge $25–$50 from ${k.chain} to another chain ${k.name} supports, then bridge half back a week later; each crossing costs about ${k.gas} plus the bridge fee and takes 5–20 minutes.`,
      (k) => `Use ${k.name} for at least three separate crossings over a month so the activity reads as real usage, not a single test transaction.`,
    ],
  },
  'Canonical Bridge': {
    weeks: 4,
    actions: [
      (k) => `Bridge $25–$50 from ${k.chain} to another chain ${k.name} supports, then bridge half back a week later; each crossing costs about ${k.gas} plus the bridge fee and takes 5–20 minutes.`,
      (k) => `Use ${k.name} for at least three separate crossings over a month so the activity reads as real usage, not a single test transaction.`,
    ],
  },
  'Cross Chain Bridge': {
    weeks: 4,
    actions: [
      (k) => `Bridge $25–$50 from ${k.chain} to another chain ${k.name} supports, then bridge half back a week later; each crossing costs about ${k.gas} plus the bridge fee and takes 5–20 minutes.`,
      (k) => `Use ${k.name} for at least three separate crossings over a month so the activity reads as real usage, not a single test transaction.`,
    ],
  },
  'Liquid Staking': {
    weeks: 6,
    actions: [
      (k) => `Stake $25–$50 of the base asset through ${k.name} on ${k.chain} and hold the receipt token; staking costs about ${k.gas} and takes 3 minutes.`,
      (k) => `Use the receipt token once in a lending market or liquidity pool on ${k.chain} so the position is productive, not idle; unwinding takes about 5 minutes.`,
    ],
  },
  'Liquid Restaking': {
    weeks: 6,
    actions: [
      (k) => `Stake $25–$50 of the base asset through ${k.name} on ${k.chain} and hold the receipt token; staking costs about ${k.gas} and takes 3 minutes.`,
      (k) => `Use the receipt token once in a lending market or liquidity pool on ${k.chain} so the position is productive, not idle; unwinding takes about 5 minutes.`,
    ],
  },
  'Restaked BTC': {
    weeks: 6,
    actions: [
      (k) => `Stake $25–$50 of the base asset through ${k.name} on ${k.chain} and hold the receipt token; staking costs about ${k.gas} and takes 3 minutes.`,
      (k) => `Use the receipt token once in a lending market or liquidity pool on ${k.chain} so the position is productive, not idle; unwinding takes about 5 minutes.`,
    ],
  },
  RWA: {
    weeks: 6,
    actions: [
      (k) => `Buy or mint a $25–$50 position in one of ${k.name}'s tokenized assets on ${k.chain}; onboarding and checks, where required, can take a day, and the mint costs about ${k.gas} in gas.`,
      (k) => `Hold the position for at least 4 weeks and collect any yield it pays; exiting early usually forfeits accrued yield.`,
    ],
  },
  CEX: {
    weeks: 4,
    actions: [
      (k) => `Create an account on ${k.name}, complete its verification, and deposit $50–$100; verification can take a few hours to a day.`,
      (k) => `Trade at least $25 of spot volume per week for 4 weeks on markets ${k.name} lists; each trade takes under a minute.`,
    ],
  },
  Perps: {
    weeks: 6,
    actions: [
      (k) => `Open a small $25–$50 position on ${k.name} on ${k.chain} with leverage under 3x; opening costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Close the position after a few days and open a second one the following week; never risk more than $50 per position and keep a stop in place.`,
    ],
  },
  Derivatives: {
    weeks: 6,
    actions: [
      (k) => `Open a small $25–$50 position on ${k.name} on ${k.chain} with leverage under 3x; opening costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Close the position after a few days and open a second one the following week; never risk more than $50 per position and keep a stop in place.`,
    ],
  },
  'Basis Trading': {
    weeks: 6,
    actions: [
      (k) => `Open a small $25–$50 position on ${k.name} on ${k.chain} with leverage under 3x; opening costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Close the position after a few days and open a second one the following week; never risk more than $50 per position and keep a stop in place.`,
    ],
  },
  Options: {
    weeks: 6,
    actions: [
      (k) => `Buy a small $25–$50 option on ${k.name} on ${k.chain} with at least two weeks to expiry; the trade costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Let the first option run to expiry or close it after a week, then open a second one; never risk more than $50 per position.`,
    ],
  },
  CDP: {
    weeks: 6,
    actions: [
      (k) => `Mint $25–$50 of ${k.name}'s stable asset against $50 of collateral on ${k.chain}; minting costs about ${k.gas} and takes 3 minutes.`,
      (k) => `Use the minted stable asset in a pool or lending market for at least 2 weeks, then repay and close the position cleanly.`,
    ],
  },
  'Algo-Stables': {
    weeks: 6,
    actions: [
      (k) => `Mint $25–$50 of ${k.name}'s stable asset against $50 of collateral on ${k.chain}; minting costs about ${k.gas} and takes 3 minutes.`,
      (k) => `Use the minted stable asset in a pool or lending market for at least 2 weeks, then repay and close the position cleanly.`,
    ],
  },
  Gaming: {
    weeks: 4,
    actions: [
      (k) => `Create an account and complete ${k.name}'s onboarding on ${k.chain}; the first session takes about 15 minutes.`,
      (k) => `Use ${k.name} at least three times a week for a month so the account shows sustained activity, about 15 minutes per session.`,
    ],
  },
  NFT: {
    weeks: 4,
    actions: [
      (k) => `Create a wallet profile on ${k.name} on ${k.chain} and list or buy one low-cost item of $25–$50; the first trade costs about ${k.gas} in gas.`,
      (k) => `Return once a week for a month and trade or list again, about 15 minutes per visit, so the wallet shows repeated real usage.`,
    ],
  },
  Insurance: {
    weeks: 6,
    actions: [
      (k) => `Buy $25–$50 of cover from ${k.name} on ${k.chain}; the purchase costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Hold the cover for at least 4 weeks; claims settle on ${k.name}'s schedule, so read it before buying.`,
    ],
  },
  'Risk Curators': {
    weeks: 6,
    actions: [
      (k) => `Deposit $25–$50 into one of ${k.name}'s curated vaults on ${k.chain}; the deposit costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Leave the deposit for at least 4 weeks and check the vault's allocation monthly; withdrawing early usually forfeits accrued yield.`,
    ],
  },
  Indexes: {
    weeks: 6,
    actions: [
      (k) => `Buy $25–$50 of one of ${k.name}'s index products on ${k.chain}; the purchase costs about ${k.gas} in gas and takes 3 minutes.`,
      (k) => `Hold for at least 4 weeks and rebalance only when the index does; frequent trading adds gas cost without adding farming signal.`,
    ],
  },
};

const GENERIC_ACTIONS: [StepTemplate, StepTemplate] = [
  (k) => `Use ${k.name}'s core feature on ${k.chain} with a $25–$50 position; the first transaction costs about ${k.gas} in gas and takes about 5 minutes.`,
  (k) => `Return once a week for ${k.weeks} weeks and use the app again, about 15 minutes per visit, so the wallet shows repeated real usage.`,
];

/** Concrete farm steps for a pre-token protocol: setup, two category actions, cadence, watch. */
export function farmStepsPreToken(p: SnapshotProtocol): { steps: string[]; weeks: number; costUsd: number } {
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = gasFor(chain);
  const entry = CATEGORY_ACTIONS[p.category ?? ''] ?? { weeks: 6, actions: GENERIC_ACTIONS };
  const weeks = entry.weeks;
  const kit: StepKit = { name: p.name, chain, gas: gas.text, weeks };
  const steps = [
    `Set up a fresh wallet and fund it with about $50–$100 on ${chain} for gas and a first position; bridging in takes about 10 minutes and gas on ${chain} is roughly ${gas.text} per transaction.`,
    entry.actions[0]!(kit),
    entry.actions[1]!(kit),
    `Repeat the core action once a week for ${weeks} weeks, about 15 minutes per session, keeping the position open between sessions so activity is continuous rather than a single burst.`,
    `Watch ${p.name}'s announcements for a token or points program and keep funds in place through any snapshot date; exiting before a snapshot usually forfeits the farming position.`,
  ];
  const costUsd = Math.round(25 + gas.mid * 8);
  return { steps, weeks, costUsd };
}

/** Steps for a protocol whose token already trades: manage a live holding, not a pre-launch farm. */
export function farmStepsLive(p: SnapshotProtocol): { steps: string[]; weeks: number; costUsd: number } {
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = gasFor(chain);
  const symbol = p.symbol ?? 'its token';
  const steps = [
    `Buy $25–$50 of ${symbol} through ${p.name} or a major exchange on ${chain}; the trade takes 2 minutes and costs about ${gas.text} in gas.`,
    `Stake or supply the tokens in ${p.name}'s own staking or lending market on ${chain} and leave them for at least 4 weeks to earn the live yield.`,
    `Vote in one governance proposal, where ${p.name} runs votes, so the wallet is recorded as an active holder; voting takes about 5 minutes.`,
    `Re-check the position monthly: ${p.name}'s token already trades, so this is a live holding to manage, not a pre-launch farm — set a price alert and a review date.`,
  ];
  return { steps, weeks: 4, costUsd: Math.round(25 + gas.mid * 6) };
}

// ---------------------------------------------------------------- the board

/** The whole radar: genuine pre-token launch candidates plus the top live comparables, ranked by implied value. */
export function buildRadar(snapshot: Snapshot): Radar {
  const { byCategory, global } = categoryMultiples(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const pretoken = snapshot.protocols.filter((p) => p.gecko_id === null && p.symbol === null);
  const candidates = pretoken.filter((p) => !isLaunchExcluded(p));
  const excluded: ExcludedRow[] = pretoken
    .filter((p) => isLaunchExcluded(p))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Uncategorized',
      tvl_usd: p.tvl_usd,
      reason:
        p.category !== null && EXCLUDED_CATEGORIES.has(p.category)
          ? `${p.category} product, not a standalone launch`
          : VERSION_TAIL.test(p.name)
            ? 'Versioned name of a protocol that already exists'
            : /\b(wrapped|staked|staking)\b/i.test(p.name)
              ? 'Wrapped or staked product of a token that already trades'
              : 'Exchange product',
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
  const live = snapshot.protocols
    .filter((p) => (p.gecko_id !== null || p.symbol !== null) && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_COMPARABLES);

  const rows: BoardRow[] = [];
  for (const p of candidates) {
    const multiple = p.category !== null ? (byCategory.get(p.category) ?? global) : global;
    const age = ageDays(p.listed_at, snapshot.as_of);
    const gf = growthFactor(p.change_7d);
    const mf = maturityFactor(age);
    const bf = breadthFactor(p.chains);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * gf * mf * bf));
    const farm = farmStepsPreToken(p);
    const note = exclusionNote(p, snapshot.floor_usd);
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      pretoken_rank: null,
      implied_value_usd: implied,
      farm_steps: farm.steps,
      category: p.category ?? 'Uncategorized',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      live: false,
      mcap_usd: null,
      value_basis: 'model',
      multiple,
      growth_factor: gf,
      maturity_factor: mf,
      breadth_factor: bf,
      watchlist: watchlist.has(p.slug),
      exclusion_note: note,
      farm_cost_usd: farm.costUsd,
      farm_weeks: farm.weeks,
    });
  }
  for (const p of live) {
    const age = ageDays(p.listed_at, snapshot.as_of);
    const farm = farmStepsLive(p);
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      pretoken_rank: null,
      implied_value_usd: Math.round(p.mcap_usd ?? 0),
      farm_steps: farm.steps,
      category: p.category ?? 'Uncategorized',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      live: true,
      mcap_usd: p.mcap_usd,
      value_basis: 'market-cap',
      multiple: 1,
      growth_factor: growthFactor(p.change_7d),
      maturity_factor: maturityFactor(age),
      breadth_factor: breadthFactor(p.chains),
      watchlist: false,
      exclusion_note: 'Token already trades — shown as a live comparable',
      farm_cost_usd: farm.costUsd,
      farm_weeks: farm.weeks,
    });
  }

  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug));
  let preRank = 0;
  rows.forEach((row, i) => {
    row.rank = i + 1;
    if (!row.live) {
      preRank += 1;
      row.pretoken_rank = preRank;
    }
  });

  const categoryMultiplesList = [...byCategory.entries()]
    .map(([category, multiple]) => ({
      category,
      multiple: Math.round(multiple * 1000) / 1000,
      sample: snapshot.protocols.filter(
        (p) => p.category === category && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
      ).length,
    }))
    .sort((a, b) => b.sample - a.sample);

  return {
    board: rows,
    excluded,
    meta: {
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      protocols_total: snapshot.protocols.length,
      pretoken_total: candidates.length,
      excluded_total: excluded.length,
      watchlist_total: snapshot.watchlist.length,
      live_total: live.length,
      board_rows: rows.length,
      live_rows: live.length,
    },
    model: {
      description:
        'Implied value = TVL x category multiple x growth factor x maturity factor x breadth factor. The multiple is the median market-cap-to-TVL ratio of the live protocols in the same category (global median when a category has fewer than three); growth is the seven-day TVL change clamped to -25%..+80%; maturity rises with days since listing up to three years; breadth adds 3% per extra chain up to ten. Live rows use market cap instead of the model. Protocols the house rule identifies as wrapped, staked, bridged, versioned or exchange products are not ranked as launch candidates and are listed separately with the reason.',
      formula: 'implied = tvl_usd * multiple(category) * (1 + clamp(change_7d, -25, 80) / 160) * (0.7 + 0.3 * min(age_days / 1095, 1)) * (1 + 0.03 * min(chains - 1, 10))',
      global_multiple: Math.round(global * 1000) / 1000,
      multiple_low: MULTIPLE_LOW,
      multiple_high: MULTIPLE_HIGH,
      category_multiples: categoryMultiplesList,
    },
    early_size: candidates.length,
    live_size: live.length,
  };
}

/** The gate's own shape, checked before anything is written: null means the board passes. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, needs 100 to 4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!slugs.has(row.slug)) return `board names ${row.slug}, not in the snapshot`;
    if (seen.has(row.slug)) return `board repeats ${row.slug}`;
    seen.add(row.slug);
    if (row.name.trim().length === 0) return `board row ${row.slug} has no name`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 100_000_000_000_000) {
      return `board row ${row.slug} has implied_value_usd ${row.implied_value_usd}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `board row ${row.slug} has ${row.farm_steps.length} farm steps, needs 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const t = step.trim();
      if (t.length < 20 || t.length > 600) return `board row ${row.slug} has a farm step of ${t.length} characters`;
    }
  }
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `board rank at position ${i + 1} is ${board[i]!.rank}`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `board implied value rises from rank ${i} to rank ${i + 1}`;
    }
  }
  if (new Set(board.map((r) => r.implied_value_usd)).size < 2) return 'board implied values are all the same';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `board misses watchlist protocol ${slug}`;
  }
  return null;
}

/** The dashboard's data file: the meta, the model, every row, and the protocols left out of the ranking with their reasons, as one script. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify({ meta: radar.meta, model: radar.model, rows: radar.board, excluded: radar.excluded })};\n`;
}
