// ClientDetailsModal
import React, { useState, useEffect, useRef } from 'react';
import { 
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView, useWindowDimensions, Animated, ActivityIndicator, Alert, Linking
} from 'react-native';
import { setLeadUpdateCallback } from './WhatsAppBulkModal';
import { supabase } from '../services/supabaseClient';

// Importações necessárias para gerar e compartilhar a proposta
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const CommentsSection = ({ formData, setFormData, newCommentText, setNewCommentText, isDarkMode, isMobile, themeStyles }) => {
  const handleAddComment = () => {
    if (!newCommentText.trim()) return;
    const comment = { id: Date.now().toString(), text: newCommentText, date: new Date().toISOString() };
    setFormData(prev => ({ ...prev, comments: [comment, ...(prev.comments || [])] }));
    setNewCommentText('');
  };

  return (
    <View style={[styles.commentsContainer, isMobile && styles.commentsContainerMobile]}>
      <Text style={[styles.commentsTitle, themeStyles.commentsTitle]}>Atividades e Comentários</Text>
      <View style={[styles.commentInputContainer, themeStyles.commentInputContainer]}>
        <TextInput 
          style={[styles.commentInput, themeStyles.commentInput]} 
          placeholder="Registre uma ação..." 
          placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
          multiline={true} 
          value={newCommentText} 
          onChangeText={setNewCommentText} 
        />
        <TouchableOpacity style={styles.addCommentBtn} onPress={handleAddComment}><Text style={styles.addCommentBtnText}>Salvar</Text></TouchableOpacity>
      </View>
      <ScrollView style={styles.commentsList} showsVerticalScrollIndicator={false}>
        {(!formData.comments || formData.comments.length === 0) ? (
          <Text style={[styles.noCommentsText, themeStyles.noCommentsText]}>Nenhuma interação registrada.</Text>
        ) : (
          formData.comments.map(comment => {
            const isSystem = comment.text.includes('Sistema:');
            return (
              <View key={comment.id} style={[styles.commentCard, isSystem ? themeStyles.commentCardAuto : themeStyles.commentCardManual]}>
                <Text style={[styles.commentDate, themeStyles.commentDate]}>{new Date(comment.date).toLocaleDateString('pt-BR')} às {new Date(comment.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                <Text style={[styles.commentText, isSystem ? themeStyles.commentTextAuto : themeStyles.commentTextManual]}>{comment.text}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

export default function ClientDetailsModal({ visible, onClose, clientData, onSave, isAdmin, usersList, currentUserId, isDarkMode }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 850;

  const [formData, setFormData] = useState({});
  const [originalData, setOriginalData] = useState({}); 
  const [activeTab, setActiveTab] = useState('informacoes');
  const [newCommentText, setNewCommentText] = useState('');
   
  const [apptType, setApptType] = useState('Ligar');
  const [apptDate, setApptDate] = useState(''); 
  const [apptTime, setApptTime] = useState(''); 
  const [apptReminder, setApptReminder] = useState(0); 
   
  const [alertConfig, setAlertConfig] = useState({ visible: false, type: 'success', title: '', message: '' });
  const alertScale = useRef(new Animated.Value(0.8)).current;
  const alertOpacity = useRef(new Animated.Value(0)).current;

  // Estados de Animação para Zoom In / Zoom Out
  const modalScale = useRef(new Animated.Value(0.8)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const [showModalContent, setShowModalContent] = useState(false);

  useEffect(() => {
    if (visible) {
      setShowModalContent(true);
      modalScale.setValue(0.8);
      modalOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(modalScale, { toValue: 1, friction: 7, tension: 40, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(modalOpacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' })
      ]).start();
    }
  }, [visible]);

  const handleCloseModal = () => {
    Animated.parallel([
      Animated.timing(modalScale, { toValue: 0.8, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(modalOpacity, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' })
    ]).start(() => {
      setShowModalContent(false);
      onClose();
    });
  };

  // --- Estados para a Aba de Proposta ---
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [dadosSimulacao, setDadosSimulacao] = useState({
    tipoBem: 'Automóvel',
    administradora: 'Embracon',
    credito: '120000',
    prazo: '120',
    taxaAdm: '15',
    parcelaIntegral: '1150',
    lanceEmbutido: '25',
    lanceDoBolso: '60000',
    mostrarLanceDoBolso: false,
    mostrarTaxaAdministracao: true,
    temAdesao: false,
    adesaoPercentual: '1',
    adesaoAteMes: '4',
    mesContemplacao: '6'
  });

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '';
    let numbers = String(value).replace(/\D/g, '');
    if (!numbers) return '';
    let amount = (parseInt(numbers, 10) / 100).toFixed(2);
    let parts = amount.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts.join(',');
  };

  useEffect(() => {
    if (formData.dealClosed && formData.contracts && formData.contracts.length > 0) {
      let totalValor = 0;
      let totalParcela = 0;

      formData.contracts.forEach(c => {
        const valContrato = parseFloat(String(c.valorContrato || '0').replace(/\./g, '').replace(',', '.')) || 0;
        const valParcela = parseFloat(String(c.valorParcela || '0').replace(/\./g, '').replace(',', '.')) || 0;
        totalValor += valContrato;
        totalParcela += valParcela;
      });

      setFormData(prev => ({
        ...prev,
        desiredCredit: formatCurrency(Math.round(totalValor * 100)),
        idealInstallment: formatCurrency(Math.round(totalParcela * 100))
      }));
    }
  }, [formData.contracts, formData.dealClosed]);

  const showCustomAlert = (type, title, message) => {
    setAlertConfig({ visible: true, type, title, message });
    alertScale.setValue(0.8);
    alertOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(alertScale, { toValue: 1, friction: 6, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(alertOpacity, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' })
    ]).start();
  };

  const closeCustomAlert = () => {
    Animated.parallel([
      Animated.timing(alertScale, { toValue: 0.8, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(alertOpacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' })
    ]).start(() => {
      setAlertConfig({ visible: false, type: 'success', title: '', message: '' });
    });
  };

  useEffect(() => {
    if (clientData) {
      let mergedInfo = clientData.initialInfo || '';
      if (clientData.history) {
        mergedInfo = mergedInfo ? `${mergedInfo}\n\n=== DADOS DA IMPORTAÇÃO ===\n${clientData.history}` : clientData.history;
      }
       
      const formattedClientData = { ...clientData, initialInfo: mergedInfo };
      delete formattedClientData.history; 

      if (formattedClientData.desiredCredit) formattedClientData.desiredCredit = formatCurrency(formattedClientData.desiredCredit);
      if (formattedClientData.idealInstallment) formattedClientData.idealInstallment = formatCurrency(formattedClientData.idealInstallment);
      if (formattedClientData.monthlyIncome) formattedClientData.monthlyIncome = formatCurrency(formattedClientData.monthlyIncome);
      if (formattedClientData.bidAmount) formattedClientData.bidAmount = formatCurrency(formattedClientData.bidAmount);

      if (formattedClientData.contracts && Array.isArray(formattedClientData.contracts)) {
        formattedClientData.contracts = formattedClientData.contracts.map(c => ({
          ...c,
          valorContrato: c.valorContrato ? formatCurrency(c.valorContrato) : '',
          valorParcela: c.valorParcela ? formatCurrency(c.valorParcela) : ''
        }));
      }

      setFormData(formattedClientData);
      setOriginalData(JSON.parse(JSON.stringify(formattedClientData))); 
      setActiveTab('informacoes');
      setNewCommentText('');
       
      const now = new Date();
      setApptDate(now.toLocaleDateString('pt-BR'));
      setApptTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);

      if (formattedClientData.desiredCredit) {
         setDadosSimulacao(prev => ({ ...prev, credito: String(formattedClientData.desiredCredit).replace(/\D/g, '') }));
      }
      if (formattedClientData.idealInstallment) {
         setDadosSimulacao(prev => ({ ...prev, parcelaIntegral: String(formattedClientData.idealInstallment).replace(/\D/g, '') }));
      }
    }
  }, [clientData]);

  useEffect(() => {
    setLeadUpdateCallback((leadId, messageText) => {
      if (clientData?.id === leadId) {
        const newComment = { 
          id: `zap_${Date.now()}`, 
          text: messageText, 
          date: new Date().toISOString() 
        };
         
        setFormData(prev => ({ 
          ...prev, 
          comments: [newComment, ...(prev.comments || [])] 
        }));
      }
    });

    return () => setLeadUpdateCallback(null);
  }, [clientData]);

  const handleChange = (field, value) => {
    let finalValue = value;
    const currencyFields = ['desiredCredit', 'idealInstallment', 'monthlyIncome', 'bidAmount'];
    if (currencyFields.includes(field)) {
      finalValue = formatCurrency(value);
    }
    setFormData(prev => ({ ...prev, [field]: finalValue }));
  };

  const handleContractChange = (contractId, field, value) => {
    let finalValue = value;
    const currencyFields = ['valorContrato', 'valorParcela'];
    if (currencyFields.includes(field)) {
      finalValue = formatCurrency(value);
    }
    setFormData(prev => {
      const updatedContracts = (prev.contracts || []).map(c => 
        c.id === contractId ? { ...c, [field]: finalValue } : c
      );
      return { ...prev, contracts: updatedContracts };
    });
  };

  const handleToggleInstallment = (contractId, index) => {
    setFormData(prev => {
      const updatedContracts = (prev.contracts || []).map(c => {
        if (c.id === contractId) {
          const newPagas = [...(c.parcelasPagas || [])];
          newPagas[index] = !newPagas[index];
          return { ...c, parcelasPagas: newPagas };
        }
        return c;
      });
      return { ...prev, contracts: updatedContracts };
    });
  };

  const handleAddContract = () => {
    setFormData(prev => ({
      ...prev,
      contracts: [...(prev.contracts || []), {
        id: `contract_${Date.now()}`, administradora: '', numeroContrato: '', grupo: '', cota: '', valorContrato: '', valorParcela: '', prazo: '', categoria: '', diaVencimento: '', parcelasPagas: []
      }]
    }));
  };

  const toggleDealClosed = () => {
    setFormData(prev => {
      const isNowClosed = !prev.dealClosed;
      return {
        ...prev,
        dealClosed: isNowClosed,
        dealClosedDate: isNowClosed ? (prev.dealClosedDate || new Date().toISOString()) : prev.dealClosedDate,
        clientStatus: isNowClosed ? (prev.clientStatus || 'Cliente Não Contemplado') : null,
        contracts: isNowClosed && (!prev.contracts || prev.contracts.length === 0) ? [{
          id: `contract_${Date.now()}`, administradora: '', numeroContrato: '', grupo: '', cota: '', valorContrato: '', valorParcela: '', prazo: '', categoria: '', diaVencimento: '', parcelasPagas: []
        }] : prev.contracts
      };
    });
    if (!formData.dealClosed) {
      setActiveTab('acompanhamento');
    }
  };

  const handleDateChange = (text) => {
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.length > 2) cleaned = cleaned.replace(/^(\d{2})(\d)/, '$1/$2');
    if (cleaned.length > 5) cleaned = cleaned.replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
    setApptDate(cleaned.substring(0, 10)); 
  };

  const handleTimeChange = (text) => {
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.length > 2) cleaned = cleaned.replace(/^(\d{2})(\d)/, '$1:$2');
    setApptTime(cleaned.substring(0, 5)); 
  };

  const handleSave = () => {
    let updatedData = { ...formData };
     
    if (updatedData.phone && updatedData.phone !== originalData.phone) {
      let cl = updatedData.phone.replace(/\D/g, '');
      if (!cl.startsWith('55') && cl.length <= 11) cl = '55' + cl;
      const match = cl.match(/^(\d{2})(\d{2})(\d+)$/);
      if (match) {
        const numero = match[3];
        const numeroFormatado = numero.length > 4 ? `${numero.slice(0, -4)}-${numero.slice(-4)}` : numero;
        updatedData.phone = `+${match[1]} (${match[2]}) ${numeroFormatado}`;
      }
    }

    const fieldsToTrack = {
      name: 'Nome', phone: 'Telefone', email: 'E-mail', category: 'Categoria', desiredCredit: 'Crédito', leadTemp: 'Temperatura'
    };

    let changes = [];
    for (let key in fieldsToTrack) {
      if ((updatedData[key] || '') !== (originalData[key] || '')) {
        changes.push(`- ${fieldsToTrack[key]}: alterado.`);
      }
    }

    if (updatedData.dealClosed !== originalData.dealClosed) {
      changes.push(`- Status de Negócio: ${updatedData.dealClosed ? 'Fechado' : 'Aberto'}.`);
    }

    if (changes.length > 0) {
      const summaryText = `⚙️ Sistema: Perfil atualizado\n${changes.join('\n')}`;
      updatedData.comments = [{ id: `sys_${Date.now()}`, text: summaryText, date: new Date().toISOString() }, ...(updatedData.comments || [])];
    }

    onSave(updatedData);
    handleCloseModal();
  };

  const handleAddAppointment = () => {
    if (!apptDate || !apptTime || apptDate.length < 10 || apptTime.length < 5) {
      showCustomAlert('error', 'Campos Incompletos', 'Preencha a data e o horário completos do agendamento.');
      return;
    }

    try {
      const [day, month, year] = apptDate.split('/');
      const [hours, minutes] = apptTime.split(':');
      const eventDateTime = new Date(year, month - 1, day, hours, minutes);

      if (isNaN(eventDateTime.getTime())) throw new Error("Data inválida");

      if (eventDateTime <= new Date()) {
        showCustomAlert('error', 'Ação Inválida', 'A data e o horário do agendamento devem ser no futuro. Por favor, escolha um horário válido.');
        return;
      }

      const newAppointment = {
        id: `appt_${Date.now()}`,
        type: apptType,
        dateTime: eventDateTime.toISOString(),
        reminderMinutes: apptReminder,
        notified: false
      };

      setFormData(prev => ({
        ...prev,
        appointments: [newAppointment, ...(prev.appointments || [])],
        comments: [
          { id: `sys_appt_${Date.now()}`, text: `⚙️ Sistema: Agendou para ${apptType} em ${apptDate} às ${apptTime}.`, date: new Date().toISOString() },
          ...(prev.comments || [])
        ]
      }));
       
      showCustomAlert('success', 'Agendado!', 'Seu compromisso foi salvo e você será notificado no horário programado.');
       
    } catch (error) {
      showCustomAlert('error', 'Formato Inválido', 'Formato de data ou hora inválido. Use DD/MM/AAAA e HH:MM.');
    }
  };

  const handleDeleteAppointment = (apptId) => {
    setFormData(prev => {
      const updatedAppts = (prev.appointments || []).filter(a => a.id !== apptId);
      return {
        ...prev,
        appointments: updatedAppts,
        comments: [
          { id: `sys_appt_del_${Date.now()}`, text: `⚙️ Sistema: Um agendamento pendente foi cancelado.`, date: new Date().toISOString() },
          ...(prev.comments || [])
        ]
      };
    });
  };

  const enviarWhatsAppProposta = () => {
    if (!formData.phone) {
      showCustomAlert('error', 'Telefone ausente', 'O cliente não possui um número de telefone/WhatsApp cadastrado.');
      return;
    }

    let phoneClean = String(formData.phone).replace(/\D/g, '');
    if (phoneClean.length <= 11) {
      phoneClean = '55' + phoneClean;
    }

    const creditoNum = parseFloat(String(dadosSimulacao.credito).replace(/\./g, '').replace(',', '.')) || 0;
    const prazoNum = parseInt(dadosSimulacao.prazo) || 0;
    const formatarMoeda = (val) => (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const mensagem = `Olá, *${formData.name || 'Cliente'}*! 👋\n\n` +
      `Conforme conversamos, preparei a simulação do seu consórcio:\n\n` +
      `🏢 *Administradora:* ${dadosSimulacao.administradora}\n` +
      `💰 *Crédito Contratado:* R$ ${formatarMoeda(creditoNum)}\n` +
      `⏳ *Prazo:* ${prazoNum} meses\n` +
      `📉 *Parcela Integral:* R$ ${dadosSimulacao.parcelaIntegral}\n\n` +
      `Acabei de gerar o documento completo em PDF com todos os detalhes do plano!🏼`;

    const url = `https://wa.me/${phoneClean}?text=${encodeURIComponent(mensagem)}`;

    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const gerarEEnviarPDF = async () => {
    setLoadingPdf(true);
    
    try {
      const creditoNum = parseFloat(String(dadosSimulacao.credito).replace(/\./g, '').replace(',', '.')) || 0;
      const prazoNum = parseInt(dadosSimulacao.prazo) || 0;
      const taxaAdmNum = parseFloat(String(dadosSimulacao.taxaAdm).replace(',', '.')) || 0;
      const parcelaIntegralNum = parseFloat(String(dadosSimulacao.parcelaIntegral).replace(/\./g, '').replace(',', '.')) || 0;
      const lanceEmbutidoNum = parseFloat(String(dadosSimulacao.lanceEmbutido).replace(',', '.')) || 0;
      const lanceDoBolsoNum = parseFloat(String(dadosSimulacao.lanceDoBolso).replace(/\./g, '').replace(',', '.')) || 0;
      const mesContemplacaoNum = parseInt(dadosSimulacao.mesContemplacao) || 1;

      const valorLanceEmbutido = creditoNum * (lanceEmbutidoNum / 100);
      const creditoLiberado = creditoNum - valorLanceEmbutido;

      let parcelaAteContemplacao = parcelaIntegralNum;
      if (dadosSimulacao.temAdesao) {
        const adesaoPct = parseFloat(String(dadosSimulacao.adesaoPercentual).replace(',', '.')) || 0;
        const valorAdesaoPorParcela = creditoNum * (adesaoPct / 100) / (parseInt(dadosSimulacao.adesaoAteMes) || 1);
        parcelaAteContemplacao += valorAdesaoPorParcela;
      }

      const taxaDecimal = taxaAdmNum / 100;
      const totalComTaxa = creditoNum * (1 + taxaDecimal);
      const totalPagoAteContemplacao = parcelaIntegralNum * mesContemplacaoNum;
      const prazoRestante = Math.max(1, prazoNum - mesContemplacaoNum);
      const saldoDevedorAposContemplacao = (totalComTaxa - totalPagoAteContemplacao) - valorLanceEmbutido;
      const parcelaPosContemplacao = saldoDevedorAposContemplacao / prazoRestante;

      const dataAtual = new Date();
      const dataValidade = new Date(dataAtual.setDate(dataAtual.getDate() + 7)).toLocaleDateString('pt-BR');

      const nomeCompleto = formData.name || 'Cliente';
      const primeiroNome = nomeCompleto.split(' ')[0];

      let opcoesLanceDinamicas = ["Lance embutido"];
      if (dadosSimulacao.mostrarLanceDoBolso) {
        opcoesLanceDinamicas.push("Lance livre");
      }
      opcoesLanceDinamicas.push("Lance limitado", "Lance fidelidade");

      const payload = {
        clienteNome: nomeCompleto,
        primeiroNomeCliente: primeiroNome,
        creditoContratado: creditoNum,
        prazo: prazoNum,
        taxaAdm: taxaAdmNum,
        percentualLanceEmbutido: lanceEmbutidoNum,
        parcelaIntegral: parcelaAteContemplacao,
        valorLanceEmbutido: valorLanceEmbutido,
        creditoLiberado: creditoLiberado,
        parcelaPosContemplacao: parcelaPosContemplacao,
        dataValidade: dataValidade,
        tipoBem: dadosSimulacao.tipoBem,
        administradora: dadosSimulacao.administradora,
        temAdesao: dadosSimulacao.temAdesao,
        adesaoPercentual: dadosSimulacao.adesaoPercentual,
        adesaoAteMes: dadosSimulacao.adesaoAteMes,
        lanceDoBolso: lanceDoBolsoNum,
        mostrarLanceDoBolso: dadosSimulacao.mostrarLanceDoBolso,
        mostrarTaxaAdministracao: dadosSimulacao.mostrarTaxaAdministracao,
        mostrarLanceEmbutido: true,
        opcoesLance: opcoesLanceDinamicas
      };

      const response = await fetch('https://backend-proposta-1067952907073.southamerica-east1.run.app/gerar-simulacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar a proposta.');
      }

      const blob = await response.blob();
      const nomeArquivoCliente = nomeCompleto.replace(/\s/g, '_');

      if (Platform.OS === 'web') {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Proposta_${nomeArquivoCliente}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = reader.result.split(',')[1];
          const filename = FileSystem.documentDirectory + `Proposta_${nomeArquivoCliente}.pdf`;
          await FileSystem.writeAsStringAsync(filename, base64data, { encoding: FileSystem.EncodingType.Base64 });
          await Sharing.shareAsync(filename);
        };
      }

      const summaryText = `⚙️ Sistema: Proposta Gerada (${dadosSimulacao.administradora} - Crédito: R$ ${dadosSimulacao.credito}, Prazo: ${prazoNum}m).`;
      setFormData(prev => ({
         ...prev,
         comments: [{ id: `sys_prop_${Date.now()}`, text: summaryText, date: new Date().toISOString() }, ...(prev.comments || [])]
      }));

      setLoadingPdf(false);

    } catch (error) {
      setLoadingPdf(false);
      showCustomAlert('error', 'Erro na Geração', 'Não foi possível gerar a proposta.');
      console.error(error);
    }
  };

  if (!clientData || !showModalContent) return null;

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  const TabButton = ({ id, label }) => {
    const isActive = activeTab === id;
    return (
      <TouchableOpacity 
        style={[
          styles.tabButton, 
          themeStyles.tabButton,
          isMobile && styles.tabButtonMobile, 
          isActive && themeStyles.tabButtonActive, 
          isMobile && isActive && themeStyles.tabButtonMobileActive
        ]} 
        onPress={() => setActiveTab(id)}
      >
        <Text style={[
          styles.tabText, 
          themeStyles.tabText,
          isMobile && styles.tabTextMobile, 
          isActive && themeStyles.tabTextActive,
          isMobile && isActive && themeStyles.tabTextMobileActive
        ]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderInstallments = (contract) => {
    const prazo = parseInt(contract.prazo) || 0;
    if (prazo <= 0) return <Text style={[styles.noCommentsText, themeStyles.noCommentsText]}>Informe o prazo do contrato para exibir as parcelas.</Text>;
    
    const parcelasPagas = contract.parcelasPagas || [];
    let visibleCount = 12;
    while (visibleCount <= prazo) {
        let allCheckedInBlock = true;
        for (let i = visibleCount - 12; i < visibleCount; i++) {
            if (!parcelasPagas[i]) {
                allCheckedInBlock = false; break;
            }
        }
        if (allCheckedInBlock && visibleCount < prazo) {
            visibleCount += 12;
        } else {
            break;
        }
    }
    visibleCount = Math.min(visibleCount, prazo);
    
    const boxes = [];
    for (let i = 0; i < visibleCount; i++) {
        const isChecked = !!parcelasPagas[i];
        boxes.push(
            <TouchableOpacity 
              key={i} 
              style={[styles.installmentBox, themeStyles.installmentBox, isChecked && styles.installmentBoxChecked]} 
              onPress={() => handleToggleInstallment(contract.id, i)}
            >
              <Text style={[styles.installmentText, isChecked && styles.installmentTextChecked]}>{i + 1}</Text>
            </TouchableOpacity>
        );
    }
    return <View style={styles.installmentsGrid}>{boxes}</View>;
  };

  return (
    <Modal animationType="none" transparent={true} visible={visible} onRequestClose={handleCloseModal}>
      <View style={styles.overlay}>
        
        {alertConfig.visible && (
          <View style={styles.successAlertOverlay}>
            <Animated.View style={[styles.successAlertBox, themeStyles.successAlertBox, { opacity: alertOpacity, transform: [{ scale: alertScale }] }]}>
              <Text style={styles.successAlertIcon}>{alertConfig.type === 'success' ? '✅' : '⚠️'}</Text>
              <Text style={[styles.successAlertTitle, themeStyles.successAlertTitle]}>{alertConfig.title}</Text>
              <Text style={[styles.successAlertMessage, themeStyles.successAlertMessage]}>{alertConfig.message}</Text>
              <TouchableOpacity 
                style={[styles.successAlertBtn, alertConfig.type === 'error' && { backgroundColor: '#ef4444' }]} 
                onPress={closeCustomAlert}
              >
                <Text style={styles.successAlertBtnText}>{alertConfig.type === 'success' ? 'Continuar' : 'Entendi'}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* Animação Zoom In / Zoom Out baseada no centro */}
        <Animated.View style={[
          styles.modalWrapper, 
          themeStyles.modalWrapper, 
          isMobile && styles.modalWrapperMobile,
          {
            opacity: modalOpacity,
            transform: [{ scale: modalScale }]
          }
        ]}>
          
          <View style={[styles.header, themeStyles.header, isMobile && styles.headerMobile]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.title, themeStyles.title, isMobile && styles.titleMobile]} numberOfLines={1}>{formData.name || 'Detalhes do Lead'}</Text>
              {formData.createdAt && <Text style={[styles.subtitle, themeStyles.subtitle]}>Cadastrado em: {new Date(formData.createdAt).toLocaleDateString('pt-BR')} às {new Date(formData.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity 
                style={[styles.dealToggleBtn, formData.dealClosed ? styles.dealToggleBtnClosed : styles.dealToggleBtnOpen]} 
                onPress={toggleDealClosed}
              >
                <Text style={styles.dealToggleBtnText}>{formData.dealClosed ? 'Negócio Fechado' : 'Fechou Negócio?'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCloseModal} style={[styles.closeButton, themeStyles.closeButton]}><Text style={[styles.closeButtonText, themeStyles.closeButtonText]}>✕</Text></TouchableOpacity>
            </View>
          </View>

          <View style={[styles.body, themeStyles.body, isMobile && styles.bodyMobile]}>
            
            {isMobile ? (
              <View style={[styles.sidebarMobileContainer, themeStyles.sidebarMobileContainer]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sidebarMobile} contentContainerStyle={{ paddingRight: 20 }}>
                  <TabButton id="informacoes" label="Informações" />
                  <TabButton id="dados" label="Dados Pessoais" />
                  <TabButton id="consorcio" label="Interesse" />
                  <TabButton id="financeiro" label="Financeiro" />
                  <TabButton id="kpis" label="Inteligência" />
                  <TabButton id="agendamentos" label="Agendamentos" />
                  <TabButton id="proposta" label="Gerar Proposta" />
                  {formData.dealClosed && <TabButton id="acompanhamento" label="Acompanhamento" />}
                  <TabButton id="comentarios" label="Comentários" />
                </ScrollView>
              </View>
            ) : (
              <View style={[styles.sidebar, themeStyles.sidebar]}>
                <TabButton id="informacoes" label="Informações Principais" />
                <TabButton id="dados" label="Dados Pessoais" />
                <TabButton id="consorcio" label="Interesse" />
                <TabButton id="financeiro" label="Financeiro" />
                <TabButton id="kpis" label="Inteligência" />
                <TabButton id="agendamentos" label="Agendamentos" />
                <TabButton id="proposta" label="Gerar Proposta" />
                {formData.dealClosed && <TabButton id="acompanhamento" label="Acompanhamento" />}
              </View>
            )}

            <ScrollView style={[styles.contentArea, themeStyles.contentArea, isMobile && styles.contentAreaMobile]} showsVerticalScrollIndicator={false}>
               
              {activeTab === 'proposta' && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Gerar Proposta em PDF</Text>
                  
                  {/* Grid de 3 colunas otimizado */}
                  <View style={[styles.row3Col, isMobile && styles.rowMobile]}>
                    
                    {/* Coluna 1 */}
                    <View style={styles.col3Item}>
                      <View style={styles.inputGroupCompact}>
                        <Text style={[styles.label, themeStyles.label]}>Tipo de Bem</Text>
                        {Platform.OS === 'web' ? (
                          <select
                            value={dadosSimulacao.tipoBem}
                            onChange={(e) => setDadosSimulacao({...dadosSimulacao, tipoBem: e.target.value})}
                            style={{
                              width: '100%',
                              height: 38,
                              backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                              color: isDarkMode ? '#f8fafc' : '#0f172a',
                              borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                              borderWidth: 1,
                              borderRadius: 6,
                              paddingHorizontal: 8,
                              fontSize: 13,
                              outline: 'none'
                            }}
                          >
                            <option value="Automóvel">Automóvel</option>
                            <option value="Imóvel">Imóvel</option>
                          </select>
                        ) : (
                          <View style={[styles.pickerContainer, themeStyles.pickerContainer]}>
                            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 100 }}>
                              {['Automóvel', 'Imóvel'].map(bem => (
                                <TouchableOpacity 
                                  key={bem} 
                                  style={[styles.dropdownItem, dadosSimulacao.tipoBem === bem && styles.dropdownItemActive]}
                                  onPress={() => setDadosSimulacao({...dadosSimulacao, tipoBem: bem})}
                                >
                                  <Text style={[styles.dropdownItemText, themeStyles.dropdownItemText, dadosSimulacao.tipoBem === bem && styles.dropdownItemTextActive]}>{bem}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>

                      <View style={styles.inputGroupCompact}>
                        <Text style={[styles.label, themeStyles.label]}>Administradora</Text>
                        {Platform.OS === 'web' ? (
                          <select
                            value={dadosSimulacao.administradora}
                            onChange={(e) => setDadosSimulacao({...dadosSimulacao, administradora: e.target.value})}
                            style={{
                              width: '100%',
                              height: 38,
                              backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                              color: isDarkMode ? '#f8fafc' : '#0f172a',
                              borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                              borderWidth: 1,
                              borderRadius: 6,
                              paddingHorizontal: 8,
                              fontSize: 13,
                              outline: 'none'
                            }}
                          >
                            <option value="Âncora">Âncora</option>
                            <option value="Embracon">Embracon</option>
                            <option value="Rodobens">Rodobens</option>
                            <option value="Recon">Recon</option>
                            <option value="Itaú">Itaú</option>
                            <option value="Renault">Renault</option>
                            <option value="Nissan">Nissan</option>
                          </select>
                        ) : (
                          <View style={[styles.pickerContainer, themeStyles.pickerContainer]}>
                            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 120 }}>
                              {['Âncora', 'Embracon', 'Rodobens', 'Recon', 'Itaú', 'Renault', 'Nissan'].map(adm => (
                                <TouchableOpacity 
                                  key={adm} 
                                  style={[styles.dropdownItem, dadosSimulacao.administradora === adm && styles.dropdownItemActive]}
                                  onPress={() => setDadosSimulacao({...dadosSimulacao, administradora: adm})}
                                >
                                  <Text style={[styles.dropdownItemText, themeStyles.dropdownItemText, dadosSimulacao.administradora === adm && styles.dropdownItemTextActive]}>{adm}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>

                      <View style={styles.inputGroupCompact}>
                        <Text style={[styles.label, themeStyles.label]}>Valor do Crédito (R$)</Text>
                        <TextInput 
                          style={[styles.inputCompact, themeStyles.input]} 
                          keyboardType="numeric"
                          placeholder="Ex: 120000"
                          placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                          value={dadosSimulacao.credito}
                          onChangeText={(t) => setDadosSimulacao({...dadosSimulacao, credito: t})}
                        />
                      </View>
                    </View>

                    {/* Coluna 2 */}
                    <View style={styles.col3Item}>
                      <View style={styles.inputGroupCompact}>
                        <Text style={[styles.label, themeStyles.label]}>Prazo (Meses)</Text>
                        <TextInput 
                          style={[styles.inputCompact, themeStyles.input]} 
                          keyboardType="numeric"
                          placeholder="Ex: 120"
                          placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                          value={dadosSimulacao.prazo}
                          onChangeText={(t) => setDadosSimulacao({...dadosSimulacao, prazo: t})}
                        />
                      </View>

                      <View style={styles.inputGroupCompact}>
                        <Text style={[styles.label, themeStyles.label]}>Taxa de Administração (%)</Text>
                        <TextInput 
                          style={[styles.inputCompact, themeStyles.input]} 
                          keyboardType="numeric"
                          placeholder="Ex: 15"
                          placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                          value={dadosSimulacao.taxaAdm}
                          onChangeText={(t) => setDadosSimulacao({...dadosSimulacao, taxaAdm: t})}
                        />
                      </View>

                      <View style={styles.inputGroupCompact}>
                        <Text style={[styles.label, themeStyles.label]}>Parcela Integral (R$)</Text>
                        <TextInput 
                          style={[styles.inputCompact, themeStyles.input]} 
                          keyboardType="numeric"
                          placeholder="Ex: 1150"
                          placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                          value={dadosSimulacao.parcelaIntegral}
                          onChangeText={(t) => setDadosSimulacao({...dadosSimulacao, parcelaIntegral: t})}
                        />
                      </View>
                    </View>

                    {/* Coluna 3 */}
                    <View style={styles.col3Item}>
                      <View style={styles.inputGroupCompact}>
                        <Text style={[styles.label, themeStyles.label]}>Lance Embutido (%)</Text>
                        <TextInput 
                          style={[styles.inputCompact, themeStyles.input]} 
                          keyboardType="numeric"
                          placeholder="Ex: 25"
                          placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                          value={dadosSimulacao.lanceEmbutido}
                          onChangeText={(t) => setDadosSimulacao({...dadosSimulacao, lanceEmbutido: t})}
                        />
                      </View>

                      <View style={styles.inputGroupCompact}>
                        <Text style={[styles.label, themeStyles.label]}>Mês Contemplação</Text>
                        <TextInput 
                          style={[styles.inputCompact, themeStyles.input]} 
                          keyboardType="numeric"
                          placeholder="Ex: 6"
                          placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                          value={dadosSimulacao.mesContemplacao}
                          onChangeText={(t) => setDadosSimulacao({...dadosSimulacao, mesContemplacao: t})}
                        />
                      </View>

                      <View style={styles.inputGroupCompact}>
                        <TouchableOpacity 
                          style={styles.checkboxContainerCompact} 
                          onPress={() => setDadosSimulacao({...dadosSimulacao, mostrarTaxaAdministracao: !dadosSimulacao.mostrarTaxaAdministracao})}
                        >
                          <View style={[styles.checkbox, themeStyles.checkbox, dadosSimulacao.mostrarTaxaAdministracao && styles.checkboxChecked]}>
                            {dadosSimulacao.mostrarTaxaAdministracao && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text style={[styles.checkboxLabel, themeStyles.checkboxLabel]}>Exibir Taxa Adm</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                  </View>

                  {/* Configurações secundárias aproximadas logo abaixo sem folga vertical */}
                  <View style={[styles.row, isMobile && styles.rowMobile, { marginTop: 4 }]}>
                    <div style={styles.contractContainerCompact}>
                      <TouchableOpacity 
                        style={styles.checkboxContainer} 
                        onPress={() => setDadosSimulacao({...dadosSimulacao, mostrarLanceDoBolso: !dadosSimulacao.mostrarLanceDoBolso})}
                      >
                        <View style={[styles.checkbox, themeStyles.checkbox, dadosSimulacao.mostrarLanceDoBolso && styles.checkboxChecked]}>
                          {dadosSimulacao.mostrarLanceDoBolso && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={[styles.checkboxLabel, themeStyles.checkboxLabel, { fontWeight: 'bold' }]}>Exibir Lance do Bolso</Text>
                      </TouchableOpacity>

                      {dadosSimulacao.mostrarLanceDoBolso && (
                        <View style={{ marginTop: 4 }}>
                          <TextInput 
                            style={[styles.inputSmall, themeStyles.inputSmall]} 
                            placeholder="Valor do Lance do Bolso (R$)" 
                            keyboardType="numeric"
                            value={dadosSimulacao.lanceDoBolso}
                            onChangeText={t => setDadosSimulacao({...dadosSimulacao, lanceDoBolso: t})}
                            placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} 
                          />
                        </View>
                      )}
                    </div>

                    <div style={styles.contractContainerCompact}>
                      <TouchableOpacity 
                        style={styles.checkboxContainer} 
                        onPress={() => setDadosSimulacao({...dadosSimulacao, temAdesao: !dadosSimulacao.temAdesao})}
                      >
                        <View style={[styles.checkbox, themeStyles.checkbox, dadosSimulacao.temAdesao && styles.checkboxChecked]}>
                          {dadosSimulacao.temAdesao && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={[styles.checkboxLabel, themeStyles.checkboxLabel, { fontWeight: 'bold' }]}>Cobrar taxa de adesão nas iniciais</Text>
                      </TouchableOpacity>

                      {dadosSimulacao.temAdesao && (
                        <View style={[styles.row, isMobile && styles.rowMobile, { marginTop: 4, gap: 8 }]}>
                          <TextInput 
                            style={[styles.inputSmall, themeStyles.inputSmall, { flex: 1 }]} 
                            placeholder="% Adesão" 
                            keyboardType="numeric"
                            value={dadosSimulacao.adesaoPercentual}
                            onChangeText={t => setDadosSimulacao({...dadosSimulacao, adesaoPercentual: t})}
                            placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} 
                          />
                          <TextInput 
                            style={[styles.inputSmall, themeStyles.inputSmall, { flex: 1 }]} 
                            placeholder="Até qual mês?" 
                            keyboardType="numeric"
                            value={dadosSimulacao.adesaoAteMes}
                            onChangeText={t => setDadosSimulacao({...dadosSimulacao, adesaoAteMes: t})}
                            placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} 
                          />
                        </View>
                      )}
                    </div>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <TouchableOpacity 
                      onPress={gerarEEnviarPDF}
                      style={{ 
                        flex: 1,
                        backgroundColor: '#10b981', 
                        padding: 10, 
                        borderRadius: 8, 
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      disabled={loadingPdf}
                    >
                      {loadingPdf ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>GERAR E BAIXAR PDF</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity 
                      onPress={enviarWhatsAppProposta}
                      style={{ 
                        flex: 1,
                        backgroundColor: '#25D366', 
                        padding: 10, 
                        borderRadius: 8, 
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>ENVIAR NO WHATSAPP</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Frase solicitada indicando o tempo de espera */}
                  <Text style={[styles.pdfNoticeText, themeStyles.pdfNoticeText]}>
                    Pode demorar cerca de 40 segundos
                  </Text>
                </View>
              )}

              {activeTab === 'informacoes' && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Informações Principais</Text>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, themeStyles.label]}>Valor Desejado (Crédito)</Text>
                      <TextInput style={[styles.input, themeStyles.input]} value={formData.desiredCredit || ''} onChangeText={t => handleChange('desiredCredit', t)} keyboardType="numeric" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, themeStyles.label]}>Parcela Ideal / Possível</Text>
                      <TextInput style={[styles.input, themeStyles.input]} value={formData.idealInstallment || ''} onChangeText={t => handleChange('idealInstallment', t)} keyboardType="numeric" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} />
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, themeStyles.label]}>Informações (Lembretes, Observações e Histórico)</Text>
                    <TextInput style={[styles.input, themeStyles.input, { height: 220, textAlignVertical: 'top' }]} multiline={true} value={formData.initialInfo || ''} onChangeText={t => handleChange('initialInfo', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} />
                  </View>
                </View>
              )}

              {activeTab === 'agendamentos' && (
                <View style={[styles.splitContainer, isMobile && styles.splitContainerMobile]}>
                    
                  <View style={[styles.splitLeft, isMobile && styles.splitLeftMobile]}>
                    <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Criar Novo Agendamento</Text>
                      
                    <View style={styles.apptTypeContainerHorizontal}>
                      {['Ligar', 'Visitar', 'Mensagem', 'Simulação'].map(tipo => (
                        <TouchableOpacity key={tipo} style={[styles.apptTypeBtnHorizontal, themeStyles.apptTypeBtn, apptType === tipo && themeStyles.apptTypeBtnActive]} onPress={() => setApptType(tipo)}>
                          <Text style={[styles.apptTypeText, themeStyles.apptTypeText, apptType === tipo && themeStyles.apptTypeTextActive]}>{tipo}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={[styles.row, isMobile && styles.rowMobile]}>
                      <View style={styles.inputGroup}>
                        <Text style={[styles.label, themeStyles.label]}>Data (DD/MM/AAAA)</Text>
                        <TextInput style={[styles.inputSmall, themeStyles.inputSmall]} placeholder="Ex: 25/12/2026" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} value={apptDate} onChangeText={handleDateChange} keyboardType="numeric" maxLength={10} />
                      </View>
                      <View style={styles.inputGroup}>
                          <Text style={[styles.label, themeStyles.label]}>Horário (HH:MM)</Text>
                          <TextInput style={[styles.inputSmall, themeStyles.inputSmall]} placeholder="Ex: 14:30" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} value={apptTime} onChangeText={handleTimeChange} keyboardType="numeric" maxLength={5} />
                      </View>
                    </View>

                    <Text style={[styles.label, themeStyles.label]}>Lembrar-me com antecedência de:</Text>
                    <View style={styles.apptTypeContainerHorizontal}>
                      {[0, 15, 30, 60].map(mins => (
                        <TouchableOpacity key={mins} style={[styles.apptTypeBtnHorizontal, themeStyles.apptTypeBtn, apptReminder === mins && themeStyles.apptTypeBtnActive]} onPress={() => setApptReminder(mins)}>
                          <Text style={[styles.apptTypeText, themeStyles.apptTypeText, apptReminder === mins && themeStyles.apptTypeTextActive]}>
                            {mins === 0 ? 'Na hora' : mins === 60 ? '1h' : `${mins}m`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity style={styles.saveApptBtn} onPress={handleAddAppointment}>
                      <Text style={styles.saveApptBtnText}>+ Programar Agendamento</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.splitRight, themeStyles.splitRight, isMobile && styles.splitRightMobile]}>
                    <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Agendamentos Ativos</Text>
                      
                    <View style={{ width: '100%' }}>
                      {(!formData.appointments || formData.appointments.length === 0) ? (
                        <Text style={[styles.noCommentsText, themeStyles.noCommentsText]}>Nenhum agendamento futuro.</Text>
                      ) : (
                        formData.appointments.map(appt => (
                          <View key={appt.id} style={[styles.scheduledCard, themeStyles.scheduledCard, appt.notified && themeStyles.scheduledCardDone]}>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4}}>
                              <Text style={[styles.scheduledCardTitle, themeStyles.scheduledCardTitle]}>{appt.type}</Text>
                                
                              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                <Text style={[styles.scheduledCardReminder, themeStyles.scheduledCardReminder]}>{appt.reminderMinutes === 0 ? 'Na hora' : `${appt.reminderMinutes}m antes`}</Text>
                                {!appt.notified && (
                                  <TouchableOpacity onPress={() => handleDeleteAppointment(appt.id)} style={[styles.deleteApptBtn, themeStyles.deleteApptBtn]}>
                                    <Text style={{fontSize: 14, color: '#ef4444'}}>🗑️</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                              
                            <Text style={[styles.scheduledCardDate, themeStyles.scheduledCardDate]}>
                              📅 {new Date(appt.dateTime).toLocaleDateString('pt-BR')} às {new Date(appt.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                              
                            {appt.notified && <Text style={styles.scheduledCardStatus}>✓ Concluído</Text>}
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                </View>
              )}

              {activeTab === 'dados' && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Dados Pessoais e Contato</Text>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Nome Completo</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.name || ''} onChangeText={t => handleChange('name', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>CPF</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.cpf || ''} onChangeText={t => handleChange('cpf', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                  </View>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, themeStyles.label]}>Telefone / WhatsApp</Text>
                      <TextInput style={[styles.input, themeStyles.input]} value={formData.phone || ''} onChangeText={t => handleChange('phone', t)} maxLength={19} keyboardType="phone-pad" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} />
                    </View>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>E-mail</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.email || ''} onChangeText={t => handleChange('email', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                  </View>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Profissão</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.profession || ''} onChangeText={t => handleChange('profession', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Renda Mensal</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.monthlyIncome || ''} onChangeText={t => handleChange('monthlyIncome', t)} keyboardType="numeric" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                  </View>
                </View>
              )}

              {activeTab === 'consorcio' && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Detalhes do Interesse</Text>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Categoria (Auto, Imóvel)</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.category || ''} onChangeText={t => handleChange('category', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Urgência</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.urgency || ''} onChangeText={t => handleChange('urgency', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                  </View>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Origem / Plataforma (Ex: Facebook)</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.platform || formData.origin || ''} onChangeText={t => handleChange('platform', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                  </View>
                </View>
              )}

              {activeTab === 'financeiro' && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Perfil Financeiro e Lances</Text>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Valor Disponível p/ Lance</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.bidAmount || ''} onChangeText={t => handleChange('bidAmount', t)} keyboardType="numeric" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Tipo de Lance Preferido</Text><TextInput style={[styles.input, themeStyles.input]} placeholder="Livre, Embutido, FGTS..." placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} value={formData.bidType || ''} onChangeText={t => handleChange('bidType', t)} /></View>
                  </View>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Possui Financiamento Ativo?</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.hasFinancing || ''} onChangeText={t => handleChange('hasFinancing', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                  </View>
                </View>
              )}

              {activeTab === 'acompanhamento' && formData.dealClosed && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Sistema de Pós-Venda</Text>
                  
                  <View style={styles.statusBtnGroup}>
                      {['Cliente Não Contemplado', 'Cliente Contemplado', 'Cliente Cancelado'].map(st => (
                        <TouchableOpacity 
                          key={st} 
                          style={[styles.clientStatusBtn, formData.clientStatus === st ? styles.clientStatusBtnActive : themeStyles.clientStatusBtnInactive]}
                          onPress={() => handleChange('clientStatus', st)}
                        >
                          <Text style={[styles.clientStatusBtnText, formData.clientStatus === st ? styles.clientStatusBtnTextActive : themeStyles.clientStatusBtnTextInactive]}>{st}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>

                  {(formData.contracts || []).map((contract, index) => (
                    <View key={contract.id} style={[styles.contractContainer, themeStyles.contractContainer]}>
                      <Text style={[styles.contractTitle, themeStyles.contractTitle]}>Contrato {index + 1}</Text>
                
                      <View style={[styles.row, isMobile && styles.rowMobile]}>
                        <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Nome da Administradora</Text><TextInput style={[styles.inputSmall, themeStyles.inputSmall]} value={contract.administradora} onChangeText={t => handleContractChange(contract.id, 'administradora', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                        <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Categoria do Contrato</Text><TextInput style={[styles.inputSmall, themeStyles.inputSmall]} value={contract.categoria} onChangeText={t => handleContractChange(contract.id, 'categoria', t)} placeholder="Ex: Auto, Imóvel" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                      </View>
                      <View style={[styles.row, isMobile && styles.rowMobile]}>
                        <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Número do Contrato</Text><TextInput style={[styles.inputSmall, themeStyles.inputSmall]} value={contract.numeroContrato} onChangeText={t => handleContractChange(contract.id, 'numeroContrato', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                        <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Número do Grupo</Text><TextInput style={[styles.inputSmall, themeStyles.inputSmall]} value={contract.grupo} onChangeText={t => handleContractChange(contract.id, 'grupo', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                        <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Número da Cota</Text><TextInput style={[styles.inputSmall, themeStyles.inputSmall]} value={contract.cota} onChangeText={t => handleContractChange(contract.id, 'cota', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                      </View>
                      <View style={[styles.row, isMobile && styles.rowMobile]}>
                        <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Valor do Contrato</Text><TextInput style={[styles.inputSmall, themeStyles.inputSmall]} value={contract.valorContrato} onChangeText={t => handleContractChange(contract.id, 'valorContrato', t)} keyboardType="numeric" placeholder="Ex: 100.000,00" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                        <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Valor da Parcela</Text><TextInput style={[styles.inputSmall, themeStyles.inputSmall]} value={contract.valorParcela} onChangeText={t => handleContractChange(contract.id, 'valorParcela', t)} keyboardType="numeric" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                      </View>
                      <View style={[styles.row, isMobile && styles.rowMobile]}>
                        <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Prazo do Contrato (Meses)</Text><TextInput style={[styles.inputSmall, themeStyles.inputSmall]} value={contract.prazo} onChangeText={t => handleContractChange(contract.id, 'prazo', t)} keyboardType="numeric" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                        <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Dia do Vencimento (Boleto)</Text><TextInput style={[styles.inputSmall, themeStyles.inputSmall]} value={contract.diaVencimento} onChangeText={t => handleContractChange(contract.id, 'diaVencimento', t)} keyboardType="numeric" placeholder="Ex: 15" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                      </View>

                      <Text style={[styles.label, themeStyles.label, { marginTop: 12 }]}>Acompanhamento de Pagamento (Parcelas)</Text>
                      {renderInstallments(contract)}
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addContractBtn} onPress={handleAddContract}>
                    <Text style={styles.addContractBtnText}>+ Adicionar Outro Contrato</Text>
                  </TouchableOpacity>
                </View>
            )}

              {activeTab === 'kpis' && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Campos Inteligentes</Text>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Temperatura do Lead</Text><TextInput style={[styles.input, themeStyles.input]} placeholder="Frio, Morno, Quente" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} value={formData.leadTemp || ''} onChangeText={t => handleChange('leadTemp', t)} /></View>
                    <View style={styles.inputGroup}><Text style={[styles.label, themeStyles.label]}>Probabilidade de Fechamento (%)</Text><TextInput style={[styles.input, themeStyles.input]} value={formData.winProbability || ''} onChangeText={t => handleChange('winProbability', t)} placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} /></View>
                  </View>
                </View>
            )}

              {isMobile && activeTab === 'comentarios' && (
                  <CommentsSection 
                    formData={formData} 
                    setFormData={setFormData} 
                    newCommentText={newCommentText} 
                    setNewCommentText={setNewCommentText} 
                    isDarkMode={isDarkMode} 
                    isMobile={isMobile} 
                    themeStyles={themeStyles} 
                  />
              )}
            </ScrollView>

            {!isMobile && (
              <View style={[styles.commentsSidebarDesktop, themeStyles.commentsSidebarDesktop]}>
                <CommentsSection 
                  formData={formData} 
                  setFormData={setFormData} 
                  newCommentText={newCommentText} 
                  setNewCommentText={setNewCommentText} 
                  isDarkMode={isDarkMode} 
                  isMobile={isMobile} 
                  themeStyles={themeStyles} 
                />
              </View>
            )}

          </View>

          <View style={[styles.footer, themeStyles.footer, isMobile && styles.footerMobile]}>
            <TouchableOpacity style={[styles.cancelButton, themeStyles.cancelButton, isMobile && { flex: 1, alignItems: 'center' }]} onPress={handleCloseModal}>
              <Text style={[styles.cancelButtonText, themeStyles.cancelButtonText]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveButton, isMobile && { flex: 1, alignItems: 'center' }]} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Salvar Alterações</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center' },
  modalWrapper: { width: '100%', maxWidth: 1150, height: '90%', borderRadius: 16, overflow: 'hidden', ...Platform.select({ web: { outlineStyle: 'none' } }) },
  modalWrapperMobile: { height: '100%', borderRadius: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 24, borderBottomWidth: 1 },
  headerMobile: { padding: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  titleMobile: { fontSize: 18 },
  subtitle: { fontSize: 13, marginTop: 4 },
  closeButton: { padding: 8, borderRadius: 8 },
  closeButtonText: { fontSize: 16, fontWeight: 'bold' },
  dealToggleBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 2 },
  dealToggleBtnOpen: { borderColor: '#cbd5e1', backgroundColor: 'transparent' },
  dealToggleBtnClosed: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  dealToggleBtnText: { fontWeight: '700', fontSize: 14, color: '#10b981' },
  body: { flex: 1, flexDirection: 'row' },
  bodyMobile: { flexDirection: 'column' }, 
  
  // Menu lateral reposicionado ligeiramente para cima e com espaçamento uniforme
  sidebar: { width: 220, padding: 16, borderRightWidth: 1, gap: 8, justifyContent: 'flex-start', paddingTop: 12 },
  tabButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', alignItems: 'flex-start', justifyContent: 'center' },
  tabText: { fontSize: 13, fontWeight: '600' },
  
  sidebarMobileContainer: { borderBottomWidth: 1 },
  sidebarMobile: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row' },
  tabButtonMobile: { marginRight: 8, marginBottom: 0, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  tabTextMobile: { fontSize: 13 },
  
  contentArea: { flex: 1, padding: 24 },
  contentAreaMobile: { padding: 16 },
  formSection: { paddingBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  rowMobile: { flexDirection: 'column', gap: 0, marginBottom: 0 }, 
  inputGroup: { flex: 1, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  inputSmall: { borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 12, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  
  row3Col: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  col3Item: { flex: 1, gap: 6 },
  inputGroupCompact: { marginBottom: 4 },
  inputCompact: { borderWidth: 1, borderRadius: 6, padding: 6, fontSize: 12, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  contractContainerCompact: { flex: 1, padding: 8, borderRadius: 6, borderWidth: 1 },
  checkboxContainerCompact: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },

  pdfNoticeText: { textAlign: 'center', fontSize: 11, fontStyle: 'italic', marginTop: 6 },

  pickerContainer: { borderWidth: 1, borderRadius: 6, padding: 4, minHeight: 38, justifyContent: 'center' },
  dropdownItem: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 4, marginBottom: 2 },
  dropdownItemActive: { backgroundColor: '#2563eb' },
  dropdownItemText: { fontSize: 13, fontWeight: '500' },
  dropdownItemTextActive: { color: '#ffffff', fontWeight: 'bold' },

  splitContainer: { flexDirection: 'row', width: '100%', gap: 24 },
  splitContainerMobile: { flexDirection: 'column', width: '100%' },
  splitLeft: { flex: 1.6 },
  splitLeftMobile: { width: '100%', marginBottom: 28 }, 
  splitRight: { flex: 1, borderLeftWidth: 1, paddingLeft: 24 },
  splitRightMobile: { width: '100%', borderLeftWidth: 0, paddingLeft: 0, borderTopWidth: 1, paddingTop: 20, marginTop: 35 },
   
  apptTypeContainerHorizontal: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  apptTypeBtnHorizontal: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, minWidth: 60, alignItems: 'center' },
  apptTypeText: { fontWeight: '600', fontSize: 11 },
  saveApptBtn: { backgroundColor: '#f59e0b', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 8, marginBottom: 4 },
  saveApptBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  deleteApptBtn: { padding: 4, borderRadius: 6 },

  scheduledCard: { borderWidth: 1, borderLeftWidth: 4, borderLeftColor: '#f59e0b', borderRadius: 8, padding: 10, marginBottom: 8, ...Platform.select({ web: { boxShadow: '0px 2px 4px rgba(0,0,0,0.03)' } }) },
  scheduledCardDone: { opacity: 0.5, borderLeftColor: '#cbd5e1' },
  scheduledCardTitle: { fontSize: 13, fontWeight: 'bold' },
  scheduledCardReminder: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  scheduledCardDate: { fontSize: 11, marginTop: 4, fontWeight: '500' },
  scheduledCardStatus: { fontSize: 10, color: '#10b981', marginTop: 6, fontWeight: 'bold' },

  statusBtnGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  clientStatusBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1 },
  clientStatusBtnActive: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  clientStatusBtnTextActive: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  clientStatusBtnTextInactive: { fontWeight: '600', fontSize: 13 },
   
  contractContainer: { padding: 16, borderRadius: 8, borderWidth: 1, marginBottom: 20 },
  contractTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 16 },
  addContractBtn: { paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#2563eb', alignItems: 'center' },
  addContractBtnText: { color: '#2563eb', fontWeight: 'bold', fontSize: 14 },
   
  installmentsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  installmentBox: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  installmentBoxChecked: { backgroundColor: '#10b981', borderColor: '#059669' },
  installmentText: { fontSize: 12, fontWeight: 'bold' },
  installmentTextChecked: { color: '#ffffff' },

  commentsSidebarDesktop: { width: 340, borderLeftWidth: 1, padding: 16, paddingBottom: 0 },
  commentsContainer: { flex: 1 },
  commentsContainerMobile: { paddingBottom: 20 },
  commentsTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  commentInputContainer: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  commentInput: { height: 60, textAlignVertical: 'top', fontSize: 13, marginBottom: 12, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  addCommentBtn: { alignSelf: 'flex-end', backgroundColor: '#10b981', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 6 },
  addCommentBtnText: { color: '#ffffff', fontWeight: '600', fontSize: 12 },
  commentsList: { flex: 1 },
  noCommentsText: { fontStyle: 'italic', textAlign: 'center', marginTop: 20, fontSize: 13 },
  commentCard: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  commentDate: { fontSize: 10, marginBottom: 6, fontWeight: '600' },
  commentTextManual: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  commentTextAuto: { fontSize: 13, lineHeight: 18, fontStyle: 'italic' },

  footer: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderTopWidth: 1, gap: 12 },
  footerMobile: { padding: 16 },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  cancelButtonText: { fontWeight: '600', fontSize: 14 },
  saveButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, backgroundColor: '#2563eb' },
  saveButtonText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },

  successAlertOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  successAlertBox: { padding: 24, borderRadius: 16, alignItems: 'center', width: 320 },
  successAlertIcon: { fontSize: 48, marginBottom: 12 },
  successAlertTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  successAlertMessage: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  successAlertBtn: { backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 8, width: '100%', alignItems: 'center' },
  successAlertBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  checkbox: { width: 16, height: 16, borderWidth: 1, borderRadius: 4, marginRight: 6, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  checkmark: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  checkboxLabel: { fontSize: 11, flex: 1, flexWrap: 'wrap' }
});

const lightStyles = StyleSheet.create({
  modalWrapper: { backgroundColor: '#ffffff', ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(0,0,0,0.15)' } }) },
  header: { borderBottomColor: '#f1f5f9' },
  title: { color: '#0f172a' },
  subtitle: { color: '#64748b' },
  closeButton: { backgroundColor: '#f8fafc' },
  closeButtonText: { color: '#64748b' },
  body: { backgroundColor: '#ffffff' },
  sidebar: { backgroundColor: '#f8fafc', borderRightColor: '#f1f5f9' },
  tabButton: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  tabButtonActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  tabText: { color: '#475569' },
  tabTextActive: { color: '#2563eb', fontWeight: '700' },
  sidebarMobileContainer: { borderBottomColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  tabButtonMobile: { backgroundColor: '#e2e8f0' },
  tabButtonMobileActive: { backgroundColor: '#2563eb' },
  tabTextMobile: { color: '#475569' },
  tabTextMobileActive: { color: '#ffffff' },
  contentArea: { backgroundColor: '#ffffff' },
  sectionTitle: { color: '#1e293b' },
  label: { color: '#475569' },
  input: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#0f172a' },
  inputSmall: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#0f172a' },
  pickerContainer: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  dropdownItemText: { color: '#334155' },
  splitRight: { borderColor: '#e2e8f0' },
  apptTypeBtn: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  apptTypeBtnActive: { backgroundColor: '#e0e7ff', borderColor: '#4f46e5' },
  apptTypeText: { color: '#64748b' },
  apptTypeTextActive: { color: '#4f46e5' },
  deleteApptBtn: { backgroundColor: '#fee2e2' },
  scheduledCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  scheduledCardDone: { backgroundColor: '#f8fafc' },
  scheduledCardTitle: { color: '#1e293b' },
  scheduledCardReminder: { color: '#f59e0b', backgroundColor: '#fef3c7' },
  scheduledCardDate: { color: '#475569' },
  clientStatusBtnInactive: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  clientStatusBtnTextInactive: { color: '#64748b' },
  contractContainer: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  contractTitle: { color: '#1e293b' },
  installmentBox: { backgroundColor: '#ffffff', borderColor: '#cbd5e1' },
  commentsSidebarDesktop: { backgroundColor: '#f8fafc', borderLeftColor: '#e2e8f0' },
  commentsTitle: { color: '#1e293b' },
  commentInputContainer: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  commentInput: { color: '#0f172a' },
  noCommentsText: { color: '#94a3b8' },
  commentDate: { color: '#64748b' },
  commentCardManual: { backgroundColor: '#ffffff', borderColor: '#bfdbfe', borderLeftColor: '#3b82f6', borderLeftWidth: 4 },
  commentTextManual: { color: '#1e293b' },
  commentCardAuto: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderLeftColor: '#cbd5e1', borderLeftWidth: 4 },
  commentTextAuto: { color: '#64748b' },
  footer: { borderTopColor: '#f1f5f9', backgroundColor: '#ffffff' },
  cancelButton: { backgroundColor: '#f1f5f9' },
  cancelButtonText: { color: '#475569' },
  successAlertBox: { backgroundColor: '#ffffff', ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(0,0,0,0.2)' } }) },
  successAlertTitle: { color: '#1e293b' },
  successAlertMessage: { color: '#475569' },
  checkbox: { borderColor: '#cbd5e1', backgroundColor: '#fff' },
  checkboxLabel: { color: '#475569' },
  pdfNoticeText: { color: '#64748b' }
});

const darkStyles = StyleSheet.create({
  modalWrapper: { backgroundColor: '#1e293b', ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(0,0,0,0.4)' } }) },
  header: { borderBottomColor: '#334155' },
  title: { color: '#f8fafc' },
  subtitle: { color: '#94a3b8' },
  closeButton: { backgroundColor: '#334155' },
  closeButtonText: { color: '#f8fafc' },
  body: { backgroundColor: '#0f172a' },
  sidebar: { backgroundColor: '#1e293b', borderRightColor: '#334155' },
  tabButton: { backgroundColor: '#0f172a', borderColor: '#334155' },
  tabButtonActive: { backgroundColor: '#334155', borderColor: '#60a5fa' },
  tabText: { color: '#94a3b8' },
  tabTextActive: { color: '#60a5fa', fontWeight: '700' },
  sidebarMobileContainer: { borderBottomColor: '#334155', backgroundColor: '#1e293b' },
  tabButtonMobile: { backgroundColor: '#334155' },
  tabButtonMobileActive: { backgroundColor: '#2563eb' },
  tabTextMobile: { color: '#cbd5e1' },
  tabTextMobileActive: { color: '#ffffff' },
  contentArea: { backgroundColor: '#0f172a' },
  sectionTitle: { color: '#f8fafc' },
  label: { color: '#cbd5e1' },
  input: { backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' },
  inputSmall: { backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' },
  pickerContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  dropdownItemText: { color: '#cbd5e1' },
  splitRight: { borderColor: '#334155' },
  apptTypeBtn: { backgroundColor: '#1e293b', borderColor: '#334155' },
  apptTypeBtnActive: { backgroundColor: '#1e3a8a', borderColor: '#3b82f6' },
  apptTypeText: { color: '#94a3b8' },
  apptTypeTextActive: { color: '#93c5fd' },
  deleteApptBtn: { backgroundColor: '#450a0a' },
  scheduledCard: { backgroundColor: '#1e293b', borderColor: '#334155' },
  scheduledCardDone: { backgroundColor: '#0f172a' },
  scheduledCardTitle: { color: '#f8fafc' },
  scheduledCardReminder: { color: '#fbbf24', backgroundColor: '#451a03' },
  scheduledCardDate: { color: '#94a3b8' },
  clientStatusBtnInactive: { backgroundColor: '#1e293b', borderColor: '#334155' },
  clientStatusBtnTextInactive: { color: '#94a3b8' },
  contractContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  contractTitle: { color: '#f8fafc' },
  installmentBox: { backgroundColor: '#0f172a', borderColor: '#475569' },
  commentsSidebarDesktop: { backgroundColor: '#1e293b', borderLeftColor: '#334155' },
  commentsTitle: { color: '#f8fafc' },
  commentInputContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  commentInput: { color: '#f8fafc' },
  noCommentsText: { color: '#64748b' },
  commentDate: { color: '#94a3b8' },
  commentCardManual: { backgroundColor: '#1e293b', borderColor: '#1e3a8a', borderLeftColor: '#3b82f6', borderLeftWidth: 4 },
  commentTextManual: { color: '#f8fafc' },
  commentCardAuto: { backgroundColor: '#0f172a', borderColor: '#334155', borderLeftColor: '#475569', borderLeftWidth: 4 },
  commentTextAuto: { color: '#94a3b8' },
  footer: { borderTopColor: '#334155', backgroundColor: '#1e293b' },
  cancelButton: { backgroundColor: '#334155' },
  cancelButtonText: { color: '#cbd5e1' },
  successAlertBox: { backgroundColor: '#1e293b', ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(0,0,0,0.4)' } }) },
  successAlertTitle: { color: '#f8fafc' },
  successAlertMessage: { color: '#94a3b8' },
  checkbox: { borderColor: '#475569', backgroundColor: '#0f172a' },
  checkboxLabel: { color: '#cbd5e1' },
  pdfNoticeText: { color: '#94a3b8' }
});