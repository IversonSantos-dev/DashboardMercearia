# Handoff Report — M3 Challenger Recheck (Latency SLA & Invariant Verification)

**Author**: M3 Challenger Recheck  
**Role**: critic, specialist  
**Date**: 2026-11-05T11:34:00Z  
**Verdict**: **REQUEST_CHANGES**  
**Location**: `c:\Users\Iverson Santos\Documents\Antigravity\Dashboard Mercearia\.agents\teamwork\m3_challenger_recheck\handoff.md`  

---

## 1. Observation

### 1.1 Verbatim Failure in Full Test Suite (`pnpm test`)
Executing `pnpm test` produced an empirical failure in `tests/unit/baixa-inteligente.test.ts`:
```
   ✓ Intelligent Deduction Engine (baixa-inteligente) > Suite E: Edge Cases & Performance Benchmarks > U-T5-05: worst-case fallthrough latency strictly < 2.0ms for 500 active SKUs 62ms
   ✓ Intelligent Deduction Engine (baixa-inteligente) > Suite E: Edge Cases & Performance Benchmarks > U-T5-06: worst-case fallthrough latency strictly < 2.0ms for 1,000 active SKUs 59ms
   × Intelligent Deduction Engine (baixa-inteligente) > Suite E: Edge Cases & Performance Benchmarks > U-T5-07: worst-case fallthrough latency strictly < 2.0ms for 2,000 active SKUs 88ms
     → expected 2.2663533333333326 to be less than 2
   ✓ Intelligent Deduction Engine (baixa-inteligente) > Suite E: Edge Cases & Performance Benchmarks > U-T5-08: exact unit match latency strictly < 2.0ms across 500, 1,000, and 2,000 active SKUs 13ms
   ✓ Intelligent Deduction Engine (baixa-inteligente) > Suite E: Edge Cases & Performance Benchmarks > U-T5-09: two-sum exact combination latency strictly < 2.0ms across 500, 1,000, and 2,000 active SKUs 15ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/baixa-inteligente.test.ts > Intelligent Deduction Engine (baixa-inteligente) > Suite E: Edge Cases & Performance Benchmarks > U-T5-07: worst-case fallthrough latency strictly < 2.0ms for 2,000 active SKUs
AssertionError: expected 2.2663533333333326 to be less than 2
 ❯ tests/unit/baixa-inteligente.test.ts:568:27
    566|       const avgDuration = (performance.now() - t0) / iterations;
    567|       console.log(`[Latency] 2000 SKUs Worst-Case Avg: ${avgDuration.toFixed(3)}ms`);
    568|       expect(avgDuration).toBeLessThan(2.0);
       |                           ^

 Test Files  1 failed | 15 passed (16)
      Tests  1 failed | 266 passed (267)
   Duration  23.91s
```

### 1.2 Verbatim Failure in Isolated Unit Test Runs (`npx vitest run tests/unit/baixa-inteligente.test.ts`)
Across 5 test runs of `tests/unit/baixa-inteligente.test.ts`, `U-T5-07` breached the `< 2.0ms` assertion in 2 runs:
- **Run 1**:
  ```
  stdout | [Latency] 2000 SKUs Worst-Case Avg: 2.058ms
  × U-T5-07: worst-case fallthrough latency strictly < 2.0ms for 2,000 active SKUs
    → expected 2.0581566666666657 to be less than 2
  ```
- **Run 3**:
  ```
  stdout | [Latency] 2000 SKUs Worst-Case Avg: 2.032ms
  × U-T5-07: worst-case fallthrough latency strictly < 2.0ms for 2,000 active SKUs
    → expected 2.031783333333332 to be less than 2
  ```
- **Runs 2, 4, 5**: Passed right at the knife-edge (`1.817ms`, `1.781ms`, `1.795ms`), leaving less than 0.2ms margin.

### 1.3 Latency Distribution Harness (50 iterations per SKU scale)
Measuring execution duration of `findDeductionSuggestion` directly (without Vitest assertion overhead) revealed:
- **500 SKUs**: Average `1.616ms` - `1.620ms` (Min `1.452ms`, Max `1.659ms`). 0 breaches.
- **1,000 SKUs**: Average `1.654ms` - `1.725ms` (P95 `2.155ms`, Max `2.189ms`). Up to **12% of requests breached 2.0ms**.
- **2,000 SKUs**: Average `1.737ms` - `1.740ms` (P95 `1.842ms`, P99 `2.945ms`, Max `2.945ms`). Up to **4% of requests breached 2.0ms**.

### 1.4 Code Inspection: Mechanical Cause in `src/modules/baixa-inteligente/engine.ts`
1. **Line 219**:
   ```typescript
   // Reserve 0.4ms buffer for Tier 3 proximity search and overhead (< 2.0ms total SLA)
   const deadline = functionStartTime + Math.max(0.2, opts.timeoutMs - 0.4);
   ```
   When `opts.timeoutMs` is 2.0, `deadline = functionStartTime + 1.6`.
2. **Lines 297-302 (Tier 2B Loop Overshoot)**:
   ```typescript
   for (let i = 0; i < pool.length; i++) {
     if (performance.now() >= deadline) break;

     const candA = pool[i];
     const limitKA = Math.min(candA.quantidade, 3);
     for (let kA = 1; kA <= limitKA; kA++) {
       // while (left < right) two-pointer scan over allEntries (750 items)
     }
   }
   ```
   The deadline is checked *only* at the outer index `i`. If `i` begins at `1.55ms` (before `1.60ms`), it proceeds to execute `kA = 1..3`, performing up to 3 two-pointer scans across 750 elements (~2,250 loop iterations). This single iteration takes `0.15ms - 0.25ms`. When it finishes, `performance.now()` has already reached `1.75ms - 1.80ms`.
3. **Lines 358-453 (Tier 3 Linear Scan of All 2,000 SKUs + 435 Pair Comparisons)**:
   ```typescript
   for (const c of activeCandidates) { // 2,000 items!
     // 4 branch multiplier tests per candidate
   }
   // 435 pair comparisons in samplePool
   ```
   Tier 3 iterates through the entire active catalog of 2,000 candidates and tests 4 branches per candidate, followed by 435 pair combinations. On 2,000 SKUs, this takes `0.35ms - 0.50ms`.
4. **Combined Total**:
   `1.75ms (Tier 2 exit)` + `0.35ms - 0.50ms (Tier 3)` = **`2.10ms - 2.27ms`**, directly causing the reproducible failures in `U-T5-07` and `pnpm test`.

### 1.5 Soundness of Invariants, Build, and Database
- **Mathematical Invariants**: 100% sound. Exact unit, exact multiple, two-sum combinations, and delta calculations all preserve integer cents without float drift (`deltaCentavos === valorSugeridoCentavos - valorAlvoCentavos`).
- **TypeScript**: `npx tsc --noEmit` exits with code 0 (zero errors).
- **Next.js Production Build**: `pnpm build` completes cleanly with code 0 (8/8 static pages generated).
- **Database Cleanliness**: `produtoEstoque` count is 0 (clean).

---

## 2. Logic Chain

1. **Premise 1**: The latency SLA requires `findDeductionSuggestion` worst-case fallthrough latency to strictly and reliably remain $< 2.0\text{ ms}$ across 500, 1,000, and 2,000 SKUs.
2. **Premise 2**: In `pnpm test`, test `U-T5-07` failed with `2.266ms < 2.0ms` (Observation 1.1). In isolated Vitest runs, `U-T5-07` failed with `2.058ms` and `2.032ms` (Observation 1.2).
3. **Inference**: The current 0.4ms safety buffer (`opts.timeoutMs - 0.4 = 1.6ms`) is inadequate because:
   - Tier 2B overshoots by up to 0.20ms due to coarse deadline checking only at outer loop `i` (Observation 1.4).
   - Tier 3 requires 0.35ms - 0.50ms to evaluate 2,000 candidates and 435 pairs (Observation 1.4).
   - The combined post-deadline work takes `0.50ms - 0.70ms`, whereas only `0.40ms` was reserved.
4. **Conclusion**: The latency SLA is NOT strictly satisfied at 2,000 SKUs under worst-case fallthrough. Changes are required to guarantee reliability.

---

## 3. Caveats

- Functional correctness and mathematical precision are fully validated. There are no algorithmic or business logic defects in R1, R2, R3, or R4.
- The failure is strictly confined to latency budget calibration under worst-case adversarial combinatorial fallthrough at 2,000 SKUs.

---

## 4. Conclusion & Required Changes

**Verdict**: **REQUEST_CHANGES**

To permanently resolve the SLA breach and ensure 100% deterministic passage under 2,000 SKUs:

1. **Recalibrate the Tier 2 Safety Buffer**:
   In `src/modules/baixa-inteligente/engine.ts`:
   Increase the buffer from `0.4ms` to `0.8ms` (or use `opts.timeoutMs * 0.55`):
   ```typescript
   // Reserve 0.8ms buffer for Tier 3 proximity search and overhead (< 2.0ms total SLA)
   const deadline = functionStartTime + Math.max(0.2, opts.timeoutMs - 0.8);
   ```
2. **Fine-Grained Deadline Check in Tier 2B**:
   Check deadline inside the `kA` loop so Tier 2B yields immediately rather than completing all 3 inner passes:
   ```typescript
   for (let kA = 1; kA <= limitKA; kA++) {
     if (performance.now() >= deadline) break;
     ...
   ```
3. **Bound Tier 3 Candidate Pool**:
   In Tier 3, instead of iterating all 2,000 active candidates, evaluate the single-item scan against the closest candidates (e.g. `alternativas` or `activeCandidates.slice(0, 100)`), reducing Tier 3 duration from 0.35ms to $< 0.05\text{ ms}$.

---

## 5. Verification Method

1. **Run Unit Benchmark Suite**:
   ```powershell
   npx vitest run tests/unit/baixa-inteligente.test.ts
   ```
   *Expected result*: All 24 tests pass cleanly, with 2000 SKUs worst-case average reliably $< 1.6\text{ ms}$ (comfortably below 2.0ms).
2. **Run Full Test Suite**:
   ```powershell
   pnpm test
   ```
   *Expected result*: 16 test files pass, 267+ tests pass with code 0.
3. **Run Production Build**:
   ```powershell
   pnpm build
   ```
   *Expected result*: Code 0.
4. **Invalidation Conditions**:
   - Any average latency in U-T5-05, U-T5-06, or U-T5-07 $\ge 2.0\text{ ms}$.
   - Any failing test in `pnpm test`.
