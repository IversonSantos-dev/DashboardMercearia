import * as XLSX from "xlsx";
import prisma from "../src/lib/prisma";

const wb = XLSX.readFile("planilha_mercearia.xlsx");

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toCentavos(val: any): number {
  if (
    val === null ||
    val === undefined ||
    val === "" ||
    (typeof val === "string" && (val.includes("#REF") || val.includes("feriado")))
  )
    return 0;
  if (typeof val === "number") return Math.round(val * 100);
  if (typeof val === "string") {
    const cleaned = val
      .replace(/R\$/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(/,/g, ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100);
  }
  return 0;
}

interface DailyRecord {
  data: string;
  valorCartaoCentavos: number;
  valorDinheiroCentavos: number;
  totalDiarioCentavos: number;
  observacoes?: string;
}

async function main() {
  console.log("=== INICIANDO IMPORTAÇÃO DOS DADOS DA PLANILHA DO USUÁRIO ===");

  // 1. Limpar lançamentos e notas fiscais existentes para inserção limpa
  await prisma.historicoBaixa.deleteMany({});
  await prisma.lancamentoDiario.deleteMany({});
  await prisma.notaFiscalMensal.deleteMany({});

  const s1 = wb.Sheets["Planilha1"];
  const r1 = XLSX.utils.sheet_to_json(s1, { header: 1, raw: true }) as any[][];

  const dailyMap = new Map<string, DailyRecord>();

  // Bloco 1: Semanais de Março
  const c1 = toCentavos(r1[1]?.[1]);
  if (c1 > 0) {
    dailyMap.set("2026-03-07", {
      data: "2026-03-07",
      valorCartaoCentavos: c1,
      valorDinheiroCentavos: 0,
      totalDiarioCentavos: c1,
      observacoes: "Fechamento Cartão (01/03 a 07/03/26)",
    });
  }

  const c2 = toCentavos(r1[1]?.[2]);
  if (c2 > 0) {
    dailyMap.set("2026-03-14", {
      data: "2026-03-14",
      valorCartaoCentavos: c2,
      valorDinheiroCentavos: 0,
      totalDiarioCentavos: c2,
      observacoes: "Fechamento Cartão (09/03 a 14/03/26)",
    });
  }

  // Bloco 1: Diários (Cols 3 a 168)
  const dates1 = r1[0] as any[];
  const cartao1 = r1[1] as any[];
  const dinheiro1 = r1[2] as any[];
  const total1 = r1[3] as any[];

  for (let col = 3; col < dates1.length; col++) {
    const dVal = dates1[col];
    if (!dVal) continue;
    let isoDate = "";

    if (typeof dVal === "number") {
      const dateObj = XLSX.SSF.parse_date_code(dVal);
      if (dateObj) {
        isoDate = `${dateObj.y}-${pad2(dateObj.m)}-${pad2(dateObj.d)}`;
      }
    } else if (typeof dVal === "string") {
      const match = dVal.trim().match(/^(\d{1,2})-([A-Za-z]{3})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const mStr = match[2];
        const MONTHS: Record<string, number> = {
          Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
          Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
        };
        const month = MONTHS[mStr];
        if (month) {
          isoDate = `2026-${pad2(month)}-${pad2(day)}`;
        }
      }
    }

    if (!isoDate) continue;

    let cVal = toCentavos(cartao1?.[col]);
    let dMoney = toCentavos(dinheiro1?.[col]);
    const tVal = toCentavos(total1?.[col]);

    // Caso especial verificado: 06/04/2026 continha Total 734.75 mas colunas C/D em branco
    if (cVal === 0 && dMoney === 0 && tVal > 0) {
      dMoney = tVal;
    }

    if (cVal > 0 || dMoney > 0) {
      const existing = dailyMap.get(isoDate);
      if (existing) {
        existing.valorCartaoCentavos += cVal;
        existing.valorDinheiroCentavos += dMoney;
        existing.totalDiarioCentavos = existing.valorCartaoCentavos + existing.valorDinheiroCentavos;
      } else {
        dailyMap.set(isoDate, {
          data: isoDate,
          valorCartaoCentavos: cVal,
          valorDinheiroCentavos: dMoney,
          totalDiarioCentavos: cVal + dMoney,
        });
      }
    }
  }

  // Bloco 2: Diários (Cols 1 a 78)
  const dates2 = r1[7] as any[];
  const cartao2 = r1[8] as any[];
  const dinheiro2 = r1[9] as any[];

  for (let col = 1; col < (dates2 ? dates2.length : 0); col++) {
    const dVal = dates2[col];
    if (!dVal) continue;
    let isoDate = "";

    if (typeof dVal === "number") {
      const dateObj = XLSX.SSF.parse_date_code(dVal);
      if (dateObj) {
        isoDate = `${dateObj.y}-${pad2(dateObj.m)}-${pad2(dateObj.d)}`;
      }
    } else if (typeof dVal === "string") {
      const match = dVal.trim().match(/^(\d{1,2})-([A-Za-z]{3})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const mStr = match[2];
        const MONTHS: Record<string, number> = {
          Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
          Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
        };
        const month = MONTHS[mStr];
        if (month) {
          isoDate = `2026-${pad2(month)}-${pad2(day)}`;
        }
      }
    }

    if (!isoDate) continue;

    const cVal = toCentavos(cartao2?.[col]);
    const dMoney = toCentavos(dinheiro2?.[col]);

    if (cVal > 0 || dMoney > 0) {
      const existing = dailyMap.get(isoDate);
      if (existing) {
        existing.valorCartaoCentavos += cVal;
        existing.valorDinheiroCentavos += dMoney;
        existing.totalDiarioCentavos = existing.valorCartaoCentavos + existing.valorDinheiroCentavos;
      } else {
        dailyMap.set(isoDate, {
          data: isoDate,
          valorCartaoCentavos: cVal,
          valorDinheiroCentavos: dMoney,
          totalDiarioCentavos: cVal + dMoney,
        });
      }
    }
  }

  // Gravar lançamentos diários no banco
  const sortedRecords = Array.from(dailyMap.values()).sort((a, b) => a.data.localeCompare(b.data));

  console.log(`Inserindo ${sortedRecords.length} lançamentos diários de caixa...`);
  for (const r of sortedRecords) {
    await prisma.lancamentoDiario.create({
      data: {
        data: r.data,
        valorCartaoCentavos: r.valorCartaoCentavos,
        valorDinheiroCentavos: r.valorDinheiroCentavos,
        totalDiarioCentavos: r.totalDiarioCentavos,
        observacoes: r.observacoes ?? null,
      },
    });
  }

  // 2. Importar Aba 2: Entradasaida (Notas Fiscais de Entrada)
  console.log("\nImportando valores de Notas Fiscais da aba Entradasaida...");
  const s2 = wb.Sheets["Entradasaida"];
  const r2 = XLSX.utils.sheet_to_json(s2, { header: 1, raw: true }) as any[][];

  const MONTH_COL_MAP: { mesAno: string; entradaCol: number; mesNome: string }[] = [
    { mesAno: "2026-03", entradaCol: 1, mesNome: "Março" },
    { mesAno: "2026-04", entradaCol: 3, mesNome: "Abril" },
    { mesAno: "2026-05", entradaCol: 5, mesNome: "Maio" },
    { mesAno: "2026-07", entradaCol: 9, mesNome: "Julho" },
    { mesAno: "2026-08", entradaCol: 11, mesNome: "Agosto" },
    { mesAno: "2026-09", entradaCol: 13, mesNome: "Setembro" },
    { mesAno: "2026-10", entradaCol: 15, mesNome: "Outubro" },
  ];

  for (const m of MONTH_COL_MAP) {
    const rawVal = r2[1]?.[m.entradaCol];
    const centavos = toCentavos(rawVal);
    if (centavos > 0) {
      await prisma.notaFiscalMensal.upsert({
        where: { mesAno: m.mesAno },
        create: {
          mesAno: m.mesAno,
          valorCentavos: centavos,
          observacoes: `Nota Fiscal de Entrada - Mês de ${m.mesNome}`,
        },
        update: {
          valorCentavos: centavos,
          observacoes: `Nota Fiscal de Entrada - Mês de ${m.mesNome}`,
        },
      });
      console.log(`  ✓ NF ${m.mesAno} (${m.mesNome}): R$ ${(centavos / 100).toFixed(2)}`);
    }
  }

  console.log("\n=== IMPORTAÇÃO FINALIZADA COM SUCESSO! ===");
  const totalLancamentos = await prisma.lancamentoDiario.count();
  const totalNFs = await prisma.notaFiscalMensal.count();
  console.log({ totalLancamentos, totalNFs });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
