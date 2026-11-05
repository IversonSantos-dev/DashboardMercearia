/**
 * Intelligent Deduction Engine Implementation
 * Module: src/modules/baixa-inteligente/engine.ts
 *
 * Implements Multi-Tier Matching:
 * - Tier 1A: Exact Unit (q = 1)
 * - Tier 1B: Exact Multiple (q > 1)
 * - Tier 2: Fast Hash-Map / Two-Pointer Combinatorial Search (< 2ms)
 * - Tier 3: Minimal Delta Proximity Match
 * - Tier 4: Assisted Interactive Catalog
 */

import { addMoney, multiplyMoney } from '@/modules/currency';
import {
  StockCandidate,
  DeductionItemSuggestion,
  DeductionSuggestionResult,
  DeductionEngineOptions,
} from './types';

const DEFAULT_OPTIONS: Required<DeductionEngineOptions> = {
  timeoutMs: 2.0,
  maxCombinationItems: 3,
  maxQuantityMultiplier: 5,
  topAlternativesLimit: 10,
};

/**
 * Filters and sanitizes stock candidates to ensure only active, positive stock
 * with valid integer prices are considered.
 */
export function filterActiveStock(stock: StockCandidate[]): StockCandidate[] {
  if (!Array.isArray(stock) || stock.length === 0) {
    return [];
  }

  return stock.filter((item) => {
    return (
      item &&
      typeof item.id === 'string' &&
      Number.isSafeInteger(item.quantidade) &&
      item.quantidade > 0 &&
      Number.isSafeInteger(item.unitarioCentavos) &&
      item.unitarioCentavos > 0 &&
      item.ativo !== false
    );
  });
}

/**
 * Builds the assisted catalog: active items ordered by proximity of unit price
 * to the target value.
 */
export function buildAssistedCatalog(
  candidates: StockCandidate[],
  valorAlvoCentavos: number,
  limit = 10
): StockCandidate[] {
  if (candidates.length === 0) return [];

  return [...candidates]
    .sort((a, b) => {
      const distA = Math.abs(a.unitarioCentavos - valorAlvoCentavos);
      const distB = Math.abs(b.unitarioCentavos - valorAlvoCentavos);
      if (distA !== distB) return distA - distB;
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
      return a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0;
    })
    .slice(0, limit);
}

function mapToSuggestion(
  candidate: StockCandidate,
  quantidadeDebitar: number
): DeductionItemSuggestion {
  const totalItemCentavos = multiplyMoney(
    candidate.unitarioCentavos,
    quantidadeDebitar
  );
  return {
    produtoId: candidate.id,
    codigo: candidate.codigo,
    barras: candidate.barras,
    discriminacao: candidate.discriminacao,
    unidade: candidate.unidade,
    quantidadeDebitar,
    unitarioCentavos: candidate.unitarioCentavos,
    totalItemCentavos,
  };
}

/**
 * Main Deduction Suggestion Function
 */
export function findDeductionSuggestion(
  stock: StockCandidate[],
  valorAlvoCentavos: number,
  options?: DeductionEngineOptions
): DeductionSuggestionResult {
  const functionStartTime = performance.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 1. Boundary: Target is 0 centavos
  if (valorAlvoCentavos === 0) {
    return {
      strategy: 'EXACT_UNIT',
      valorAlvoCentavos: 0,
      valorSugeridoCentavos: 0,
      deltaCentavos: 0,
      itens: [],
      alternativasProximidade: [],
    };
  }

  // 2. Boundary: Negative or invalid target
  if (
    !Number.isSafeInteger(valorAlvoCentavos) ||
    valorAlvoCentavos < 0
  ) {
    return {
      strategy: 'ASSISTED_CATALOG',
      valorAlvoCentavos: valorAlvoCentavos ?? 0,
      valorSugeridoCentavos: 0,
      deltaCentavos: -(valorAlvoCentavos ?? 0),
      itens: [],
      alternativasProximidade: [],
    };
  }

  // 3. Filter active inventory
  const activeCandidates = filterActiveStock(stock);
  if (activeCandidates.length === 0) {
    return {
      strategy: 'ASSISTED_CATALOG',
      valorAlvoCentavos,
      valorSugeridoCentavos: 0,
      deltaCentavos: -valorAlvoCentavos,
      itens: [],
      alternativasProximidade: [],
    };
  }

  const alternativas = buildAssistedCatalog(
    activeCandidates,
    valorAlvoCentavos,
    opts.topAlternativesLimit
  );

  // -------------------------------------------------------------------------
  // TIER 1A: Exact Unit Match (q = 1)
  // -------------------------------------------------------------------------
  const exactUnits = activeCandidates.filter(
    (c) => c.unitarioCentavos === valorAlvoCentavos && c.quantidade >= 1
  );

  if (exactUnits.length > 0) {
    // Sort to prefer highest available stock, then stable code
    exactUnits.sort((a, b) => {
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
      return a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0;
    });

    const chosen = exactUnits[0];
    return {
      strategy: 'EXACT_UNIT',
      valorAlvoCentavos,
      valorSugeridoCentavos: valorAlvoCentavos,
      deltaCentavos: 0,
      itens: [mapToSuggestion(chosen, 1)],
      alternativasProximidade: alternativas,
    };
  }

  // -------------------------------------------------------------------------
  // TIER 1B: Exact Multiple Match (q > 1)
  // -------------------------------------------------------------------------
  const exactMultiples: Array<{ candidate: StockCandidate; k: number }> = [];

  for (const c of activeCandidates) {
    if (c.unitarioCentavos < valorAlvoCentavos) {
      if (valorAlvoCentavos % c.unitarioCentavos === 0) {
        const k = Math.floor(valorAlvoCentavos / c.unitarioCentavos);
        if (k > 1 && k <= c.quantidade) {
          exactMultiples.push({ candidate: c, k });
        }
      }
    }
  }

  if (exactMultiples.length > 0) {
    // Prefer smaller k (e.g. 2 x R$10 over 20 x R$1), then highest remaining stock
    exactMultiples.sort((a, b) => {
      if (a.k !== b.k) return a.k - b.k;
      const bufferA = a.candidate.quantidade - a.k;
      const bufferB = b.candidate.quantidade - b.k;
      if (bufferB !== bufferA) return bufferB - bufferA;
      return a.candidate.codigo < b.candidate.codigo
        ? -1
        : a.candidate.codigo > b.candidate.codigo
        ? 1
        : 0;
    });

    const best = exactMultiples[0];
    return {
      strategy: 'EXACT_MULTIPLE',
      valorAlvoCentavos,
      valorSugeridoCentavos: valorAlvoCentavos,
      deltaCentavos: 0,
      itens: [mapToSuggestion(best.candidate, best.k)],
      alternativasProximidade: alternativas,
    };
  }

  // -------------------------------------------------------------------------
  // TIER 2: Exact Combinations (Two-Sum & Three-Sum) with Calibrated SLA Budget
  // -------------------------------------------------------------------------
  // Reserve 0.8ms buffer for Tier 3 proximity search and overhead (< 2.0ms total SLA)
  const deadline = functionStartTime + Math.max(0.2, opts.timeoutMs - 0.8);

  // Pre-filter candidates strictly smaller than target
  let pool = activeCandidates.filter(
    (c) => c.unitarioCentavos < valorAlvoCentavos
  );

  // If pool is very large, keep top 150 candidates sorted by stock depth
  if (pool.length > 150) {
    pool = pool
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 150);
  }

  // 2A. Two-Item Hash Map Matching (Two-Sum)
  interface MultiEntry {
    candidate: StockCandidate;
    k: number;
    total: number;
  }

  const multMap = new Map<number, MultiEntry[]>();
  const maxK = opts.maxQuantityMultiplier;

  for (const c of pool) {
    const limitK = Math.min(c.quantidade, maxK);
    for (let k = 1; k <= limitK; k++) {
      const val = multiplyMoney(c.unitarioCentavos, k);
      if (val < valorAlvoCentavos) {
        let list = multMap.get(val);
        if (!list) {
          list = [];
          multMap.set(val, list);
        }
        list.push({ candidate: c, k, total: val });
      }
    }
  }

  // Search 2-item exact match
  for (const c of pool) {
    const limitK = Math.min(c.quantidade, maxK);
    for (let k = 1; k <= limitK; k++) {
      const valA = multiplyMoney(c.unitarioCentavos, k);
      const rem = valorAlvoCentavos - valA;
      if (rem > 0) {
        const matchesB = multMap.get(rem);
        if (matchesB) {
          for (const entryB of matchesB) {
            if (entryB.candidate.id !== c.id) {
              return {
                strategy: 'EXACT_COMBINATION',
                valorAlvoCentavos,
                valorSugeridoCentavos: valorAlvoCentavos,
                deltaCentavos: 0,
                itens: [
                  mapToSuggestion(c, k),
                  mapToSuggestion(entryB.candidate, entryB.k),
                ],
                alternativasProximidade: alternativas,
              };
            }
          }
        }
      }
    }
  }

  // 2B. Three-Item Sorted Two-Pointer Matching (if time permits)
  if (performance.now() < deadline && pool.length >= 3) {
    const allEntries: MultiEntry[] = [];
    for (const entries of multMap.values()) {
      for (const e of entries) {
        allEntries.push(e);
      }
    }
    allEntries.sort((a, b) => a.total - b.total);

    for (let i = 0; i < pool.length; i++) {
      if (performance.now() >= deadline) break;

      const candA = pool[i];
      const limitKA = Math.min(candA.quantidade, 3);
      for (let kA = 1; kA <= limitKA; kA++) {
        if (performance.now() >= deadline) break;
        const valA = multiplyMoney(candA.unitarioCentavos, kA);
        const remTarget = valorAlvoCentavos - valA;
        if (remTarget <= 0) continue;

        let left = 0;
        let right = allEntries.length - 1;

        while (left < right) {
          const sum2 = allEntries[left].total + allEntries[right].total;
          if (sum2 === remTarget) {
            const entryB = allEntries[left];
            const entryC = allEntries[right];

            if (
              entryB.candidate.id !== candA.id &&
              entryC.candidate.id !== candA.id &&
              entryB.candidate.id !== entryC.candidate.id
            ) {
              return {
                strategy: 'EXACT_COMBINATION',
                valorAlvoCentavos,
                valorSugeridoCentavos: valorAlvoCentavos,
                deltaCentavos: 0,
                itens: [
                  mapToSuggestion(candA, kA),
                  mapToSuggestion(entryB.candidate, entryB.k),
                  mapToSuggestion(entryC.candidate, entryC.k),
                ],
                alternativasProximidade: alternativas,
              };
            }
            left++;
            right--;
          } else if (sum2 < remTarget) {
            left++;
          } else {
            right--;
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // TIER 3: Minimal Delta Proximity Match
  // -------------------------------------------------------------------------
  let bestTotal = 0;
  let minAbsDelta = Infinity;
  let bestType: 'single' | 'pair' = 'single';
  let bestCandidate: StockCandidate | null = null;
  let bestCandidateK = 0;
  let bestItemA: StockCandidate | null = null;
  let bestItemB: StockCandidate | null = null;

  // Evaluate single items (including single items larger or smaller than target)
  const tier3Candidates =
    activeCandidates.length > 150
      ? activeCandidates.slice(0, 150)
      : activeCandidates;

  for (const c of tier3Candidates) {
    const unit = c.unitarioCentavos;
    const qty = c.quantidade;
    const maxK = Math.max(
      1,
      Math.min(qty, Math.round(valorAlvoCentavos / unit))
    );

    // Test k = 1
    let total = unit;
    let absDelta = Math.abs(total - valorAlvoCentavos);
    if (
      absDelta < minAbsDelta ||
      (absDelta === minAbsDelta && total <= valorAlvoCentavos)
    ) {
      minAbsDelta = absDelta;
      bestTotal = total;
      bestType = 'single';
      bestCandidate = c;
      bestCandidateK = 1;
    }

    // Test maxK
    if (maxK > 1 && maxK <= qty) {
      total = unit * maxK;
      absDelta = Math.abs(total - valorAlvoCentavos);
      if (
        absDelta < minAbsDelta ||
        (absDelta === minAbsDelta && total <= valorAlvoCentavos)
      ) {
        minAbsDelta = absDelta;
        bestTotal = total;
        bestType = 'single';
        bestCandidate = c;
        bestCandidateK = maxK;
      }
    }

    // Test maxK - 1
    const prevK = maxK - 1;
    if (prevK > 1 && prevK <= qty) {
      total = unit * prevK;
      absDelta = Math.abs(total - valorAlvoCentavos);
      if (
        absDelta < minAbsDelta ||
        (absDelta === minAbsDelta && total <= valorAlvoCentavos)
      ) {
        minAbsDelta = absDelta;
        bestTotal = total;
        bestType = 'single';
        bestCandidate = c;
        bestCandidateK = prevK;
      }
    }

    // Test maxK + 1
    const nextK = maxK + 1;
    if (nextK > 1 && nextK <= qty && nextK !== maxK) {
      total = unit * nextK;
      absDelta = Math.abs(total - valorAlvoCentavos);
      if (
        absDelta < minAbsDelta ||
        (absDelta === minAbsDelta && total <= valorAlvoCentavos)
      ) {
        minAbsDelta = absDelta;
        bestTotal = total;
        bestType = 'single';
        bestCandidate = c;
        bestCandidateK = nextK;
      }
    }
  }

  // Evaluate 2-item combinations for closer proximity
  if (pool.length >= 2) {
    const samplePool = pool.slice(0, 30);
    for (let i = 0; i < samplePool.length; i++) {
      for (let j = i + 1; j < samplePool.length; j++) {
        const itemA = samplePool[i];
        const itemB = samplePool[j];
        const total = itemA.unitarioCentavos + itemB.unitarioCentavos;
        const absDelta = Math.abs(total - valorAlvoCentavos);

        if (
          absDelta < minAbsDelta ||
          (absDelta === minAbsDelta && total <= valorAlvoCentavos)
        ) {
          minAbsDelta = absDelta;
          bestTotal = total;
          bestType = 'pair';
          bestItemA = itemA;
          bestItemB = itemB;
        }
      }
    }
  }

  let bestItems: DeductionItemSuggestion[] = [];
  if (bestType === 'single' && bestCandidate) {
    bestItems = [mapToSuggestion(bestCandidate, bestCandidateK)];
  } else if (bestType === 'pair' && bestItemA && bestItemB) {
    bestItems = [
      mapToSuggestion(bestItemA, 1),
      mapToSuggestion(bestItemB, 1),
    ];
  }

  const deltaCentavos = bestTotal - valorAlvoCentavos;

  return {
    strategy: 'PROXIMITY_COMBINATION',
    valorAlvoCentavos,
    valorSugeridoCentavos: bestTotal,
    deltaCentavos,
    itens: bestItems,
    alternativasProximidade: alternativas,
  };
}
