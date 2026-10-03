import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Phone, 
  MessageSquare, 
  Sparkles, 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Paperclip, 
  ShieldCheck, 
  Check, 
  Loader2, 
  Search,
  Volume2,
  Lock,
  RotateCcw
} from 'lucide-react';
import { useBoard } from '../../context/BoardContext';
import { useTheme } from '../../context/ThemeContext';
import { whatsappSchedulerService, sanitizePhoneNumber } from '../../services/whatsappSchedulerService';
import { pocketTtsService } from '../../services/pocketTtsService';

export default function NovoAgendamentoModal({ isOpen, onClose, onCreated, defaultDate = null }) {
  const { boardData, showToast, addLeadComment } = useBoard();
  const { isDarkMode } = useTheme();

  // Estados principais
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  
  // Data e hora (padrão: hoje ou defaultDate, 1 hora no futuro)
  const [date, setDate] = useState(() => {
    if (defaultDate) return defaultDate;
    return new Date().toISOString().slice(0, 10);
  });
  
  const [time, setTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return `${String(d.getHours()).padStart(2, '0')}:00`;
  });

  // Tipo de mensagem: 'text' | 'audio_ai' | 'audio_record' | 'media'
  const [activeTab, setActiveTab] = useState('text');
  const [contentText, setContentText] = useState('');
  const [voiceReference, setVoiceReference] = useState('rafael'); // 'rafael' | 'female'
  const [humanSimulation, setHumanSimulation] = useState(true);

  // Estados de Áudio IA
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [previewAudioUri, setPreviewAudioUri] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const audioPreviewRef = useRef(null);

  // Estados de Gravação de Áudio
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState(null);
  const [recordedAudioUri, setRecordedAudioUri] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Estados de Upload de Mídia
  const [selectedFile, setSelectedFile] = useState(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [filePreview, setFilePreview] = useState(null);

  // Submissão
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resetar modal ao fechar/abrir
  useEffect(() => {
    if (isOpen) {
      if (defaultDate) setDate(defaultDate);
      setSelectedLead(null);
      setSearchTerm('');
      setClientName('');
      setClientPhone('');
      setContentText('');
      setPreviewAudioUri(null);
      setRecordedAudioBlob(null);
      setRecordedAudioUri(null);
      setSelectedFile(null);
      setFilePreview(null);
      setIsPlayingPreview(false);
    }
  }, [isOpen, defaultDate]);

  // Lista unificada de leads a partir do boardData
  const allLeads = useMemo(() => {
    if (!boardData?.phases) return [];
    const leads = [];
    boardData.phases.forEach((phase) => {
      (phase.clients || []).forEach((c) => {
        if (c.name || c.phone) {
          leads.push({
            id: c.id,
            name: c.name || 'Sem nome',
            phone: c.phone || '',
            phaseName: phase.name,
            credito: c.credito || c.valor || ''
          });
        }
      });
    });
    return leads;
  }, [boardData]);

  // Leads filtrados pela busca
  const filteredLeads = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return allLeads.filter(
      (l) => l.name.toLowerCase().includes(term) || l.phone.includes(term)
    ).slice(0, 5);
  }, [allLeads, searchTerm]);

  const handleSelectLead = (lead) => {
    setSelectedLead(lead);
    setClientName(lead.name);
    setClientPhone(lead.phone);
    setSearchTerm('');
  };

  // Preview com substituição de tags
  const renderedMessagePreview = useMemo(() => {
    const name = clientName || 'Nome do Cliente';
    return contentText
      .replace(/{nome}/gi, name)
      .replace(/{empresa}/gi, 'ConsorFlux')
      .replace(/{data}/gi, date);
  }, [contentText, clientName, date]);

  // Gerar prévia do áudio com Pocket-TTS
  const handleGenerateAudioPreview = async () => {
    if (!contentText.trim()) {
      showToast?.('Digite o texto que a IA deve falar antes de ouvir a prévia.', 'error');
      return;
    }

    try {
      setIsSynthesizing(true);
      const res = await pocketTtsService.generateSpeech({
        text: renderedMessagePreview,
        gender: voiceReference === 'female' ? 'female' : 'male'
      });

      if (res?.audio_base64) {
        const audioUri = `data:audio/wav;base64,${res.audio_base64}`;
        setPreviewAudioUri(audioUri);
        showToast?.('Áudio sintetizado com sucesso! Clique em reproduzir.', 'success');
      } else {
        throw new Error('Nenhum áudio retornado pelo modelo.');
      }
    } catch (err) {
      console.error('Erro ao gerar prévia de áudio:', err);
      showToast?.(err.message || 'Falha ao sintetizar áudio com a IA.', 'error');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const togglePlayAudio = (uri) => {
    if (!uri) return;
    if (!audioPreviewRef.current) {
      audioPreviewRef.current = new Audio(uri);
      audioPreviewRef.current.onended = () => setIsPlayingPreview(false);
    } else {
      if (audioPreviewRef.current.src !== uri) {
        audioPreviewRef.current.src = uri;
      }
    }

    if (isPlayingPreview) {
      audioPreviewRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioPreviewRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  // Gravação de microfone
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedAudioBlob(blob);
        setRecordedAudioUri(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      showToast?.('Permissão de microfone negada ou indisponível.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Upload de arquivo
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      showToast?.('O arquivo excede o limite máximo de 15MB.', 'error');
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview(null);
    }
  };

  // Submissão do agendamento
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedLead) {
      showToast?.('Por favor, selecione um lead da lista interna do seu CRM.', 'error');
      return;
    }

    if (!clientName.trim()) {
      showToast?.('Lead inválido: nome ausente.', 'error');
      return;
    }

    const cleanPhone = sanitizePhoneNumber(clientPhone);
    if (!cleanPhone || cleanPhone.length < 12) {
      showToast?.('Lead inválido: telefone com DDD inválido no cadastro.', 'error');
      return;
    }

    const scheduledDateTime = new Date(`${date}T${time}:00`);
    if (isNaN(scheduledDateTime.getTime())) {
      showToast?.('Data ou horário inválidos.', 'error');
      return;
    }

    if (scheduledDateTime.getTime() < Date.now() - 30000) {
      showToast?.('Selecione uma data e horário no futuro.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);

      let mediaUrl = null;
      let mediaMime = null;
      let fileName = null;
      let finalMessageType = activeTab;

      // Se for mídia, faz upload para o Storage
      if (activeTab === 'media' && selectedFile) {
        mediaUrl = await whatsappSchedulerService.uploadMedia(selectedFile, selectedFile.name, 'media');
        mediaMime = selectedFile.type;
        fileName = selectedFile.name;
        finalMessageType = selectedFile.type.startsWith('image/') ? 'image' : 'document';
      } else if (activeTab === 'audio_record' && recordedAudioBlob) {
        mediaUrl = await whatsappSchedulerService.uploadMedia(recordedAudioBlob, 'gravacao.webm', 'audios');
        mediaMime = 'audio/webm';
        fileName = 'audio.webm';
      } else if (activeTab === 'audio_ai' && previewAudioUri) {
        // Se já gerou a prévia, converte o base64 para blob e salva no storage para envio direto
        const blob = await (await fetch(previewAudioUri)).blob();
        mediaUrl = await whatsappSchedulerService.uploadMedia(blob, 'audio_ia.wav', 'audios_ia');
        mediaMime = 'audio/wav';
        fileName = 'audio_ia.wav';
      }

      const schedulePayload = {
        lead_id: selectedLead?.id || null,
        lead_name: clientName.trim(),
        lead_phone: cleanPhone,
        scheduled_for: scheduledDateTime.toISOString(),
        message_type: finalMessageType,
        content_text: activeTab === 'media' ? mediaCaption : renderedMessagePreview,
        media_url: mediaUrl,
        media_mime: mediaMime,
        file_name: fileName,
        voice_reference: voiceReference,
        human_simulation: humanSimulation
      };

      await whatsappSchedulerService.createScheduledMessage(schedulePayload);

      // REGISTRO AUTOMÁTICO DE NOTA / ATIVIDADE NO HISTÓRICO DO LEAD (ClientDetailsModal)
      if (selectedLead?.id && addLeadComment) {
        const dataFmt = scheduledDateTime.toLocaleDateString('pt-BR');
        const horaFmt = scheduledDateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const tipoNome = finalMessageType === 'audio_ai' 
          ? 'Áudio IA Pocket-TTS' 
          : finalMessageType === 'audio_record' 
          ? 'Áudio Gravado' 
          : finalMessageType === 'image' 
          ? 'Imagem' 
          : finalMessageType === 'document' 
          ? 'Documento' 
          : 'Texto';

        const previewSnippet = (schedulePayload.content_text || fileName || '').slice(0, 70);
        const autoNoteText = `📅 Sistema: Mensagem WhatsApp programada para ${dataFmt} às ${horaFmt} (${tipoNome}). Conteúdo: "${previewSnippet}${previewSnippet.length >= 70 ? '...' : ''}"`;
        
        await addLeadComment(selectedLead.id, autoNoteText);
      }

      showToast?.('🎉 Mensagem agendada com sucesso no ConsorFlux!', 'success');
      onCreated?.();
      onClose();
    } catch (err) {
      console.error('Erro ao agendar mensagem:', err);
      showToast?.(err.message || 'Erro ao agendar mensagem.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
        isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50/50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold">Novo Agendamento de Mensagem WhatsApp</h2>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Programe disparos de texto, áudios com IA ou mídias com envio autônomo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isDarkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulário com Scroll */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Seção 1: Seleção de Lead (ESTRITAMENTE CONTATOS INTERNOS DO CRM) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wider text-slate-400">
                <User size={13} /> Destinatário (Lead da Carteira do CRM)
              </label>
              {selectedLead && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLead(null);
                    setClientName('');
                    setClientPhone('');
                    setSearchTerm('');
                  }}
                  className="text-[11px] flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
                >
                  <RotateCcw size={11} />
                  <span>Trocar Lead</span>
                </button>
              )}
            </div>

            {/* Busca rápida na base interna */}
            {!selectedLead ? (
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquise o lead pelo nome ou telefone na sua carteira..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs border outline-none transition-all ${
                    isDarkMode 
                      ? 'bg-slate-950 border-slate-800 focus:border-emerald-500 text-slate-200' 
                      : 'bg-slate-50 border-slate-200 focus:border-emerald-500 text-slate-800'
                  }`}
                />

                {/* Resultados suspensos da busca */}
                {filteredLeads.length > 0 && (
                  <div className={`absolute top-full left-0 right-0 mt-1 rounded-2xl border shadow-xl z-20 overflow-hidden ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                  }`}>
                    {filteredLeads.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => handleSelectLead(lead)}
                        className={`w-full p-3 text-left flex items-center justify-between text-xs transition-colors border-b last:border-0 ${
                          isDarkMode 
                            ? 'border-slate-800/60 hover:bg-slate-900 text-slate-200' 
                            : 'border-slate-100 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div>
                          <div className="font-bold">{lead.name}</div>
                          <div className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {lead.phone} • Fase: {lead.phaseName}
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold">
                          Selecionar
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {searchTerm.trim().length > 0 && filteredLeads.length === 0 && (
                  <div className={`absolute top-full left-0 right-0 mt-1 p-3 rounded-2xl border shadow-xl z-20 text-xs text-center ${
                    isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
                  }`}>
                    Nenhum lead interno encontrado com esse nome ou telefone.
                  </div>
                )}
              </div>
            ) : (
              <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                isDarkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <User size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold">{selectedLead.name}</div>
                    <div className="text-[10px] opacity-80">{selectedLead.phone} • Fase: {selectedLead.phaseName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/20 px-2.5 py-1 rounded-full">
                  <Lock size={10} />
                  <span>Lead Verificado CRM</span>
                </div>
              </div>
            )}

            {/* Inputs de Nome e Telefone TRAVADOS CONTRA DIGITAÇÃO MANUAL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <span>Nome do Cliente</span>
                  <Lock size={10} className="text-slate-500" />
                </label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    value={clientName}
                    placeholder="Selecione um lead da busca acima..."
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border outline-none cursor-not-allowed ${
                      isDarkMode 
                        ? 'bg-slate-950/50 border-slate-800 text-slate-300 placeholder-slate-600' 
                        : 'bg-slate-100 border-slate-200 text-slate-700 placeholder-slate-400'
                    }`}
                  />
                  <Lock size={12} className="absolute right-3 top-3 text-slate-500 opacity-60" />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <span>Telefone / WhatsApp</span>
                  <Lock size={10} className="text-slate-500" />
                </label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    value={clientPhone}
                    placeholder="Telefone vinculado ao lead..."
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border outline-none cursor-not-allowed ${
                      isDarkMode 
                        ? 'bg-slate-950/50 border-slate-800 text-slate-300 placeholder-slate-600' 
                        : 'bg-slate-100 border-slate-200 text-slate-700 placeholder-slate-400'
                    }`}
                  />
                  <Lock size={12} className="absolute right-3 top-3 text-slate-500 opacity-60" />
                </div>
              </div>
            </div>
          </div>

          {/* Seção 2: Data e Horário */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wider text-slate-400">
                <CalendarIcon size={13} /> Data de Disparo *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className={`w-full px-3.5 py-2.5 mt-1.5 rounded-xl text-xs border outline-none ${
                  isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wider text-slate-400">
                <Clock size={13} /> Horário *
              </label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={`w-full px-3.5 py-2.5 mt-1.5 rounded-xl text-xs border outline-none ${
                  isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>
          </div>

          {/* Seção 3: Tipo de Conteúdo (Abas) */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Formato da Mensagem
            </label>

            <div className={`grid grid-cols-4 p-1 rounded-2xl border text-xs font-semibold ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'text' 
                    ? 'bg-emerald-600 text-white shadow-xs' 
                    : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <MessageSquare size={14} /> <span>Texto</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audio_ai')}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'audio_ai' 
                    ? 'bg-purple-600 text-white shadow-xs' 
                    : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Sparkles size={14} /> <span>Áudio IA</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audio_record')}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'audio_record' 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Mic size={14} /> <span>Gravar</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('media')}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'media' 
                    ? 'bg-amber-600 text-white shadow-xs' 
                    : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Paperclip size={14} /> <span>Mídia</span>
              </button>
            </div>

            {/* Conteúdo Aba Texto */}
            {activeTab === 'text' && (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  required
                  value={contentText}
                  onChange={(e) => setContentText(e.target.value)}
                  placeholder="Digite sua mensagem. Você pode usar as variáveis {nome}, {empresa} e {data}..."
                  className={`w-full p-3.5 rounded-2xl text-xs border outline-none ${
                    isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
                <div className={`p-3 rounded-xl border text-[11px] ${
                  isDarkMode ? 'bg-slate-950/50 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  <strong>Prévia do texto:</strong> {renderedMessagePreview || 'Sua mensagem aparecerá aqui formatada.'}
                </div>
              </div>
            )}

            {/* Conteúdo Aba Áudio IA (Pocket-TTS) */}
            {activeTab === 'audio_ai' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400">Texto que a IA vai narrar *</label>
                  <textarea
                    rows={3}
                    required
                    value={contentText}
                    onChange={(e) => setContentText(e.target.value)}
                    placeholder="Olá {nome}, aqui é da ConsorFlux! Estou passando para lembrar da nossa apresentação de consórcio hoje..."
                    className={`w-full p-3.5 mt-1 rounded-2xl text-xs border outline-none ${
                      isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label className="text-xs font-semibold text-slate-400">Perfil de Voz:</label>
                    <select
                      value={voiceReference}
                      onChange={(e) => setVoiceReference(e.target.value)}
                      className={`px-3 py-1.5 rounded-xl text-xs border outline-none ${
                        isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <option value="rafael">Rafael (Voz Masculina Executiva)</option>
                      <option value="female">Voz Feminina Studio</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateAudioPreview}
                    disabled={isSynthesizing || !contentText.trim()}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isSynthesizing ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Sintetizando...</span>
                      </>
                    ) : (
                      <>
                        <Volume2 size={14} />
                        <span>Ouvir Prévia com IA</span>
                      </>
                    )}
                  </button>
                </div>

                {previewAudioUri && (
                  <div className="p-3 rounded-2xl border bg-purple-500/10 border-purple-500/20 flex items-center justify-between">
                    <span className="text-xs text-purple-300 font-semibold flex items-center gap-2">
                      <Sparkles size={14} /> Áudio de IA Pronto para Envio
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePlayAudio(previewAudioUri)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 text-white font-bold text-xs flex items-center gap-1.5"
                    >
                      {isPlayingPreview ? <Pause size={14} /> : <Play size={14} />}
                      <span>{isPlayingPreview ? 'Pausar' : 'Reproduzir'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Conteúdo Aba Gravação de Microfone */}
            {activeTab === 'audio_record' && (
              <div className="space-y-3 p-4 rounded-2xl border border-dashed text-center flex flex-col items-center justify-center">
                <p className="text-xs text-slate-400">
                  Grave um áudio de voz autêntico pelo microfone para ser enviado no horário agendado
                </p>

                <div className="flex items-center gap-3">
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="px-5 py-2.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-red-500/20"
                    >
                      <Mic size={15} /> <span>Iniciar Gravação</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-5 py-2.5 rounded-2xl bg-slate-800 text-red-400 border border-red-500 font-bold text-xs flex items-center gap-2 animate-pulse"
                    >
                      <Square size={15} /> <span>Parar Gravação</span>
                    </button>
                  )}
                </div>

                {recordedAudioUri && (
                  <div className="w-full pt-3 border-t flex items-center justify-between">
                    <span className="text-xs text-blue-400 font-semibold">🎙️ Áudio Gravado Pronto</span>
                    <button
                      type="button"
                      onClick={() => togglePlayAudio(recordedAudioUri)}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      {isPlayingPreview ? <Pause size={14} /> : <Play size={14} />}
                      <span>{isPlayingPreview ? 'Pausar' : 'Ouvir Gravação'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Conteúdo Aba Mídia / Arquivo */}
            {activeTab === 'media' && (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl border border-dashed flex flex-col items-center justify-center text-center">
                  <input
                    type="file"
                    id="media-file"
                    onChange={handleFileChange}
                    accept="image/*,application/pdf"
                    className="hidden"
                  />
                  <label
                    htmlFor="media-file"
                    className="cursor-pointer px-4 py-2 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 font-semibold text-xs flex items-center gap-2 transition-all"
                  >
                    <Paperclip size={14} />
                    <span>{selectedFile ? selectedFile.name : 'Selecionar Imagem ou PDF (até 15MB)'}</span>
                  </label>

                  {filePreview && (
                    <div className="mt-3">
                      <img src={filePreview} alt="Preview" className="h-24 w-auto rounded-xl object-cover shadow-md" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400">Legenda Opcional</label>
                  <input
                    type="text"
                    value={mediaCaption}
                    onChange={(e) => setMediaCaption(e.target.value)}
                    placeholder="Adicione uma legenda que acompanhará o anexo..."
                    className={`w-full px-3.5 py-2 mt-1 rounded-xl text-xs border outline-none ${
                      isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Seção 4: Mecanismo Antiban */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between ${
            isDarkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-emerald-50/50 border-emerald-200'
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h4 className="text-xs font-bold">Simulação Humana Antiban</h4>
                <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Simula status "digitando..." ou "gravando áudio..." por 3 a 5 segundos antes do envio
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setHumanSimulation(!humanSimulation)}
              className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                humanSimulation ? 'bg-emerald-500 justify-end pr-1' : 'bg-slate-700 justify-start pl-1'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </button>
          </div>

          {/* Footer / Botões */}
          <div className="pt-3 border-t flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2.5 rounded-2xl text-xs font-semibold transition-colors ${
                isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !selectedLead}
              className={`px-6 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-md ${
                !selectedLead 
                  ? 'bg-slate-700/60 text-slate-400 cursor-not-allowed opacity-60' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
              } disabled:opacity-50`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Salvando Agendamento...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>{!selectedLead ? 'Selecione um Lead' : 'Confirmar e Agendar'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
