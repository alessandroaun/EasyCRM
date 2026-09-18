import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import ReportModal from './ReportModal';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView, ActivityIndicator, Image, Animated, Linking, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

let globalIsSending = false;
let globalIsPaused = false;
let globalCancelRequested = false;
let globalLogs = [];
let globalProgressText = '';
let globalStats = { success: 0, error: 0, total: 0, startTime: null, messageSummary: '' };
let onLeadUpdateCallback = null;

import { MODERN_FONT, TOKENS } from '../theme/tokens';

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
  const { height: windowHeight } = useWindowDimensions();
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

  const [showReconnectBtn, setShowReconnectBtn] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Refs para controle infalível de Timeouts e "Stale Closures"
  const fastCheckInterval = useRef(null);
  const connectionTimeout = useRef(null);
  const disconnectionTimeout = useRef(null);
  const connectionStageRef = useRef(connectionStage);

  useEffect(() => {
    connectionStageRef.current = connectionStage;
  }, [connectionStage]);

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
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' })
      ]).start();

      setConnectionStage('connecting');
      hasTransitioned.current = false; 
      checkBotStatus();
      fetchHistorico();
      interval = setInterval(checkBotStatus, 2000);
      
      setIsSending(globalIsSending);
      setIsPaused(globalIsPaused);
      setLogs(globalLogs);
      setProgressText(globalProgressText);
    } else {
      scaleAnim.setValue(0.8);
      fadeAnim.setValue(0);
      setQrCodeImage(null);
      // Limpa rastros de timeout ao fechar o modal
      if (fastCheckInterval.current) clearInterval(fastCheckInterval.current);
      if (connectionTimeout.current) clearTimeout(connectionTimeout.current);
      if (disconnectionTimeout.current) clearTimeout(disconnectionTimeout.current);
    }
    return () => {
      clearInterval(interval);
      if (fastCheckInterval.current) clearInterval(fastCheckInterval.current);
      if (connectionTimeout.current) clearTimeout(connectionTimeout.current);
      if (disconnectionTimeout.current) clearTimeout(disconnectionTimeout.current);
    };
  }, [visible]);

  useEffect(() => {
    let timeoutId;
    setShowReconnectBtn(false);

    if (visible && ['connecting', 'authenticating', 'loading', 'starting_app'].includes(connectionStage)) {
      timeoutId = setTimeout(() => {
        setShowReconnectBtn(true);
      }, 60000);
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

  useEffect(() => {
    if (Platform.OS === 'web') {
      const killLocalServer = () => {
        fetch('http://127.0.0.1:3001/encerrar-sistema', { 
          method: 'POST', 
          keepalive: true 
        }).catch(() => {});
      };
      
      window.addEventListener('beforeunload', killLocalServer);
      return () => window.removeEventListener('beforeunload', killLocalServer);
    }
  }, []);

  const handleAnimatedClose = () => {
    if (!globalIsSending && globalLogs.length > 0) {
      globalLogs = [];
      globalProgressText = '';
      setLogs([]);
      setProgressText('');
    }
    
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' })
    ]).start(() => {
      onClose();
    });
  };

  const checkBotStatus = async () => {
    // Evita loop de erro enquanto a UI estiver em transição explícita
    if (
      connectionStageRef.current === 'starting_app' || 
      connectionStageRef.current === 'disconnecting' || 
      connectionStageRef.current === 'error_timeout' ||
      connectionStageRef.current === 'disconnect_error'
    ) return;

    try {
      const response = await fetch('http://127.0.0.1:3001/status');
      const data = await response.json();

      // VERIFICAÇÃO PÓS-FETCH: Garante que a tela não mudou enquanto aguardava a resposta
      if (
        connectionStageRef.current === 'starting_app' || 
        connectionStageRef.current === 'disconnecting' || 
        connectionStageRef.current === 'error_timeout' ||
        connectionStageRef.current === 'disconnect_error'
      ) return;

      if (connectionTimeout.current) clearTimeout(connectionTimeout.current);
      if (fastCheckInterval.current) clearInterval(fastCheckInterval.current);

      if (data.connected && data.status === 'READY') {
        setIsBotConnected(true);
        if (data.number) setBotNumber(data.number);

        if (!hasTransitioned.current || connectionStage !== 'ready') {
          hasTransitioned.current = true;
          setConnectionStage('ready');
          connectionStageRef.current = 'ready';
        }
      } else {
        setIsBotConnected(false);
        
        if (data.status === 'AUTHENTICATING') {
          hasTransitioned.current = false;
          setConnectionStage('authenticating');
          connectionStageRef.current = 'authenticating';
        } else if (data.status === 'LOADING') {
          hasTransitioned.current = false;
          setConnectionStage('loading');
          connectionStageRef.current = 'loading';
        } else if (data.status === 'QR_CODE' && data.qrCode) {
          hasTransitioned.current = false;
          setConnectionStage('qr_code');
          connectionStageRef.current = 'qr_code';
          setQrCodeImage(data.qrCode);
        } else if (data.status === 'INITIALIZING') {
          setConnectionStage('connecting');
          connectionStageRef.current = 'connecting';
        } else {
          setQrCodeImage(null);
          setConnectionStage('connecting');
          connectionStageRef.current = 'connecting';
        }
      }
    } catch (error) {
      // VERIFICAÇÃO PÓS-ERRO: Impede que o erro atropele a tela de 'Desconectando'
      if (
        connectionStageRef.current === 'starting_app' || 
        connectionStageRef.current === 'disconnecting' || 
        connectionStageRef.current === 'error_timeout' ||
        connectionStageRef.current === 'disconnect_error'
      ) return;

      setIsBotConnected(false);
      
      if (Platform.OS === 'web') {
        setConnectionStage('waiting_local_server');
        connectionStageRef.current = 'waiting_local_server';
      } else {
        setConnectionStage('connecting');
        connectionStageRef.current = 'connecting';
      }
    } finally {
      if(connectionStageRef.current !== 'starting_app' && connectionStageRef.current !== 'disconnecting') {
        setLoadingStatus(false);
      }
    }
  };

  const handleDownloadConnector = () => {
    Linking.openURL('https://omgkvkooitmdqulasdmx.supabase.co/storage/v1/object/public/downloads/Instalador-ConectorZap.exe');
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
          const response = await fetch('http://127.0.0.1:3001/disparar-unico', {
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
      items: allItemsToSend 
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
      mensagem: globalStats.messageSummary, 
      detalhes_json: historicoDetalhado, 
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
      // Exibe a tela de "Desconectando" e BLINDA A REF imediatamente
      setConnectionStage('disconnecting');
      connectionStageRef.current = 'disconnecting';
      
      // Envia o comando para desligar o motor nativo
      fetch('http://127.0.0.1:3001/encerrar-sistema', { method: 'POST' }).catch(() => {});
      
      if (fastCheckInterval.current) clearInterval(fastCheckInterval.current);
      if (connectionTimeout.current) clearTimeout(connectionTimeout.current);

      // Timeout de 40s caso o processo zumbi não morra
      disconnectionTimeout.current = setTimeout(() => {
        setConnectionStage('disconnect_error');
        connectionStageRef.current = 'disconnect_error';
        setIsBotConnected(false);
        setQrCodeImage(null);
      }, 40000);

      // Aguarda 2.5 segundos de "Desconectando" visível antes de mostrar a tela verde
      setTimeout(() => {
        if(disconnectionTimeout.current) clearTimeout(disconnectionTimeout.current);
        setConnectionStage('waiting_local_server');
        connectionStageRef.current = 'waiting_local_server';
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
      }, 2500);

    } catch (e) {
      setConnectionStage('waiting_local_server');
      connectionStageRef.current = 'waiting_local_server';
      setIsBotConnected(false);
      setQrCodeImage(null);
    }
  };

  const handleDisconnect = () => {
    showAlert('Desconectar WhatsApp', 'Deseja realmente desconectar da sua conta e desligar o sistema?', 'disconnect');
  };

  if (!visible) return null;

  const optionStyle = isDarkMode ? { backgroundColor: '#1e293b', color: '#f8fafc' } : {};

  const renderContentBox = () => {
    if (loadingStatus) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText]}>Verificando status...</Text>
        </View>
      );
    }

    if (connectionStage === 'waiting_local_server') {
      return (
        <View style={[styles.centerBox, { padding: 10, justifyContent: 'flex-start', paddingTop: 20 }]}>
          <Image 
            source={{ uri: 'https://omgkvkooitmdqulasdmx.supabase.co/storage/v1/object/public/images/disparazap_logo.png' }} 
            style={[styles.floatingWaIcon, { position: 'relative', top: 0, width: 60, height: 60, marginBottom: 12 }]} 
          />
          <Text style={[styles.statusError, { color: isDarkMode ? '#f8fafc' : '#1e293b', fontSize: 24, marginBottom: 16 }]}>
            Orientações Iniciais
          </Text>
          
          <View style={[styles.instructionsBox, isDarkMode && darkStyles.instructionsBox]}>
            <Text style={[styles.instructionsTitle, isDarkMode && darkStyles.instructionsText]}>
              ⚠️ Atenção e Boas Práticas:
            </Text>
            
            <Text style={[styles.instructionsText, isDarkMode && darkStyles.instructionsText]}>
              <Text style={{fontWeight: 'bold'}}>• Instalação Única:</Text> O sistema requer a instalação do ConectorZap. Instale apenas uma vez.
            </Text>
            <Text style={[styles.instructionsText, isDarkMode && darkStyles.instructionsText]}>
              <Text style={{fontWeight: 'bold'}}>• Inicialização:</Text> Se já estiver instalado, basta iniciar o aplicativo no botão verde abaixo.
            </Text>
            <Text style={[styles.instructionsText, { color: isDarkMode ? '#fca5a5' : '#ef4444', marginTop: 8, fontWeight: '500' }]}>
              <Text style={{fontWeight: 'bold'}}>• Risco de Bloqueio:</Text> O uso excessivo ou envio de spam pode causar restrições na sua conta do WhatsApp. Priorize disparos para clientes que já possuem contato com você.
            </Text>
          </View>

          <TouchableOpacity 
            style={[styles.btn3D, styles.btn3DPrimary, { width: '100%', marginTop: 24 }]} 
            activeOpacity={0.8}
            onPress={() => {
              // Muda a tela IMEDIATAMENTE e BLINDA A REF
              setConnectionStage('starting_app');
              connectionStageRef.current = 'starting_app';
              
              window.location.href = "conectorzap://iniciar";
              
              if (fastCheckInterval.current) clearInterval(fastCheckInterval.current);
              if (connectionTimeout.current) clearTimeout(connectionTimeout.current);

              fastCheckInterval.current = setInterval(async () => {
                try {
                  const res = await fetch('http://127.0.0.1:3001/status');
                  if (res.ok) {
                    clearInterval(fastCheckInterval.current);
                    if(connectionTimeout.current) clearTimeout(connectionTimeout.current);
                    setConnectionStage('connecting');
                    connectionStageRef.current = 'connecting';
                    checkBotStatus();
                  }
                } catch (e) {} 
              }, 1500);

              connectionTimeout.current = setTimeout(() => {
                clearInterval(fastCheckInterval.current);
                setConnectionStage('error_timeout');
                connectionStageRef.current = 'error_timeout';
              }, 40000);
            }}
          >
            <Text style={styles.btn3DText}>INICIAR APLICATIVO</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.btn3D, styles.btn3DSecondary, isDarkMode && darkStyles.btn3DSecondary, { width: '100%', marginTop: 12 }]} 
            activeOpacity={0.8}
            onPress={handleDownloadConnector}
          >
            <Text style={[styles.btn3DTextSecondary, isDarkMode && darkStyles.btn3DTextSecondary]}>📥 Baixar Instalador (Primeiro Acesso)</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (connectionStage === 'starting_app') {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText]}>Iniciando Aplicativo no Windows...</Text>
        </View>
      );
    }

    if (connectionStage === 'error_timeout') {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.statusError}>Falha na Comunicação</Text>
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText, { marginTop: 12, paddingHorizontal: 10, lineHeight: 22 }]}>
            O ConectorZap não respondeu após 40 segundos. 
          </Text>
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText, { marginTop: 4, marginBottom: 20, paddingHorizontal: 10, lineHeight: 22, fontSize: 13, color: '#64748b' }]}>
            Certifique-se de que o aplicativo está instalado e que você permitiu a execução dele no seu navegador. Se o erro persistir, reinstale o Conector.
          </Text>

          <TouchableOpacity 
            style={[styles.primaryButton, { width: 260, backgroundColor: '#2563eb' }]} 
            onPress={() => {
              setConnectionStage('waiting_local_server');
              connectionStageRef.current = 'waiting_local_server';
            }}
          >
            <Text style={styles.primaryButtonText}>Tentar Novamente</Text>
          </TouchableOpacity>

          <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 30, gap: 8}}>
            <TouchableOpacity onPress={handleDownloadConnector}>
              <Text style={{fontSize: 12, color: '#ef4444', fontWeight: 'bold', textDecorationLine: 'underline'}}>
                Baixar Instalador Novamente
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (connectionStage === 'disconnect_error') {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.statusError}>Falha ao Desconectar</Text>
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText, { marginTop: 12, paddingHorizontal: 10, lineHeight: 22 }]}>
            O servidor não respondeu ao comando de encerramento em 40 segundos.
          </Text>
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText, { marginTop: 4, marginBottom: 20, paddingHorizontal: 10, lineHeight: 22, fontSize: 13, color: '#64748b' }]}>
            Por favor, feche esta aba do navegador para forçar a eliminação de processos inativos na sua máquina e abra o CRM novamente.
          </Text>
        </View>
      );
    }

    if (connectionStage === 'connecting') {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText]}>Inicializando Servidor Interno...</Text>
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
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText]}>Desconectando Conta e Finalizando Sistema...</Text>
        </View>
      );
    }

    if (connectionStage === 'qr_code') {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.statusError}>WhatsApp Desconectado</Text>
          <Text style={[styles.infoText, isDarkMode && darkStyles.infoText, {marginBottom: 30}]}>Abra o WhatsApp no seu celular e leia o QR Code abaixo:</Text>
          
          <View style={styles.qrCodeWrapper}>
            <Image 
              source={{ uri: 'https://omgkvkooitmdqulasdmx.supabase.co/storage/v1/object/public/images/whatsapp1.png' }} 
              style={[styles.floatingWaIcon, { position: 'absolute', top: -28, width: 56, height: 56, zIndex: 10 }]} 
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
        <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }}>
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContentContainer} style={{ flex: 1 }}>
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
            maxHeight: windowHeight * 0.9,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }]
          }
        ]}>
          
          <View style={styles.header}>
            <Text style={[styles.title, isDarkMode && darkStyles.title]}>Disparo de Mensagens</Text>
            <View style={styles.headerRightActions}>
              {isBotConnected && connectionStage !== 'disconnecting' && connectionStage !== 'starting_app' && connectionStage !== 'error_timeout' && connectionStage !== 'disconnect_error' && (
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

          {isBotConnected && connectionStage !== 'disconnecting' && connectionStage !== 'starting_app' && connectionStage !== 'error_timeout' && connectionStage !== 'disconnect_error' && (
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
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', alignItems: 'center', padding: Platform.OS === 'web' ? 20 : 0 },
  modalContainer: { 
    width: '100%', 
    maxWidth: 640, 
    backgroundColor: '#ffffff',
    borderRadius: 20, 
    padding: 24, 
    ...Platform.select({ 
      web: { 
        boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        outlineStyle: 'none'
      } 
    }) 
  },
  fixedContentBox: { flex: 1, minHeight: 460, overflow: 'hidden' },
  scrollContentContainer: { flex: 1 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', fontFamily: MODERN_FONT, letterSpacing: -0.4 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  
  startTopBtn: { 
    backgroundColor: '#2563eb', 
    paddingVertical: 6, 
    paddingHorizontal: 12, 
    borderRadius: 8, 
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer', transition: 'all 0.15s ease' } })
  },
  startTopBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12, fontFamily: MODERN_FONT },

  disconnectTopBtn: { 
    backgroundColor: '#fee2e2', 
    borderWidth: 1, 
    borderColor: '#fca5a5', 
    paddingVertical: 6, 
    paddingHorizontal: 12, 
    borderRadius: 8, 
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer', transition: 'all 0.15s ease' } })
  },
  disconnectTopBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 12, fontFamily: MODERN_FONT },
  
  closeButton: { padding: 6, borderRadius: 8 },
  closeButtonText: { fontSize: 18, color: '#64748b', fontWeight: 'bold', fontFamily: MODERN_FONT },

  tabsRow: { 
    flexDirection: 'row', 
    marginBottom: 16, 
    backgroundColor: '#f1f5f9', 
    borderRadius: 12, 
    padding: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  tabBtn: { 
    flex: 1, 
    paddingVertical: 8, 
    alignItems: 'center', 
    borderRadius: 8,
    ...Platform.select({ web: { cursor: 'pointer', transition: 'all 0.15s ease' } })
  },
  tabBtnActive: { 
    backgroundColor: '#ffffff', 
    ...Platform.select({ web: { boxShadow: '0 2px 6px rgba(0,0,0,0.08)' } }) 
  },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748b', fontFamily: MODERN_FONT },
  tabTextActive: { color: '#2563eb', fontWeight: '800' },

  label: { fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6, marginTop: 8, fontFamily: MODERN_FONT },
  filtersRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },

  itemBlock: { backgroundColor: '#f8fafc', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  removeText: { fontSize: 12, color: '#ef4444', fontWeight: '700', fontFamily: MODERN_FONT },
  addBtn: { 
    paddingVertical: 12, 
    alignItems: 'center', 
    borderStyle: 'dashed', 
    borderWidth: 1.5, 
    borderColor: '#2563eb', 
    borderRadius: 10, 
    backgroundColor: '#eff6ff',
    ...Platform.select({ web: { cursor: 'pointer', transition: 'all 0.15s ease' } })
  },
  addBtnText: { color: '#2563eb', fontWeight: '700', fontSize: 13, fontFamily: MODERN_FONT },
  
  floatingMenu: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 8, ...Platform.select({ web: { boxShadow: '0 10px 25px rgba(0,0,0,0.15)' } }) },
  menuTitle: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 6, textAlign: 'center', fontFamily: MODERN_FONT },
  menuItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', ...Platform.select({ web: { cursor: 'pointer' } }) },
  menuItemText: { fontSize: 13, fontWeight: '600', color: '#334155', fontFamily: MODERN_FONT },

  mediaPickerBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 11, alignItems: 'center', width: '100%', ...Platform.select({ web: { cursor: 'pointer' } }) },
  mediaPickerBtnText: { color: '#334155', fontWeight: '600', fontSize: 13, fontFamily: MODERN_FONT },
  selectedFileText: { fontSize: 12, color: '#059669', fontWeight: '600', marginTop: 4, fontFamily: MODERN_FONT },
  audioFormatHint: { fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 4, fontFamily: MODERN_FONT },

  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  checkbox: { width: 18, height: 18, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 5, marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  checkmark: { color: '#ffffff', fontSize: 11, fontWeight: 'bold', fontFamily: MODERN_FONT },
  checkboxLabel: { fontSize: 12, color: '#475569', flex: 1, fontFamily: MODERN_FONT, fontWeight: '500' },

  infoText: { fontSize: 13, color: '#475569', textAlign: 'center', marginTop: 12, marginBottom: 12, fontFamily: MODERN_FONT, lineHeight: 18 },
  statusError: { fontSize: 16, fontWeight: '800', color: '#ef4444', textAlign: 'center', fontFamily: MODERN_FONT },
  
  instructionsBox: {
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({ web: { boxShadow: '0 2px 6px rgba(0,0,0,0.02)' } })
  },
  instructionsTitle: {
    fontWeight: '800',
    fontSize: 12,
    color: '#334155',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    fontFamily: MODERN_FONT
  },
  instructionsText: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
    lineHeight: 18,
    fontFamily: MODERN_FONT
  },
  
  btn3D: {
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        transition: 'all 0.15s ease',
        cursor: 'pointer',
      }
    })
  },
  btn3DPrimary: {
    backgroundColor: '#059669',
    borderBottomWidth: 3,
    borderColor: '#047857',
  },
  btn3DText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: MODERN_FONT,
    letterSpacing: 0.3
  },
  btn3DSecondary: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: '#cbd5e1',
  },
  btn3DTextSecondary: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 12,
    fontFamily: MODERN_FONT,
  },

  stepsBox: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', width: '100%', maxWidth: 340 },
  stepText: { fontSize: 12, color: '#334155', marginBottom: 8, fontWeight: '600', fontFamily: MODERN_FONT },

  qrCodeWrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  floatingWaIcon: { marginBottom: 8 },
  qrCodeFrame: { backgroundColor: '#ffffff', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#059669', ...Platform.select({ web: { boxShadow: '0 10px 25px rgba(5, 150, 105, 0.15)' } }) },
  qrCodeImage: { width: 220, height: 220 },
  
  reconnectContainer: { alignItems: 'center', marginTop: 20 },
  reconnectBtn: { backgroundColor: '#dc2626', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, ...Platform.select({ web: { cursor: 'pointer' } }) },
  reconnectBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13, fontFamily: MODERN_FONT },
  reconnectHint: { fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 8, textAlign: 'center', maxWidth: 280, fontFamily: MODERN_FONT },

  topActionRow: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  connectedBadgeInline: { backgroundColor: '#ecfdf5', paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', display: 'inline-flex', borderWidth: 1, borderColor: '#a7f3d0' },
  connectedText: { color: '#059669', fontWeight: '700', fontSize: 12, whiteSpace: 'nowrap', textAlign: 'center', fontFamily: MODERN_FONT },
  
  pickerContainer: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, overflow: 'hidden', marginBottom: 8 },
  webSelect: { width: '100%', padding: 10, borderWidth: 0, backgroundColor: 'transparent', outlineStyle: 'none', fontSize: 13, color: '#0f172a', fontFamily: MODERN_FONT },
  
  textAreaLarge: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 13, color: '#0f172a', minHeight: 75, textAlignVertical: 'top', marginBottom: 8, outlineStyle: 'none', fontFamily: MODERN_FONT },
  primaryButton: { backgroundColor: '#059669', paddingVertical: 12, borderRadius: 10, alignItems: 'center', ...Platform.select({ web: { cursor: 'pointer', boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)' } }) },
  primaryButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 14, fontFamily: MODERN_FONT },

  logWrapper: { marginTop: 6 },
  logHeaderBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressLabel: { fontSize: 12, fontWeight: '800', color: '#2563eb', fontFamily: MODERN_FONT },
  logContainer: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, height: 180, borderWidth: 1, borderColor: '#1e293b' },
  logItem: { fontSize: 11, fontFamily: 'monospace', marginBottom: 4, lineHeight: 16 },
  logSuccess: { color: '#34d399' },
  logError: { color: '#f87171' },

  controlButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  controlBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', ...Platform.select({ web: { cursor: 'pointer' } }) },
  btnPause: { backgroundColor: '#d97706' },
  btnResume: { backgroundColor: '#059669' },
  btnCancel: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 11, borderRadius: 10, alignItems: 'center', ...Platform.select({ web: { cursor: 'pointer' } }) },
  controlBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 12, fontFamily: MODERN_FONT },

  emptyText: { textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', marginTop: 40, fontFamily: MODERN_FONT, fontSize: 13 },
  historyCard: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  historyStatus: { fontWeight: '800', fontSize: 12, fontFamily: MODERN_FONT },
  historyDate: { fontSize: 11, color: '#64748b', fontFamily: MODERN_FONT },
  historyMsg: { fontSize: 13, color: '#0f172a', marginBottom: 6, fontFamily: MODERN_FONT, lineHeight: 18 },
  historyStatsRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8, marginTop: 6 },
  historyStatItem: { fontSize: 11, fontWeight: '700', color: '#475569', fontFamily: MODERN_FONT },
  connectedAccountInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyMsgClean: { fontSize: 12, color: '#475569', backgroundColor: '#ffffff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', fontStyle: 'italic', marginTop: 4, fontFamily: MODERN_FONT },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },

  alertOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  alertContent: { backgroundColor: '#ffffff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center', ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.2)'} }) },
  alertTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 8, textAlign: 'center', fontFamily: MODERN_FONT, letterSpacing: -0.3 },
  alertSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 20, textAlign: 'center', lineHeight: 19, fontFamily: MODERN_FONT, fontWeight: '500' },
  alertButtonsRow: { flexDirection: 'row', gap: 12, width: '100%' },
  alertBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', ...Platform.select({ web: { cursor: 'pointer' } }) },
  alertCancelBtn: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  alertCancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 12, fontFamily: MODERN_FONT },
  alertConfirmBtn: { backgroundColor: '#2563eb' },
  alertConfirmBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 12, fontFamily: MODERN_FONT }
});

const darkStyles = StyleSheet.create({
  modalContainer: { backgroundColor: TOKENS.dark.surface },
  title: { color: TOKENS.dark.textPrimary },
  closeButtonText: { color: TOKENS.dark.textMuted },
  tabsRow: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  tabBtnActive: { backgroundColor: TOKENS.dark.surface },
  tabText: { color: TOKENS.dark.textMuted },
  tabTextActive: { color: '#60a5fa' },
  label: { color: TOKENS.dark.textSecondary },
  pickerContainer: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  webSelect: { color: TOKENS.dark.textPrimary },
  itemBlock: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  textAreaLarge: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border, color: TOKENS.dark.textPrimary },
  mediaPickerBtn: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  mediaPickerBtnText: { color: TOKENS.dark.textPrimary },
  checkbox: { borderColor: TOKENS.dark.border, backgroundColor: TOKENS.dark.surface },
  checkboxLabel: { color: TOKENS.dark.textPrimary },
  addBtn: { backgroundColor: TOKENS.dark.primarySubtle, borderColor: '#3b82f6' },
  floatingMenu: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  menuTitle: { color: TOKENS.dark.textMuted },
  menuItem: { borderBottomColor: TOKENS.dark.borderSubtle },
  menuItemText: { color: TOKENS.dark.textPrimary },
  infoText: { color: TOKENS.dark.textSecondary },
  emptyText: { color: TOKENS.dark.textMuted },
  historyCard: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  historyDate: { color: TOKENS.dark.textMuted },
  historyMsg: { color: TOKENS.dark.textPrimary },
  historyMsgClean: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border, color: TOKENS.dark.textSecondary },
  historyStatsRow: { borderTopColor: TOKENS.dark.borderSubtle },
  historyStatItem: { color: TOKENS.dark.textSecondary },
  alertContent: { backgroundColor: TOKENS.dark.surface },
  alertTitle: { color: TOKENS.dark.textPrimary },
  alertSubtitle: { color: TOKENS.dark.textSecondary },
  alertCancelBtn: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  alertCancelBtnText: { color: TOKENS.dark.textSecondary },
  reconnectHint: { color: TOKENS.dark.textMuted },
  stepsBox: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  stepText: { color: TOKENS.dark.textPrimary },
  instructionsBox: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  instructionsTitle: { color: TOKENS.dark.textPrimary },
  instructionsText: { color: TOKENS.dark.textSecondary },
  btn3DSecondary: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  btn3DTextSecondary: { color: TOKENS.dark.textSecondary },
  connectedBadgeInline: { backgroundColor: TOKENS.dark.successSubtle, borderColor: TOKENS.dark.successBorder },
  connectedText: { color: TOKENS.dark.success },
  logContainer: { backgroundColor: '#090d16', borderColor: '#1e293b' },
  qrCodeFrame: { backgroundColor: '#ffffff' }
});