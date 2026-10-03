/**
 * Sanitiza e normaliza números de telefone para o padrão WhatsApp internacional (DDI 55 Brasil)
 */
export function sanitizePhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  return `55${digits}`;
}

/**
 * Valida os dados de agendamento antes da persistência
 */
export function validateScheduleData(data) {
  if (!data) {
    return { valid: false, error: 'Dados de agendamento não informados.' };
  }

  const lead_name = (data.lead_name || '').trim();
  if (!lead_name) {
    return { valid: false, error: 'Por favor, informe o nome do cliente/lead.' };
  }

  const rawPhone = (data.lead_phone || '').trim();
  const lead_phone = sanitizePhoneNumber(rawPhone);
  if (!lead_phone || lead_phone.length < 12) {
    return { valid: false, error: 'Por favor, informe um telefone válido com DDD.' };
  }

  if (!data.scheduled_for) {
    return { valid: false, error: 'Data e horário do agendamento são obrigatórios.' };
  }

  const scheduledDate = new Date(data.scheduled_for);
  if (isNaN(scheduledDate.getTime())) {
    return { valid: false, error: 'Data de agendamento inválida.' };
  }

  const now = new Date();
  // Permite uma tolerância de até 30 segundos para compensar latência de rede no envio
  if (scheduledDate.getTime() < now.getTime() - 30000) {
    return { valid: false, error: 'O agendamento deve ser definido para um horário no futuro.' };
  }

  const message_type = data.message_type || 'text';
  const hasText = Boolean(data.content_text && data.content_text.trim());
  const hasMedia = Boolean(data.media_url);

  if (message_type === 'text' && !hasText) {
    return { valid: false, error: 'O texto da mensagem é obrigatório.' };
  }

  if (message_type === 'audio_ai' && !hasText) {
    return { valid: false, error: 'Informe o texto que a IA deve falar no áudio.' };
  }

  if ((message_type === 'image' || message_type === 'document' || message_type === 'audio_record') && !hasMedia && !hasText) {
    return { valid: false, error: 'Por favor, forneça o conteúdo ou arquivo para envio.' };
  }

  return {
    valid: true,
    sanitized: {
      lead_id: data.lead_id ? String(data.lead_id) : null,
      lead_name,
      lead_phone,
      scheduled_for: scheduledDate.toISOString(),
      message_type,
      content_text: data.content_text ? data.content_text.trim() : null,
      media_url: data.media_url || null,
      media_mime: data.media_mime || null,
      file_name: data.file_name || null,
      voice_reference: data.voice_reference || 'rafael',
      human_simulation: data.human_simulation !== false,
      status: 'pending'
    }
  };
}
