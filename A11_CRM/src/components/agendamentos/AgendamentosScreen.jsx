import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  X,
  MessageSquare,
  Mic,
  Paperclip,
  Trash2,
  Send,
  Ban,
  Loader2,
  RefreshCw,
  Phone
} from 'lucide-react';
import { useBoard } from '../../context/BoardContext';
import { useTheme } from '../../context/ThemeContext';
import { whatsappSchedulerService } from '../../services/whatsappSchedulerService';
import NovoAgendamentoModal from './NovoAgendamentoModal';

export default function AgendamentosScreen() {
  const { boardData, showToast } = useBoard();
  const { isDarkMode } = useTheme();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  
  // Filtros: tab 'ALL' | 'WHATSAPP' | 'MEETINGS' e status 'ALL' | 'PENDING' | 'SENT' | 'FAILED'
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  
  // Modais
  const [isWaModalOpen, setIsWaModalOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);

  // Estados de dados
  const [scheduledMessages, setScheduledMessages] = useState([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Compromissos presenciais / reuniões (sessões)
  const [appointments, setAppointments] = useState([]);

  // Formulário de nova reunião
  const [meetingForm, setMeetingForm] = useState({
    clientName: '',
    clientPhone: '',
    title: 'Apresentação de Proposta de Consórcio',
    type: 'online', // 'online' | 'presencial' | 'telefone'
    date: new Date().toISOString().slice(0, 10),
    time: '14:30',
    notes: ''
  });

  // Carregar mensagens agendadas do Supabase para o mês selecionado
  const loadSchedules = useCallback(async () => {
    try {
      setIsLoadingSchedules(true);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const startOfMonth = new Date(year, month, 1).toISOString();
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();

      const data = await whatsappSchedulerService.fetchSchedules({
        startDate: startOfMonth,
        endDate: endOfMonth
      });

      setScheduledMessages(data || []);
    } catch (err) {
      console.error('Erro ao carregar agendamentos do WhatsApp:', err);
    } finally {
      setIsLoadingSchedules(false);
    }
  }, [currentDate]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Dias do mês atual para o calendário
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ day: null, dateStr: null });
    }
    for (let d = 1; d <= lastDay; d++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      const waCount = scheduledMessages.filter((m) => {
        const msgDateStr = new Date(m.scheduled_for).toISOString().slice(0, 10);
        return msgDateStr === dateStr && m.status !== 'cancelled';
      }).length;

      const meetingCount = appointments.filter((a) => a.date === dateStr).length;

      days.push({ 
        day: d, 
        dateStr, 
        hasWa: waCount > 0, 
        waCount, 
        hasMeeting: meetingCount > 0,
        meetingCount 
      });
    }
    return days;
  }, [currentDate, scheduledMessages, appointments]);

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Disparo Antecipado
  const handleSendNow = async (id) => {
    try {
      setActionLoadingId(id);
      await whatsappSchedulerService.sendImmediately(id);
      showToast?.('🚀 Mensagem disparada com sucesso via WhatsApp!', 'success');
      loadSchedules();
    } catch (err) {
      console.error('Erro ao disparar mensagem antecipada:', err);
      showToast?.(err.message || 'Falha ao disparar mensagem.', 'error');
      loadSchedules();
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancelar
  const handleCancelSchedule = async (id) => {
    try {
      setActionLoadingId(id);
      await whatsappSchedulerService.cancelSchedule(id);
      showToast?.('Agendamento cancelado com sucesso.');
      loadSchedules();
    } catch (err) {
      showToast?.(err.message || 'Erro ao cancelar.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Excluir
  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Deseja realmente excluir este agendamento?')) return;
    try {
      setActionLoadingId(id);
      await whatsappSchedulerService.deleteSchedule(id);
      showToast?.('Agendamento excluído.');
      loadSchedules();
    } catch (err) {
      showToast?.(err.message || 'Erro ao excluir.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Salvar Reunião Tradicional
  const handleSaveMeeting = (e) => {
    e.preventDefault();
    if (!meetingForm.clientName.trim()) {
      showToast?.('Informe o nome do cliente.', 'error');
      return;
    }

    const newMeeting = {
      id: `meet_${Date.now()}`,
      ...meetingForm,
      status: 'PENDING'
    };

    setAppointments((prev) => [newMeeting, ...prev]);
    setIsMeetingModalOpen(false);
    showToast?.('Reunião agendada com sucesso!');
  };

  // Unificação e Filtragem da Lista
  const unifiedItems = useMemo(() => {
    const list = [];

    // Mensagens WhatsApp
    if (filterType === 'ALL' || filterType === 'WHATSAPP') {
      scheduledMessages.forEach((msg) => {
        const itemDateStr = new Date(msg.scheduled_for).toISOString().slice(0, 10);
        const itemTimeStr = new Date(msg.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Filtrar por status se aplicável
        if (filterStatus === 'PENDING' && msg.status !== 'pending' && msg.status !== 'processing') return;
        if (filterStatus === 'SENT' && msg.status !== 'sent') return;
        if (filterStatus === 'FAILED' && msg.status !== 'failed' && msg.status !== 'cancelled') return;

        list.push({
          id: msg.id,
          rawItem: msg,
          category: 'whatsapp',
          date: itemDateStr,
          time: itemTimeStr,
          title: msg.message_type === 'audio_ai' 
            ? 'Mensagem de Áudio IA' 
            : msg.message_type === 'audio_record' 
            ? 'Áudio de Voz Gravado' 
            : msg.message_type === 'image' 
            ? 'Imagem com Legenda' 
            : msg.message_type === 'document'
            ? 'Documento Anexo'
            : 'Mensagem de Texto',
          clientName: msg.lead_name,
          clientPhone: msg.lead_phone,
          status: msg.status,
          messageType: msg.message_type,
          content: msg.content_text,
          mediaUrl: msg.media_url,
          error: msg.error_message
        });
      });
    }

    // Reuniões
    if (filterType === 'ALL' || filterType === 'MEETINGS') {
      appointments.forEach((app) => {
        if (filterStatus === 'PENDING' && app.status !== 'PENDING') return;
        if (filterStatus === 'SENT' && app.status !== 'DONE') return;
        if (filterStatus === 'FAILED') return; // Reuniões não têm status falha

        list.push({
          id: app.id,
          rawItem: app,
          category: 'meeting',
          date: app.date,
          time: app.time,
          title: app.title,
          clientName: app.clientName,
          clientPhone: app.clientPhone,
          status: app.status === 'DONE' ? 'sent' : 'pending',
          meetingType: app.type,
          notes: app.notes
        });
      });
    }

    // Ordenar por data/hora
    return list.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
  }, [scheduledMessages, appointments, filterType, filterStatus]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b ${
        isDarkMode ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div>
          <h1 className={`text-xl font-bold flex items-center gap-2.5 ${
            isDarkMode ? 'text-slate-100' : 'text-slate-900'
          }`}>
            <div className={`p-2 rounded-xl border ${
              isDarkMode 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              <MessageSquare size={20} />
            </div>
            <span>Agendador Inteligente & Sessões</span>
          </h1>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Programação autônoma de mensagens WhatsApp, áudios com IA e reuniões com leads
          </p>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMeetingModalOpen(true)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-semibold border transition-all ${
              isDarkMode 
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
          >
            <CalendarIcon size={15} />
            <span>Nova Reunião</span>
          </button>

          <button
            onClick={() => setIsWaModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md shadow-emerald-500/20"
          >
            <Plus size={16} />
            <span>Agendar WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Grid: Calendário Mensal | Lista de Sessões */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna 1: Calendário Interativo */}
        <div className={`lg:col-span-5 p-5 rounded-3xl border transition-all ${
          isDarkMode 
            ? 'border-slate-800 bg-slate-900/60' 
            : 'border-slate-200/90 bg-white shadow-xs'
        } space-y-4`}>
          <div className={`flex items-center justify-between pb-3 border-b ${
            isDarkMode ? 'border-slate-800' : 'border-slate-100'
          }`}>
            <h2 className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className={`p-1.5 rounded-xl border transition-colors ${
                  isDarkMode 
                    ? 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200' 
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleNextMonth}
                className={`p-1.5 rounded-xl border transition-colors ${
                  isDarkMode 
                    ? 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200' 
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Dias da Semana */}
          <div className={`grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase ${
            isDarkMode ? 'text-slate-500' : 'text-slate-400'
          }`}>
            <span>Dom</span>
            <span>Seg</span>
            <span>Ter</span>
            <span>Qua</span>
            <span>Qui</span>
            <span>Sex</span>
            <span>Sáb</span>
          </div>

          {/* Grid dos Dias */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((item, idx) => {
              if (!item.day) {
                return <div key={`empty_${idx}`} className="h-9" />;
              }

              const isSelected = selectedDate === item.dateStr;
              const isToday = new Date().toISOString().slice(0, 10) === item.dateStr;

              return (
                <button
                  key={item.dateStr}
                  onClick={() => setSelectedDate(item.dateStr)}
                  className={`h-9 rounded-xl flex flex-col items-center justify-center text-xs font-semibold relative transition-all ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : isToday
                      ? (isDarkMode ? 'border border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border border-emerald-400 text-emerald-600 bg-emerald-50 font-bold')
                      : (isDarkMode ? 'text-slate-300 hover:bg-slate-800/60' : 'text-slate-700 hover:bg-slate-100')
                  }`}
                >
                  <span>{item.day}</span>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {item.hasWa && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500'}`} />
                    )}
                    {item.hasMeeting && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className={`pt-3 border-t flex flex-wrap items-center justify-between text-[11px] gap-2 ${
            isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'
          }`}>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> WhatsApp
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Reunião
            </span>
            <button
              onClick={loadSchedules}
              className="flex items-center gap-1 hover:text-emerald-400 transition-colors ml-auto"
              title="Recarregar agendamentos"
            >
              <RefreshCw size={12} className={isLoadingSchedules ? 'animate-spin' : ''} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Coluna 2: Lista de Agendamentos e Compromissos */}
        <div className={`lg:col-span-7 p-6 rounded-3xl border transition-all ${
          isDarkMode 
            ? 'border-slate-800 bg-slate-900/60' 
            : 'border-slate-200/90 bg-white shadow-xs'
        } space-y-4`}>
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
            isDarkMode ? 'border-slate-800' : 'border-slate-100'
          }`}>
            <div>
              <h2 className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                Programação & Compromissos
              </h2>
              <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {unifiedItems.length} item(ns) encontrado(s)
              </p>
            </div>

            {/* Filtros de Tipo e Status */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border outline-none ${
                  isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <option value="ALL">Todos os Tipos</option>
                <option value="WHATSAPP">💬 Apenas WhatsApp</option>
                <option value="MEETINGS">📅 Apenas Reuniões</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border outline-none ${
                  isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <option value="ALL">Todos Status</option>
                <option value="PENDING">Pendentes</option>
                <option value="SENT">Enviados / Concluídos</option>
                <option value="FAILED">Falhas / Cancelados</option>
              </select>
            </div>
          </div>

          {/* Cards de Agendamentos */}
          <div className="space-y-3 max-h-[30rem] overflow-y-auto pr-1">
            {isLoadingSchedules ? (
              <div className="py-16 text-center text-xs flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 size={20} className="animate-spin text-emerald-500" />
                <span>Carregando agendamentos...</span>
              </div>
            ) : unifiedItems.length === 0 ? (
              <div className={`py-16 text-center text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Nenhum agendamento encontrado para este filtro.
              </div>
            ) : (
              unifiedItems.map((item) => {
                const isWa = item.category === 'whatsapp';
                const isPending = item.status === 'pending' || item.status === 'processing';
                const isSent = item.status === 'sent';
                const isFailed = item.status === 'failed' || item.status === 'cancelled';
                const isLoading = actionLoadingId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border space-y-3 transition-colors ${
                      isDarkMode 
                        ? 'bg-slate-950 border-slate-800 hover:border-slate-700' 
                        : 'bg-slate-50/80 border-slate-200/80 hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Badge de Categoria */}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                            isWa 
                              ? (isDarkMode ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                              : (isDarkMode ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200')
                          }`}>
                            {isWa ? <MessageSquare size={10} /> : <CalendarIcon size={10} />}
                            <span>{item.title}</span>
                          </span>

                          {/* Data e Hora */}
                          <span className={`text-[10px] flex items-center gap-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            <Clock size={11} /> {item.date} às {item.time}
                          </span>

                          {/* Status Badge */}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase ${
                            isSent 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : isPending
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {item.status === 'processing' ? 'Disparando...' : item.status}
                          </span>
                        </div>

                        {/* Dados do Lead */}
                        <p className={`text-xs flex items-center gap-1.5 font-bold pt-1 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          <User size={12} className={isDarkMode ? 'text-slate-400' : 'text-slate-500'} />
                          <span>{item.clientName}</span>
                          <span className="font-normal text-slate-400">({item.clientPhone})</span>
                        </p>

                        {/* Conteúdo / Mensagem */}
                        {item.content && (
                          <p className={`text-[11px] p-2 rounded-xl border line-clamp-2 ${
                            isDarkMode ? 'bg-slate-900/60 border-slate-900 text-slate-300' : 'bg-white border-slate-200 text-slate-600'
                          }`}>
                            "{item.content}"
                          </p>
                        )}

                        {/* Mensagem de Erro se falhou */}
                        {item.error && (
                          <p className="text-[10px] text-red-400 flex items-center gap-1">
                            <AlertCircle size={11} /> Motivo da falha: {item.error}
                          </p>
                        )}
                      </div>

                      {/* Ações */}
                      {isWa && (
                        <div className="flex items-center gap-1">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleSendNow(item.id)}
                                disabled={isLoading}
                                className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs"
                                title="Disparar agora antecipadamente"
                              >
                                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                              </button>

                              <button
                                onClick={() => handleCancelSchedule(item.id)}
                                disabled={isLoading}
                                className="p-2 rounded-xl border hover:bg-amber-500/10 hover:text-amber-400 transition-all text-slate-400 border-slate-800"
                                title="Cancelar agendamento"
                              >
                                <Ban size={14} />
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => handleDeleteSchedule(item.id)}
                            disabled={isLoading}
                            className="p-2 rounded-xl border hover:bg-red-500/10 hover:text-red-400 transition-all text-slate-400 border-slate-800"
                            title="Excluir agendamento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal de Agendamento do WhatsApp */}
      <NovoAgendamentoModal
        isOpen={isWaModalOpen}
        onClose={() => setIsWaModalOpen(false)}
        defaultDate={selectedDate}
        onCreated={loadSchedules}
      />

      {/* Modal de Reunião Tradicional */}
      {isMeetingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden p-6 space-y-4 ${
            isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <CalendarIcon size={16} className="text-blue-500" />
                <span>Nova Reunião / Sessão</span>
              </h2>
              <button onClick={() => setIsMeetingModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveMeeting} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400">Nome do Cliente *</label>
                <input
                  type="text"
                  required
                  value={meetingForm.clientName}
                  onChange={(e) => setMeetingForm({ ...meetingForm, clientName: e.target.value })}
                  className={`w-full px-3 py-2 mt-1 rounded-xl text-xs border outline-none ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400">Telefone</label>
                <input
                  type="text"
                  value={meetingForm.clientPhone}
                  onChange={(e) => setMeetingForm({ ...meetingForm, clientPhone: e.target.value })}
                  className={`w-full px-3 py-2 mt-1 rounded-xl text-xs border outline-none ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400">Data</label>
                  <input
                    type="date"
                    required
                    value={meetingForm.date}
                    onChange={(e) => setMeetingForm({ ...meetingForm, date: e.target.value })}
                    className={`w-full px-3 py-2 mt-1 rounded-xl text-xs border outline-none ${
                      isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400">Horário</label>
                  <input
                    type="time"
                    required
                    value={meetingForm.time}
                    onChange={(e) => setMeetingForm({ ...meetingForm, time: e.target.value })}
                    className={`w-full px-3 py-2 mt-1 rounded-xl text-xs border outline-none ${
                      isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMeetingModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs bg-blue-600 font-bold text-white shadow-xs"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
