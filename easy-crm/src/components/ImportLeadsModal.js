import React, { useState, useRef, useEffect } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Platform, 
  KeyboardAvoidingView, 
  ScrollView, 
  ActivityIndicator, 
  Animated, 
  Image,
  useWindowDimensions 
} from 'react-native';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

// FUNÇÃO AUXILIAR DE FORMATAÇÃO FINANCEIRA
const formatToFinancial = (value) => {
  if (!value) return '';
  let strVal = String(value).trim();
  
  // Se o valor já contém vírgula ou ponto separando centavos (ex: 750.00 ou 750,00)
  if (/[.,]\d{1,2}$/.test(strVal)) {
    let normalized = strVal.replace('.', ',');
    let parts = normalized.split(',');
    let integerPart = parts[0].replace(/\D/g, '');
    let decimalPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);
    let formattedInteger = parseInt(integerPart || '0', 10).toLocaleString('pt-BR');
    return `${formattedInteger},${decimalPart}`;
  }

  // Se for um número inteiro puro (ex: 800 ou 180000)
  let cleaned = strVal.replace(/\D/g, '');
  if (cleaned === '') return '';
  let num = parseInt(cleaned, 10);
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const DICTIONARY = {
  name: ['nome', 'cliente', 'lead', 'full name', 'nome completo', 'razao social', 'primeiro nome', 'sobrenome', 'nome do contato', 'como se chama', 'qual o seu nome'],
  phone: ['telefone', 'whatsapp', 'celular', 'whats', 'wpp', 'zap', 'fone', 'contato', 'numero', 'mobile', 'phone', 'ligar', 'telefone para contato', 'qual o seu telefone', 'qual o seu whatsapp', 'numero de whatsapp'],
  email: ['email', 'e-mail', 'correio eletronico', 'endereço de email', 'qual o seu email', 'qual o seu e-mail'],
  cpf: ['cpf', 'cnpj', 'documento', 'identidade', 'rg', 'doc'],
  profession: ['profissao', 'profissão', 'trabalho', 'cargo', 'ocupacao', 'ocupação', 'o que faz', 'onde trabalha', 'ramo de atuaçao', 'area de atuacao', 'trabalha com o que', 'emprego', 'qual a sua profissao', 'qual a sua profissão', 'sua profissão', 'sua profissao'],
  monthlyIncome: ['renda', 'salario', 'salário', 'faturamento', 'ganho', 'receita', 'ganhos', 'quanto ganha', 'rendimento', 'renda mensal', 'renda familiar', 'rendimento mensal', 'faturamento mensal', 'qual a sua renda', 'sua renda', 'renda aproximada'],
  category: ['categoria', 'qual bem', 'tipo de bem', 'o que deseja', 'interesse', 'tipo de consorcio', 'tipo de consórcio', 'o que busca', 'automovel', 'automóvel', 'imovel', 'imóvel', 'veiculo', 'veículo', 'serviço', 'servico', 'produto', 'qual o seu objetivo', 'qual bem deseja', 'qual tipo de consorcio', 'qual tipo de consórcio', 'procura fazer um consorcio para qual bem', 'qual o bem', 'consórcio para qual bem', 'consorcio para qual bem', 'para qual bem', 'qual bem esta em busca'],
  desiredCredit: ['valor do bem', 'credito', 'crédito', 'carta', 'meta', 'qual valor', 'de quanto precisa', 'capital', 'valor da carta', 'valor desejado', 'valor do credito', 'valor do crédito', 'valor do imovel', 'valor do veiculo', 'montante', 'valor que esta em busca', 'qual valor do bem', 'qual o valor pretendido', 'valor pretendido', 'de quanto é a carta', 'qual o valor', 'valor do automovel'],
  idealInstallment: ['parcela', 'mensalidade', 'media de parcela', 'média de parcela', 'pagamento', 'quanto pode pagar', 'parcela ideal', 'disponibilidade mensal', 'valor da parcela', 'parcela maxima', 'parcela máxima', 'capadidade de pagamento', 'qual a parcela', 'qual valor de parcela', 'qual o valor da parcela', 'parcela que cabe no bolso', 'quanto pretende pagar', 'quanto pretende pagar por mes'],
  urgency: ['urgencia', 'urgência', 'prazo', 'quando', 'em qual momento', 'tempo', 'para quando', 'expectativa', 'quando pretende', 'imediatismo', 'momento de compra', 'qual o seu prazo', 'em quanto tempo', 'momento esta em relacao'],
  bidAmount: ['lance', 'valor para lance', 'ofertar lance', 'entrada', 'valor disponivel', 'valor disponível', 'reserva financeira', 'tem valor para lance', 'valor de entrada', 'montante para lance', 'possui valor para lance', 'possui lance', 'tem lance', 'qual o valor do lance', 'quanto tem de lance', 'valor guardado', 'dinheiro guardado'],
  bidType: ['tipo de lance', 'recurso', 'fgts', 'embutido', 'livre', 'lance fixo', 'lance livre', 'recurso proprio', 'como pretende ofertar o lance', 'qual tipo de lance', 'vai usar fgts'],
  hasFinancing: ['financiamento', 'financiado', 'possui financiamento', 'paga juros', 'tem financiamento', 'ja tem proposta', 'já tem proposta', 'ja fez consorcio', 'já fez consórcio', 'ja tem consorcio', 'já tem consorcio', 'tem proposta de consorcio ou financiamento'],
  platform: ['plataforma', 'origem', 'fonte', 'campanha', 'anuncio', 'anúncio', 'source', 'adset', 'utm_source', 'veio de onde', 'form', 'formulario', 'formulário', 'publico', 'público', 'criativo'],
  consorcioKnowledge: ['voce conhece o consorcio', 'conhece o consorcio', 'ja teve consorcio', 'sabe como funciona'],
  reason: ['por que esta preenchendo', 'motivo', 'por que preencheu', 'por que preenchendo']
};

const sortedDictionaryEntries = Object.entries(DICTIONARY).map(([field, synonyms]) => [field, [...synonyms].sort((a, b) => b.length - a.length)]);

const normalizeString = (str) => {
  if (!str) return '';
  return String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_]/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
};

const identifyField = (line) => {
  if (!line) return null;
  const normLine = normalizeString(line);
  if (normLine.length < 2) return null;
  for (const [field, synonyms] of sortedDictionaryEntries) {
    if (synonyms.some(s => normLine === normalizeString(s))) return field;
  }
  for (const [field, synonyms] of sortedDictionaryEntries) {
    if (synonyms.some(s => normLine.startsWith(normalizeString(s)))) return field;
  }
  if (normLine.length < 60 || line.trim().endsWith('?')) {
    for (const [field, synonyms] of sortedDictionaryEntries) {
      if (synonyms.some(s => {
        const normSyn = normalizeString(s);
        return normSyn.length > 4 && normLine.includes(normSyn);
      })) return field;
    }
  }
  return null;
};

const parseCategoryValue = (rawValue, fullBlockText = '') => {
  const combinedText = normalizeString(`${rawValue || ''} ${fullBlockText}`);
  if (combinedText.includes('auto') || combinedText.includes('carro') || combinedText.includes('veiculo') || combinedText.includes('automovel') || combinedText.includes('picape') || combinedText.includes('moto')) return 'Auto';
  if (combinedText.includes('imovel') || combinedText.includes('casa') || combinedText.includes('sitio') || combinedText.includes('apartamento') || combinedText.includes('terreno')) return 'Imóvel';
  if (combinedText.includes('pesado') || combinedText.includes('caminhao') || combinedText.includes('maquina') || combinedText.includes('trator')) return 'Pesados';
  if (combinedText.includes('servico')) return 'Serviços';
  if (combinedText.includes('invest') || combinedText.includes('poupanca')) return 'Investimento';
  return rawValue ? String(rawValue).trim() : '';
};

const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) cleaned = '55' + cleaned;
  const match = cleaned.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  if (match) return `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}`;
  return String(phone);
};

const normalizePlatform = (rawPlatform) => {
  if (!rawPlatform) return 'Desconhecida';
  const platform = String(rawPlatform).toLowerCase();
  if (platform.includes('ig') || platform.includes('insta')) return 'Instagram';
  if (platform.includes('fb') || platform.includes('face')) return 'Facebook';
  if (platform.includes('goo') || platform.includes('ads')) return 'Google';
  if (platform.includes('tik') || platform.includes('tok')) return 'TikTok';
  return String(rawPlatform).trim();
};

export const processLeadsIntelligence = (text, removeFormatting = true) => {
  let textToProcess = String(text);
  if (removeFormatting) {
    textToProcess = textToProcess.replace(/[*~`]/g, '');
    textToProcess = textToProcess.replace(/_/g, ' ');
  }

  let blocks = [];
  const leadSeparatorRegex = /(?=✅?\s*\*?NOVO LEAD|={3,}|-{3,})/gi;
  if (leadSeparatorRegex.test(textToProcess)) blocks = textToProcess.split(leadSeparatorRegex);
  else blocks = [textToProcess];

  const extractedClients = [];

  blocks.forEach(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return;

    const leadData = {};
    const unmappedData = [];
    let activeField = null; 

    lines.forEach(line => {
      if (/(respostas do.? lead|clique no n.mero|clique no numero)/i.test(line)) return;
      if (/(novo lead gerado|novo lead|campanha:)/i.test(line) && !line.includes(':')) return;

      let keyPart = null;
      let valPart = null;

      const colonMatch = line.match(/^([^:]+):(.*)$/);
      if (colonMatch) {
        keyPart = colonMatch[1].trim();
        valPart = colonMatch[2].trim();
      } else {
        const hyphenMatch = line.match(/^([^-]+)\s+-\s+(.*)$/);
        if (hyphenMatch) {
          keyPart = hyphenMatch[1].trim();
          valPart = hyphenMatch[2].trim();
        }
      }

      if (keyPart !== null) {
        const field = identifyField(keyPart);
        if (field) {
          if (valPart.length > 0) {
            if (field === 'platform' && leadData[field]) leadData[field] += ` | ${valPart}`;
            else leadData[field] = valPart;
            activeField = null; 
          } else {
            activeField = field; 
          }
          return;
        }
      }

      const field = identifyField(line);
      if (field) {
        activeField = field;
        return;
      }

      if (activeField) {
        if (activeField === 'email') {
          const cleanLine = line.replace(/\s+/g, '');
          if (cleanLine.includes('@') && !cleanLine.includes('?') && cleanLine.length < 60) {
            leadData[activeField] = cleanLine;
          }
          activeField = null;
        } else {
          if (leadData[activeField]) leadData[activeField] += ` ${line}`;
          else leadData[activeField] = line;
          return;
        }
      }

      unmappedData.push(line);
    });

    if (leadData.email) {
      const emailMatch = String(leadData.email).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      leadData.email = emailMatch ? emailMatch[0] : '';
    }

    const rawPhoneDigits = String(leadData.phone || '').replace(/\D/g, '');
    const hasValidPhone = rawPhoneDigits.length >= 8;

    if ((leadData.name || leadData.phone) && hasValidPhone) {
      const resolvedCategory = parseCategoryValue(leadData.category, block);

      const allDetails = [];
      if (leadData.desiredCredit) allDetails.push({ key: 'Meta/Crédito', val: leadData.desiredCredit, priority: 1 });
      if (leadData.idealInstallment) allDetails.push({ key: 'Parcela Ideal', val: leadData.idealInstallment, priority: 2 });
      if (resolvedCategory) allDetails.push({ key: 'Bem', val: resolvedCategory, priority: 3 });
      if (leadData.bidAmount) allDetails.push({ key: 'Lance', val: leadData.bidAmount, priority: 4 });
      if (leadData.consorcioKnowledge) allDetails.push({ key: 'Conhece Consórcio', val: leadData.consorcioKnowledge, priority: 5 });
      if (leadData.urgency) allDetails.push({ key: 'Urgência', val: leadData.urgency, priority: 6 });

      const extraInfo = [];
      for (let i = 0; i < unmappedData.length; i++) {
        const line = unmappedData[i].trim();
        if (!line) continue;
        
        const isQuestion = line.endsWith('?') || (line === line.toUpperCase() && line.length > 5 && !line.includes('R$'));
        
        if (isQuestion) {
          const nextLine = unmappedData[i + 1] ? unmappedData[i + 1].trim() : '';
          if (nextLine && !nextLine.endsWith('?') && nextLine !== nextLine.toUpperCase()) {
             extraInfo.push({ key: '', val: nextLine, priority: 7 });
             i++; 
          }
        } else {
          if (!line.includes('NOVO LEAD') && !line.includes('CAMPANHA') && !line.includes('@')) {
            extraInfo.push({ key: '', val: line, priority: 8 });
          }
        }
      }

      const sortedDetails = [...allDetails, ...extraInfo].sort((a, b) => a.priority - b.priority);
      const initialInfoLines = sortedDetails
        .map(d => `${d.key ? d.key + ': ' : ''}${d.val}`.trim())
        .filter(line => line.length > 0 && !line.includes('?') && !line.includes('COMERCIAL'));

      const finalCardSummary = initialInfoLines.slice(0, 2).join('\n');

      extractedClients.push({
        id: `client_imp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        createdAt: new Date().toISOString(),
        name: String(leadData.name || 'Lead Não Identificado').trim(),
        phone: formatPhoneNumber(String(leadData.phone || '')),
        email: String(leadData.email || '').trim(),
        cpf: String(leadData.cpf || '').trim(),
        profession: String(leadData.profession || '').trim(),
        monthlyIncome: String(leadData.monthlyIncome || '').trim(),
        category: String(resolvedCategory || '').trim(),
        desiredCredit: formatToFinancial(leadData.desiredCredit || ''),
        idealInstallment: formatToFinancial(leadData.idealInstallment || ''),
        urgency: String(leadData.urgency || '').trim(),
        bidAmount: formatToFinancial(leadData.bidAmount || ''),
        bidType: String(leadData.bidType || '').trim(),
        hasFinancing: String(leadData.hasFinancing || '').trim(),
        platform: normalizePlatform(String(leadData.platform || '')),
        leadTemp: 'Morno',
        winProbability: '',
        initialInfo: String(finalCardSummary).trim(),
        history: `DADOS BRUTOS ORIGINAIS:\n${block}`
      });
    }
  });

  return extractedClients;
};

export default function ImportLeadsModal({ visible, onClose, onImport, isDarkMode, isElectron, isAutoImportActive, onToggleAutoImport }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [rawText, setRawText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [removeFormatting, setRemoveFormatting] = useState(true);

  const [isServerConnected, setIsServerConnected] = useState(true);

  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('');

  const [alertConfig, setAlertConfig] = useState({ visible: false, type: 'success', title: '', message: '' });
  const alertScale = useRef(new Animated.Value(0.8)).current;
  const alertOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isElectron && Platform.OS === 'web') {
      const savedSetting = localStorage.getItem('autoImportSetting');
      if (savedSetting !== null) {
        const shouldBeActive = savedSetting === 'true';
        onToggleAutoImport(shouldBeActive);
        
        if (shouldBeActive) {
          fetch('http://localhost:3001/status')
            .then(res => res.json())
            .then(data => setIsServerConnected(data.connected))
            .catch(() => setIsServerConnected(false));
        }
      }
    }
  }, [isElectron]);

  useEffect(() => {
    let statusInterval;
    if (isAutoImportActive && isElectron) {
      statusInterval = setInterval(async () => {
        try {
          const response = await fetch('http://localhost:3001/status');
          const data = await response.json();
          setIsServerConnected(data.connected);
        } catch (e) {
          setIsServerConnected(false);
        }
      }, 5000);
    }
    return () => clearInterval(statusInterval);
  }, [isAutoImportActive, isElectron]);

  useEffect(() => {
    let interval;
    if (showQrModal) {
      interval = setInterval(async () => {
        try {
          const response = await fetch('http://localhost:3001/status');
          const data = await response.json();
          setConnectionStatus(data.status);
          setQrCodeData(data.qrCode);

          if (data.connected) {
            setShowQrModal(false);
            onToggleAutoImport(true);
            if (Platform.OS === 'web') localStorage.setItem('autoImportSetting', 'true');
          }
        } catch (e) {
          setConnectionStatus('ERROR');
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [showQrModal]);

  const handleToggleAutoImportClick = async () => {
    const newState = !isAutoImportActive;
    onToggleAutoImport(newState);
    if (Platform.OS === 'web') {
      localStorage.setItem('autoImportSetting', String(newState));
    }

    if (newState) {
      try {
        const response = await fetch('http://localhost:3001/status');
        const data = await response.json();
        setIsServerConnected(data.connected);
        if (!data.connected) {
          setShowQrModal(true);
        }
      } catch (e) {
        setIsServerConnected(false);
        setShowQrModal(true);
      }
    }
  };

  const showCustomAlert = (type, title, message) => {
    setAlertConfig({ visible: true, type, title, message });
    alertScale.setValue(0.8);
    alertOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(alertScale, { toValue: 1, friction: 6, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(alertOpacity, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' })
    ]).start();
  };

  const closeCustomAlert = (callback) => {
    Animated.parallel([
      Animated.timing(alertScale, { toValue: 0.8, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(alertOpacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' })
    ]).start(() => {
      setAlertConfig({ visible: false, type: 'success', title: '', message: '' });
      if (typeof callback === 'function') callback();
    });
  };

  const handleProcessText = () => {
    if (!rawText.trim()) {
      showCustomAlert('error', 'Atenção', 'Por favor, cole os dados dos leads na área de texto antes de prosseguir.');
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      try {
        const newClients = processLeadsIntelligence(rawText, removeFormatting);
        if (newClients.length === 0) {
          showCustomAlert('error', 'Falha na Análise', 'Nenhum lead válido foi encontrado. Obrigatório possuir telefone.');
          setProcessing(false);
          return;
        }
        onImport(newClients);
        showCustomAlert('success', 'Importação Concluída', `${newClients.length} Lead(s) importado(s) e estruturado(s) com sucesso.`, () => {
          setRawText('');
          onClose();
        });
      } catch (error) {
        showCustomAlert('error', 'Erro Interno', 'Ocorreu um erro ao processar a estrutura do texto.');
      } finally {
        setProcessing(false);
      }
    }, 300);
  };

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        
        {showQrModal && (
          <View style={styles.qrOverlay}>
            <View style={[styles.qrContainer, themeStyles.modalContainer, isMobile && { width: '90%' }]}>
                <Text style={[styles.title, themeStyles.title, { textAlign: 'center', marginBottom: 16 }]}>Conectar WhatsApp</Text>
                
                {qrCodeData ? (
                    <Image source={{ uri: qrCodeData }} style={{ width: 250, height: 250 }} />
                ) : (
                    <ActivityIndicator size="large" color="#2563eb" style={{ marginVertical: 40 }} />
                )}
                
                <Text style={[styles.subtitle, themeStyles.subtitle, { textAlign: 'center', marginTop: 16, marginBottom: 24 }]}>
                    {connectionStatus === 'LOADING' ? 'Baixando mensagens...' : 'Leia o QR Code com o aplicativo do WhatsApp para ativar a importação automática.'}
                </Text>

                <TouchableOpacity style={[styles.cancelButton, themeStyles.cancelButton, {width: '100%'}]} onPress={() => setShowQrModal(false)}>
                  <Text style={[styles.cancelButtonText, themeStyles.cancelButtonText]}>Cancelar</Text>
                </TouchableOpacity>
            </View>
          </View>
        )}

        {alertConfig.visible && (
          <View style={styles.successAlertOverlay}>
            <Animated.View style={[styles.successAlertBox, themeStyles.successAlertBox, { opacity: alertOpacity, transform: [{ scale: alertScale }] }, isMobile && { width: '90%' }]}>
              <Text style={styles.successAlertIcon}>{alertConfig.type === 'success' ? '✅' : '⚠️'}</Text>
              <Text style={[styles.successAlertTitle, themeStyles.successAlertTitle, isMobile && { fontSize: 18 }]}>{alertConfig.title}</Text>
              <Text style={[styles.successAlertMessage, themeStyles.successAlertMessage]}>{alertConfig.message}</Text>
              <TouchableOpacity style={[styles.successAlertBtn, alertConfig.type === 'error' && { backgroundColor: '#ef4444' }]} onPress={() => closeCustomAlert(alertConfig.type === 'success' ? alertConfig.onPress : null)}>
                <Text style={styles.successAlertBtnText}>{alertConfig.type === 'success' ? 'Continuar' : 'Entendi'}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        <View style={[styles.modalContainer, themeStyles.modalContainer, isMobile && { width: '98%', maxHeight: '95%' }]}>
          <View style={[styles.header, themeStyles.header, isMobile && { padding: 16 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.title, themeStyles.title, isMobile && { fontSize: 18 }]}>Importação de Leads em Massa</Text>
              <Text style={[styles.subtitle, themeStyles.subtitle, isMobile && { fontSize: 11 }]}>O motor lerá perguntas e respostas ou formatos estruturados automaticamente.</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, themeStyles.closeButton]}>
              <Text style={[styles.closeButtonText, themeStyles.closeButtonText]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, isMobile && { padding: 16 }]}>
            
            {isElectron && (
              <View style={[styles.autoImportCard, themeStyles.autoImportCard, isMobile && { flexDirection: 'column', alignItems: 'flex-start' }]}>
                  <View style={{flex: 1}}>
                      <Text style={[styles.autoImportTitle, themeStyles.title]}>Importar Leads Automaticamente do WhatsApp</Text>
                      <Text style={[styles.autoImportSubtitle, themeStyles.subtitle]}>Ao ativar, o sistema lerá conversas do WhatsApp Web conectado e puxará novos formulários de leads para a fase "Novo Cliente".</Text>
                      
                      {isAutoImportActive && !isServerConnected && (
                      <View style={styles.disconnectContainer}>
                        <Text style={styles.disconnectWarningText}>
                          ⚠️ WhatsApp desconectado. Reconecte para continuar recebendo novos leads automaticamente.
                        </Text>
                      <TouchableOpacity 
                      style={styles.connectButton} 
                      onPress={() => setShowQrModal(true)}
                        >
                      <Text style={styles.connectButtonText}>CONECTAR</Text>
                      </TouchableOpacity>
                      </View>
                        )}
                  </View>
                  <TouchableOpacity 
                    style={[styles.toggleSwitch, isAutoImportActive && styles.toggleSwitchActive, isMobile && { alignSelf: 'flex-end', marginTop: 10 }]} 
                    onPress={handleToggleAutoImportClick} 
                    activeOpacity={0.8}
                  >
                      <View style={[styles.toggleCircle, isAutoImportActive && styles.toggleCircleActive]} />
                  </TouchableOpacity>
              </View>
            )}

            <View style={[styles.toolsRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
              <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Dados Brutos da Campanha (Manual)</Text>
              <TouchableOpacity style={[styles.compactToggle, themeStyles.compactToggle]} activeOpacity={0.7} onPress={() => setRemoveFormatting(!removeFormatting)}>
                <View style={[styles.compactCheckbox, themeStyles.compactCheckbox, removeFormatting && styles.compactCheckboxChecked]}>
                  {removeFormatting && <Text style={styles.compactCheckmark}>✓</Text>}
                </View>
                <Text style={[styles.compactToggleText, themeStyles.compactToggleText]}>Limpar formatação (* e _)</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.textArea, themeStyles.textArea]}
              multiline={true}
              placeholder="Cole os dados aqui...&#10;&#10;O sistema identifica formatos em linha:&#10;Nome: João Silva&#10;Telefone: 85999999999&#10;&#10;E também formatos de formulários (Pular linha):&#10;Qual o valor do bem desejado?&#10;R$ 150.000,00"
              placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
              value={rawText}
              onChangeText={setRawText}
            />
          </ScrollView>

          <View style={[styles.footer, themeStyles.footer, isMobile && { padding: 16, flexDirection: 'column-reverse' }]}>
            <TouchableOpacity style={[styles.cancelButton, themeStyles.cancelButton, isMobile && { width: '100%' }]} onPress={onClose} disabled={processing}>
              <Text style={[styles.cancelButtonText, themeStyles.cancelButtonText]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveButton, isMobile && { width: '100%', marginBottom: 8 }]} onPress={handleProcessText} disabled={processing}>
              {processing ? (
                <View style={styles.processingBtnRow}>
                  <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.saveButtonText}>Processando Dados...</Text>
                </View>
              ) : (
                <Text style={styles.saveButtonText}>Processar Manual e Importar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  qrOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  qrContainer: { width: 350, padding: 24, borderRadius: 16, alignItems: 'center', ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 20px 40px rgba(0,0,0,0.3)' } }) },
  modalContainer: { width: '100%', maxWidth: 750, borderRadius: 16, maxHeight: '90%', overflow: 'hidden', ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 20px 40px rgba(0,0,0,0.15)' } }) },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1 },
  title: { fontFamily: MODERN_FONT, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontFamily: MODERN_FONT, fontSize: 13, marginTop: 4 },
  closeButton: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  closeButtonText: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: 'bold' },
  scrollContent: { padding: 24 },
  
  autoImportCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 24, gap: 16 },
  autoImportTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 4, fontFamily: MODERN_FONT },
  autoImportSubtitle: { fontSize: 12, lineHeight: 16, fontFamily: MODERN_FONT },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#cbd5e1', padding: 2, justifyContent: 'center' },
  toggleSwitchActive: { backgroundColor: '#10b981' },
  toggleCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff', ...Platform.select({ web: { transition: 'transform 0.2s' } }) },
  toggleCircleActive: { transform: [{ translateX: 20 }] },

  toolsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  inputLabel: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '700' },
  compactToggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1 },
  compactCheckbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  compactCheckboxChecked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  compactCheckmark: { color: '#ffffff', fontSize: 10, fontWeight: '900' },
  compactToggleText: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '600' },
  textArea: { height: 300, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 13, fontFamily: MODERN_FONT, textAlignVertical: 'top', lineHeight: 22, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  footer: { flexDirection: 'row', padding: 20, borderTopWidth: 1, justifyContent: 'flex-end', gap: 12 },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', borderRadius: 8 },
  cancelButtonText: { fontFamily: MODERN_FONT, fontWeight: '700', fontSize: 14 },
  saveButton: { paddingVertical: 12, paddingHorizontal: 28, alignItems: 'center', borderRadius: 8, backgroundColor: '#2563eb', ...Platform.select({ web: { boxShadow: '0px 4px 10px rgba(37, 99, 235, 0.2)' } }) },
  processingBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { fontFamily: MODERN_FONT, color: '#ffffff', fontWeight: '700', fontSize: 14 },
  successAlertOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 99999 },
  successAlertBox: { padding: 24, borderRadius: 16, alignItems: 'center', width: 320, ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(0,0,0,0.2)' } }) },
  successAlertIcon: { fontSize: 48, marginBottom: 12 },
  successAlertTitle: { fontFamily: MODERN_FONT, fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  successAlertMessage: { fontFamily: MODERN_FONT, fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  successAlertBtn: { backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 8, width: '100%', alignItems: 'center' },
  successAlertBtnText: { fontFamily: MODERN_FONT, color: '#ffffff', fontWeight: '700', fontSize: 14 },
  disconnectWarningText: { 
    fontSize: 11, 
    color: '#059b93', 
    fontWeight: '500', 
    marginTop: 6, 
    fontFamily: MODERN_FONT,
    lineHeight: 15
    },
    disconnectContainer: { 
  flexDirection: 'row', 
  alignItems: 'center', 
  marginTop: 6, 
  flexWrap: 'wrap' 
},
connectButton: { 
  backgroundColor: '#f87171', 
  paddingVertical: 2, 
  paddingHorizontal: 8, 
  borderRadius: 4, 
  marginLeft: 8 
},
connectButtonText: { 
  color: '#ffffff', 
  fontSize: 10, 
  fontWeight: 'bold', 
  fontFamily: MODERN_FONT 
}
});

const lightStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#ffffff' },
  header: { borderBottomColor: '#f1f5f9', backgroundColor: '#ffffff' },
  title: { color: '#0f172a' },
  subtitle: { color: '#64748b' },
  closeButton: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  closeButtonText: { color: '#475569' },
  autoImportCard: { backgroundColor: '#f0fdfa', borderColor: '#ccfbf1' },
  inputLabel: { color: '#1e293b' },
  compactToggle: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  compactCheckbox: { borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  compactToggleText: { color: '#475569' },
  textArea: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#0f172a' },
  footer: { backgroundColor: '#ffffff', borderTopColor: '#f1f5f9' },
  cancelButton: { backgroundColor: '#f1f5f9' },
  cancelButtonText: { color: '#475569' },
  successAlertBox: { backgroundColor: '#ffffff' },
  successAlertTitle: { color: '#1e293b' },
  successAlertMessage: { color: '#475569' }
});

const darkStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  header: { borderBottomColor: '#334155', backgroundColor: '#1e293b' },
  title: { color: '#f8fafc' },
  subtitle: { color: '#94a3b8' },
  closeButton: { backgroundColor: '#0f172a', borderColor: '#334155' },
  closeButtonText: { color: '#94a3b8' },
  autoImportCard: { backgroundColor: '#022c22', borderColor: '#064e3b' },
  inputLabel: { color: '#f8fafc' },
  compactToggle: { backgroundColor: '#0f172a', borderColor: '#334155' },
  compactCheckbox: { borderColor: '#334155', backgroundColor: '#0f172a' },
  compactToggleText: { color: '#94a3b8' },
  textArea: { backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' },
  footer: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
  cancelButton: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1 },
  cancelButtonText: { color: '#cbd5e1' },
  successAlertBox: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  successAlertTitle: { color: '#f8fafc' },
  successAlertMessage: { color: '#94a3b8' }
});