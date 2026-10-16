import assert from 'node:assert';

// 1. Simulação das funções do serviço
function getTempoCRM(createdAt, baseDate = new Date(2026, 9, 16, 15, 0)) {
  if (!createdAt) return { dataHoraFormatada: 'Data não informada', tempoRelativo: '' };
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return { dataHoraFormatada: 'Data inválida', tempoRelativo: '' };

  const pad = (n) => String(n).padStart(2, '0');
  const dia = pad(d.getDate());
  const mes = pad(d.getMonth() + 1);
  const ano = d.getFullYear();
  const hora = pad(d.getHours());
  const min = pad(d.getMinutes());

  const diffMs = baseDate.getTime() - d.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const diffMonths = Math.floor(diffDays / 30.4375);
  const diffYears = Math.floor(diffMonths / 12);
  const remMonths = diffMonths % 12;

  let tempoRelativo = '';
  if (diffYears >= 1) {
    if (remMonths > 0) {
      tempoRelativo = `(${diffYears} ${diffYears === 1 ? 'ano' : 'anos'} e ${remMonths} ${remMonths === 1 ? 'mês' : 'meses'})`;
    } else {
      tempoRelativo = `(${diffYears} ${diffYears === 1 ? 'ano' : 'anos'})`;
    }
  } else if (diffMonths >= 1) {
    tempoRelativo = `(${diffMonths} ${diffMonths === 1 ? 'mês' : 'meses'})`;
  } else {
    tempoRelativo = '(menos de 1 mês)';
  }

  return {
    dataHoraFormatada: `${dia}/${mes}/${ano} às ${hora}:${min}`,
    tempoRelativo,
    textoCompleto: `${dia}/${mes}/${ano} às ${hora}:${min} ${tempoRelativo}`
  };
}

function calcularDesempenho(realizadoCredito, realizadoCotas, metaCredito, metaCotas, foco = 'ambos') {
  const mCred = Number(metaCredito) || 500000;
  const mCot = Number(metaCotas) || 5;
  const rCred = Number(realizadoCredito) || 0;
  const rCot = Number(realizadoCotas) || 0;

  let bateu = false;
  let pctCredito = mCred > 0 ? (rCred / mCred) * 100 : 0;
  let pctCotas = mCot > 0 ? (rCot / mCot) * 100 : 0;

  if (foco === 'credito') {
    bateu = rCred >= mCred;
  } else if (foco === 'cotas') {
    bateu = rCot >= mCot;
  } else {
    bateu = rCred >= mCred && rCot >= mCot;
  }

  const extraCredito = Math.max(0, pctCredito - 100);
  const faltouCredito = Math.max(0, 100 - pctCredito);
  const extraCotas = Math.max(0, pctCotas - 100);
  const faltouCotas = Math.max(0, 100 - pctCotas);

  return {
    bateu,
    pctCredito: Math.round(pctCredito),
    pctCotas: Math.round(pctCotas),
    extraCredito: Math.round(extraCredito),
    faltouCredito: Math.round(faltouCredito),
    extraCotas: Math.round(extraCotas),
    faltouCotas: Math.round(faltouCotas)
  };
}

console.log('=== TESTES UNITÁRIOS DO SERVIÇO DE METAS MENSAIS ===\n');

// Teste 1: Tempo no CRM
const t1 = getTempoCRM('2026-05-16T10:00:00Z', new Date('2026-10-16T10:00:00Z'));
console.log('Teste 1 (5 meses):', t1.tempoRelativo);
assert.strictEqual(t1.tempoRelativo, '(5 meses)');

const t2 = getTempoCRM('2025-04-16T10:00:00Z', new Date('2026-10-16T10:00:00Z'));
console.log('Teste 2 (1 ano e 6 meses):', t2.tempoRelativo);
assert.strictEqual(t2.tempoRelativo, '(1 ano e 6 meses)');

const t3 = getTempoCRM('2026-10-01T10:00:00Z', new Date('2026-10-16T10:00:00Z'));
console.log('Teste 3 (menos de 1 mês):', t3.tempoRelativo);
assert.strictEqual(t3.tempoRelativo, '(menos de 1 mês)');

// Teste 4: Desempenho - Meta Batida (+25% em crédito)
const d1 = calcularDesempenho(1000000, 8, 800000, 8, 'credito');
console.log('Teste 4 (Crédito Batido):', d1);
assert.strictEqual(d1.bateu, true);
assert.strictEqual(d1.extraCredito, 25);

// Teste 5: Desempenho - Meta Não Batida (faltou 20% em cotas)
const d2 = calcularDesempenho(500000, 4, 500000, 5, 'cotas');
console.log('Teste 5 (Cotas Não Batida):', d2);
assert.strictEqual(d2.bateu, false);
assert.strictEqual(d2.faltouCotas, 20);

// Teste 6: Desempenho - Foco Ambos (Crédito bateu, cotas faltou -> Não bateu ambos)
const d3 = calcularDesempenho(1000000, 4, 800000, 5, 'ambos');
console.log('Teste 6 (Ambos - 1 bateu e 1 não):', d3);
assert.strictEqual(d3.bateu, false);

console.log('\n✓ TODOS OS TESTES PASSARAM COM SUCESSO!');
