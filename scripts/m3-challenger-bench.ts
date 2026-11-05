import { performance } from 'perf_hooks';
import {
  findDeductionSuggestion,
  StockCandidate,
} from '../src/modules/baixa-inteligente';

interface BenchmarkStats {
  size: number;
  scenario: string;
  iterations: number;
  min: number;
  mean: number;
  median: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  maxIterationIndex: number;
  slaBreaches: number;
  strategy: string;
}

function calculatePercentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function computeStats(
  durations: number[],
  size: number,
  scenario: string,
  strategy: string
): BenchmarkStats {
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const maxIterationIndex = durations.indexOf(max);
  const median = calculatePercentile(sorted, 50);
  const p90 = calculatePercentile(sorted, 90);
  const p95 = calculatePercentile(sorted, 95);
  const p99 = calculatePercentile(sorted, 99);
  const slaBreaches = sorted.filter((d) => d >= 2.0).length;

  return {
    size,
    scenario,
    iterations: sorted.length,
    min,
    mean,
    median,
    p90,
    p95,
    p99,
    max,
    maxIterationIndex,
    slaBreaches,
    strategy,
  };
}

function createEvenAdversarialCatalog(size: number): StockCandidate[] {
  const catalog: StockCandidate[] = [];
  for (let i = 1; i <= size; i++) {
    catalog.push({
      id: `even-${size}-${i}`,
      codigo: `EV-${String(i).padStart(5, '0')}`,
      barras: `789000${String(i).padStart(7, '0')}`,
      discriminacao: `Produto Par Adversarial ${i}`,
      unidade: 'UN',
      quantidade: 10 + (i % 25),
      unitarioCentavos: 2 + ((i * 4) % 10000), // Strictly even integer cents
      ativo: true,
    });
  }
  return catalog;
}

function createPrimeAdversarialCatalog(size: number): StockCandidate[] {
  const primes = [
    1009, 1013, 1019, 1021, 1031, 1033, 1039, 1049, 1051, 1061,
    1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109, 1117, 1123,
    1129, 1151, 1153, 1163, 1171, 1181, 1187, 1193, 1201, 1213,
  ];
  const catalog: StockCandidate[] = [];
  for (let i = 1; i <= size; i++) {
    const p = primes[i % primes.length] + Math.floor(i / primes.length) * 100;
    catalog.push({
      id: `prime-${size}-${i}`,
      codigo: `PR-${String(i).padStart(5, '0')}`,
      barras: `789100${String(i).padStart(7, '0')}`,
      discriminacao: `Produto Primo Adversarial ${i}`,
      unidade: 'UN',
      quantidade: 5 + (i % 10),
      unitarioCentavos: p,
      ativo: true,
    });
  }
  return catalog;
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('M3 EMPIRICAL CHALLENGER: LATENCY SLA STRESS HARNESS (< 2.0ms)');
  console.log('================================================================\n');

  // Comprehensive JIT warmup for all code paths
  console.log('Running comprehensive JIT warmup for all matching tiers...');
  const warmupCatalog = createEvenAdversarialCatalog(500);
  for (let i = 0; i < 20; i++) {
    findDeductionSuggestion(warmupCatalog, 77777); // Proximity fallthrough
    findDeductionSuggestion(warmupCatalog, warmupCatalog[10].unitarioCentavos); // Exact unit
    findDeductionSuggestion(warmupCatalog, warmupCatalog[10].unitarioCentavos * 3); // Exact multiple
    findDeductionSuggestion(warmupCatalog, warmupCatalog[10].unitarioCentavos + warmupCatalog[20].unitarioCentavos); // Two-sum
  }
  console.log('Warmup complete.\n');

  const targetSizes = [500, 1000, 2000];
  const reports: BenchmarkStats[] = [];

  // 1. Worst-Case Fallthrough (Even Catalog vs Odd Target)
  console.log('--- Test Suite 1: Worst-Case Fallthrough (Adversarial Even vs Odd Target) ---');
  for (const size of targetSizes) {
    const catalog = createEvenAdversarialCatalog(size);
    const oddTarget = 77777; // R$ 777,77 - impossible with even catalog

    // Specific catalog pre-warmup (5 iterations)
    for (let i = 0; i < 5; i++) findDeductionSuggestion(catalog, oddTarget);

    const iterations = 50;
    const durations: number[] = [];
    let lastStrategy = '';

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const res = findDeductionSuggestion(catalog, oddTarget);
      const elapsed = performance.now() - t0;
      durations.push(elapsed);
      lastStrategy = res.strategy;
    }

    const stats = computeStats(durations, size, 'Worst-Case Fallthrough', lastStrategy);
    reports.push(stats);
    console.log(
      `SKUs: ${String(size).padStart(4)} | Strategy: ${stats.strategy.padEnd(20)} | ` +
      `Mean: ${stats.mean.toFixed(3)}ms | Median: ${stats.median.toFixed(3)}ms | ` +
      `p95: ${stats.p95.toFixed(3)}ms | p99: ${stats.p99.toFixed(3)}ms | ` +
      `Max: ${stats.max.toFixed(3)}ms (iter #${stats.maxIterationIndex}) | Breaches >= 2ms: ${stats.slaBreaches}/${stats.iterations}`
    );
  }

  // 2. Adversarial Coprime / Prime Catalog Fallthrough
  console.log('\n--- Test Suite 2: Coprime / Prime Fallthrough (Target = 1 centavo) ---');
  for (const size of targetSizes) {
    const catalog = createPrimeAdversarialCatalog(size);
    const target = 1; // 1 centavo (all items > 1000)

    for (let i = 0; i < 5; i++) findDeductionSuggestion(catalog, target);

    const iterations = 50;
    const durations: number[] = [];
    let lastStrategy = '';

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const res = findDeductionSuggestion(catalog, target);
      const elapsed = performance.now() - t0;
      durations.push(elapsed);
      lastStrategy = res.strategy;
    }

    const stats = computeStats(durations, size, 'Target < Min Price', lastStrategy);
    reports.push(stats);
    console.log(
      `SKUs: ${String(size).padStart(4)} | Strategy: ${stats.strategy.padEnd(20)} | ` +
      `Mean: ${stats.mean.toFixed(3)}ms | Median: ${stats.median.toFixed(3)}ms | ` +
      `p95: ${stats.p95.toFixed(3)}ms | p99: ${stats.p99.toFixed(3)}ms | ` +
      `Max: ${stats.max.toFixed(3)}ms (iter #${stats.maxIterationIndex}) | Breaches >= 2ms: ${stats.slaBreaches}/${stats.iterations}`
    );
  }

  // 3. Exact Unit Match (Worst-case Position: Tail of Catalog)
  console.log('\n--- Test Suite 3: Exact Unit Match (Item at Last Position) ---');
  for (const size of targetSizes) {
    const catalog = createEvenAdversarialCatalog(size);
    const target = catalog[catalog.length - 1].unitarioCentavos;

    for (let i = 0; i < 5; i++) findDeductionSuggestion(catalog, target);

    const iterations = 50;
    const durations: number[] = [];
    let lastStrategy = '';

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const res = findDeductionSuggestion(catalog, target);
      const elapsed = performance.now() - t0;
      durations.push(elapsed);
      lastStrategy = res.strategy;
    }

    const stats = computeStats(durations, size, 'Exact Unit at Tail', lastStrategy);
    reports.push(stats);
    console.log(
      `SKUs: ${String(size).padStart(4)} | Strategy: ${stats.strategy.padEnd(20)} | ` +
      `Mean: ${stats.mean.toFixed(3)}ms | Median: ${stats.median.toFixed(3)}ms | ` +
      `p95: ${stats.p95.toFixed(3)}ms | p99: ${stats.p99.toFixed(3)}ms | ` +
      `Max: ${stats.max.toFixed(3)}ms (iter #${stats.maxIterationIndex}) | Breaches >= 2ms: ${stats.slaBreaches}/${stats.iterations}`
    );
  }

  // 4. Exact Multiple Match (3x Unit at Tail)
  console.log('\n--- Test Suite 4: Exact Multiple Match (3x Unit at Tail) ---');
  for (const size of targetSizes) {
    const catalog = createEvenAdversarialCatalog(size);
    const item = catalog[Math.floor(size * 0.75)];
    const target = item.unitarioCentavos * 3;

    for (let i = 0; i < 5; i++) findDeductionSuggestion(catalog, target);

    const iterations = 50;
    const durations: number[] = [];
    let lastStrategy = '';

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const res = findDeductionSuggestion(catalog, target);
      const elapsed = performance.now() - t0;
      durations.push(elapsed);
      lastStrategy = res.strategy;
    }

    const stats = computeStats(durations, size, 'Exact Multiple (3x)', lastStrategy);
    reports.push(stats);
    console.log(
      `SKUs: ${String(size).padStart(4)} | Strategy: ${stats.strategy.padEnd(20)} | ` +
      `Mean: ${stats.mean.toFixed(3)}ms | Median: ${stats.median.toFixed(3)}ms | ` +
      `p95: ${stats.p95.toFixed(3)}ms | p99: ${stats.p99.toFixed(3)}ms | ` +
      `Max: ${stats.max.toFixed(3)}ms (iter #${stats.maxIterationIndex}) | Breaches >= 2ms: ${stats.slaBreaches}/${stats.iterations}`
    );
  }

  // 5. Two-Sum Exact Match (Combinatorial)
  console.log('\n--- Test Suite 5: Two-Sum Exact Combination ---');
  for (const size of targetSizes) {
    const catalog = createEvenAdversarialCatalog(size);
    const item1 = catalog[50];
    const item2 = catalog[120];
    const target = item1.unitarioCentavos + item2.unitarioCentavos;

    for (let i = 0; i < 5; i++) findDeductionSuggestion(catalog, target);

    const iterations = 50;
    const durations: number[] = [];
    let lastStrategy = '';

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const res = findDeductionSuggestion(catalog, target);
      const elapsed = performance.now() - t0;
      durations.push(elapsed);
      lastStrategy = res.strategy;
    }

    const stats = computeStats(durations, size, 'Two-Sum Exact Combination', lastStrategy);
    reports.push(stats);
    console.log(
      `SKUs: ${String(size).padStart(4)} | Strategy: ${stats.strategy.padEnd(20)} | ` +
      `Mean: ${stats.mean.toFixed(3)}ms | Median: ${stats.median.toFixed(3)}ms | ` +
      `p95: ${stats.p95.toFixed(3)}ms | p99: ${stats.p99.toFixed(3)}ms | ` +
      `Max: ${stats.max.toFixed(3)}ms (iter #${stats.maxIterationIndex}) | Breaches >= 2ms: ${stats.slaBreaches}/${stats.iterations}`
    );
  }

  // 6. Summary of Breaches
  console.log('\n================================================================');
  console.log('SUMMARY EVALUATION (500, 1000, 2000 SKUs)');
  console.log('================================================================');
  const totalBreaches = reports.reduce((acc, r) => acc + r.slaBreaches, 0);
  const totalInvocations = reports.reduce((acc, r) => acc + r.iterations, 0);
  console.log(`Total Invocations Across All Test Suites: ${totalInvocations}`);
  console.log(`Total Invocations Exceeding 2.0ms: ${totalBreaches}`);
  if (totalBreaches === 0) {
    console.log('VERDICT: ZERO BREACHES. SLA (< 2.0ms) IS STRICTLY AND RELIABLY SATISFIED.');
  } else {
    console.log(`VERDICT: VIOLATION. ${totalBreaches} invocations breached SLA.`);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark crashed:', err);
  process.exit(1);
});
