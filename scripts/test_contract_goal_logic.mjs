import assert from 'assert';
import { parseMoney } from '../consorflux/src/services/gamificationService.js';

// Logic matching getLeadCreditValue and getLeadCotasCount
const getLeadCreditValue = (client) => {
  if (!client || !Array.isArray(client.contracts) || client.contracts.length === 0) {
    return 0;
  }
  return client.contracts.reduce((acc, c) => {
    const v = parseMoney(c.valorContrato || c.credito || c.creditValue || c.valor || c.credit || 0);
    return acc + v;
  }, 0);
};

const getLeadCotasCount = (client) => {
  if (!client || !Array.isArray(client.contracts) || client.contracts.length === 0) {
    return 0;
  }
  const validContracts = client.contracts.filter(c => {
    if (!c) return false;
    const hasCota = c.cota !== undefined && c.cota !== null && String(c.cota).trim() !== '';
    const hasValor = parseMoney(c.valorContrato || c.credito || c.valor || 0) > 0;
    const hasNumero = c.numeroContrato !== undefined && c.numeroContrato !== null && String(c.numeroContrato).trim() !== '';
    return hasCota || hasValor || hasNumero;
  });
  return validContracts.length;
};

// TEST 1: Lead with desiredCredit only, but NO contracts
const leadNoContracts = {
  name: 'Lead Sem Contrato',
  desiredCredit: 'R$ 800.000,00',
  contracts: []
};

assert.strictEqual(getLeadCreditValue(leadNoContracts), 0, 'Lead sem contrato deve ter crédito 0');
assert.strictEqual(getLeadCotasCount(leadNoContracts), 0, 'Lead sem contrato deve ter cotas 0');
console.log('✅ TESTE 1 PASSOU: Lead sem contrato na aba de acompanhamentos resulta em 0 crédito e 0 cotas');

// TEST 2: Lead with 4 contracts of 200k each (Total 800k, 4 cotas)
const leadWith4Contracts = {
  name: 'Cliente 4 Cotas',
  desiredCredit: 'R$ 800.000,00',
  contracts: [
    { id: 'c1', cota: '101', grupo: '01', valorContrato: '200.000,00' },
    { id: 'c2', cota: '102', grupo: '01', valorContrato: '200.000,00' },
    { id: 'c3', cota: '103', grupo: '01', valorContrato: '200.000,00' },
    { id: 'c4', cota: '104', grupo: '01', valorContrato: '200.000,00' }
  ]
};

const totalCredit = getLeadCreditValue(leadWith4Contracts);
const totalCotas = getLeadCotasCount(leadWith4Contracts);

assert.strictEqual(totalCredit, 800000, 'Total de crédito deve ser 800.000');
assert.strictEqual(totalCotas, 4, 'Total de cotas deve ser 4');
console.log('✅ TESTE 2 PASSOU: 4 contratos de 200.000 resultam em R$ 800.000,00 e 4 cotas');

// TEST 3: Meta de Cotas
const goalCotas5 = { tipo_meta: 'cotas', valor_meta: 5 };
assert.strictEqual(totalCotas >= goalCotas5.valor_meta, false, '4 cotas NÃO devem bater meta de 5');
console.log('✅ TESTE 3 PASSOU: 4 cotas < meta de 5 cotas (não bateu meta)');

// TEST 4: Meta de Crédito
const goalCredit500k = { tipo_meta: 'credito', valor_meta: 500000 };
assert.strictEqual(totalCredit >= goalCredit500k.valor_meta, true, '800k DEVE bater meta de 500k');
console.log('✅ TESTE 4 PASSOU: R$ 800.000 >= meta de R$ 500.000 (bateu meta)');

console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
