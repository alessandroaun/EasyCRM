import assert from 'node:assert';
import { validateScheduleData, sanitizePhoneNumber } from '../../utils/schedulerValidation.js';

console.log('🧪 Iniciando testes unitários do whatsappSchedulerService...');

// Teste 1: Sanitização de telefone
{
  assert.strictEqual(sanitizePhoneNumber('(11) 98765-4321'), '5511987654321');
  assert.strictEqual(sanitizePhoneNumber('+55 21 99999-8888'), '5521999998888');
  assert.strictEqual(sanitizePhoneNumber('11987654321'), '5511987654321');
  assert.strictEqual(sanitizePhoneNumber('5511987654321'), '5511987654321');
  console.log('✅ Teste 1: sanitização de telefone passou com sucesso.');
}

// Teste 2: Rejeição de campos obrigatórios vazios
{
  const missingName = validateScheduleData({
    lead_name: '',
    lead_phone: '11987654321',
    scheduled_for: new Date(Date.now() + 3600000).toISOString(),
    content_text: 'Olá'
  });
  assert.strictEqual(missingName.valid, false);
  assert.match(missingName.error, /nome/i);

  const missingPhone = validateScheduleData({
    lead_name: 'Carlos',
    lead_phone: '',
    scheduled_for: new Date(Date.now() + 3600000).toISOString(),
    content_text: 'Olá'
  });
  assert.strictEqual(missingPhone.valid, false);
  assert.match(missingPhone.error, /telefone/i);
  console.log('✅ Teste 2: validação de campos obrigatórios passou com sucesso.');
}

// Teste 3: Rejeição de agendamento no passado
{
  const inThePast = validateScheduleData({
    lead_name: 'Carlos',
    lead_phone: '11987654321',
    scheduled_for: new Date(Date.now() - 3600000).toISOString(),
    content_text: 'Olá'
  });
  assert.strictEqual(inThePast.valid, false);
  assert.match(inThePast.error, /futuro/i);
  console.log('✅ Teste 3: validação de data no passado passou com sucesso.');
}

// Teste 4: Rejeição de agendamento sem conteúdo
{
  const noContent = validateScheduleData({
    lead_name: 'Carlos',
    lead_phone: '11987654321',
    scheduled_for: new Date(Date.now() + 3600000).toISOString(),
    message_type: 'text',
    content_text: '   '
  });
  assert.strictEqual(noContent.valid, false);
  assert.match(noContent.error, /texto|conteúdo/i);
  console.log('✅ Teste 4: validação de conteúdo ausente passou com sucesso.');
}

// Teste 5: Agendamento válido com formatação e defaults corretos
{
  const validData = validateScheduleData({
    lead_name: 'Mariana Lima',
    lead_phone: '(31) 98888-7777',
    scheduled_for: new Date(Date.now() + 86400000).toISOString(),
    message_type: 'audio_ai',
    content_text: 'Olá Mariana, segue sua proposta!',
    voice_reference: 'rafael'
  });
  assert.strictEqual(validData.valid, true);
  assert.strictEqual(validData.sanitized.lead_phone, '5531988887777');
  assert.strictEqual(validData.sanitized.human_simulation, true);
  assert.strictEqual(validData.sanitized.status, 'pending');
  console.log('✅ Teste 5: validação de payload completo e defaults passou com sucesso.');
}

console.log('🎉 Todos os testes unitários passaram!');
