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
  if (typeof val === "number") {
    if (!Number.isFinite(val)) {
      throw new RangeError(
        `Valor monetário não pode ser infinito ou NaN. Recebido: ${val}`
      );
    }
    const cents = Math.round(val * 100);
    if (!Number.isSafeInteger(cents)) {
      throw new RangeError(
        `Valor monetário excede o limite seguro de inteiros (MAX_SAFE_INTEGER): ${val}`
      );
    }
    return cents === 0 ? 0 : cents;
  }

  if (typeof val !== "string") {
    throw new TypeError(
      `Valor monetário deve ser do tipo string ou number. Recebido tipo '${typeof val}'`
    );
  }

  let raw = val.trim().replace(/\u00A0/g, " ");
  if (!raw) {
    return 0;
  }

  // Detecção de sinal negativo/positivo e formato contábil "(R$ 10)"
  let isNegative = false;
  if (raw.startsWith("(") && raw.endsWith(")")) {
    isNegative = true;
    raw = raw.slice(1, -1).trim();
    if (raw.includes("+") || raw.includes("-")) {
      throw new TypeError(
        `Formato contábil entre parênteses não pode conter sinais adicionais: '${val}'`
      );
    }
  } else {
    const plusMatches = raw.match(/\+/g);
    const minusMatches = raw.match(/-/g);
    const plusCount = plusMatches ? plusMatches.length : 0;
    const minusCount = minusMatches ? minusMatches.length : 0;

    if (plusCount + minusCount > 1) {
      throw new TypeError(
        `Formato monetário contém múltiplos sinais: '${val}'`
      );
    }

    if (plusCount + minusCount === 1) {
      const isLeadingSign =
        raw.startsWith("+") ||
        raw.startsWith("-") ||
        /^(R\$|\$|BRL)\s*[+-]/i.test(raw);

      if (!isLeadingSign) {
        throw new TypeError(
          `Formato monetário contém sinal em posição inválida: '${val}'`
        );
      }

      if (raw.startsWith("+")) {
        raw = raw.slice(1).trim();
      } else if (raw.startsWith("-")) {
        isNegative = true;
        raw = raw.slice(1).trim();
      } else {
        const match = raw.match(/^(R\$|\$|BRL)\s*([+-])\s*/i);
        if (match) {
          if (match[2] === "-") {
            isNegative = true;
          }
          raw = raw.slice(match[0].length).trim();
        }
      }
    }
  }

  // Remoção de símbolos de moeda comuns (R$, $, BRL)
  raw = raw
    .replace(/^(R\$|\$|BRL)\s*/i, "")
    .replace(/\s*(R\$|\$|BRL)$/i, "")
    .trim();

  if (!raw) {
    throw new TypeError(`Formato monetário inválido: '${val}'`);
  }

  // Remove espaços internos
  raw = raw.replace(/\s+/g, "");

  // Validação estrita de caracteres permitidos: apenas dígitos, ponto e vírgula
  if (!/^[0-9.,]+$/.test(raw)) {
    throw new TypeError(
      `Formato monetário contém caracteres não numéricos inválidos: '${val}'`
    );
  }

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  let integerPart = "";
  let decimalPart = "";

  if (hasComma && hasDot) {
    const firstComma = raw.indexOf(",");
    const lastComma = raw.lastIndexOf(",");
    const firstDot = raw.indexOf(".");
    const lastDot = raw.lastIndexOf(".");

    if (lastComma > lastDot) {
      // Padrão Brasileiro: 1.234.567,89 (pontos são milhar, vírgula única é decimal)
      if (firstComma !== lastComma) {
        throw new TypeError(
          `Formato monetário contém múltiplos separadores decimais (vírgulas): '${val}'`
        );
      }
      const dotChunks = raw.slice(0, lastComma).split(".");
      if (dotChunks.slice(1).some((chunk) => chunk.length !== 3)) {
        throw new TypeError(
          `Separador de milhar brasileiro malformado: '${val}'`
        );
      }
      integerPart = raw.slice(0, lastComma).replace(/\./g, "");
      decimalPart = raw.slice(lastComma + 1);
    } else {
      // Padrão Internacional: 1,234,567.89 (vírgulas são milhar, ponto único é decimal)
      if (firstDot !== lastDot) {
        throw new TypeError(
          `Formato monetário contém múltiplos separadores decimais (pontos): '${val}'`
        );
      }
      const commaChunks = raw.slice(0, lastDot).split(",");
      if (commaChunks.slice(1).some((chunk) => chunk.length !== 3)) {
        throw new TypeError(
          `Separador de milhar internacional malformado: '${val}'`
        );
      }
      integerPart = raw.slice(0, lastDot).replace(/,/g, "");
      decimalPart = raw.slice(lastDot + 1);
    }
  } else if (hasComma) {
    const commaChunks = raw.split(",");
    if (commaChunks.length === 2) {
      // Vírgula única decimal: 1234,56 ou ,50
      integerPart = commaChunks[0];
      decimalPart = commaChunks[1];
    } else {
      // Múltiplas vírgulas: tratadas como separadores de milhar sem decimais
      if (commaChunks.slice(1).some((chunk) => chunk.length !== 3)) {
        throw new TypeError(`Separador de milhar malformado: '${val}'`);
      }
      integerPart = raw.replace(/,/g, "");
      decimalPart = "00";
    }
  } else if (hasDot) {
    const dotChunks = raw.split(".");
    if (dotChunks.length === 2) {
      // Ponto único decimal: 1234.56 ou .50
      integerPart = dotChunks[0];
      decimalPart = dotChunks[1];
    } else {
      // Múltiplos pontos: separadores de milhar sem decimais (1.234.567)
      if (dotChunks.slice(1).some((chunk) => chunk.length !== 3)) {
        throw new TypeError(`Separador de milhar malformado: '${val}'`);
      }
      integerPart = raw.replace(/\./g, "");
      decimalPart = "00";
    }
  } else {
    // Apenas dígitos inteiros: 1234 -> R$ 1.234,00
    integerPart = raw;
    decimalPart = "00";
  }

  if (integerPart === "" && decimalPart === "") {
    throw new TypeError(`Formato monetário vazio ou inválido: '${val}'`);
  }

  if (integerPart === "") {
    integerPart = "0";
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
    throw new TypeError(
      `Falha ao converter valor monetário para inteiro: '${val}'`
    );
  }

  let totalCentavos = intVal * 100 + cents;
  if (isNegative) {
    totalCentavos = -totalCentavos;
  }

  if (!Number.isSafeInteger(totalCentavos)) {
    throw new RangeError(
      `Valor em centavos excede o limite seguro de inteiros (MAX_SAFE_INTEGER): ${totalCentavos}`
    );
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
    throw new TypeError(
      `centavos deve ser um inteiro seguro. Recebido: ${centavos}`
    );
  }

  const isNegative = centavos < 0;
  const abs = Math.abs(centavos);
  const reais = Math.floor(abs / 100);
  const cents = abs % 100;

  // Formatação de milhares com pontos
  const reaisFormatted = reais
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centsFormatted = cents.toString().padStart(2, "0");

  return `${isNegative ? "-R$ " : "R$ "}${reaisFormatted},${centsFormatted}`;
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
    throw new TypeError(
      `centavos deve ser um inteiro seguro. Recebido: ${centavos}`
    );
  }

  const isNegative = centavos < 0;
  const abs = Math.abs(centavos);
  const reais = Math.floor(abs / 100);
  const cents = abs % 100;
  const centsFormatted = cents.toString().padStart(2, "0");

  return `${isNegative ? "-" : ""}${reais},${centsFormatted}`;
}

/**
 * Soma dois valores em centavos com verificação estrita de inteiros e overflow.
 */
export function addMoney(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new TypeError(
      `Parâmetros de addMoney devem ser inteiros seguros. Recebido a=${a}, b=${b}`
    );
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
    throw new TypeError(
      `Parâmetros de subtractMoney devem ser inteiros seguros. Recebido a=${a}, b=${b}`
    );
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
    throw new TypeError(
      `centavos deve ser um inteiro seguro. Recebido: ${centavos}`
    );
  }
  if (typeof qty !== "number" || !Number.isFinite(qty)) {
    throw new TypeError(`qty deve ser um número finito. Recebido: ${qty}`);
  }

  const result = Math.round(centavos * qty);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(
      `Multiplicação monetária excede MAX_SAFE_INTEGER: ${centavos} * ${qty}`
    );
  }

  // Previne -0 do JavaScript
  return result === 0 ? 0 : result;
}
