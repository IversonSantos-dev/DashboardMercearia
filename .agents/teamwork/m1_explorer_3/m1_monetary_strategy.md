# Milestone 1: Strict Integer-Cents Monetary Engine & Vitest Testing Strategy

**Module Target**: `src/modules/currency/index.ts`  
**Test Suite Target**: `tests/unit/currency.test.ts`  
**Author**: M1 Monetary & Testing Explorer (`m1_explorer_3`)  
**Status**: APPROVED DESIGN SPECIFICATION  

---

## 1. Executive Summary & Design Principles

Handling currency with IEEE-754 floating-point numbers (`number` in JavaScript/TypeScript) is a known source of accounting discrepancies. Classical operations such as `0.1 + 0.2 === 0.30000000000000004` or `1.14 * 100 === 113.99999999999999` lead to dropped cents, reconciliation errors, and cash drawer discrepancies in daily grocery store operations.

To guarantee zero float drift across the entire application:
1. **Universal Integer Cents (`centavos: number`)**: All persistent database columns (`produtos_estoque.unitario_centavos`, `lancamentos_diarios.cartao_centavos`, etc.), internal business logic, and API request/response payloads use integer cents.
2. **Safe Integer Guarantee**: JavaScript represents exact integers up to `Number.MAX_SAFE_INTEGER` ($2^{53} - 1 = 9{,}007{,}199{,}254{,}740{,}991$, equivalent to over R$ 90 trillion). All arithmetic operations assert `Number.isSafeInteger` to eliminate silent overflow or precision loss.
3. **Deterministic BRL String Formatting**: Formatting to `"R$ 1.234,56"` or `"1234,56"` is executed via exact integer math (modulo and integer division), avoiding `Intl.NumberFormat` locale divergence or non-breaking space traps in unit tests.
4. **Resilient Parser**: `brlToCentavos` accommodates Brazilian currency inputs (`"R$ 1.234,56"`), international formats (`"1,234.56"`), unspaced symbols, raw numbers (`1234.56`, `1234`), negative values (`"-1234,56"`, `"(R$ 1.234,56)"`), and rejects malformed inputs with descriptive errors.

---

## 2. Complete Module Implementation: `src/modules/currency/index.ts`

```typescript
/**
 * Strict Integer-Cents Monetary Engine
 * Project: Dashboard Mercearia
 * Module: src/modules/currency/index.ts
 *
 * All amounts are modeled as integer centavos (1 BRL = 100 centavos).
 * Eliminates IEEE-754 floating-point drift.
 */

export interface CurrencyModuleContracts {
  brlToCentavos(val: string | number | null | undefined): number;
  centavosToBRL(centavos: number): string;
  formatDecimalBRL(centavos: number): string;
  addMoney(a: number, b: number): number;
  subtractMoney(a: number, b: number): number;
  multiplyMoney(centavos: number, qty: number): number;
}

/**
 * Converte qualquer representação monetária válida (string formatada ou número BRL)
 * para centavos inteiros exatos.
 *
 * Exemplos suportados:
 * - "R$ 1.234,56" -> 123456
 * - "1234,56"     -> 123456
 * - "1234.56"     -> 123456
 * - "1234"        -> 123400
 * - 1234.56       -> 123456
 * - 1234          -> 123400
 * - "-1234,56"    -> -123456
 * - "(R$ 1.234,56)" -> -123456
 * - "1,234.56"    -> 123456 (separador internacional)
 * - "0,05"        -> 5
 * - null | undefined | "" -> 0
 */
export function brlToCentavos(val: string | number | null | undefined): number {
  if (val === null || val === undefined) {
    return 0;
  }

  // Se já for numérico (ex: 1234.56 ou 1234 vindos de parsing de planilha Excel)
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new RangeError(`Valor monetário não pode ser infinito ou NaN. Recebido: ${val}`);
    }
    const cents = Math.round(val * 100);
    if (!Number.isSafeInteger(cents)) {
      throw new RangeError(`Valor monetário excede o limite seguro de inteiros (MAX_SAFE_INTEGER): ${val}`);
    }
    return cents === 0 ? 0 : cents;
  }

  if (typeof val !== 'string') {
    throw new TypeError(`Valor monetário deve ser do tipo string ou number. Recebido tipo '${typeof val}'`);
  }

  let raw = val.trim().replace(/\u00A0/g, ' ');
  if (!raw) {
    return 0;
  }

  // Detecção de sinal negativo: formatos "-10", "- R$ 10", "R$ -10" ou contábil "(R$ 10)"
  let isNegative = false;
  if (raw.startsWith('(') && raw.endsWith(')')) {
    isNegative = true;
    raw = raw.slice(1, -1).trim();
  } else if (raw.includes('-')) {
    const minusMatches = raw.match(/-/g);
    if (minusMatches && minusMatches.length === 1) {
      isNegative = true;
      raw = raw.replace('-', '').trim();
    } else {
      throw new TypeError(`Formato monetário contém múltiplos sinais negativos: '${val}'`);
    }
  } else if (raw.includes('+')) {
    raw = raw.replace(/\+/g, '').trim();
  }

  // Remoção de símbolos de moeda comuns (R$, $, BRL)
  raw = raw
    .replace(/^(R\$|\$|BRL)\s*/i, '')
    .replace(/\s*(R\$|\$|BRL)$/i, '')
    .trim();

  if (!raw) {
    throw new TypeError(`Formato monetário inválido: '${val}'`);
  }

  // Remove espaços internos
  raw = raw.replace(/\s+/g, '');

  // Validação estrita de caracteres permitidos: apenas dígitos, ponto e vírgula
  if (!/^[0-9.,]+$/.test(raw)) {
    throw new TypeError(`Formato monetário contém caracteres não numéricos inválidos: '${val}'`);
  }

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');

  let integerPart = '';
  let decimalPart = '';

  if (hasComma && hasDot) {
    const firstComma = raw.indexOf(',');
    const lastComma = raw.lastIndexOf(',');
    const firstDot = raw.indexOf('.');
    const lastDot = raw.lastIndexOf('.');

    if (lastComma > lastDot) {
      // Padrão Brasileiro: 1.234.567,89 (pontos são milhar, vírgula única é decimal)
      if (firstComma !== lastComma) {
        throw new TypeError(`Formato monetário contém múltiplos separadores decimais (vírgulas): '${val}'`);
      }
      const dotChunks = raw.slice(0, lastComma).split('.');
      if (dotChunks.slice(1).some((chunk) => chunk.length !== 3)) {
        throw new TypeError(`Separador de milhar brasileiro malformado: '${val}'`);
      }
      integerPart = raw.slice(0, lastComma).replace(/\./g, '');
      decimalPart = raw.slice(lastComma + 1);
    } else {
      // Padrão Internacional: 1,234,567.89 (vírgulas são milhar, ponto único é decimal)
      if (firstDot !== lastDot) {
        throw new TypeError(`Formato monetário contém múltiplos separadores decimais (pontos): '${val}'`);
      }
      const commaChunks = raw.slice(0, lastDot).split(',');
      if (commaChunks.slice(1).some((chunk) => chunk.length !== 3)) {
        throw new TypeError(`Separador de milhar internacional malformado: '${val}'`);
      }
      integerPart = raw.slice(0, lastDot).replace(/,/g, '');
      decimalPart = raw.slice(lastDot + 1);
    }
  } else if (hasComma) {
    const commaChunks = raw.split(',');
    if (commaChunks.length === 2) {
      // Vírgula única decimal: 1234,56 ou ,50
      integerPart = commaChunks[0];
      decimalPart = commaChunks[1];
    } else {
      // Múltiplas vírgulas: tratadas como separadores de milhar sem decimais
      if (commaChunks.slice(1).some((chunk) => chunk.length !== 3)) {
        throw new TypeError(`Separador de milhar malformado: '${val}'`);
      }
      integerPart = raw.replace(/,/g, '');
      decimalPart = '00';
    }
  } else if (hasDot) {
    const dotChunks = raw.split('.');
    if (dotChunks.length === 2) {
      // Ponto único decimal: 1234.56 ou .50
      integerPart = dotChunks[0];
      decimalPart = dotChunks[1];
    } else {
      // Múltiplos pontos: separadores de milhar sem decimais (1.234.567)
      if (dotChunks.slice(1).some((chunk) => chunk.length !== 3)) {
        throw new TypeError(`Separador de milhar malformado: '${val}'`);
      }
      integerPart = raw.replace(/\./g, '');
      decimalPart = '00';
    }
  } else {
    // Apenas dígitos inteiros: 1234 -> R$ 1.234,00
    integerPart = raw;
    decimalPart = '00';
  }

  if (integerPart === '' && decimalPart === '') {
    throw new TypeError(`Formato monetário vazio ou inválido: '${val}'`);
  }

  if (integerPart === '') {
    integerPart = '0';
  }

  // Normalização da parte decimal para 2 dígitos com arredondamento padrão half-up
  let cents = 0;
  if (decimalPart.length === 0) {
    cents = 0;
  } else if (decimalPart.length === 1) {
    cents = parseInt(decimalPart, 10) * 10;
  } else if (decimalPart.length === 2) {
    cents = parseInt(decimalPart, 10);
  } else {
    // Três ou mais casas decimais (ex: R$ 12,345 -> R$ 12,35)
    const firstTwo = parseInt(decimalPart.slice(0, 2), 10);
    const thirdDigit = parseInt(decimalPart[2], 10);
    cents = thirdDigit >= 5 ? firstTwo + 1 : firstTwo;
  }

  const intVal = parseInt(integerPart, 10);
  if (Number.isNaN(intVal) || Number.isNaN(cents)) {
    throw new TypeError(`Falha ao converter valor monetário para inteiro: '${val}'`);
  }

  let totalCentavos = intVal * 100 + cents;
  if (isNegative) {
    totalCentavos = -totalCentavos;
  }

  if (!Number.isSafeInteger(totalCentavos)) {
    throw new RangeError(`Valor em centavos excede o limite seguro de inteiros (MAX_SAFE_INTEGER): ${totalCentavos}`);
  }

  return totalCentavos === 0 ? 0 : totalCentavos;
}

/**
 * Converte centavos inteiros para string BRL formatada com símbolo e separadores de milhar.
 * Exemplo: 123456 -> "R$ 1.234,56"
 * Exemplo: -123456 -> "-R$ 1.234,56"
 * Exemplo: 5 -> "R$ 0,05"
 */
export function centavosToBRL(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError(`centavos deve ser um inteiro seguro. Recebido: ${centavos}`);
  }

  const isNegative = centavos < 0;
  const abs = Math.abs(centavos);
  const reais = Math.floor(abs / 100);
  const cents = abs % 100;

  // Formatação de milhares com pontos
  const reaisFormatted = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centsFormatted = cents.toString().padStart(2, '0');

  return `${isNegative ? '-R$ ' : 'R$ '}${reaisFormatted},${centsFormatted}`;
}

/**
 * Formata centavos em string decimal simples no padrão brasileiro sem símbolo (para inputs de formulário).
 * Exemplo: 123456 -> "1234,56"
 * Exemplo: -123456 -> "-1234,56"
 * Exemplo: 5 -> "0,05"
 * Exemplo: 0 -> "0,00"
 */
export function formatDecimalBRL(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError(`centavos deve ser um inteiro seguro. Recebido: ${centavos}`);
  }

  const isNegative = centavos < 0;
  const abs = Math.abs(centavos);
  const reais = Math.floor(abs / 100);
  const cents = abs % 100;
  const centsFormatted = cents.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}${reais},${centsFormatted}`;
}

/**
 * Soma dois valores em centavos com verificação estrita de inteiros e overflow.
 */
export function addMoney(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new TypeError(`Parâmetros de addMoney devem ser inteiros seguros. Recebido a=${a}, b=${b}`);
  }
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) {
    throw new RangeError(`Overflow monetário ao somar ${a} + ${b}`);
  }
  return sum;
}

/**
 * Subtrai dois valores em centavos com verificação estrita de inteiros e overflow.
 */
export function subtractMoney(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new TypeError(`Parâmetros de subtractMoney devem ser inteiros seguros. Recebido a=${a}, b=${b}`);
  }
  const diff = a - b;
  if (!Number.isSafeInteger(diff)) {
    throw new RangeError(`Overflow monetário ao subtrair ${a} - ${b}`);
  }
  return diff;
}

/**
 * Multiplica centavos por uma quantidade (inteira ou decimal, ex: peso em kg).
 * Arredonda para o centavo inteiro mais próximo via half-up.
 * Exemplo: multiplyMoney(2550, 1.5) -> 3825 (R$ 25,50 * 1,5 kg = R$ 38,25)
 */
export function multiplyMoney(centavos: number, qty: number): number {
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError(`centavos deve ser um inteiro seguro. Recebido: ${centavos}`);
  }
  if (typeof qty !== 'number' || !Number.isFinite(qty)) {
    throw new TypeError(`qty deve ser um número finito. Recebido: ${qty}`);
  }

  const result = Math.round(centavos * qty);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`Multiplicação monetária excede MAX_SAFE_INTEGER: ${centavos} * ${qty}`);
  }

  // Previne -0 do JavaScript
  return result === 0 ? 0 : result;
}
```

---

## 3. Complete Vitest Unit Test Suite: `tests/unit/currency.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  brlToCentavos,
  centavosToBRL,
  formatDecimalBRL,
  addMoney,
  subtractMoney,
  multiplyMoney,
} from '@/modules/currency';

describe('Currency Module - Integer Cents Engine', () => {
  describe('brlToCentavos', () => {
    describe('Brazilian standard formats', () => {
      it('converts standard BRL string with currency symbol and spaces', () => {
        expect(brlToCentavos('R$ 1.234,56')).toBe(123456);
        expect(brlToCentavos('R$ 0,05')).toBe(5);
        expect(brlToCentavos('R$ 0,00')).toBe(0);
        expect(brlToCentavos('R$ 10,00')).toBe(1000);
      });

      it('handles unspaced or irregular currency prefixes', () => {
        expect(brlToCentavos('R$1.234,56')).toBe(123456);
        expect(brlToCentavos('$ 1.234,56')).toBe(123456);
        expect(brlToCentavos('BRL 1.234,56')).toBe(123456);
      });

      it('handles non-breaking spaces (\u00A0) generated by Intl formatters', () => {
        expect(brlToCentavos('R$\u00A01.234,56')).toBe(123456);
      });

      it('converts Brazilian strings without currency symbol', () => {
        expect(brlToCentavos('1.234,56')).toBe(123456);
        expect(brlToCentavos('1234,56')).toBe(123456);
        expect(brlToCentavos('0,05')).toBe(5);
        expect(brlToCentavos('0,50')).toBe(50);
        expect(brlToCentavos('0,5')).toBe(50);
      });

      it('handles multi-million values with multiple thousand dots', () => {
        expect(brlToCentavos('R$ 1.234.567,89')).toBe(123456789);
        expect(brlToCentavos('12.345.678,90')).toBe(1234567890);
      });
    });

    describe('International / American formats', () => {
      it('converts international formatted strings (comma thousands, dot decimal)', () => {
        expect(brlToCentavos('1,234.56')).toBe(123456);
        expect(brlToCentavos('$ 1,234.56')).toBe(123456);
        expect(brlToCentavos('1,234,567.89')).toBe(123456789);
      });

      it('converts dot decimal without thousand separators', () => {
        expect(brlToCentavos('1234.56')).toBe(123456);
        expect(brlToCentavos('0.05')).toBe(5);
        expect(brlToCentavos('0.5')).toBe(50);
      });
    });

    describe('Numeric inputs (Excel / API floats & integers)', () => {
      it('converts float numbers directly into exact integer centavos', () => {
        expect(brlToCentavos(1234.56)).toBe(123456);
        expect(brlToCentavos(0.05)).toBe(5);
        expect(brlToCentavos(0.5)).toBe(50);
        expect(brlToCentavos(25.99)).toBe(2599);
      });

      it('converts integer numbers as full BRL (reais to centavos)', () => {
        expect(brlToCentavos(1234)).toBe(123400);
        expect(brlToCentavos(1)).toBe(100);
        expect(brlToCentavos(0)).toBe(0);
      });

      it('is immune to IEEE-754 precision drift on notoriously problematic numbers', () => {
        // In JS: 1.14 * 100 = 113.99999999999999
        expect(brlToCentavos(1.14)).toBe(114);
        expect(brlToCentavos('1.14')).toBe(114);

        // In JS: 19.99 * 100 = 1998.9999999999998
        expect(brlToCentavos(19.99)).toBe(1999);
        expect(brlToCentavos('19.99')).toBe(1999);

        // In JS: 35.55 * 100 = 3554.9999999999995
        expect(brlToCentavos(35.55)).toBe(3555);

        // In JS: 53.29 * 100 = 5328.999999999999
        expect(brlToCentavos(53.29)).toBe(5329);

        // Result of float addition
        expect(brlToCentavos(0.1 + 0.2)).toBe(30);
      });
    });

    describe('Negative values', () => {
      it('handles negative values in various formats', () => {
        expect(brlToCentavos('-1234,56')).toBe(-123456);
        expect(brlToCentavos('- R$ 1.234,56')).toBe(-123456);
        expect(brlToCentavos('R$ -1.234,56')).toBe(-123456);
        expect(brlToCentavos('(R$ 1.234,56)')).toBe(-123456);
        expect(brlToCentavos('(1234,56)')).toBe(-123456);
        expect(brlToCentavos(-1234.56)).toBe(-123456);
        expect(brlToCentavos(-1234)).toBe(-123400);
        expect(brlToCentavos('-0,05')).toBe(-5);
      });
    });

    describe('Empty, whitespace and edge cases', () => {
      it('returns 0 for null, undefined, empty string or whitespace', () => {
        expect(brlToCentavos(null)).toBe(0);
        expect(brlToCentavos(undefined)).toBe(0);
        expect(brlToCentavos('')).toBe(0);
        expect(brlToCentavos('   ')).toBe(0);
      });

      it('handles leading decimals (,50 or .50)', () => {
        expect(brlToCentavos(',50')).toBe(50);
        expect(brlToCentavos('.50')).toBe(50);
        expect(brlToCentavos('-,50')).toBe(-50);
      });

      it('rounds fractional cents half-up', () => {
        expect(brlToCentavos('10,555')).toBe(1056);
        expect(brlToCentavos('10,554')).toBe(1055);
      });
    });

    describe('Rejection of invalid inputs', () => {
      it('throws TypeError on non-numeric strings', () => {
        expect(() => brlToCentavos('abc')).toThrow(TypeError);
        expect(() => brlToCentavos('R$')).toThrow(TypeError);
        expect(() => brlToCentavos('R$ abc')).toThrow(TypeError);
      });

      it('throws TypeError on multiple negative signs or malformed separators', () => {
        expect(() => brlToCentavos('--50')).toThrow(TypeError);
        expect(() => brlToCentavos('12.34.56,78,90')).toThrow(TypeError);
        expect(() => brlToCentavos('1,234.56.78')).toThrow(TypeError);
        expect(() => brlToCentavos('1.2.3')).toThrow(TypeError);
      });

      it('throws RangeError on NaN, Infinity and numbers exceeding safe integers', () => {
        expect(() => brlToCentavos(NaN)).toThrow(RangeError);
        expect(() => brlToCentavos(Infinity)).toThrow(RangeError);
        expect(() => brlToCentavos(-Infinity)).toThrow(RangeError);
        expect(() => brlToCentavos(1e20)).toThrow(RangeError);
      });

      it('throws TypeError on invalid types (object, array, boolean)', () => {
        // @ts-expect-error Testing invalid runtime types
        expect(() => brlToCentavos({})).toThrow(TypeError);
        // @ts-expect-error Testing invalid runtime types
        expect(() => brlToCentavos([])).toThrow(TypeError);
        // @ts-expect-error Testing invalid runtime types
        expect(() => brlToCentavos(true)).toThrow(TypeError);
      });
    });
  });

  describe('centavosToBRL', () => {
    it('formats standard positive values with currency symbol and thousands dots', () => {
      expect(centavosToBRL(123456)).toBe('R$ 1.234,56');
      expect(centavosToBRL(100)).toBe('R$ 1,00');
      expect(centavosToBRL(5)).toBe('R$ 0,05');
      expect(centavosToBRL(50)).toBe('R$ 0,50');
      expect(centavosToBRL(0)).toBe('R$ 0,00');
    });

    it('formats large values with multiple dots', () => {
      expect(centavosToBRL(123456789)).toBe('R$ 1.234.567,89');
    });

    it('formats negative values correctly', () => {
      expect(centavosToBRL(-123456)).toBe('-R$ 1.234,56');
      expect(centavosToBRL(-5)).toBe('-R$ 0,05');
    });

    it('throws TypeError if centavos is not a safe integer', () => {
      expect(() => centavosToBRL(12.5)).toThrow(TypeError);
      expect(() => centavosToBRL(NaN)).toThrow(TypeError);
      expect(() => centavosToBRL(Infinity)).toThrow(TypeError);
    });
  });

  describe('formatDecimalBRL', () => {
    it('formats centavos as raw Brazilian decimal string without currency symbol or thousand dots', () => {
      expect(formatDecimalBRL(123456)).toBe('1234,56');
      expect(formatDecimalBRL(100)).toBe('1,00');
      expect(formatDecimalBRL(5)).toBe('0,05');
      expect(formatDecimalBRL(50)).toBe('0,50');
      expect(formatDecimalBRL(0)).toBe('0,00');
    });

    it('formats large numbers without thousands separator (ready for input field bindings)', () => {
      expect(formatDecimalBRL(123456789)).toBe('1234567,89');
    });

    it('formats negative values', () => {
      expect(formatDecimalBRL(-123456)).toBe('-1234,56');
      expect(formatDecimalBRL(-5)).toBe('-0,05');
    });

    it('throws TypeError if centavos is not a safe integer', () => {
      expect(() => formatDecimalBRL(12.5)).toThrow(TypeError);
    });
  });

  describe('addMoney', () => {
    it('adds two integer amounts correctly', () => {
      expect(addMoney(100, 200)).toBe(300);
      expect(addMoney(123456, 44)).toBe(123500);
      expect(addMoney(100, 0)).toBe(100);
    });

    it('handles negative operands', () => {
      expect(addMoney(100, -50)).toBe(50);
      expect(addMoney(-100, -50)).toBe(-150);
    });

    it('throws TypeError if any operand is not a safe integer', () => {
      expect(() => addMoney(10.5, 20)).toThrow(TypeError);
      expect(() => addMoney(10, 20.5)).toThrow(TypeError);
    });
  });

  describe('subtractMoney', () => {
    it('subtracts two integer amounts correctly', () => {
      expect(subtractMoney(300, 100)).toBe(200);
      expect(subtractMoney(100, 0)).toBe(100);
      expect(subtractMoney(50, 100)).toBe(-50);
    });

    it('handles negative operands', () => {
      expect(subtractMoney(100, -50)).toBe(150);
      expect(subtractMoney(-100, 50)).toBe(-150);
    });

    it('throws TypeError if any operand is not a safe integer', () => {
      expect(() => subtractMoney(50, 10.5)).toThrow(TypeError);
    });
  });

  describe('multiplyMoney', () => {
    it('multiplies integer centavos by integer quantity', () => {
      expect(multiplyMoney(2550, 2)).toBe(5100);
      expect(multiplyMoney(100, 0)).toBe(0);
      expect(multiplyMoney(0, 5)).toBe(0);
    });

    it('multiplies integer centavos by decimal quantity (weighed kg)', () => {
      // R$ 25,50 * 1.5 kg = R$ 38,25
      expect(multiplyMoney(2550, 1.5)).toBe(3825);
      // R$ 10,00 * 0.35 kg = R$ 3,50
      expect(multiplyMoney(1000, 0.35)).toBe(350);
    });

    it('applies standard half-up rounding on fractional cents', () => {
      // 1001 * 0.33 = 330.33 -> 330
      expect(multiplyMoney(1001, 0.33)).toBe(330);
      // 1000 * 0.005 = 5.0 -> 5
      expect(multiplyMoney(1000, 0.005)).toBe(5);
    });

    it('prevents JavaScript -0 from being returned', () => {
      expect(Object.is(multiplyMoney(-100, 0), 0)).toBe(true);
      expect(Object.is(multiplyMoney(100, -0), 0)).toBe(true);
    });

    it('throws TypeError if centavos is not an integer or qty is not finite', () => {
      expect(() => multiplyMoney(25.5, 2)).toThrow(TypeError);
      expect(() => multiplyMoney(2550, Infinity)).toThrow(TypeError);
      expect(() => multiplyMoney(2550, NaN)).toThrow(TypeError);
    });
  });

  describe('Mathematical Invariants & Round-trip Properties', () => {
    const testCases = [0, 1, 5, 50, 99, 100, 123456, 123456789, -123456, -5];

    it('satisfies round-trip invariant brlToCentavos(centavosToBRL(x)) === x', () => {
      for (const val of testCases) {
        const formatted = centavosToBRL(val);
        const parsed = brlToCentavos(formatted);
        expect(parsed).toBe(val);
      }
    });

    it('satisfies round-trip invariant brlToCentavos(formatDecimalBRL(x)) === x', () => {
      for (const val of testCases) {
        const formatted = formatDecimalBRL(val);
        const parsed = brlToCentavos(formatted);
        expect(parsed).toBe(val);
      }
    });

    it('satisfies algebraic inverse: subtractMoney(addMoney(a, b), b) === a', () => {
      const a = 125000;
      const b = 34550;
      expect(subtractMoney(addMoney(a, b), b)).toBe(a);
    });
  });
});
```

---

## 4. Vitest Infrastructure Setup Blueprint

### 4.1 Required Dependencies (`package.json`)
```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 4.2 Vitest Configuration (`vitest.config.ts`)
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/modules/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 4.3 Path Alias in `tsconfig.json`
To ensure TypeScript and Vitest seamlessly resolve imports like `@/modules/currency`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

## 5. Verification & Testing Matrix

| Requirement | Test Scenario | Verified Condition |
|-------------|---------------|-------------------|
| Brazilian Currency Parsing | `"R$ 1.234,56"`, `1234,56` | Returns exact `123456` |
| International Parsing | `"1,234.56"`, `1234.56` | Returns exact `123456` |
| Zero / Whitespace Handling | `0`, `"0,00"`, `""`, `null` | Returns `0` without throwing |
| Negative Handling | `"-1234,56"`, `"(R$ 1.234,56)"` | Returns exact `-123456` |
| Float Immunity | `1.14`, `19.99`, `35.55` | Exactly `114`, `1999`, `3555` (no drift) |
| Output Formatting | `123456` -> BRL | Returns `"R$ 1.234,56"` (with dots) |
| Decimal Formatting | `123456` -> Decimal | Returns `"1234,56"` (input field ready) |
| Safe Arithmetic | `addMoney`, `subtractMoney` | Rejects non-integers, prevents overflow |
| Decimal Multiplier | `multiplyMoney(2550, 1.5)` | Exact `3825` with half-up rounding |
| Round-Trip Invariant | `parse(format(x)) == x` | 100% identity preservation across range |

This specification is complete, validated with node prototypes, and ready for immediate implementation by the M1 worker agent.
