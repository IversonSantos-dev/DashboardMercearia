const validCases = [
  'R$ 1.234,56', 'R$1.234,56', '$ 1.234,56', 'BRL 1.234,56', '1.234,56', '1234,56',
  '+ R$ 1.234,56', 'R$ +1.234,56', '+10', '+ 10', '+,50',
  '-1234,56', '- R$ 1.234,56', 'R$ -1.234,56', '(R$ 1.234,56)', '(1234,56)',
  '-0,05', '-,50', '-R$ 0,00', '(0,00)'
];

const invalidCases = [
  '++10', '--10', '+-10', '-+10', '+ + 10', '- - 10',
  '1+0', '1-0', '10+20', '10-20', '10+', '10-',
  'R$ +', 'R$ -', '+', '-', '-(10)', '(+10)', '(-10)',
  '12.34.56', 'abc', 'DROP TABLE lancamentos_diarios;'
];

function checkSign(val: string) {
  let raw = val.trim().replace(/\u00A0/g, ' ');
  let isNeg = false;
  if (raw.startsWith('(') && raw.endsWith(')')) {
    isNeg = true;
    raw = raw.slice(1, -1).trim();
  }
  const minCount = (raw.match(/-/g) || []).length;
  const plusCount = (raw.match(/\+/g) || []).length;
  if (minCount + plusCount > 1) {
    throw new TypeError(`Múltiplos sinais detectados: '${val}'`);
  }
  if (isNeg && (minCount > 0 || plusCount > 0)) {
    throw new TypeError(`Sinal conflitante com parênteses: '${val}'`);
  }

  if (minCount === 1 || plusCount === 1) {
    const isPrefix = /^[-+]\s*(R\$|\$|BRL)?/i.test(raw) || /^(R\$|\$|BRL)\s*[-+]/i.test(raw);
    if (!isPrefix) {
      throw new TypeError(`Sinal em posição inválida: '${val}'`);
    }
    if (minCount === 1) isNeg = true;
    raw = raw.replace(/[-+]/, '').trim();
  }

  raw = raw.replace(/^(R\$|\$|BRL)\s*/i, '').replace(/\s*(R\$|\$|BRL)$/i, '').trim();
  if (!raw) {
    throw new TypeError(`Formato monetário vazio: '${val}'`);
  }
  return { raw, isNeg };
}

console.log('Testing valid:');
let validPass = 0;
for (const v of validCases) {
  try {
    const res = checkSign(v);
    validPass++;
  } catch (e: any) {
    console.error('FAIL valid:', v, e.message);
  }
}
console.log(`Valid: ${validPass}/${validCases.length} passed.`);

console.log('Testing invalid:');
let invalidPass = 0;
for (const inv of invalidCases) {
  try {
    const res = checkSign(inv);
    // If it's something like abc, checkSign might produce 'abc', which line 101 checks.
    // But for signs, checkSign MUST throw!
    if (['++10', '--10', '+-10', '-+10', '+ + 10', '- - 10', '1+0', '1-0', '10+20', '10-20', '10+', '10-', 'R$ +', 'R$ -', '+', '-', '-(10)', '(+10)', '(-10)'].includes(inv)) {
      console.error('FAILED TO REJECT invalid sign case:', inv, res);
    } else {
      invalidPass++;
    }
  } catch (e) {
    invalidPass++;
  }
}
console.log(`Invalid: ${invalidPass}/${invalidCases.length} correctly rejected or forwarded.`);
