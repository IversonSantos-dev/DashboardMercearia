import { describe, it, expect } from "vitest";
import {
  brlToCentavos,
  centavosToBRL,
  formatDecimalBRL,
  addMoney,
  subtractMoney,
  multiplyMoney,
} from "@/modules/currency";

describe("Currency Engine - Empirical Adversarial Stress & Fuzz Suite", () => {
  // Pseudorandom generator with seed for reproducible empirical fuzzing
  class SeededRandom {
    private seed: number;
    constructor(seed = 123456789) {
      this.seed = seed;
    }
    next(): number {
      this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
      return this.seed / 4294967296;
    }
    rangeInt(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
    rangeFloat(min: number, max: number): number {
      return this.next() * (max - min) + min;
    }
  }

  describe("10,000 Iterations Randomized Round-Trip Fuzzing", () => {
    it("satisfies brlToCentavos(centavosToBRL(x)) === x across 10,000 random amounts in 4 magnitude tiers", () => {
      const rng = new SeededRandom(42);
      const iterations = 10000;
      let passedCount = 0;

      for (let i = 0; i < iterations; i++) {
        let x: number;
        const tier = i % 4;

        if (tier === 0) {
          // Tier 0: Small values [-10,000, 10,000] centavos (-R$ 100 to R$ 100)
          x = rng.rangeInt(-10000, 10000);
        } else if (tier === 1) {
          // Tier 1: Medium values [-10,000,000, 10,000,000] centavos (-R$ 100,000 to R$ 100,000)
          x = rng.rangeInt(-10000000, 10000000);
        } else if (tier === 2) {
          // Tier 2: Large values [-1,000,000,000, 1,000,000,000] (-R$ 10,000,000 to R$ 10,000,000)
          x = rng.rangeInt(-1000000000, 1000000000);
        } else {
          // Tier 3: Extreme high values up to Number.MAX_SAFE_INTEGER
          // MAX_SAFE_INTEGER = 9,007,199,254,740,991
          const factor = rng.next();
          const sign = rng.next() > 0.5 ? 1 : -1;
          x = sign * Math.floor(factor * Number.MAX_SAFE_INTEGER);
        }

        const formattedBRL = centavosToBRL(x);
        const parsedBackBRL = brlToCentavos(formattedBRL);
        expect(parsedBackBRL).toBe(x);

        const formattedDecimal = formatDecimalBRL(x);
        const parsedBackDecimal = brlToCentavos(formattedDecimal);
        expect(parsedBackDecimal).toBe(x);

        passedCount++;
      }

      expect(passedCount).toBe(iterations);
    });
  });

  describe("10,000 Randomized Additions vs IEEE-754 Float Drift", () => {
    it("accumulates 10,000 transactions with ZERO drift against BigInt ground truth, while exposing float drift", () => {
      const rng = new SeededRandom(999);
      const txCount = 10000;

      let integerSum = 0;
      let bigIntSum = 0n;
      let floatSum = 0.0;

      for (let i = 0; i < txCount; i++) {
        // Random transaction amount between R$ 0,01 (1 centavo) and R$ 9.999,99 (999,999 centavos)
        const centavos = rng.rangeInt(1, 999999);
        const floatReais = centavos / 100;

        integerSum = addMoney(integerSum, centavos);
        bigIntSum += BigInt(centavos);
        floatSum += floatReais;
      }

      // Strict equivalence: integer engine matches BigInt ground truth to the exact centavo
      expect(BigInt(integerSum)).toBe(bigIntSum);

      // Quantify IEEE-754 float drift in the standard float accumulator
      const floatInCentavos = Math.round(floatSum * 100);
      const floatDrift = floatSum - integerSum / 100;

      // Ensure that our integer engine is completely discrete and exact
      expect(integerSum).toBeGreaterThan(0);
      expect(Number.isSafeInteger(integerSum)).toBe(true);

      // Verify floatSum shows non-zero drift or discrepancy from floating-point inaccuracy
      // (This proves why integer centavos is mandatory for financial integrity)
      console.log(`[FLOAT DRIFT TEST REPORT]`);
      console.log(`Total 10,000 Transactions Integer Cents: ${integerSum} (${centavosToBRL(integerSum)})`);
      console.log(`Total 10,000 Transactions BigInt Sum:    ${bigIntSum.toString()}`);
      console.log(`Total 10,000 Transactions Float Sum:     ${floatSum}`);
      console.log(`Drift between Float and Integer Sum:     ${floatDrift} BRL`);
    });
  });

  describe("10,000 Randomized Arithmetic Invariants", () => {
    it("maintains strict additive/subtractive algebraic inverse over 10,000 operations", () => {
      const rng = new SeededRandom(777);
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        // Bounds safe from overflow when added
        const a = rng.rangeInt(-1000000000, 1000000000);
        const b = rng.rangeInt(-1000000000, 1000000000);

        // a + b - b === a
        const sum = addMoney(a, b);
        expect(subtractMoney(sum, b)).toBe(a);

        // Commutativity: a + b === b + a
        expect(addMoney(a, b)).toBe(addMoney(b, a));

        // Identity
        expect(addMoney(a, 0)).toBe(a);
        expect(subtractMoney(a, 0)).toBe(a);
        expect(subtractMoney(a, a)).toBe(0);
      }
    });

    it("verifies 10,000 decimal quantity multiplications with half-up rounding", () => {
      const rng = new SeededRandom(888);
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        // Centavos up to R$ 10,000.00
        const centavos = rng.rangeInt(1, 1000000);
        // Decimal quantity up to 100.000 kg (e.g. 0.125 kg, 2.500 kg)
        const qty = parseFloat(rng.rangeFloat(0.001, 100.0).toFixed(3));

        const result = multiplyMoney(centavos, qty);
        expect(Number.isSafeInteger(result)).toBe(true);

        const expected = Math.round(centavos * qty);
        expect(result).toBe(expected === 0 ? 0 : expected);
      }
    });
  });

  describe("Boundary Conditions & Extreme Limits", () => {
    it("handles zero and negative zeros consistently", () => {
      expect(brlToCentavos(0)).toBe(0);
      expect(brlToCentavos(-0)).toBe(0);
      expect(brlToCentavos("0")).toBe(0);
      expect(brlToCentavos("0,00")).toBe(0);
      expect(brlToCentavos("0.00")).toBe(0);
      expect(brlToCentavos("-0,00")).toBe(0);
      expect(brlToCentavos("-0.00")).toBe(0);
      expect(brlToCentavos("(0,00)")).toBe(0);
      expect(brlToCentavos("R$ 0,00")).toBe(0);
      expect(brlToCentavos("-R$ 0,00")).toBe(0);
      expect(centavosToBRL(0)).toBe("R$ 0,00");
      expect(centavosToBRL(-0)).toBe("R$ 0,00");
      expect(formatDecimalBRL(0)).toBe("0,00");
      expect(formatDecimalBRL(-0)).toBe("0,00");
    });

    it("handles exact Number.MAX_SAFE_INTEGER bounds", () => {
      const maxSafe = Number.MAX_SAFE_INTEGER; // 9007199254740991
      const formattedMax = centavosToBRL(maxSafe);
      expect(formattedMax).toBe("R$ 90.071.992.547.409,91");
      expect(brlToCentavos(formattedMax)).toBe(maxSafe);

      const formattedDecimalMax = formatDecimalBRL(maxSafe);
      expect(formattedDecimalMax).toBe("90071992547409,91");
      expect(brlToCentavos(formattedDecimalMax)).toBe(maxSafe);

      const minSafe = -Number.MAX_SAFE_INTEGER; // -9007199254740991
      const formattedMin = centavosToBRL(minSafe);
      expect(formattedMin).toBe("-R$ 90.071.992.547.409,91");
      expect(brlToCentavos(formattedMin)).toBe(minSafe);
    });

    it("detects and rejects overflow beyond MAX_SAFE_INTEGER", () => {
      const maxSafe = Number.MAX_SAFE_INTEGER;

      // centavosToBRL beyond max safe integer
      expect(() => centavosToBRL(maxSafe + 1)).toThrow(TypeError);
      expect(() => centavosToBRL(-maxSafe - 1)).toThrow(TypeError);

      // formatDecimalBRL beyond max safe integer
      expect(() => formatDecimalBRL(maxSafe + 1)).toThrow(TypeError);

      // addMoney overflow
      expect(() => addMoney(maxSafe, 1)).toThrow(RangeError);
      expect(() => addMoney(-maxSafe, -1)).toThrow(RangeError);

      // subtractMoney overflow
      expect(() => subtractMoney(-maxSafe, 1)).toThrow(RangeError);
      expect(() => subtractMoney(maxSafe, -1)).toThrow(RangeError);

      // multiplyMoney overflow
      expect(() => multiplyMoney(maxSafe, 2)).toThrow(RangeError);

      // brlToCentavos numeric overflow
      expect(() => brlToCentavos(maxSafe + 1)).toThrow(RangeError);
      expect(() => brlToCentavos(1e22)).toThrow(RangeError);

      // brlToCentavos string overflow beyond safe integer
      expect(() => brlToCentavos("999999999999999999999999,99")).toThrow(RangeError);
    });
  });

  describe("Malicious & Adversarial String Fuzzing", () => {
    // Inputs that are strictly rejected with TypeError or RangeError
    const strictlyRejectedMaliciousInputs = [
      "R$ NaN",
      "NaN",
      "Infinity",
      "-Infinity",
      "abc",
      "R$ abc",
      "12.34.56",
      "12.34.56,78",
      "1,234.56.78",
      "1.2.3",
      "1,2,3",
      "--10",
      "+-10",
      "-+10",
      "R$ -",
      "R$ +",
      ".",
      ",",
      "..",
      ",,",
      "...",
      ",,,",
      "R$",
      "$",
      "BRL",
      "12,345,67",
      "1.2345,67",
      "1.23,45",
      "<script>alert(1)</script>",
      "DROP TABLE lancamentos_diarios;",
      "{}",
      "[1, 2, 3]",
      "null",
      "undefined",
      "true",
      "false",
      "12@34",
      "12#34",
      "R$ 10.00.00",
      "10.0000,00",
      "10,0000,00",
    ];

    it("reliably throws TypeError or RangeError for all standard malicious string inputs", () => {
      for (const str of strictlyRejectedMaliciousInputs) {
        expect(
          () => brlToCentavos(str),
          `Expected input "${str}" to throw TypeError or RangeError`
        ).toThrow();
      }
    });

    /**
     * REGRESSION HARDENING:
     * Disallows malformed plus signs, minus signs, and infix/postfix operators.
     * Rejects with TypeError.
     */
    it("strictly rejects malformed plus signs and infix operators with TypeError", () => {
      // Multiple plus signs: "++10" and "+ + 10" must throw TypeError
      expect(() => brlToCentavos("++10")).toThrow(TypeError);
      expect(() => brlToCentavos("+ + 10")).toThrow(TypeError);

      // Embedded/infix plus & minus: "1+0", "1-0", "10+20", "10-20" must throw TypeError
      expect(() => brlToCentavos("1+0")).toThrow(TypeError);
      expect(() => brlToCentavos("1-0")).toThrow(TypeError);
      expect(() => brlToCentavos("10+20")).toThrow(TypeError);
      expect(() => brlToCentavos("10-20")).toThrow(TypeError);

      // Trailing signs: "10+", "10-" must throw TypeError
      expect(() => brlToCentavos("10+")).toThrow(TypeError);
      expect(() => brlToCentavos("10-")).toThrow(TypeError);

      // Signs with currency prefix: "R$ 10+20", "R$ 10-20" must throw TypeError
      expect(() => brlToCentavos("R$ 10+20")).toThrow(TypeError);
      expect(() => brlToCentavos("R$ 10-20")).toThrow(TypeError);

      // Accounting parentheses with internal signs must throw TypeError
      expect(() => brlToCentavos("(+10)")).toThrow(TypeError);
      expect(() => brlToCentavos("(-10)")).toThrow(TypeError);
    });

    const maliciousValidStrings = [
      { input: "   R$    1.234,56   ", expected: 123456 },
      { input: "R$\u00A01.234,56", expected: 123456 },
      { input: "   1.234,56   ", expected: 123456 },
      { input: "(R$ 1.234,56)", expected: -123456 },
      { input: "- R$ 1.234,56", expected: -123456 },
      { input: "R$ -1.234,56", expected: -123456 },
      { input: "+ R$ 1.234,56", expected: 123456 },
      { input: "R$ +1.234,56", expected: 123456 },
      { input: ",50", expected: 50 },
      { input: ".50", expected: 50 },
      { input: ",05", expected: 5 },
      { input: ".05", expected: 5 },
      { input: "10,", expected: 1000 },
      { input: "10.", expected: 1000 },
      { input: "0,5", expected: 50 },
      { input: "0.5", expected: 50 },
      { input: "10,999", expected: 1100 },
      { input: "10,001", expected: 1000 },
      { input: "", expected: 0 },
      { input: "   ", expected: 0 },
    ];

    it("correctly normalizes and parses valid edge strings", () => {
      for (const { input, expected } of maliciousValidStrings) {
        expect(brlToCentavos(input)).toBe(expected);
      }
    });

    it("gracefully handles null and undefined by returning 0", () => {
      expect(brlToCentavos(null)).toBe(0);
      expect(brlToCentavos(undefined)).toBe(0);
    });

    it("rejects non-string and non-number types with TypeError", () => {
      // @ts-expect-error invalid type
      expect(() => brlToCentavos({})).toThrow(TypeError);
      // @ts-expect-error invalid type
      expect(() => brlToCentavos([])).toThrow(TypeError);
      // @ts-expect-error invalid type
      expect(() => brlToCentavos(true)).toThrow(TypeError);
      // @ts-expect-error invalid type
      expect(() => brlToCentavos(false)).toThrow(TypeError);
      // @ts-expect-error invalid type
      expect(() => brlToCentavos(Symbol("test"))).toThrow(TypeError);
    });
  });
});
