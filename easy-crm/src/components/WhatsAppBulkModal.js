import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import ReportModal from './ReportModal';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView, ActivityIndicator, Image, Animated } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

let globalIsSending = false;
let globalIsPaused = false;
let globalCancelRequested = false;
let globalLogs = [];
let globalProgressText = '';
let globalStats = { success: 0, error: 0, total: 0, startTime: null, messageSummary: '' };
let onLeadUpdateCallback = null;

export const setLeadUpdateCallback = (callback) => {
  onLeadUpdateCallback = callback;
};

const CheckBox = ({ label, value, onValueChange, isDarkMode }) => (
  <TouchableOpacity style={styles.checkboxContainer} onPress={() => onValueChange(!value)}>
    <View style={[styles.checkbox, isDarkMode && darkStyles.checkbox, value && styles.checkboxChecked]}>
      {value && <Text style={styles.checkmark}>✓</Text>}
    </View>
    <Text style={[styles.checkboxLabel, isDarkMode && darkStyles.checkboxLabel]}>{label}</Text>
  </TouchableOpacity>
);

export default function WhatsAppBulkModal({ visible, onClose, boardData, onComplete, isDarkMode }) {
  const hasTransitioned = useRef(false);
  const [connectionStage, setConnectionStage] = useState('connecting');
  const [botNumber, setBotNumber] = useState('');  
  const [selectedPhaseId, setSelectedPhaseId] = useState('all');
  const [selectedTag, setSelectedTag] = useState('all');

  const [messageItems, setMessageItems] = useState([]);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const [isBotConnected, setIsBotConnected] = useState(false);
  const [qrCodeImage, setQrCodeImage] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [activeTab, setActiveTab] = useState('disparar');
  const [selectedReport, setSelectedReport] = useState(null);
  
  const [isSending, setIsSending] = useState(globalIsSending);
  const [isPaused, setIsPaused] = useState(globalIsPaused);
  const [logs, setLogs] = useState(globalLogs);
  const [progressText, setProgressText] = useState(globalProgressText);
  const [historicoList, setHistoricoList] = useState([]);

  const [isAlertModalVisible, setIsAlertModalVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertActionType, setAlertActionType] = useState(null);

  // Estados de Timeout / Auto-Recovery UI
  const [showReconnectBtn, setShowReconnectBtn] = useState(false);

  // Animação do Modal
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const showAlert = (title, message, actionType = 'info') => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertActionType(actionType);
    setIsAlertModalVisible(true);
  };

  const handleAlertConfirm = () => {
    if (alertActionType === 'cancel_send') {
      globalCancelRequested = true;
      globalIsPaused = false;
      globalIsSending = false;
      setIsSending(false);
      setIsPaused(false);
      setProgressText('❌ Disparos Cancelados');
    } else if (alertActionType === 'disconnect') {
      executeDisconnect();
    }
    setIsAlertModalVisible(false);
  };

  useEffect(() => {
    let interval;
    if (visible) {
      // Ativa animação Zoom In
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' })
      ]).start();

      setConnectionStage('connecting');
      hasTransitioned.current = false; 
      checkBotStatus();
      fetchHistorico();
      interval = setInterval(checkBotStatus, 1500);
      
      setIsSending(globalIsSending);
      setIsPaused(globalIsPaused);
      setLogs(globalLogs);
      setProgressText(globalProgressText);
    } else {
      // Reseta estado da animação
      scaleAnim.setValue(0.8);
      fadeAnim.setValue(0);
      setQrCodeImage(null);
    }
    return () => clearInterval(interval);
  }, [visible]);

  // Lógica do Temporizador de 60s para mostrar botão "Reconectar"
  useEffect(() => {
    let timeoutId;
    setShowReconnectBtn(false);

    if (visible && ['connecting', 'authenticating', 'loading'].includes(connectionStage)) {
      timeoutId = setTimeout(() => {
        setShowReconnectBtn(true);
      }, 60000); // 60 segundos
    }

    return () => clearTimeout(timeoutId);
  }, [connectionStage, visible]);

  const prevBoardId = useRef(boardData?.id);

  useEffect(() => {
    if (prevBoardId.current && boardData?.id && prevBoardId.current !== boardData.id) {
      globalIsSending = false;
      globalIsPaused = false;
      globalCancelRequested = false;
      globalLogs = [];
      globalProgressText = '';
      
      setIsSending(false);
      setIsPaused(false);
      setLogs([]);
      setProgressText('');
    }
    prevBoardId.current = boardData?.id;
  }, [boardData?.id]);

  const handleAnimatedClose = () => {
    if (!globalIsSending && globalLogs.length > 0) {
      globalLogs = [];
      globalProgressText = '';
      setLogs([]);
      setProgressText('');
    }
    
    // Ativa animação Zoom Out antes de fechar
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' })
    ]).start(() => {
      onClose();
    });
  };

  const checkBotStatus = async () => {
    try {
      const response = await fetch('http://localhost:3001/status');
      const data = await response.json();

      if (data.connected && data.status === 'READY') {
        setIsBotConnected(true);
        if (data.number) setBotNumber(data.number);

        if (!hasTransitioned.current || connectionStage !== 'ready') {
          hasTransitioned.current = true;
          setConnectionStage('ready');
        }
      } else {
        setIsBotConnected(false);
        
        if (data.status === 'AUTHENTICATING') {
          hasTransitioned.current = false;
          setConnectionStage('authenticating');
        } else if (data.status === 'LOADING') {
          hasTransitioned.current = false;
          setConnectionStage('loading');
        } else if (data.status === 'QR_CODE' && data.qrCode) {
          hasTransitioned.current = false;
          setConnectionStage('qr_code');
          setQrCodeImage(data.qrCode);
        } else if (data.status === 'INITIALIZING') {
          setConnectionStage('connecting');
        } else {
          setQrCodeImage(null);
          setConnectionStage(prev => prev === 'disconnecting' ? 'disconnecting' : 'connecting');
        }
      }
    } catch (error) {
      setIsBotConnected(false);
      setConnectionStage(prev => prev === 'disconnecting' ? 'disconnecting' : 'connecting');
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchHistorico = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('disparos_historico')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: false });

      if (error) throw error;
      if (data) setHistoricoList(data);
    } catch (e) {
      console.log('Erro ao buscar histórico do Supabase:', e.message);
    }
  };

  const handleAddItem = (type) => {
    setShowAddMenu(false);
    const newItem = {
      id: Date.now() + Math.random(),
      type, 
      content: type === 'text' ? 'Olá {nome}, tudo bem?' : '',
      caption: '',
      file: null,
      isVariation: false
    };
    setMessageItems([...messageItems, newItem]);
  };

  const handleRemoveItem = (id) => {
    setMessageItems(messageItems.filter(item => item.id !== id));
  };

  const handleUpdateItem = (id, field, value) => {
    setMessageItems(messageItems.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handlePickFileForItem = async (id, allowedTypes) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: allowedTypes,
        copyToCacheDirectory: true
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onloadend = () => {
        const fileObj = {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || 'application/octet-stream',
          base64: reader.result
        };
        handleUpdateItem(id, 'file', fileObj);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      showAlert('Erro', 'Não foi possível carregar o arquivo selecionado.');
    }
  };

  const handleStartBulkSend = async () => {
    const fixedItems = [];
    const varItems = [];

    for (const item of messageItems) {
      if (item.type === 'text') {
        if (!item.content.trim()) continue;
        const formattedItem = { type: 'text', text: item.content };
        item.isVariation ? varItems.push(formattedItem) : fixedItems.push(formattedItem);
      } else if (item.type === 'image') {
        if (!item.file) continue;
        const formattedItem = { type: 'image', file: item.file, caption: item.caption };
        item.isVariation ? varItems.push(formattedItem) : fixedItems.push(formattedItem);
      } else if (item.type === 'video') {
        if (!item.file) continue;
        const formattedItem = { type: 'video', file: item.file, caption: item.caption };
        item.isVariation ? varItems.push(formattedItem) : fixedItems.push(formattedItem);
      } else if (item.type === 'audio') {
        if (!item.file) continue;
        const formattedItem = { type: 'audio', file: item.file };
        item.isVariation ? varItems.push(formattedItem) : fixedItems.push(formattedItem);
      }
    }

    if (fixedItems.length === 0 && varItems.length === 0) {
      showAlert('Atenção', 'Adicione e configure pelo menos uma mensagem, imagem, vídeo ou áudio.');
      return;
    }

    let leadsToMessage = [];
    if (selectedPhaseId === 'all') {
      boardData.phases.forEach(phase => {
        if (phase.clients) leadsToMessage = [...leadsToMessage, ...phase.clients];
      });
    } else {
      const phase = boardData.phases.find(p => p.id === selectedPhaseId);
      if (phase && phase.clients) leadsToMessage = [...phase.clients];
    }

    if (selectedTag !== 'all') {
      const tagLower = selectedTag.toLowerCase().trim();
      leadsToMessage = leadsToMessage.filter(lead => {
        const source = lead.interest?.source ? String(lead.interest.source).toLowerCase() : '';
        const category = lead.interest?.category ? String(lead.interest.category).toLowerCase() : '';
        const directCategory = lead.category ? String(lead.category).toLowerCase() : '';
        const rawTags = lead.tags ? String(lead.tags).toLowerCase() : '';
        const rawOrigin = lead.origin ? String(lead.origin).toLowerCase() : '';
        const rawPlatform = lead.platform ? String(lead.platform).toLowerCase() : '';
        const rawInterest = lead.interesse ? String(lead.interesse).toLowerCase() : '';

        return (
          source.includes(tagLower) || category.includes(tagLower) || directCategory.includes(tagLower) ||
          rawTags.includes(tagLower) || rawOrigin.includes(tagLower) || rawPlatform.includes(tagLower) || rawInterest.includes(tagLower)
        );
      });
    }

    const validLeads = leadsToMessage.filter(lead => lead.phone && lead.phone.replace(/\D/g, '').length >= 10);

    if (validLeads.length === 0) {
      showAlert('Atenção', 'Nenhum lead encontrado com os filtros selecionados e telefone válido.');
      return;
    }

    // ==========================================
    // LÓGICA DE GERAÇÃO DO RESUMO DE INFORMAÇÕES
    // ==========================================
    const allItemsToSend = [...fixedItems, ...varItems];
    const uniqueTypes = [...new Set(allItemsToSend.map(i => i.type))];
    
    let typeLabels = [];
    if (uniqueTypes.includes('image')) typeLabels.push('Imagem');
    if (uniqueTypes.includes('video')) typeLabels.push('Vídeo');
    if (uniqueTypes.includes('text')) typeLabels.push('Texto');
    if (uniqueTypes.includes('audio')) typeLabels.push('Áudio');
    
    let summaryPrefix = typeLabels.join(' + ');
    let textSnippet = '';
    
    const firstTextItem = allItemsToSend.find(i => i.type === 'text');
    if (firstTextItem) {
      let cleanText = firstTextItem.text.replace(/\n/g, ' ').trim();
      textSnippet = cleanText.length > 60 ? cleanText.substring(0, 60) + '...' : cleanText;
    } else {
      const firstMedia = allItemsToSend.find(i => (i.type === 'image' || i.type === 'video') && i.caption);
      if (firstMedia) {
        let cleanCap = firstMedia.caption.replace(/\n/g, ' ').trim();
        textSnippet = cleanCap.length > 60 ? cleanCap.substring(0, 60) + '...' : cleanCap;
      }
    }
    
    let finalMessageSummary = summaryPrefix;
    if (textSnippet) {
      finalMessageSummary += ` (${textSnippet})`;
    }
    if (!finalMessageSummary) finalMessageSummary = 'Disparo configurado';

    globalIsSending = true;
    globalIsPaused = false;
    globalCancelRequested = false;
    setIsSending(true);
    setIsPaused(false);
    
    globalLogs = [];
    setLogs([]);

    globalStats = {
      success: 0,
      error: 0,
      total: validLeads.length,
      startTime: new Date(),
      messageSummary: finalMessageSummary
    };

    let dbBoardId = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userBoards } = await supabase
          .from('crm_boards')
          .select('id')
          .eq('user_id', user.id)
          .ilike('id', 'board_%')
          .order('id', { ascending: false })
          .limit(1);

        if (userBoards && userBoards.length > 0) {
          dbBoardId = userBoards[0].id;
        }
      }
    } catch (err) {
      console.error('Erro ao identificar o ID correto do board:', err);
    }

    for (let i = 0; i < validLeads.length; i++) {
      if (globalCancelRequested) break;

      while (globalIsPaused && !globalCancelRequested) {
        globalProgressText = '⏸️ Disparos Pausados pelo Usuário';
        setProgressText('⏸️ Disparos Pausados pelo Usuário');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (globalCancelRequested) break;

      const lead = validLeads[i];
      const currentProgress = `Enviando ${i + 1} de ${validLeads.length}...`;
      globalProgressText = currentProgress;
      setProgressText(currentProgress);

      const leadItems = [...fixedItems];
      if (varItems.length > 0) {
        leadItems.push(varItems[i % varItems.length]);
      }

      let leadSuccess = true;
      let leadErrorMsg = '';
      let sentDescriptions = [];

      for (const item of leadItems) {
        if (globalCancelRequested) break;

        let formData = new FormData();
        formData.append('phone', lead.phone);
        formData.append('name', lead.name);

        if (item.type === 'text') {
          formData.append('messageTemplate', item.text);
        } else if (item.type === 'image' || item.type === 'video') {
          formData.append('messageTemplate', item.caption || '');
          const responseBlob = await fetch(item.file.uri);
          const blobData = await responseBlob.blob();
          formData.append('file', blobData, item.file.name);
        } else if (item.type === 'audio') {
          formData.append('messageTemplate', '');
          const responseBlob = await fetch(item.file.uri);
          const blobData = await responseBlob.blob();
          formData.append('file', blobData, item.file.name);
        }

        try {
          const response = await fetch('http://localhost:3001/disparar-unico', {
            method: 'POST',
            body: formData
          });
          const result = await response.json();

          if (result.success) {
            let desc = 'Desconhecido';
            if (item.type === 'text') desc = 'Texto';
            else if (item.type === 'image') desc = 'Imagem';
            else if (item.type === 'video') desc = 'Vídeo';
            else if (item.type === 'audio') desc = 'Áudio';
            sentDescriptions.push(desc);
          } else {
            leadSuccess = false;
            leadErrorMsg = result.reason;
            break;
          }
        } catch (err) {
          leadSuccess = false;
          leadErrorMsg = 'Erro de conexão com o servidor';
          break;
        }
      }

      let newLogItem;
      const summaryDesc = sentDescriptions.join(' + ');

      if (leadSuccess) {
        globalStats.success++;
        newLogItem = { status: 'success', text: `✅ Enviado para ${lead.name} (${summaryDesc})` };

        const zapComment = { 
          id: `zap_${Date.now()}`, 
          text: `🤖 Robô WhatsApp: Disparo automático realizado com sucesso para o número ${lead.phone}. Itens: ${summaryDesc}`, 
          date: new Date().toISOString() 
        };

        if (onLeadUpdateCallback) {
          onLeadUpdateCallback(lead.id, zapComment.text);
        }

        if (dbBoardId) {
          try {
            const { data: freshBoard } = await supabase
              .from('crm_boards')
              .select('id, data_payload')
              .eq('id', dbBoardId)
              .single();

            if (freshBoard && freshBoard.data_payload?.phases) {
              const updatedPhases = freshBoard.data_payload.phases.map(phase => {
                return {
                  ...phase,
                  clients: phase.clients.map(c => {
                    if (String(c.id) === String(lead.id)) {
                      const comments = Array.isArray(c.comments) ? c.comments : [];
                      return { 
                        ...c, 
                        whatsappError: false, 
                        comments: [zapComment, ...comments] 
                      };
                    }
                    return c;
                  })
                };
              });

              await supabase
                .from('crm_boards')
                .update({ data_payload: { ...freshBoard.data_payload, phases: updatedPhases } })
                .eq('id', dbBoardId);
              
              boardData.phases = updatedPhases;
            }
          } catch (dbErr) {
            console.error('Erro ao persistir comentário no banco:', dbErr);
          }
        }
      } else {
        globalStats.error++;
        newLogItem = { status: 'error', text: `❌ Falha para ${lead.name} (${lead.phone}): ${leadErrorMsg}` };

        const failComment = { 
          id: `fail_${Date.now()}`, 
          text: `🔴 Robô WhatsApp: Falha ao enviar itens. Motivo: ${leadErrorMsg}`, 
          date: new Date().toISOString() 
        };

        if (onLeadUpdateCallback) {
          onLeadUpdateCallback(lead.id, failComment.text);
        }

        if (dbBoardId) {
          try {
            let { data: freshBoard } = await supabase
              .from('crm_boards')
              .select('id, data_payload')
              .eq('id', dbBoardId)
              .single();

            if (freshBoard && freshBoard.data_payload?.phases) {
              let updatedPhases = freshBoard.data_payload.phases.map(phase => {
                if (!phase.clients) return phase;
                let clients = phase.clients.map(c => {
                  if (String(c.id) === String(lead.id)) {
                    let comments = Array.isArray(c.comments) ? c.comments : [];
                    return { ...c, whatsappError: true, comments: [failComment, ...comments] };
                  }
                  return c;
                });
                return { ...phase, clients };
              });

              await supabase
                .from('crm_boards')
                .update({ data_payload: { ...freshBoard.data_payload, phases: updatedPhases } })
                .eq('id', dbBoardId);
              
              if (boardData && boardData.phases) {
                boardData.phases = updatedPhases;
              }
            }
          } catch (dbErr) {
            console.error('Erro ao salvar comentário de falha no banco:', dbErr);
          }
        }
      }

      globalLogs = [...globalLogs, newLogItem];
      setLogs([...globalLogs]);

      if (i < validLeads.length - 1 && !globalCancelRequested) {
        const delay = Math.floor(Math.random() * (14000 - 8000 + 1)) + 8000;
        const pauseMsg = `Pausa anti-spam (${Math.round(delay/1000)}s)...`;
        globalProgressText = pauseMsg;
        setProgressText(pauseMsg);
        
        let elapsed = 0;
        while (elapsed < delay && !globalCancelRequested) {
          if (!globalIsPaused) elapsed += 1000;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    const endTime = new Date();
    const finalStatusText = globalCancelRequested ? '❌ Disparo Cancelado pelo Usuário' : '🎉 Disparo em Massa Concluído!';
    
    globalProgressText = finalStatusText;
    setProgressText(finalStatusText);

    const leadsComStatus = validLeads.map(l => {
      const logDoLead = globalLogs.find(log => log.text.includes(l.name) || log.text.includes(l.phone));
      const deuErro = logDoLead && logDoLead.status === 'error';
      return { name: l.name, phone: l.phone, status: deuErro ? 'Falha' : 'Sucesso' };
    });

    const historicoDetalhado = {
      fase: selectedPhaseId === 'all' ? 'Todas as Fases' : (boardData.phases.find(p => p.id === selectedPhaseId)?.title || selectedPhaseId),
      tag: selectedTag === 'all' ? 'Todas as Tags / Origens' : selectedTag,
      leads: leadsComStatus,
      hasVariations: varItems.length > 0,
      items: allItemsToSend // Itens detalhados bloco a bloco para o relatório
    };

    const { data: { user } } = await supabase.auth.getUser();

    const novoHistorico = {
      user_id: user?.id,
      status: globalCancelRequested ? 'Cancelado' : 'Concluído',
      inicio: globalStats.startTime ? globalStats.startTime.toLocaleString() : new Date().toLocaleString(),
      fim: endTime.toLocaleString(),
      total_alvos: parseInt(globalStats.total) || 0,
      enviados: parseInt(globalStats.success + globalStats.error) || 0,
      sucesso: parseInt(globalStats.success) || 0,
      falha: parseInt(globalStats.error) || 0,
      mensagem: globalStats.messageSummary, // Agora fica limpo apenas com o resumo de 2 linhas!
      detalhes_json: historicoDetalhado, // Dados completos salvos na nova coluna dedicada
      whatsapp_numero: botNumber || 'Desconhecido'
    };

    try {
      const { error } = await supabase.from('disparos_historico').insert([novoHistorico]);
      if (error) console.error('Erro ao salvar histórico:', error.message);
      else fetchHistorico();
    } catch (e) {
      console.log('Erro de conexão ao salvar histórico:', e.message);
    }

    globalIsSending = false;
    globalIsPaused = false;
    setIsSending(false);
    setIsPaused(false);

    if (onComplete) onComplete(globalStats);
  };

  const handleTogglePause = () => {
    globalIsPaused = !globalIsPaused;
    setIsPaused(globalIsPaused);
  };

  const handleCancelSend = () => {
    showAlert('Cancelar Disparos', 'Tem certeza que deseja cancelar os disparos permanentemente?', 'cancel_send');
  };

  const executeDisconnect = async () => {
    try {
      setConnectionStage('disconnecting');
      await fetch('http://localhost:3001/desconectar', { method: 'POST' });
      setIsBotConnected(false);
      setQrCodeImage(null);
      
      globalIsSending = false;
      globalIsPaused = false;
      globalCancelRequested = false;
      globalLogs = [];
      globalProgressText = '';
      
      setIsSending(false);
      setIsPaused(false);
      setLogs([]);
      setProgressText('');
    } catch (e) {
      showAlert('Erro', 'Erro ao tentar desconectar.');
    }
  };

  const handleDisconnect = () => {
    showAlert('Desconectar WhatsApp', 'Deseja realmente desconectar o WhatsApp?', 'disconnect');
  };

  if (!visible) return null;

  const optionStyle = isDarkMode ? { backgroundColor: '#1e293b', color: '#f8fafc' } : {};

  // Renderização Dinâmica e Fluída
  const renderContentBox = () => {
    if (loadingStatus) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText]}>Conectando Conta do WhatsApp...</Text>
        </View>
      );
    }

    if (connectionStage === 'connecting') {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText]}>Inicializando servidor interno (Aguarde)...</Text>
          {showReconnectBtn && (
            <View style={styles.reconnectContainer}>
              <TouchableOpacity style={styles.reconnectBtn} onPress={executeDisconnect}>
                <Text style={styles.reconnectBtnText}>Reconectar</Text>
              </TouchableOpacity>
              <Text style={[styles.reconnectHint, isDarkMode && darkStyles.reconnectHint]}>
                Parece que o servidor apresenta instabilidade e necessita de uma reconexão
              </Text>
            </View>
          )}
        </View>
      );
    }

    if (connectionStage === 'authenticating') {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText, {color: '#10b981', fontWeight: 'bold'}]}>Leitura concluída! Autenticando sua conta...</Text>
          {showReconnectBtn && (
            <View style={styles.reconnectContainer}>
              <TouchableOpacity style={styles.reconnectBtn} onPress={executeDisconnect}>
                <Text style={styles.reconnectBtnText}>Reconectar</Text>
              </TouchableOpacity>
              <Text style={[styles.reconnectHint, isDarkMode && darkStyles.reconnectHint]}>
                Parece que o servidor apresenta instabilidade e necessita de uma reconexão
              </Text>
            </View>
          )}
        </View>
      );
    }

    if (connectionStage === 'loading') {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText, {color: '#f59e0b', fontWeight: 'bold'}]}>Baixando mensagens e sincronizando (Pode demorar)...</Text>
          {showReconnectBtn && (
            <View style={styles.reconnectContainer}>
              <TouchableOpacity style={styles.reconnectBtn} onPress={executeDisconnect}>
                <Text style={styles.reconnectBtnText}>Reconectar</Text>
              </TouchableOpacity>
              <Text style={[styles.reconnectHint, isDarkMode && darkStyles.reconnectHint]}>
                Parece que o servidor apresenta instabilidade e necessita de uma reconexão
              </Text>
            </View>
          )}
        </View>
      );
    }

    if (connectionStage === 'disconnecting') {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText]}>Desconectando Conta do WhatsApp...</Text>
        </View>
      );
    }

    if (connectionStage === 'qr_code') {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.statusError}>🔴 WhatsApp Desconectado</Text>
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText, {marginBottom: 30}]}>Abra o WhatsApp no seu celular e leia o QR Code abaixo:</Text>
          
          <View style={styles.qrCodeWrapper}>
            <Image 
              source={{ uri: 'https://omgkvkooitmdqulasdmx.supabase.co/storage/v1/object/public/images/whatsapp1.png' }} 
              style={styles.floatingWaIcon} 
            />
            <View style={styles.qrCodeFrame}>
              {qrCodeImage ? (
                <Image source={{ uri: qrCodeImage }} style={styles.qrCodeImage} />
              ) : (
                <ActivityIndicator color="#16a34a" size="large" />
              )}
            </View>
          </View>
        </View>
      );
    }

    if (activeTab === 'historico') {
      return (
        <ScrollView showsVerticalScrollIndicator={true} style={{height: 450}}>
          <Text style={[styles.label, isDarkMode && darkStyles.label]}>Histórico de Disparos Realizados</Text>
          {historicoList.length === 0 ? (
            <Text style={[styles.emptyText, isDarkMode && darkStyles.emptyText]}>Nenhum disparo registrado ainda.</Text>
          ) : (
            historicoList.map((item) => {
              const getCleanMessage = (fullText) => {
                if (!fullText) return 'Sem mensagem.';
                if (fullText.includes('[DADOS_EXTRA:')) {
                  return fullText.split('[DADOS_EXTRA:')[0].trim();
                }
                return fullText;
              };

              let hasVariations = false;
              if (item.mensagem && item.mensagem.includes('[DADOS_EXTRA:')) {
                try {
                  const extraStart = item.mensagem.indexOf('[DADOS_EXTRA:');
                  const extraEnd = item.mensagem.lastIndexOf(']');
                  const jsonStr = item.mensagem.substring(extraStart + 13, extraEnd);
                  const parsed = JSON.parse(jsonStr);
                  hasVariations = parsed.hasVariations || false;
                } catch(e) {}
              }

              return (
                <TouchableOpacity key={item.id} onPress={() => setSelectedReport(item)} style={[styles.historyCard, isDarkMode && darkStyles.historyCard]}>
                  <View style={styles.historyHeader}>
                    <Text style={[styles.historyStatus, item.status === 'Cancelado' ? {color: '#ef4444'} : {color: '#16a34a'}]}>{item.status}</Text>
                    <Text style={styles.historyDate}>Início: {item.inicio}</Text>
                  </View>
                  <Text style={[styles.historyMsg, isDarkMode && darkStyles.historyMsg]}>
                    <Text style={{fontWeight:'bold'}}>Conta WhatsApp:</Text> +{item.whatsapp_numero || 'N/A'}
                  </Text>
                  <View style={{ marginVertical: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Informações:</Text>
                    <Text style={[styles.historyMsgClean, isDarkMode && darkStyles.historyMsgClean]} numberOfLines={2}>
                      {getCleanMessage(item.mensagem)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.historyDate}><Text style={{fontWeight:'bold'}}>Fim:</Text> {item.fim}</Text>
                    {hasVariations && (
                      <Text style={{fontSize: 10, color: '#64748b', fontStyle: 'italic', textAlign: 'right', flex: 1}}>
                        (mensagens disparadas alternadamente)
                      </Text>
                    )}
                  </View>
                  <View style={[styles.historyStatsRow, isDarkMode && darkStyles.historyStatsRow]}>
                    <Text style={[styles.historyStatItem, isDarkMode && darkStyles.historyStatItem]}>👥 Leads: {item.total_alvos}</Text>
                    <Text style={[styles.historyStatItem, {color: '#16a34a'}]}>✅ Sucesso: {item.sucesso}</Text>
                    <Text style={[styles.historyStatItem, {color: '#ef4444'}]}>❌ Falha: {item.falha}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      );
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContentContainer} style={{height: 450}}>
        {!isSending && logs.length === 0 && (
          <View style={styles.topActionRow}>
            <View style={styles.connectedBadgeInline}>
              <Text style={styles.connectedText}>🟢 WhatsApp Conectado: +{botNumber}</Text>
            </View>
          </View>
        )}

        {!isSending && logs.length === 0 && (
          <>
            <View style={styles.filtersRow}>
              <View style={{flex: 1}}>
                <Text style={[styles.label, isDarkMode && darkStyles.label]}>Coluna (Fase)</Text>
                <View style={[styles.pickerContainer, isDarkMode && darkStyles.pickerContainer]}>
                  <select 
                    style={isDarkMode ? { ...styles.webSelect, ...darkStyles.webSelect } : styles.webSelect} 
                    value={selectedPhaseId} 
                    onChange={(e) => setSelectedPhaseId(e.target.value)}
                  >
                    <option value="all" style={optionStyle}>Todas as Fases</option>
                    {boardData?.phases?.map(phase => (
                      <option key={phase.id} value={phase.id} style={optionStyle}>{phase.title} ({phase.clients?.length || 0})</option>
                    ))}
                  </select>
                </View>
              </View>
              <View style={{flex: 1}}>
                <Text style={[styles.label, isDarkMode && darkStyles.label]}>Origem ou Categoria</Text>
                <View style={[styles.pickerContainer, isDarkMode && darkStyles.pickerContainer]}>
                  <select 
                    style={isDarkMode ? { ...styles.webSelect, ...darkStyles.webSelect } : styles.webSelect} 
                    value={selectedTag} 
                    onChange={(e) => setSelectedTag(e.target.value)}
                  >
                    <option value="all" style={optionStyle}>Todas as Tags / Origens</option>
                    <optgroup label="Origem / Plataforma" style={optionStyle}>
                      <option value="Instagram" style={optionStyle}>Instagram</option>
                      <option value="Facebook" style={optionStyle}>Facebook</option>
                      <option value="TikTok" style={optionStyle}>TikTok</option>
                      <option value="Google" style={optionStyle}>Google</option>
                      <option value="Indicação" style={optionStyle}>Indicação</option>
                    </optgroup>
                    <optgroup label="Categoria / Produto" style={optionStyle}>
                      <option value="Auto" style={optionStyle}>Auto (Veículos)</option>
                      <option value="Imóvel" style={optionStyle}>Imóvel</option>
                      <option value="Serviço" style={optionStyle}>Serviço</option>
                      <option value="Investimento" style={optionStyle}>Investimento</option>
                    </optgroup>
                  </select>
                </View>
              </View>
            </View>

            {messageItems.map((item, index) => (
              <View key={item.id} style={[styles.itemBlock, isDarkMode && darkStyles.itemBlock]}>
                <View style={styles.blockHeader}>
                  <Text style={[styles.label, isDarkMode && darkStyles.label, {marginTop: 0}]}>
                    Item {index + 1}: {item.type === 'text' ? 'Texto' : item.type === 'image' ? 'Imagem' : item.type === 'video' ? 'Vídeo' : 'Áudio'}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveItem(item.id)}>
                    <Text style={styles.removeText}>Remover</Text>
                  </TouchableOpacity>
                </View>

                {item.type === 'text' && (
                  <>
                    <TextInput
                      style={[styles.textAreaLarge, isDarkMode && darkStyles.textAreaLarge]}
                      multiline
                      numberOfLines={3}
                      value={item.content}
                      onChangeText={(val) => handleUpdateItem(item.id, 'content', val)}
                      placeholder="Digite a mensagem aqui... Use {nome} para personalizar."
                      placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                    />
                    <CheckBox label="Esta mensagem é uma variação (alternar no disparo)" value={item.isVariation} onValueChange={(val) => handleUpdateItem(item.id, 'isVariation', val)} isDarkMode={isDarkMode} />
                  </>
                )}

                {item.type === 'image' && (
                  <>
                    <TouchableOpacity style={[styles.mediaPickerBtn, isDarkMode && darkStyles.mediaPickerBtn]} onPress={() => handlePickFileForItem(item.id, ['image/*'])}>
                      <Text style={[styles.mediaPickerBtnText, isDarkMode && darkStyles.mediaPickerBtnText]}>🖼️ {item.file ? 'Trocar Imagem' : 'Selecionar Imagem'}</Text>
                    </TouchableOpacity>
                    {item.file && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.selectedFileText}>Arquivo: {item.file.name}</Text>
                        <TextInput style={[styles.textAreaLarge, isDarkMode && darkStyles.textAreaLarge, { minHeight: 45, marginTop: 6 }]} value={item.caption} onChangeText={(val) => handleUpdateItem(item.id, 'caption', val)} placeholder="Legenda da imagem (opcional)..." placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} />
                      </View>
                    )}
                    <CheckBox label="Esta imagem é uma variação (alternar no disparo)" value={item.isVariation} onValueChange={(val) => handleUpdateItem(item.id, 'isVariation', val)} isDarkMode={isDarkMode} />
                  </>
                )}

                {item.type === 'video' && (
                  <>
                    <TouchableOpacity style={[styles.mediaPickerBtn, isDarkMode && darkStyles.mediaPickerBtn]} onPress={() => handlePickFileForItem(item.id, ['video/*'])}>
                      <Text style={[styles.mediaPickerBtnText, isDarkMode && darkStyles.mediaPickerBtnText]}>🎥 {item.file ? 'Trocar Vídeo' : 'Selecionar Vídeo'}</Text>
                    </TouchableOpacity>
                    {item.file && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.selectedFileText}>Arquivo: {item.file.name}</Text>
                        <TextInput style={[styles.textAreaLarge, isDarkMode && darkStyles.textAreaLarge, { minHeight: 45, marginTop: 6 }]} value={item.caption} onChangeText={(val) => handleUpdateItem(item.id, 'caption', val)} placeholder="Legenda do vídeo (opcional)..." placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} />
                      </View>
                    )}
                    <CheckBox label="Este vídeo é uma variação (alternar no disparo)" value={item.isVariation} onValueChange={(val) => handleUpdateItem(item.id, 'isVariation', val)} isDarkMode={isDarkMode} />
                  </>
                )}

                {item.type === 'audio' && (
                  <>
                    <TouchableOpacity style={[styles.mediaPickerBtn, isDarkMode && darkStyles.mediaPickerBtn]} onPress={() => handlePickFileForItem(item.id, ['audio/*'])}>
                      <Text style={[styles.mediaPickerBtnText, isDarkMode && darkStyles.mediaPickerBtnText]}>🎵 {item.file ? 'Trocar Áudio' : 'Selecionar Arquivo de Áudio'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.audioFormatHint}>Formatos aceitos: MP3, WAV, OGG</Text>
                    {item.file && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.selectedFileText}>Áudio: {item.file.name}</Text>
                      </View>
                    )}
                    <CheckBox label="Este áudio é uma variação (alternar no disparo)" value={item.isVariation} onValueChange={(val) => handleUpdateItem(item.id, 'isVariation', val)} isDarkMode={isDarkMode} />
                  </>
                )}
              </View>
            ))}

            <View style={{ marginVertical: 12, position: 'relative' }}>
              {!showAddMenu ? (
                <TouchableOpacity onPress={() => setShowAddMenu(true)} style={[styles.addBtn, isDarkMode && darkStyles.addBtn]}>
                  <Text style={styles.addBtnText}>+ Adicionar Mensagem</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.floatingMenu, isDarkMode && darkStyles.floatingMenu]}>
                  <Text style={[styles.menuTitle, isDarkMode && darkStyles.menuTitle]}>Selecione o tipo de item:</Text>
                  <TouchableOpacity style={[styles.menuItem, isDarkMode && darkStyles.menuItem]} onPress={() => handleAddItem('text')}><Text style={[styles.menuItemText, isDarkMode && darkStyles.menuItemText]}>📝 Texto</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.menuItem, isDarkMode && darkStyles.menuItem]} onPress={() => handleAddItem('image')}><Text style={[styles.menuItemText, isDarkMode && darkStyles.menuItemText]}>🖼️ Imagem</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.menuItem, isDarkMode && darkStyles.menuItem]} onPress={() => handleAddItem('video')}><Text style={[styles.menuItemText, isDarkMode && darkStyles.menuItemText]}>🎥 Vídeo</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.menuItem, isDarkMode && darkStyles.menuItem]} onPress={() => handleAddItem('audio')}><Text style={[styles.menuItemText, isDarkMode && darkStyles.menuItemText]}>🎵 Áudio</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0, backgroundColor: isDarkMode ? '#334155' : '#f1f5f9' }]} onPress={() => setShowAddMenu(false)}>
                    <Text style={[styles.menuItemText, { color: '#ef4444', textAlign: 'center' }]}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        )}

        {(isSending || logs.length > 0) && (
          <View style={styles.logWrapper}>
            <View style={styles.logHeaderBar}>
              <Text style={styles.progressLabel}>{progressText}</Text>
              {isSending && !isPaused && <ActivityIndicator size="small" color="#2563eb" />}
            </View>
            <ScrollView style={styles.logContainer} nestedScrollEnabled={true}>
              {logs.map((log, index) => (
                <Text key={index} style={[styles.logItem, log.status === 'error' ? styles.logError : styles.logSuccess]}>{log.text}</Text>
              ))}
            </ScrollView>
            {isSending && (
              <View style={styles.controlButtonsRow}>
                <TouchableOpacity style={[styles.controlBtn, isPaused ? styles.btnResume : styles.btnPause]} onPress={handleTogglePause}>
                  <Text style={styles.controlBtnText}>{isPaused ? 'Continuar Disparos' : 'Pausar Disparos'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnCancel} onPress={handleCancelSend}>
                  <Text style={styles.controlBtnText}>Cancelar Disparos</Text>
                </TouchableOpacity>
              </View>
            )}
            {!isSending && (
              <TouchableOpacity style={[styles.primaryButton, { marginTop: 16, marginBottom: 20 }]} onPress={() => { globalLogs = []; setLogs([]); }}>
                <Text style={styles.primaryButtonText}>Fazer Novo Disparo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={handleAnimatedClose}>
      <View style={styles.overlay}>
        <Animated.View style={[
          styles.modalContainer, 
          isDarkMode && darkStyles.modalContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }]
          }
        ]}>
          
          <View style={styles.header}>
            <Text style={[styles.title, isDarkMode && darkStyles.title]}>Disparo de Mensagens</Text>
            <View style={styles.headerRightActions}>
              {isBotConnected && (
                <View style={styles.connectedAccountInfo}>
                  {!isSending && logs.length === 0 && activeTab === 'disparar' && (
                    <TouchableOpacity style={styles.startTopBtn} onPress={handleStartBulkSend}>
                      <Text style={styles.startTopBtnText}>Iniciar Disparo</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.disconnectTopBtn} onPress={handleDisconnect}>
                    <Text style={styles.disconnectTopBtnText}>Desconectar</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity onPress={handleAnimatedClose} style={styles.closeButton}>
                <Text style={[styles.closeButtonText, isDarkMode && darkStyles.closeButtonText]}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isBotConnected && (
            <View style={[styles.tabsRow, isDarkMode && darkStyles.tabsRow]}>
              <TouchableOpacity style={[styles.tabBtn, activeTab === 'disparar' && (isDarkMode ? darkStyles.tabBtnActive : styles.tabBtnActive)]} onPress={() => setActiveTab('disparar')}>
                <Text style={[styles.tabText, isDarkMode && darkStyles.tabText, activeTab === 'disparar' && styles.tabTextActive]}>Central de Disparos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tabBtn, activeTab === 'historico' && (isDarkMode ? darkStyles.tabBtnActive : styles.tabBtnActive)]} onPress={() => { setActiveTab('historico'); fetchHistorico(); }}>
                <Text style={[styles.tabText, isDarkMode && darkStyles.tabText, activeTab === 'historico' && styles.tabTextActive]}>Histórico</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.fixedContentBox}>
            {renderContentBox()}
          </View>
        </Animated.View>
      </View>

      <Modal animationType="fade" transparent={true} visible={isAlertModalVisible} onRequestClose={() => setIsAlertModalVisible(false)}>
        <View style={styles.alertOverlay}>
          <View style={[styles.alertContent, isDarkMode && darkStyles.alertContent]}>
            <Text style={[styles.alertTitle, isDarkMode && darkStyles.alertTitle]}>{alertTitle}</Text>
            <Text style={[styles.alertSubtitle, isDarkMode && darkStyles.alertSubtitle]}>{alertMessage}</Text>
            <View style={styles.alertButtonsRow}>
              {alertActionType !== 'info' ? (
                <>
                  <TouchableOpacity style={[styles.alertBtn, styles.alertCancelBtn, isDarkMode && darkStyles.alertCancelBtn]} onPress={() => setIsAlertModalVisible(false)}>
                    <Text style={[styles.alertCancelBtnText, isDarkMode && darkStyles.alertCancelBtnText]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.alertBtn, styles.alertConfirmBtn]} onPress={handleAlertConfirm}>
                    <Text style={styles.alertConfirmBtnText}>Confirmar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={[styles.alertBtn, styles.alertConfirmBtn, { width: '100%' }]} onPress={() => setIsAlertModalVisible(false)}>
                  <Text style={styles.alertConfirmBtnText}>OK</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <ReportModal visible={!!selectedReport} report={selectedReport} boardData={boardData} onClose={() => setSelectedReport(null)} isDarkMode={isDarkMode} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '100%', maxWidth: 620, backgroundColor: '#ffffff', borderRadius: 16, padding: 24, height: 680, ...Platform.select({ web: { boxShadow: '0px 20px 40px rgba(0,0,0,0.3)' } }) },
  fixedContentBox: { height: 500, overflow: 'hidden' },
  scrollContentContainer: { alignItems: 'stretch' },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  
  startTopBtn: { backgroundColor: '#2563eb', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, justifyContent: 'center' },
  startTopBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },

  disconnectTopBtn: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, justifyContent: 'center' },
  disconnectTopBtnText: { color: '#dc2626', fontWeight: 'bold', fontSize: 12 },
  
  closeButton: { padding: 4 },
  closeButtonText: { fontSize: 20, color: '#64748b', fontWeight: 'bold' },

  tabsRow: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#f1f5f9', borderRadius: 8, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabBtnActive: { backgroundColor: '#ffffff', ...Platform.select({ web: { boxShadow: '0px 1px 3px rgba(0,0,0,0.1)' } }) },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#2563eb', fontWeight: 'bold' },

  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 8 },
  filtersRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },

  itemBlock: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  removeText: { fontSize: 12, color: '#ef4444', fontWeight: 'bold' },
  addBtn: { paddingVertical: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, backgroundColor: '#eff6ff' },
  addBtnText: { color: '#2563eb', fontWeight: '700', fontSize: 14 },
  
  floatingMenu: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 8, ...Platform.select({ web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.1)' } }) },
  menuTitle: { fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 6, textAlign: 'center' },
  menuItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  menuItemText: { fontSize: 14, fontWeight: '600', color: '#334155' },

  mediaPickerBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, alignItems: 'center', width: '100%' },
  mediaPickerBtnText: { color: '#334155', fontWeight: '600', fontSize: 13 },
  selectedFileText: { fontSize: 12, color: '#16a34a', fontWeight: '600', marginTop: 4 },
  audioFormatHint: { fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 4 },

  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  checkbox: { width: 18, height: 18, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  checkmark: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  checkboxLabel: { fontSize: 13, color: '#475569', flex: 1 },

  infoText: { fontSize: 15, color: '#475569', textAlign: 'center', marginTop: 12, marginBottom: 12 },
  statusError: { fontSize: 18, fontWeight: 'bold', color: '#ef4444' },
  
  // Estilos da Moldura e QR Code Elegante
  qrCodeWrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  floatingWaIcon: { width: 60, height: 60, position: 'absolute', top: -30, zIndex: 10 },
  qrCodeFrame: { backgroundColor: '#ffffff', padding: 16, borderRadius: 16, borderWidth: 3, borderColor: '#16a34a', ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(22, 163, 74, 0.2)' } }) },
  qrCodeImage: { width: 220, height: 220 },
  
  // Estilos do Botão Reconectar Auto-Recovery
  reconnectContainer: { alignItems: 'center', marginTop: 20 },
  reconnectBtn: { backgroundColor: '#dc2626', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  reconnectBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  reconnectHint: { fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 8, textAlign: 'center', maxWidth: 280 },

  topActionRow: { 
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12 
  },
  connectedBadgeInline: { 
    backgroundColor: '#dcfce7', 
    paddingVertical: 8, 
    paddingHorizontal: 16, 
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    display: 'inline-flex'
  },
  connectedText: { 
    color: '#16a34a', 
    fontWeight: 'bold', 
    fontSize: 13, 
    whiteSpace: 'nowrap',
    textAlign: 'center'
  },
  
  pickerContainer: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, overflow: 'hidden', marginBottom: 8 },
  webSelect: { width: '100%', padding: 10, borderWidth: 0, backgroundColor: 'transparent', outlineStyle: 'none', fontSize: 14, color: '#0f172a', fontFamily: 'inherit' },
  
  textAreaLarge: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 14, color: '#0f172a', minHeight: 70, textAlignVertical: 'top', marginBottom: 6, outlineStyle: 'none' },
  primaryButton: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

  logWrapper: { marginTop: 4 },
  logHeaderBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressLabel: { fontSize: 13, fontWeight: 'bold', color: '#2563eb' },
  logContainer: { backgroundColor: '#0f172a', borderRadius: 8, padding: 10, height: 180 },
  logItem: { fontSize: 12, fontFamily: 'monospace', marginBottom: 4, lineHeight: 16 },
  logSuccess: { color: '#4ade80' },
  logError: { color: '#f87171' },

  controlButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  controlBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnPause: { backgroundColor: '#d97706' },
  btnResume: { backgroundColor: '#16a34a' },
  btnCancel: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  controlBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },

  emptyText: { textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', marginTop: 40 },
  historyCard: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  historyStatus: { fontWeight: 'bold', fontSize: 13 },
  historyDate: { fontSize: 12, color: '#64748b' },
  historyMsg: { fontSize: 13, color: '#334155', marginBottom: 6 },
  historyStatsRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6 },
  historyStatItem: { fontSize: 12, fontWeight: '600', color: '#475569' },
  connectedAccountInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyMsgClean: { fontSize: 13, color: '#475569', backgroundColor: '#ffffff', padding: 6, borderRadius: 4, borderWidth: 1, borderColor: '#e2e8f0', fontStyle: 'italic', marginTop: 2 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },

  alertOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  alertContent: { backgroundColor: '#ffffff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center', ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 10px 20px rgba(0,0,0,0.15)'} }) },
  alertTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 8, textAlign: 'center' },
  alertSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 20, textAlign: 'center', lineHeight: 18 },
  alertButtonsRow: { flexDirection: 'row', gap: 12, width: '100%' },
  alertBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  alertCancelBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  alertCancelBtnText: { color: '#475569', fontWeight: 'bold', fontSize: 13 },
  alertConfirmBtn: { backgroundColor: '#2563eb' },
  alertConfirmBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 }
});

const darkStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#1e293b' },
  title: { color: '#f8fafc' },
  closeButtonText: { color: '#94a3b8' },
  tabsRow: { backgroundColor: '#0f172a' },
  tabBtnActive: { backgroundColor: '#334155' },
  tabText: { color: '#64748b' },
  label: { color: '#cbd5e1' },
  pickerContainer: { backgroundColor: '#0f172a', borderColor: '#334155' },
  webSelect: { color: '#f8fafc' },
  itemBlock: { backgroundColor: '#0f172a', borderColor: '#334155' },
  textAreaLarge: { backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' },
  mediaPickerBtn: { backgroundColor: '#1e293b', borderColor: '#334155' },
  mediaPickerBtnText: { color: '#cbd5e1' },
  checkbox: { borderColor: '#475569', backgroundColor: '#1e293b' },
  checkboxLabel: { color: '#cbd5e1' },
  addBtn: { backgroundColor: '#1e293b', borderColor: '#3b82f6' },
  floatingMenu: { backgroundColor: '#1e293b', borderColor: '#334155' },
  menuTitle: { color: '#cbd5e1' },
  menuItem: { borderBottomColor: '#334155' },
  menuItemText: { color: '#f8fafc' },
  infoText: { color: '#cbd5e1' },
  emptyText: { color: '#64748b' },
  historyCard: { backgroundColor: '#0f172a', borderColor: '#334155' },
  historyMsg: { color: '#cbd5e1' },
  historyMsgClean: { backgroundColor: '#1e293b', borderColor: '#334155', color: '#cbd5e1' },
  historyStatsRow: { borderTopColor: '#334155' },
  historyStatItem: { color: '#cbd5e1' },
  alertContent: { backgroundColor: '#1e293b' },
  alertTitle: { color: '#f8fafc' },
  alertSubtitle: { color: '#cbd5e1' },
  alertCancelBtn: { backgroundColor: '#334155', borderColor: '#475569' },
  alertCancelBtnText: { color: '#cbd5e1' },
  reconnectHint: { color: '#94a3b8' }
});