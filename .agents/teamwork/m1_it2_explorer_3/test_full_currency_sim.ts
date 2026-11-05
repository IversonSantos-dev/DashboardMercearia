// Complete simulated brlToCentavos with improved sign handling

export function brlToCentavos(val: string | number | null | undefined): number {
  if (val === null || val === undefined) {
    return 0;
  }

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

  let isNegative = false;
  if (raw.startsWith("(") && raw.endsWith(")")) {
    isNegative = true;
    raw = raw.slice(1, -1).trim();
  }

  // Validação estrita de sinais (+ e -):
  // 1. Proíbe múltiplos sinais (ex: "++10", "--10", "+-10")
  // 2. Proíbe sinal redundante/conflitante com parênteses contábeis (ex: "( -10 )")
  // 3. Proíbe sinais infixos ou sufixos (ex: "1+0", "1-0", "10+", "10-")
  const minusMatches = raw.match(/-/g);
  const plusMatches = raw.match(/\+/g);
  const minusCount = minusMatches ? minusMatches.length : 0;
  const plusCount = plusMatches ? plusMatches.length : 0;

  if (minusCount + plusCount > 1) {
    throw new TypeError(
      `Formato monetário contém múltiplos sinais (+/-): '${val}'`
    );
  }

  if (isNegative && (minusCount > 0 || plusCount > 0)) {
    throw new TypeError(
      `Formato monetário contém sinal conflitante com parênteses: '${val}'`
    );
  }

  if (minusCount === 1 || plusCount === 1) {
    // Sinal deve estar no início da string ou imediatamente após o símbolo da moeda
    const isPrefix =
      /^[-+]\s*(R\$|\$|BRL)?/i.test(raw) ||
      /^(R\$|\$|BRL)\s*[-+]/i.test(raw);
    if (!isPrefix) {
      throw new TypeError(
        `Formato monetário contém sinal (+/-) em posição inválida: '${val}'`
      );
    }
    if (minusCount === 1) {
      isNegative = true;
    }
    raw = raw.replace(/[-+]/, "").trim();
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

  let cents = 0;
  if (decimalPart.length === 0) {
    cents = 0;
  } else if (decimalPart.length === 1) {
    cents = parseInt(decimalPart, 10) * 10;
  } else if (decimalPart.length === 2) {
    cents = parseInt(decimalPart, 10);
  } else {
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

const testsToReject = [
  '++10', '--10', '+-10', '-+10', '+ + 10', '- - 10',
  '1+0', '1-0', '10+20', '10-20', '10+', '10-',
  'R$ +', 'R$ -', '+', '-', '-(10)', '(+10)', '(-10)',
  '12.34.56', 'abc', 'DROP TABLE lancamentos_diarios;', '<script>alert(1)</script>'
];

console.log('Testing rejection of all invalid inputs:');
let rejectedCount = 0;
for (const t of testsToReject) {
  try {
    brlToCentavos(t);
    console.error('FAILED TO REJECT:', t);
  } catch (e: any) {
    rejectedCount++;
  }
}
console.log(`Rejected ${rejectedCount}/${testsToReject.length} inputs.`);

const testsToAccept = [
  { input: "R$ 1.234,56", expected: 123456 },
  { input: "+ R$ 1.234,56", expected: 123456 },
  { input: "R$ +1.234,56", expected: 123456 },
  { input: "- R$ 1.234,56", expected: -123456 },
  { input: "R$ -1.234,56", expected: -123456 },
  { input: "(R$ 1.234,56)", expected: -123456 },
  { input: "+10", expected: 1000 },
  { input: "-10", expected: -1000 },
  { input: "-0,05", expected: -5 },
  { input: "-R$ 0,00", expected: 0 },
  { input: "(0,00)", expected: 0 },
  { input: ",50", expected: 50 },
  { input: ".50", expected: 50 },
  { input: "10,", expected: 1000 },
  { input: "10.", expected: 1000 },
  { input: "", expected: 0 },
  { input: "   ", expected: 0 },
  { input: null, expected: 0 },
  { input: undefined, expected: 0 },
];

console.log('Testing valid inputs:');
let acceptedCount = 0;
for (const { input, expected } of testsToAccept) {
  const res = brlToCentavos(input);
  if (res !== expected) {
    console.error(`MISMATCH for ${input}: got ${res}, expected ${expected}`);
  } else {
    acceptedCount++;
  }
}
console.log(`Accepted ${acceptedCount}/${testsToAccept.length} inputs correctly.`);
