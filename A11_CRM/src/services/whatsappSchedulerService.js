import { supabase } from './supabaseClient';
import { evolutionApi } from './evolutionApi';
import { sanitizePhoneNumber, validateScheduleData } from '../utils/schedulerValidation.js';

export { sanitizePhoneNumber, validateScheduleData };

class WhatsAppSchedulerService {
  /**
   * Salva um novo agendamento no Supabase
   */
  async createScheduledMessage(data, userId = null) {
    const validation = validateScheduleData(data);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    let finalUserId = userId;
    if (!finalUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      finalUserId = user?.id || null;
    }

    const payload = {
      ...validation.sanitized,
      user_id: finalUserId
    };

    const { data: inserted, error } = await supabase
      .from('whatsapp_scheduled_messages')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[WhatsAppSchedulerService] Erro ao criar agendamento:', error);
      throw error;
    }

    return inserted;
  }

  /**
   * Busca agendamentos com filtros opcionais
   */
  async fetchSchedules({ startDate = null, endDate = null, status = 'ALL', userId = null } = {}) {
    let query = supabase
      .from('whatsapp_scheduled_messages')
      .select('*')
      .order('scheduled_for', { ascending: true });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (status && status !== 'ALL') {
      query = query.eq('status', status.toLowerCase());
    }

    if (startDate) {
      query = query.gte('scheduled_for', startDate);
    }

    if (endDate) {
      query = query.lte('scheduled_for', endDate);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[WhatsAppSchedulerService] Erro ao buscar agendamentos:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Cancela um agendamento pendente
   */
  async cancelSchedule(scheduleId) {
    if (!scheduleId) throw new Error('ID do agendamento não informado.');

    const { data, error } = await supabase
      .from('whatsapp_scheduled_messages')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', scheduleId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Exclui um agendamento do banco
   */
  async deleteSchedule(scheduleId) {
    if (!scheduleId) throw new Error('ID do agendamento não informado.');

    const { error } = await supabase
      .from('whatsapp_scheduled_messages')
      .delete()
      .eq('id', scheduleId);

    if (error) throw error;
    return true;
  }

  /**
   * Dispara imediatamente um agendamento de forma antecipada
   */
  async sendImmediately(scheduleId, activeInstanceName = null) {
    if (!scheduleId) throw new Error('ID do agendamento não informado.');

    // 1. Buscar dados do agendamento
    const { data: schedule, error: fetchErr } = await supabase
      .from('whatsapp_scheduled_messages')
      .select('*')
      .eq('id', scheduleId)
      .single();

    if (fetchErr || !schedule) {
      throw new Error('Agendamento não encontrado.');
    }

    // 2. Determinar instância ativa do vendedor
    let instanceName = activeInstanceName;
    if (!instanceName) {
      const { data: inst } = await supabase
        .from('whatsapp_instances')
        .select('instance_name')
        .eq('status', 'CONNECTED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      instanceName = inst?.instance_name;
    }

    if (!instanceName) {
      throw new Error('Nenhuma instância do WhatsApp conectada no momento para envio.');
    }

    // 3. Atualizar status para processing
    await supabase
      .from('whatsapp_scheduled_messages')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', scheduleId);

    try {
      let sendResult;

      if (schedule.message_type === 'text') {
        sendResult = await evolutionApi.sendTextMessage(instanceName, schedule.lead_phone, schedule.content_text);
      } else if (schedule.message_type === 'audio_ai' || schedule.message_type === 'audio_record') {
        if (schedule.media_url) {
          sendResult = await evolutionApi.sendWhatsAppAudio(instanceName, schedule.lead_phone, schedule.media_url);
        } else if (schedule.content_text) {
          sendResult = await evolutionApi.sendTextMessage(instanceName, schedule.lead_phone, schedule.content_text);
        }
      } else if (schedule.message_type === 'image' || schedule.message_type === 'document') {
        sendResult = await evolutionApi.sendMediaMessage(instanceName, schedule.lead_phone, {
          mediaDataUri: schedule.media_url,
          mediaType: schedule.message_type === 'image' ? 'image' : 'document',
          mimetype: schedule.media_mime || 'application/octet-stream',
          fileName: schedule.file_name || 'arquivo',
          caption: schedule.content_text || ''
        });
      }

      // Marcar como enviado
      const nowIso = new Date().toISOString();
      await supabase
        .from('whatsapp_scheduled_messages')
        .update({
          status: 'sent',
          sent_at: nowIso,
          error_message: null,
          updated_at: nowIso
        })
        .eq('id', scheduleId);

      return { success: true, result: sendResult };
    } catch (sendError) {
      await supabase
        .from('whatsapp_scheduled_messages')
        .update({
          status: 'failed',
          error_message: sendError.message || 'Falha ao despachar mensagem.',
          updated_at: new Date().toISOString()
        })
        .eq('id', scheduleId);

      throw sendError;
    }
  }

  /**
   * Upload de arquivo para o bucket do Supabase Storage
   */
  async uploadMedia(fileBlob, fileName, folder = 'scheduled') {
    const ext = fileName.split('.').pop() || 'bin';
    const filePath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, fileBlob, { upsert: true });

    if (uploadErr) {
      console.warn('[WhatsAppSchedulerService] Falha ao enviar para bucket whatsapp-media, tentando fallback público:', uploadErr.message);
      const { data: publicData, error: fbErr } = await supabase.storage
        .from('images')
        .upload(filePath, fileBlob, { upsert: true });

      if (fbErr) throw fbErr;
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
      return publicUrl;
    }

    const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
    return publicUrl;
  }
}

export const whatsappSchedulerService = new WhatsAppSchedulerService();
