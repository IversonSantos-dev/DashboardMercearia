import { describe, it, expect } from "vitest";
import {
  findDeductionSuggestion,
  filterActiveStock,
  buildAssistedCatalog,
  StockCandidate,
} from "../../src/modules/baixa-inteligente";

describe("Intelligent Deduction Engine (baixa-inteligente)", () => {
  const sampleStock: StockCandidate[] = [
    {
      id: "p1",
      codigo: "001",
      barras: "78910001",
      discriminacao: "Arroz 5kg",
      unidade: "UN",
      quantidade: 15,
      unitarioCentavos: 2500, // R$ 25,00
      ativo: true,
    },
    {
      id: "p2",
      codigo: "002",
      barras: "78910002",
      discriminacao: "Feijão 1kg",
      unidade: "UN",
      quantidade: 10,
      unitarioCentavos: 850, // R$ 8,50
      ativo: true,
    },
    {
      id: "p3",
      codigo: "003",
      barras: "78910003",
      discriminacao: "Óleo 900ml",
      unidade: "UN",
      quantidade: 30,
      unitarioCentavos: 650, // R$ 6,50
      ativo: true,
    },
    {
      id: "p4",
      codigo: "004",
      barras: "78910004",
      discriminacao: "Açúcar 1kg",
      unidade: "UN",
      quantidade: 20,
      unitarioCentavos: 450, // R$ 4,50
      ativo: true,
    },
    {
      id: "p5",
      codigo: "005",
      barras: "78910005",
      discriminacao: "Sal 1kg",
      unidade: "UN",
      quantidade: 50,
      unitarioCentavos: 200, // R$ 2,00
      ativo: true,
    },
  ];

  // =========================================================================
  // Suite A: Tier 1 — Exact Unit & Multiple Match
  // =========================================================================
  describe("Suite A: Tier 1 — Exact Unit & Multiple Match", () => {
    it("U-T1-01: matches single product when 1 * unitarioCentavos === valorAlvoCentavos", () => {
      const res = findDeductionSuggestion(sampleStock, 2500);
      expect(res.strategy).toBe("EXACT_UNIT");
      expect(res.valorAlvoCentavos).toBe(2500);
      expect(res.valorSugeridoCentavos).toBe(2500);
      expect(res.deltaCentavos).toBe(0);
      expect(res.itens.length).toBe(1);
      expect(res.itens[0].codigo).toBe("001");
      expect(res.itens[0].quantidadeDebitar).toBe(1);
    });

    it("U-T1-02: tie-breaking chooses candidate with higher stock on identical price", () => {
      const stockWithTie: StockCandidate[] = [
        {
          id: "t1",
          codigo: "A-LOW",
          barras: null,
          discriminacao: "Item Pouco Estoque",
          unidade: "UN",
          quantidade: 3,
          unitarioCentavos: 1000,
          ativo: true,
        },
        {
          id: "t2",
          codigo: "B-HIGH",
          barras: null,
          discriminacao: "Item Muito Estoque",
          unidade: "UN",
          quantidade: 50,
          unitarioCentavos: 1000,
          ativo: true,
        },
      ];

      const res = findDeductionSuggestion(stockWithTie, 1000);
      expect(res.strategy).toBe("EXACT_UNIT");
      expect(res.itens[0].codigo).toBe("B-HIGH");
    });

    it("U-T1-03: ignores candidates with quantidade === 0", () => {
      const stockWithZero: StockCandidate[] = [
        {
          id: "z1",
          codigo: "ZERO-STOCK",
          barras: null,
          discriminacao: "Item Zerado",
          unidade: "UN",
          quantidade: 0,
          unitarioCentavos: 1500,
          ativo: true,
        },
        {
          id: "z2",
          codigo: "OTHER",
          barras: null,
          discriminacao: "Outro Item",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 1000,
          ativo: true,
        },
      ];

      const res = findDeductionSuggestion(stockWithZero, 1500);
      expect(res.itens.some((i) => i.codigo === "ZERO-STOCK")).toBe(false);
    });

    it("U-T1-04: matches exact multiple when integer quantity equals target amount", () => {
      // R$ 20,00 with Sal (R$ 2,00 * 10 = R$ 20,00)
      const res = findDeductionSuggestion(sampleStock, 2000);
      expect(res.strategy).toBe("EXACT_MULTIPLE");
      expect(res.valorSugeridoCentavos).toBe(2000);
      expect(res.deltaCentavos).toBe(0);
      expect(res.itens.length).toBe(1);
      expect(res.itens[0].codigo).toBe("005");
      expect(res.itens[0].quantidadeDebitar).toBe(10);
    });

    it("U-T1-05: skips multiple match when required k exceeds available quantity", () => {
      const limitedStock: StockCandidate[] = [
        {
          id: "lim",
          codigo: "LIM-01",
          barras: null,
          discriminacao: "Item Limitado",
          unidade: "UN",
          quantidade: 2, // only 2 available
          unitarioCentavos: 500, // needs 4 for target 2000
          ativo: true,
        },
      ];

      const res = findDeductionSuggestion(limitedStock, 2000);
      expect(res.strategy).not.toBe("EXACT_MULTIPLE");
      expect(res.strategy).toBe("PROXIMITY_COMBINATION");
      expect(res.itens[0].quantidadeDebitar).toBeLessThanOrEqual(2);
    });

    it("U-T1-06: prefers exact unit match (k=1) over multiple match (k>1)", () => {
      const stock: StockCandidate[] = [
        {
          id: "s1",
          codigo: "MULTIPLE",
          barras: null,
          discriminacao: "Biscoito 5,00",
          unidade: "UN",
          quantidade: 10,
          unitarioCentavos: 500,
          ativo: true,
        },
        {
          id: "s2",
          codigo: "UNIT",
          barras: null,
          discriminacao: "Vinho 10,00",
          unidade: "UN",
          quantidade: 2,
          unitarioCentavos: 1000,
          ativo: true,
        },
      ];

      const res = findDeductionSuggestion(stock, 1000);
      expect(res.strategy).toBe("EXACT_UNIT");
      expect(res.itens[0].codigo).toBe("UNIT");
      expect(res.itens[0].quantidadeDebitar).toBe(1);
    });
  });

  // =========================================================================
  // Suite B: Tier 2 — Exact Combinations (Two-Sum & Three-Sum)
  // =========================================================================
  describe("Suite B: Tier 2 — Exact Combinations", () => {
    it("U-T2-01: finds exact 2-item combination via Hash-Map Two-Sum", () => {
      // Target: R$ 11,00 (Óleo 6,50 + Açúcar 4,50)
      const res = findDeductionSuggestion(sampleStock, 1100);
      expect(res.strategy).toBe("EXACT_COMBINATION");
      expect(res.valorSugeridoCentavos).toBe(1100);
      expect(res.deltaCentavos).toBe(0);
      expect(res.itens.length).toBe(2);

      const codes = res.itens.map((i) => i.codigo).sort();
      expect(codes).toEqual(["003", "004"]);
    });

    it("U-T2-02: finds exact 3-item combination", () => {
      const threeStock: StockCandidate[] = [
        {
          id: "a1",
          codigo: "A",
          barras: null,
          discriminacao: "Item A",
          unidade: "UN",
          quantidade: 1,
          unitarioCentavos: 300,
          ativo: true,
        },
        {
          id: "b1",
          codigo: "B",
          barras: null,
          discriminacao: "Item B",
          unidade: "UN",
          quantidade: 1,
          unitarioCentavos: 500,
          ativo: true,
        },
        {
          id: "c1",
          codigo: "C",
          barras: null,
          discriminacao: "Item C",
          unidade: "UN",
          quantidade: 1,
          unitarioCentavos: 600,
          ativo: true,
        },
      ];

      // Target: 1400 (300 + 500 + 600)
      const res = findDeductionSuggestion(threeStock, 1400);
      expect(res.strategy).toBe("EXACT_COMBINATION");
      expect(res.valorSugeridoCentavos).toBe(1400);
      expect(res.deltaCentavos).toBe(0);
      expect(res.itens.length).toBe(3);
    });

    it("U-T2-03: does not re-use a product with single unit across multiple slots", () => {
      const stockSingle: StockCandidate[] = [
        {
          id: "s1",
          codigo: "SOLO",
          barras: null,
          discriminacao: "Item com 1 unidade",
          unidade: "UN",
          quantidade: 1,
          unitarioCentavos: 500,
          ativo: true,
        },
        {
          id: "s2",
          codigo: "OTHER",
          barras: null,
          discriminacao: "Outro",
          unidade: "UN",
          quantidade: 1,
          unitarioCentavos: 300,
          ativo: true,
        },
      ];

      // Target: 1000. SOLO has 1 unit of 500. Should NOT suggest 2x SOLO!
      const res = findDeductionSuggestion(stockSingle, 1000);
      expect(res.strategy).not.toBe("EXACT_COMBINATION");
      expect(res.strategy).not.toBe("EXACT_MULTIPLE");
    });

    it("U-T2-04: allows combining multiple units of one product with another", () => {
      // 2 x Açúcar (450 * 2 = 900) + 1 x Sal (200) = 1100
      const stockMulti: StockCandidate[] = [
        {
          id: "m1",
          codigo: "ACUCAR",
          barras: null,
          discriminacao: "Açúcar",
          unidade: "UN",
          quantidade: 10,
          unitarioCentavos: 450,
          ativo: true,
        },
        {
          id: "m2",
          codigo: "SAL",
          barras: null,
          discriminacao: "Sal",
          unidade: "UN",
          quantidade: 10,
          unitarioCentavos: 200,
          ativo: true,
        },
      ];

      const res = findDeductionSuggestion(stockMulti, 1100);
      expect(res.strategy).toBe("EXACT_COMBINATION");
      expect(res.valorSugeridoCentavos).toBe(1100);
      expect(res.deltaCentavos).toBe(0);
    });
  });

  // =========================================================================
  // Suite C: Tier 3 — Minimal Delta Proximity Match
  // =========================================================================
  describe("Suite C: Tier 3 — Minimal Delta Proximity Match", () => {
    it("U-T3-01: returns nearest combination when exact match is impossible", () => {
      const stockProx: StockCandidate[] = [
        {
          id: "x1",
          codigo: "P10",
          barras: null,
          discriminacao: "Item 10",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 1000,
          ativo: true,
        },
        {
          id: "x2",
          codigo: "P15",
          barras: null,
          discriminacao: "Item 15",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 1500,
          ativo: true,
        },
      ];

      // Target: 1100. Nearest is 1000 (delta: -100)
      const res = findDeductionSuggestion(stockProx, 1100);
      expect(res.strategy).toBe("PROXIMITY_COMBINATION");
      expect(res.valorSugeridoCentavos).toBe(1000);
      expect(res.deltaCentavos).toBe(-100);
    });

    it("U-T3-02: handles prime odd target (R$ 0,07) with minimal delta", () => {
      const stockPrime: StockCandidate[] = [
        {
          id: "b1",
          codigo: "BALA",
          barras: null,
          discriminacao: "Bala",
          unidade: "UN",
          quantidade: 50,
          unitarioCentavos: 10, // R$ 0,10
          ativo: true,
        },
      ];

      const res = findDeductionSuggestion(stockPrime, 7);
      expect(res.strategy).toBe("PROXIMITY_COMBINATION");
      expect(res.valorSugeridoCentavos).toBe(10);
      expect(res.deltaCentavos).toBe(3); // 10 - 7 = +3
    });

    it("U-T3-03: accurately sets signed deltaCentavos", () => {
      const stock: StockCandidate[] = [
        {
          id: "a1",
          codigo: "A",
          barras: null,
          discriminacao: "A",
          unidade: "UN",
          quantidade: 2,
          unitarioCentavos: 500,
          ativo: true,
        },
      ];

      // Target: 450. Nearest is 500. Delta = 500 - 450 = +50
      const res = findDeductionSuggestion(stock, 450);
      expect(res.deltaCentavos).toBe(50);
    });
  });

  // =========================================================================
  // Suite D: Tier 4 — Interactive Assisted Catalog
  // =========================================================================
  describe("Suite D: Tier 4 — Interactive Assisted Catalog", () => {
    it("U-T4-01: orders alternatives by proximity of unit price to target", () => {
      const catalog = buildAssistedCatalog(sampleStock, 700, 3);
      expect(catalog.length).toBe(3);
      // Closest to 700: 650 (delta 50), then 850 (delta 150), then 450 (delta 250)
      expect(catalog[0].codigo).toBe("003"); // 650
      expect(catalog[1].codigo).toBe("002"); // 850
      expect(catalog[2].codigo).toBe("004"); // 450
    });

    it("U-T4-02: excludes zero-stock and inactive items from filtered active stock", () => {
      const rawCandidates: StockCandidate[] = [
        {
          id: "1",
          codigo: "ACTIVE",
          barras: null,
          discriminacao: "Ativo",
          unidade: "UN",
          quantidade: 5,
          unitarioCentavos: 500,
          ativo: true,
        },
        {
          id: "2",
          codigo: "ZERO",
          barras: null,
          discriminacao: "Zerado",
          unidade: "UN",
          quantidade: 0,
          unitarioCentavos: 500,
          ativo: true,
        },
        {
          id: "3",
          codigo: "INACTIVE",
          barras: null,
          discriminacao: "Inativo",
          unidade: "UN",
          quantidade: 10,
          unitarioCentavos: 500,
          ativo: false,
        },
      ];

      const filtered = filterActiveStock(rawCandidates);
      expect(filtered.length).toBe(1);
      expect(filtered[0].codigo).toBe("ACTIVE");
    });
  });

  // =========================================================================
  // Suite E: Edge Cases & Performance Benchmarks
  // =========================================================================
  describe("Suite E: Edge Cases & Performance Benchmarks", () => {
    it("U-T5-01: handles target amount of 0 centavos safely", () => {
      const res = findDeductionSuggestion(sampleStock, 0);
      expect(res.strategy).toBe("EXACT_UNIT");
      expect(res.valorSugeridoCentavos).toBe(0);
      expect(res.deltaCentavos).toBe(0);
      expect(res.itens.length).toBe(0);
    });

    it("U-T5-02: handles negative or invalid target without unhandled exceptions", () => {
      const res = findDeductionSuggestion(sampleStock, -500);
      expect(res.strategy).toBe("ASSISTED_CATALOG");
      expect(res.itens.length).toBe(0);
    });

    it("U-T5-03: handles empty inventory array safely", () => {
      const res = findDeductionSuggestion([], 1500);
      expect(res.strategy).toBe("ASSISTED_CATALOG");
      expect(res.itens.length).toBe(0);
    });

    it("U-T5-04: performance benchmark: combinatorial search with 250 candidates runs in < 2ms", () => {
      const largeCatalog: StockCandidate[] = [];
      for (let i = 1; i <= 250; i++) {
        largeCatalog.push({
          id: `bench-${i}`,
          codigo: `BENCH-${String(i).padStart(4, "0")}`,
          barras: `789000${String(i).padStart(6, "0")}`,
          discriminacao: `Produto Benchmark ${i}`,
          unidade: "UN",
          quantidade: 20,
          unitarioCentavos: 100 + (i * 37) % 4900,
          ativo: true,
        });
      }

      const t0 = performance.now();
      const iterations = 50;
      for (let i = 0; i < iterations; i++) {
        findDeductionSuggestion(largeCatalog, 3750, { timeoutMs: 2.0 });
      }
      const avgDuration = (performance.now() - t0) / iterations;

      expect(avgDuration).toBeLessThan(2.0); // Strictly < 2ms SLA
    });

    function createEvenAdversarialCatalog(size: number): StockCandidate[] {
      const catalog: StockCandidate[] = [];
      for (let i = 1; i <= size; i++) {
        catalog.push({
          id: `even-${size}-${i}`,
          codigo: `EV-${String(i).padStart(5, "0")}`,
          barras: `789000${String(i).padStart(7, "0")}`,
          discriminacao: `Produto Par Adversarial ${i}`,
          unidade: "UN",
          quantidade: 10 + (i % 25),
          unitarioCentavos: 2 + ((i * 4) % 10000), // Strictly even integer cents
          ativo: true,
        });
      }
      return catalog;
    }

    it("U-T5-05: worst-case fallthrough latency strictly < 2.0ms for 500 active SKUs", () => {
      const catalog = createEvenAdversarialCatalog(500);
      const oddTarget = 77777; // No exact match possible with even catalog

      // Warmup JIT
      for (let i = 0; i < 5; i++) {
        findDeductionSuggestion(catalog, oddTarget);
      }

      const iterations = 30;
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = findDeductionSuggestion(catalog, oddTarget);
        expect(res.strategy).toBe("PROXIMITY_COMBINATION");
      }
      const avgDuration = (performance.now() - t0) / iterations;
      console.log(`[Latency] 500 SKUs Worst-Case Avg: ${avgDuration.toFixed(3)}ms`);
      expect(avgDuration).toBeLessThan(2.0);
    });

    it("U-T5-06: worst-case fallthrough latency strictly < 2.0ms for 1,000 active SKUs", () => {
      const catalog = createEvenAdversarialCatalog(1000);
      const oddTarget = 77777;

      // Warmup JIT
      for (let i = 0; i < 5; i++) {
        findDeductionSuggestion(catalog, oddTarget);
      }

      const iterations = 30;
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = findDeductionSuggestion(catalog, oddTarget);
        expect(res.strategy).toBe("PROXIMITY_COMBINATION");
      }
      const avgDuration = (performance.now() - t0) / iterations;
      console.log(`[Latency] 1000 SKUs Worst-Case Avg: ${avgDuration.toFixed(3)}ms`);
      expect(avgDuration).toBeLessThan(2.0);
    });

    it("U-T5-07: worst-case fallthrough latency strictly < 2.0ms for 2,000 active SKUs", () => {
      const catalog = createEvenAdversarialCatalog(2000);
      const oddTarget = 77777;

      // Warmup JIT
      for (let i = 0; i < 5; i++) {
        findDeductionSuggestion(catalog, oddTarget);
      }

      const iterations = 30;
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = findDeductionSuggestion(catalog, oddTarget);
        expect(res.strategy).toBe("PROXIMITY_COMBINATION");
      }
      const avgDuration = (performance.now() - t0) / iterations;
      console.log(`[Latency] 2000 SKUs Worst-Case Avg: ${avgDuration.toFixed(3)}ms`);
      expect(avgDuration).toBeLessThan(2.0);
    });

    it("U-T5-08: exact unit match latency strictly < 2.0ms across 500, 1,000, and 2,000 active SKUs", () => {
      for (const size of [500, 1000, 2000]) {
        const catalog = createEvenAdversarialCatalog(size);
        const target = catalog[Math.floor(size / 2)].unitarioCentavos;

        for (let i = 0; i < 5; i++) findDeductionSuggestion(catalog, target);

        const iterations = 20;
        const t0 = performance.now();
        for (let i = 0; i < iterations; i++) {
          const res = findDeductionSuggestion(catalog, target);
          expect(res.strategy).toBe("EXACT_UNIT");
        }
        const avg = (performance.now() - t0) / iterations;
        console.log(`[Latency] ${size} SKUs Exact Unit Avg: ${avg.toFixed(3)}ms`);
        expect(avg).toBeLessThan(2.0);
      }
    });

    it("U-T5-09: two-sum exact combination latency strictly < 2.0ms across 500, 1,000, and 2,000 active SKUs", () => {
      for (const size of [500, 1000, 2000]) {
        const catalog = createEvenAdversarialCatalog(size);
        const item1 = catalog[10];
        const item2 = catalog[25];
        const target = item1.unitarioCentavos + item2.unitarioCentavos;

        for (let i = 0; i < 5; i++) findDeductionSuggestion(catalog, target);

        const iterations = 20;
        const t0 = performance.now();
        for (let i = 0; i < iterations; i++) {
          const res = findDeductionSuggestion(catalog, target);
          expect(res.deltaCentavos).toBe(0);
          expect(res.valorSugeridoCentavos).toBe(target);
        }
        const avg = (performance.now() - t0) / iterations;
        console.log(`[Latency] ${size} SKUs Two-Sum Avg: ${avg.toFixed(3)}ms`);
        expect(avg).toBeLessThan(2.0);
      }
    });
  });
});
