import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, useWindowDimensions, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../services/supabaseClient';

import { MODERN_FONT, TOKENS } from '../theme/tokens';

// Extrai números puros de campos financeiros considerando o padrão brasileiro (R$)
const parseMoney = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  
  // Converte para string e remove espaços
  let s = String(val).trim();
  
  // Se contiver vírgula, tratamos como padrão brasileiro (ex: 649.961.007,38)
  // Removemos pontos (milhar) e trocamos a vírgula pelo ponto decimal
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Se não tiver vírgula, removemos apenas pontos caso existam (ex: 180.000)
    s = s.replace(/\./g, '');
  }
  
  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
};

// Formatação Padrão de Moeda Brasileira
const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

// Obter a data e hora atual no fuso horário do Brasil (UTC-3)
const getBrazilTime = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * -3)); 
};

// Componente do Botão Vetorial de Olho para ocultar valores
const EyeToggle = ({ isVisible, onPress, color }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ padding: 4 }}>
    <View style={{ width: 20, height: 16, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
      <View style={{ width: 20, height: 12, borderWidth: 1.5, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderColor: color }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
      {!isVisible && (
        <View style={{ position: 'absolute', width: 22, height: 1.5, transform: [{ rotate: '-45deg' }], backgroundColor: color }} />
      )}
    </View>
  </TouchableOpacity>
);

export default function MinhaCentral({ boardData, onOpenClient, isDarkMode }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 850;

  const [config, setConfig] = useState(null);
  const [userProfileName, setUserProfileName] = useState(null);
  
  // Estado de visibilidade dos valores financeiros (Comissionamento) persistente
  const [showCommission, setShowCommission] = useState(true);

  // Carrega a preferência salva assim que a tela abre
  useEffect(() => {
    if (Platform.OS === 'web') {
      const savedPref = localStorage.getItem('@crm_show_commission');
      if (savedPref !== null) {
        setShowCommission(savedPref === 'true');
      }
    }
  }, []);

  // Função que inverte a visibilidade e salva a escolha na memória do aplicativo
  const toggleCommissionVisibility = () => {
    const newValue = !showCommission;
    setShowCommission(newValue);
    if (Platform.OS === 'web') {
      localStorage.setItem('@crm_show_commission', String(newValue));
    }
  };

  // Alterado nome do estado para evitar termos técnicos
  const [boardsEngagementMetrics, setBoardsEngagementMetrics] = useState({
    disparazapCount: 0,
    totalCommentsCount: 0,
    totalNotificationsCount: 0,
    activeCampaigns: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'mentoria' | 'desempenho' | 'engajamento' | 'comissao'

  // Busca as configurações dinâmicas e o nome real em user_profiles > name, além dos dados dos boards
  useEffect(() => {
    const fetchCentralData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // 1. Consulta o nome real na tabela user_profiles > name
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('name')
            .eq('id', user.id)
            .maybeSingle();

          if (profileData && profileData.name) {
            setUserProfileName(profileData.name);
          }

          // 2. Busca as configurações de meta e nome na crm_boards com ID config_...
          const configId = `config_${user.id}`;
          const { data: configRecord } = await supabase
            .from('crm_boards')
            .select('data_payload')
            .eq('id', configId)
            .maybeSingle();

          if (configRecord && configRecord.data_payload) {
            setConfig(configRecord.data_payload);
          } else {
            // Fallback para crm_config
            const { data: fallbackData } = await supabase
              .from('crm_boards')
              .select('data_payload')
              .eq('id', 'crm_config')
              .maybeSingle();
            
            setConfig(fallbackData?.data_payload || { name: 'Usuário', monthlyGoal: '50000', dailyCalls: '15', dailySims: '3', dailyNeg: '5' });
          }

          // 3. Consulta o data_payload dos "board_..." de cada usuário para sumarizar engajamento
          const { data: allBoards } = await supabase
            .from('crm_boards')
            .select('id, data_payload')
            .ilike('id', '%board_%');

          let dCount = 0;
          let cCount = 0;
          let nCount = 0;
          let campCount = 0;

          if (allBoards && allBoards.length > 0) {
            allBoards.forEach(b => {
              const payload = b.data_payload;
              if (payload) {
                if (payload.disparazapLogs && Array.isArray(payload.disparazapLogs)) {
                  dCount += payload.disparazapLogs.length;
                }
                if (payload.disparazapHistory && Array.isArray(payload.disparazapHistory)) {
                  dCount += payload.disparazapHistory.length;
                }
                if (payload.campaigns && Array.isArray(payload.campaigns)) {
                  campCount += payload.campaigns.length;
                }

                if (payload.phases && Array.isArray(payload.phases)) {
                  payload.phases.forEach(ph => {
                    if (ph.clients && Array.isArray(ph.clients)) {
                      ph.clients.forEach(cl => {
                        if (cl.comments && Array.isArray(cl.comments)) {
                          cCount += cl.comments.length;
                        }
                        if (cl.appointments && Array.isArray(cl.appointments)) {
                          nCount += cl.appointments.length;
                        }
                        if (cl.comments) {
                          cl.comments.forEach(cm => {
                            const txt = (cm.text || '').toLowerCase();
                            if (txt.includes('disparazap') || txt.includes('disparo')) {
                              dCount++;
                            }
                          });
                        }
                      });
                    }
                  });
                }
              }
            });
          }

          setBoardsEngagementMetrics({
            disparazapCount: dCount,
            totalCommentsCount: cCount,
            totalNotificationsCount: nCount,
            activeCampaigns: campCount
          });

        }
      } catch (err) {
        console.error("Erro ao buscar dados na Minha Central:", err);
        setConfig({ name: 'Usuário', monthlyGoal: '50000', dailyCalls: '15', dailySims: '3', dailyNeg: '5' });
      } finally {
        setLoading(false);
      }
    };
    fetchCentralData();
  }, []);

  const rawFullName = userProfileName || config?.name || 'Usuário';
  const firstName = rawFullName.split(' ')[0];

  const metaMensalNumerica = parseMoney(config?.monthlyGoal || 50000);
  const metaDiariasLigacoes = parseInt(config?.dailyCalls || 15, 10);
  const metaDiariasSimulacoes = parseInt(config?.dailySims || 3, 10);

  const metrics = useMemo(() => {
    let inactive = 0, noContact = 0, hot = 0, highChance = 0, todayAppts = 0;
    let calls = 0, whatsapps = 0, sims = 0, overdue = 0;
    let allClients = [];
    
    let vendasMes = 0;
    let negMesAtual = 0;
    let negMesesAnteriores = 0;
    
    let estagnadosNovoCliente = [];
    let contatosRealizados = [];
    let standByAlerts = [];
    let boletosProximos = [];
    let parcelasAtrasadas = [];

    const now = getBrazilTime();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayStr = now.toLocaleDateString();

    if (boardData && boardData.phases) {
      boardData.phases.forEach(phase => {
        const title = phase.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        const isFechado = title.includes('fechad');
        const isNegociacao = title.includes('negocia');
        const isNovo = title.includes('novo');
        const isTentou = title.includes('tentou');
        const isContato = title.includes('contato realizado');
        const isStandby = title.includes('stand');

        phase.clients.forEach(client => {
          allClients.push({ ...client, phaseTitle: phase.title, originalPhaseId: phase.id });
          
          const creditValue = parseMoney(client.desiredCredit || client.valor || 0);
          const created = new Date(client.createdAt || now);
          const lastUpdate = new Date(client.updatedAt || client.createdAt || now);
          
          const daysInactive = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
          const daysInPhase = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
          const isCreatedCurrentMonth = created.getMonth() === currentMonth && created.getFullYear() === currentYear;

          if (daysInactive >= 3 && (isNovo || isTentou || isContato || isNegociacao)) {
            inactive++;
          }
          if (isNovo || isTentou) {
            noContact++;
          }

          if (client.leadTemp?.toLowerCase().includes('quente')) hot++;
          const prob = parseInt(client.winProbability?.replace(/\D/g, '') || '0', 10);
          if (prob >= 80) highChance++;

          if (client.appointments) {
            client.appointments.forEach(appt => {
              const apptDateObj = new Date(appt.dateTime);
              const isPast = apptDateObj < now;
              
              if (!appt.notified && isPast) overdue++;
              if (apptDateObj.toLocaleDateString() === todayStr && !appt.notified) todayAppts++;

              const apptTitle = (appt.title || appt.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              if (apptTitle.includes('simulaca')) sims++;
            });
          }

          if (client.comments) {
            client.comments.forEach(comment => {
              const commentDate = new Date(comment.date).toLocaleDateString();
              if (commentDate === todayStr) {
                const text = comment.text.toLowerCase();
                if (text.includes('botão de ligar') || text.includes('ligação')) calls++;
                if (text.includes('falar no whatsapp') || text.includes('whatsapp')) whatsapps++;
              }
            });
          }

          // Cálculo da Meta (Somatório Exato dos Contratos)
          if (client.dealClosed || isFechado) {
            let sumContratos = 0;
            if (client.contracts && client.contracts.length > 0) {
              client.contracts.forEach(c => {
                sumContratos += parseMoney(c.valorContrato);
              });
            }
            vendasMes += sumContratos > 0 ? sumContratos : creditValue;
          }

          // Inteligência de Pós-Venda
          if (client.dealClosed && client.contracts) {
            client.contracts.forEach((contract, idx) => {
              // 1. Alerta de Vencimento
              const dia = parseInt(contract.diaVencimento);
              if (dia > 0 && dia <= 31) {
                const nextVencimento = new Date(now.getFullYear(), now.getMonth(), dia);
                if (now.getDate() > dia + 1) {
                  nextVencimento.setMonth(nextVencimento.getMonth() + 1);
                }
                const diffTime = nextVencimento - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays <= 5 && diffDays >= 0) {
                  boletosProximos.push({ 
                    clientName: client.name, 
                    contractCat: contract.categoria || `Contrato ${idx + 1}`,
                    diffDays, 
                    dia,
                    originalPhaseId: phase.id,
                    client
                  });
                }
              }

              // 2. Alerta de Atraso no Acompanhamento (> 2 meses sem atualizar pagamento)
              if (client.dealClosedDate) {
                const closedDate = new Date(client.dealClosedDate);
                if (!isNaN(closedDate.getTime())) {
                  const monthsPassed = (now.getFullYear() - closedDate.getFullYear()) * 12 + (now.getMonth() - closedDate.getMonth());
                  const parcelasPagasCount = (contract.parcelasPagas || []).filter(p => p).length;

                  if (monthsPassed >= 2) {
                    const gap = monthsPassed - parcelasPagasCount;
                    if (gap >= 2) {
                      parcelasAtrasadas.push({
                        clientName: client.name,
                        contractCat: contract.categoria || `Contrato ${idx + 1}`,
                        monthsPassed,
                        parcelasPagasCount,
                        originalPhaseId: phase.id,
                        client
                      });
                    }
                  }
                }
              }
            });
          }

          if (isNegociacao) {
            if (isCreatedCurrentMonth) {
              negMesAtual += creditValue;
            } else {
              negMesesAnteriores += creditValue;
            }
          }

          if (isNovo && daysInPhase >= 7) {
            estagnadosNovoCliente.push(client);
          }

          if (isContato) {
            contatosRealizados.push({ ...client, daysInPhase });
          }

          if (isStandby && daysInPhase >= 15) {
            standByAlerts.push({ ...client, daysInPhase });
          }
        });
      });
    }

    allClients.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    return { 
      inactive, noContact, hot, highChance, todayAppts, calls, whatsapps, sims, overdue, allClients,
      vendasMes, negMesAtual, negMesesAnteriores, estagnadosNovoCliente, contatosRealizados, standByAlerts, boletosProximos, parcelasAtrasadas 
    };
  }, [boardData]);

  const metaPercentage = metaMensalNumerica > 0 ? Math.min(Math.round((metrics.vendasMes / metaMensalNumerica) * 100), 100) : 0;
  
  // Cálculo de Comissionamento Estimado (Base temporária: 1% do valor vendido)
  const estimatedCommission = metrics.vendasMes * 0.01;

  const getGreeting = () => {
    const hour = getBrazilTime().getHours();
    if (hour >= 6 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const currentDate = getBrazilTime();
  const weekDays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const monthsCorrected = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const dateFormatted = `Hoje é ${weekDays[currentDate.getDay()]}, ${currentDate.getDate()} de ${monthsCorrected[currentDate.getMonth()]} de ${currentDate.getFullYear()}.`;

  const salesTips = useMemo(() => {
    let tips = [];
    if (metrics.hot > 0) {
      tips.push({
        title: "⚡ Abordagem Quente",
        desc: `Você possui ${metrics.hot} cliente(s) marcado(s) como quente(s). O calor da negociação esfria rápido em 48h. Conecte-se agora via WhatsApp ou Ligação.`
      });
    }
    if (boardsEngagementMetrics.disparazapCount > 0) {
      tips.push({
        title: "🤖 O Poder do DisparaZap",
        desc: `O sistema registrou ${boardsEngagementMetrics.disparazapCount} interações/disparos via DisparaZap na sua base. Monitore o retorno imediato desses leads para qualificar os interessados em consórcio.`
      });
    } else {
      tips.push({
        title: "🚀 Ative suas Campanhas em Massa",
        desc: "Notamos que o uso do DisparaZap está baixo nos registros dos seus boards. Utilize disparos segmentados para reaquecer sua base antiga de clientes."
      });
    }
    if (metrics.noContact > 0) {
      tips.push({
        title: "🎯 Redução de Fila Ociosa",
        desc: `Existem ${metrics.noContact} novos leads aguardando o primeiro contato. O primeiro a falar tem 7x mais chances de conversão no consórcio.`
      });
    }
    if (metrics.estagnadosNovoCliente.length > 0) {
      tips.push({
        title: "🔄 Resgate de Base",
        desc: `Há ${metrics.estagnadosNovoCliente.length} leads parados na coluna inicial. Utilize gatilhos de escassez ou novas simulações de parcelas para reengajá-los.`
      });
    }
    if (tips.length === 0) {
      tips.push({
        title: "💡 Prospecção Ativa Contínua",
        desc: "Sua carteira está limpa e organizada! Esse é o momento ideal para buscar novas indicações e disparar campanhas automatizadas."
      });
    }
    return tips;
  }, [metrics, boardsEngagementMetrics]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centerAll, isDarkMode && darkStyles.container]}>
        <ActivityIndicator size="large" color={isDarkMode ? '#38bdf8' : '#2563eb'} />
        <Text style={[styles.loadingText, isDarkMode && darkStyles.loadingText]}>Carregando sua central inteligente...</Text>
      </View>
    );
  }

  const themeStyles = isDarkMode ? darkStyles : lightStyles;
  const iconColor = isDarkMode ? '#94a3b8' : '#64748b';

  // Renderizador unificado dos botões de abas para manter código DRY
  const renderNavTabs = () => (
    <>
      <TouchableOpacity 
        style={[styles.navTabBtn, activeTab === 'overview' && themeStyles.navTabActive]} 
        onPress={() => setActiveTab('overview')}
      >
        <Text style={[styles.navTabText, themeStyles.navTabText, activeTab === 'overview' && themeStyles.navTabTextActive]}>Visão Geral</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.navTabBtn, activeTab === 'mentoria' && themeStyles.navTabActive]} 
        onPress={() => setActiveTab('mentoria')}
      >
        <Text style={[styles.navTabText, themeStyles.navTabText, activeTab === 'mentoria' && themeStyles.navTabTextActive]}>Mentoria & Dicas</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.navTabBtn, activeTab === 'desempenho' && themeStyles.navTabActive]} 
        onPress={() => setActiveTab('desempenho')}
      >
        <Text style={[styles.navTabText, themeStyles.navTabText, activeTab === 'desempenho' && themeStyles.navTabTextActive]}>Análise de Funil</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.navTabBtn, activeTab === 'engajamento' && themeStyles.navTabActive]} 
        onPress={() => setActiveTab('engajamento')}
      >
        <Text style={[styles.navTabText, themeStyles.navTabText, activeTab === 'engajamento' && themeStyles.navTabTextActive]}>Engajamento</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.navTabBtn, activeTab === 'comissao' && themeStyles.navTabActive]} 
        onPress={() => setActiveTab('comissao')}
      >
        <Text style={[styles.navTabText, themeStyles.navTabText, activeTab === 'comissao' && themeStyles.navTabTextActive]}>Comissionamento</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={[styles.outerContainer, themeStyles.outerContainer]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* HEADER EXECUTIVO */}
        <View style={[styles.heroSection, isMobile && styles.heroSectionMobile]}>
          <View>
            <Text style={[styles.greeting, themeStyles.greeting]}>{getGreeting()}, {firstName}!</Text>
            <Text style={[styles.dateText, themeStyles.dateText]}>{dateFormatted}</Text>
          </View>
          
          {/* ISOLAMENTO DA BARRA DE NAVEGAÇÃO: Mobile usa Scroll horizontal em 1 linha / PC usa o antigo Wrap */}
          {isMobile ? (
            <View style={[themeStyles.navTabsContainer, styles.navTabsWrapperMobile]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navTabsContainerMobileInner}>
                {renderNavTabs()}
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.navTabsContainer, themeStyles.navTabsContainer]}>
              {renderNavTabs()}
            </View>
          )}
        </View>

        {/* ABA: VISÃO GERAL */}
        {activeTab === 'overview' && (
          <View style={[styles.grid, isMobile && styles.gridMobile]}>
            
            <View style={[styles.mainColumn, isMobile && styles.columnMobile]}>
              
              {/* PAINEL DE METAS */}
              <View style={[styles.goalCardHero, themeStyles.goalCardHero]}>
                <View style={styles.goalHeaderRow}>
                  <View>
                    <Text style={[styles.goalTitleTag, themeStyles.goalTitleTag]}>🎯 Desempenho da Meta Mensal</Text>
                    <Text style={[styles.goalValueLarge, themeStyles.goalValueLarge]}>{formatCurrency(metrics.vendasMes)}</Text>
                  </View>
                  <View style={[styles.goalBadgeContainer, themeStyles.goalBadgeContainer]}>
                    <Text style={[styles.goalBadgeText, themeStyles.goalBadgeText]}>{metaPercentage}%</Text>
                  </View>
                </View>
                <View style={[styles.progressBarBg, themeStyles.progressBarBg]}>
                  <View style={[styles.progressBarFill, themeStyles.progressBarFill, { width: `${metaPercentage}%` }]} />
                </View>
                <View style={styles.goalMilestonesRow}>
                  <Text style={styles.goalMilestoneText}>0%</Text>
                  <Text style={styles.goalMilestoneText}>25%</Text>
                  <Text style={styles.goalMilestoneText}>50%</Text>
                  <Text style={styles.goalMilestoneText}>75%</Text>
                  <Text style={[styles.goalMilestoneText, metaPercentage >= 100 && { color: '#10b981', fontWeight: '800' }]}>100% Alvo</Text>
                </View>
                <View style={styles.goalFooterRow}>
                  <Text style={[styles.goalSubText, themeStyles.goalSubText]}>Meta Alvo: <Text style={{fontWeight: '700', color: isDarkMode ? '#f8fafc' : '#ffffff'}}>{formatCurrency(metaMensalNumerica)}</Text></Text>
                  <Text style={[styles.goalSubText, themeStyles.goalSubText]}>Falta p/ Bater: <Text style={{fontWeight: '700', color: '#38bdf8'}}>{formatCurrency(Math.max(0, metaMensalNumerica - metrics.vendasMes))}</Text></Text>
                </View>
              </View>

              {/* RESUMO DIÁRIO */}
              <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Indicadores Operacionais de Hoje</Text>
              <View style={[styles.summaryCard, themeStyles.summaryCard]}>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: 'rgba(239, 68, 68, 0.15)'} : {backgroundColor: '#fee2e2'}]}><Text style={styles.summaryIcon}>⏳</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '800', color: isDarkMode ? '#f87171' : '#dc2626'}}>{metrics.inactive}</Text> leads sem movimentação há mais de 3 dias</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: 'rgba(245, 158, 11, 0.15)'} : {backgroundColor: '#ffedd5'}]}><Text style={styles.summaryIcon}>⚡</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '800', color: isDarkMode ? '#fbbf24' : '#d97706'}}>{metrics.noContact}</Text> leads aguardando primeiro contato</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: 'rgba(16, 185, 129, 0.15)'} : {backgroundColor: '#dcfce7'}]}><Text style={styles.summaryIcon}>🔥</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '800', color: isDarkMode ? '#34d399' : '#059669'}}>{metrics.hot}</Text> clientes sinalizados como quentes no perfil</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: 'rgba(139, 92, 246, 0.15)'} : {backgroundColor: '#f3e8ff'}]}><Text style={styles.summaryIcon}>💎</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '800', color: isDarkMode ? '#a78bfa' : '#7c3aed'}}>{metrics.highChance}</Text> clientes com alta probabilidade de fechamento (&gt;=80%)</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: 'rgba(56, 189, 248, 0.15)'} : {backgroundColor: '#e0f2fe'}]}><Text style={styles.summaryIcon}>📅</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '800', color: isDarkMode ? '#38bdf8' : '#0284c7'}}>{metrics.todayAppts}</Text> agendamentos e compromissos programados para hoje</Text>
                </View>
              </View>

              {/* TAREFAS DIÁRIAS */}
              <Text style={[styles.sectionTitle, themeStyles.sectionTitle, { marginTop: 28 }]}>Atividades Executadas Hoje</Text>
              <View style={styles.tasksRow}>
                <View style={[styles.taskBox, themeStyles.taskBox]}>
                  <Text style={styles.taskIcon}>📞</Text>
                  <Text style={[styles.taskCount, themeStyles.taskCount]}>{metrics.calls} <Text style={{fontSize: 13, color: '#94a3b8'}}>/{metaDiariasLigacoes}</Text></Text>
                  <Text style={[styles.taskLabel, themeStyles.taskLabel]}>Ligações Feitas</Text>
                </View>
                <View style={[styles.taskBox, themeStyles.taskBox]}>
                  <Text style={styles.taskIcon}>💬</Text>
                  <Text style={[styles.taskCount, themeStyles.taskCount]}>{metrics.whatsapps}</Text>
                  <Text style={[styles.taskLabel, themeStyles.taskLabel]}>Mensagens WhatsApp</Text>
                </View>
                <View style={[styles.taskBox, themeStyles.taskBox]}>
                  <Text style={styles.taskIcon}>📄</Text>
                  <Text style={[styles.taskCount, themeStyles.taskCount]}>{metrics.sims} <Text style={{fontSize: 13, color: '#94a3b8'}}>/{metaDiariasSimulacoes}</Text></Text>
                  <Text style={[styles.taskLabel, themeStyles.taskLabel]}>Simulações</Text>
                </View>
                <View style={[styles.taskBox, themeStyles.taskBox]}>
                  <Text style={styles.taskIcon}>⏰</Text>
                  <Text style={[styles.taskCount, themeStyles.taskCount, metrics.overdue > 0 && {color: '#ef4444'}]}>{metrics.overdue}</Text>
                  <Text style={[styles.taskLabel, themeStyles.taskLabel]}>Tarefas Atrasadas</Text>
                </View>
              </View>

              {/* ÚLTIMAS INTERAÇÕES E COMISSIONAMENTO (Exibido apenas no celular na coluna principal) */}
              {isMobile && (
                <>
                  <Text style={[styles.sectionTitle, themeStyles.sectionTitle, { marginTop: 28 }]}>Últimas Interações</Text>
                  <View style={[styles.recentCard, themeStyles.recentCard]}>
                    {metrics.allClients.slice(0, 4).map((client, idx) => (
                      <TouchableOpacity 
                        key={client.id || idx} 
                        style={[styles.recentItem, idx !== 3 && themeStyles.recentBorder]} 
                        onPress={() => onOpenClient && onOpenClient(client, client.originalPhaseId)}
                      >
                        <View style={{flex: 1, paddingRight: 8}}>
                          <Text style={[styles.recentName, themeStyles.recentName]} numberOfLines={1}>{client.name}</Text>
                          <Text style={styles.recentCredit}>{formatCurrency(parseMoney(client.desiredCredit || client.valor || 0))}</Text>
                        </View>
                        <Text style={[styles.recentPhase, themeStyles.recentPhase]} numberOfLines={1}>{client.phaseTitle}</Text>
                      </TouchableOpacity>
                    ))}
                    {metrics.allClients.length === 0 && (
                      <Text style={[styles.emptyRecentText, themeStyles.emptyRecentText]}>Nenhuma movimentação registrada no CRM ainda.</Text>
                    )}
                  </View>

                  {/* Card de Comissionamento Mobile */}
                  <View style={[styles.commissionCard, themeStyles.commissionCard]}>
                    <View style={styles.commissionHeaderRow}>
                      <Text style={[styles.commissionCardTitle, themeStyles.commissionCardTitle]}>💰 Comissionamento (Mês Atual)</Text>
                      <EyeToggle isVisible={showCommission} onPress={toggleCommissionVisibility} color={iconColor} />
                    </View>
                    <Text style={[styles.commissionCardValue, themeStyles.commissionCardValue]}>
                      {showCommission ? formatCurrency(estimatedCommission) : 'R$ •••••••'}
                    </Text>
                    <Text style={[styles.commissionCardDesc, themeStyles.commissionCardDesc]}>
                      Baseado em {showCommission ? formatCurrency(metrics.vendasMes) : 'R$ •••••••'} de vendas fechadas.
                    </Text>
                  </View>
                </>
              )}

              {/* RAIO-X DO PIPELINE */}
              <View style={[styles.executiveSummary, themeStyles.executiveSummary, { marginTop: 28 }]}>
                <Text style={[styles.executiveSummaryText, themeStyles.executiveSummaryText]}>
                  💡 <Text style={{fontWeight: '700', color: isDarkMode ? '#f8fafc' : '#1e293b'}}>Raio-X do Pipeline:</Text> Você possui <Text style={styles.highlightText}>{formatCurrency(metrics.negMesAtual)}</Text> em negociações ativas geradas neste mês e <Text style={styles.highlightText}>{formatCurrency(metrics.negMesesAnteriores)}</Text> em oportunidades herdadas de meses anteriores que podem ser convertidas rapidamente.
                </Text>
              </View>

              {/* ALERTAS E OPORTUNIDADES (Exibido apenas no celular na base) */}
              {isMobile && (
                <>
                  <Text style={[styles.sectionTitle, themeStyles.sectionTitle, { marginTop: 28 }]}>Alertas e Oportunidades</Text>

                  {metrics.boletosProximos.length > 0 && (
                    metrics.boletosProximos.slice(0, 2).map((alert, idx) => (
                      <TouchableOpacity 
                        key={`bol_${idx}`} 
                        style={[styles.alertCardBoleto, themeStyles.alertCardBoleto]} 
                        onPress={() => onOpenClient && onOpenClient(alert.client, alert.originalPhaseId)}
                      >
                        <Text style={[styles.alertTitleBoleto, themeStyles.alertTitleBoleto]}>🗓️ Vencimento Próximo</Text>
                        <Text style={[styles.alertTextBoleto, themeStyles.alertTextBoleto]}>
                          O boleto de <Text style={{fontWeight: '700'}}>{alert.clientName}</Text> ({alert.contractCat}) vence {alert.diffDays === 0 ? 'hoje' : `em ${alert.diffDays} dia(s)`}.
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}

                  {metrics.parcelasAtrasadas.length > 0 && (
                    metrics.parcelasAtrasadas.slice(0, 2).map((alert, idx) => (
                      <TouchableOpacity 
                        key={`atr_${idx}`} 
                        style={[styles.alertCardDanger, themeStyles.alertCardDanger]} 
                        onPress={() => onOpenClient && onOpenClient(alert.client, alert.originalPhaseId)}
                      >
                        <Text style={[styles.alertTitleDanger, themeStyles.alertTitleDanger]}>⚠️ Atualize o Pós-Venda</Text>
                        <Text style={[styles.alertTextDanger, themeStyles.alertTextDanger]}>
                          O contrato de <Text style={{fontWeight: '700'}}>{alert.clientName}</Text> fechou há {alert.monthsPassed} meses, mas só {alert.parcelasPagasCount} parcela(s) constam como paga(s).
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}

                  {metrics.estagnadosNovoCliente.length > 0 && (
                    <View style={[styles.alertCardDanger, themeStyles.alertCardDanger]}>
                      <Text style={[styles.alertTitleDanger, themeStyles.alertTitleDanger]}>⚠️ Atenção Crítica de Base</Text>
                      <Text style={[styles.alertTextDanger, themeStyles.alertTextDanger]}>
                        {firstName}, existem {metrics.estagnadosNovoCliente.length} leads parados há mais de 7 dias na coluna inicial. O risco de perda de interesse é alto.
                      </Text>
                    </View>
                  )}

                  {metrics.standByAlerts.length > 0 && (
                    metrics.standByAlerts.slice(0, 2).map((client) => (
                      <TouchableOpacity 
                        key={client.id} 
                        style={[styles.alertCardInfo, themeStyles.alertCardInfo]} 
                        onPress={() => onOpenClient && onOpenClient(client, client.originalPhaseId)}
                      >
                        <Text style={[styles.alertTitleInfo, themeStyles.alertTitleInfo]}>🔄 Reengajamento StandBy</Text>
                        <Text style={[styles.alertTextInfo, themeStyles.alertTextInfo]}>
                          O cliente <Text style={{fontWeight: '700'}}>{client.name}</Text> está há {client.daysInPhase} dias em StandBy. Que tal enviar uma nova condição de consórcio?
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}

                  {metrics.estagnadosNovoCliente.length === 0 && metrics.standByAlerts.length === 0 && metrics.boletosProximos.length === 0 && metrics.parcelasAtrasadas.length === 0 && (
                    <View style={[styles.emptyStateCard, themeStyles.emptyStateCard]}>
                      <Text style={[styles.emptyStateText, themeStyles.emptyStateText]}>✨ Pipeline saudável! Sem gargalos críticos no momento.</Text>
                    </View>
                  )}
                </>
              )}

            </View>

            {/* Coluna Lateral (Exibida apenas no PC) */}
            {!isMobile && (
              <View style={styles.sideColumn}>
                <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Últimas Interações</Text>
                <View style={[styles.recentCard, themeStyles.recentCard]}>
                  {metrics.allClients.slice(0, 4).map((client, idx) => (
                    <TouchableOpacity 
                      key={client.id || idx} 
                      style={[styles.recentItem, idx !== 3 && themeStyles.recentBorder]} 
                      onPress={() => onOpenClient && onOpenClient(client, client.originalPhaseId)}
                    >
                      <View style={{flex: 1, paddingRight: 8}}>
                        <Text style={[styles.recentName, themeStyles.recentName]} numberOfLines={1}>{client.name}</Text>
                        <Text style={styles.recentCredit}>{formatCurrency(parseMoney(client.desiredCredit || client.valor || 0))}</Text>
                      </View>
                      <Text style={[styles.recentPhase, themeStyles.recentPhase]} numberOfLines={1}>{client.phaseTitle}</Text>
                    </TouchableOpacity>
                  ))}
                  {metrics.allClients.length === 0 && (
                    <Text style={[styles.emptyRecentText, themeStyles.emptyRecentText]}>Nenhuma movimentação registrada no CRM ainda.</Text>
                  )}
                </View>

                {/* Card de Comissionamento Desktop */}
                <View style={[styles.commissionCard, themeStyles.commissionCard]}>
                  <View style={styles.commissionHeaderRow}>
                    <Text style={[styles.commissionCardTitle, themeStyles.commissionCardTitle]}>💰 Comissionamento (Mês Atual)</Text>
                    <EyeToggle isVisible={showCommission} onPress={toggleCommissionVisibility} color={iconColor} />
                  </View>
                  <Text style={[styles.commissionCardValue, themeStyles.commissionCardValue]}>
                    {showCommission ? formatCurrency(estimatedCommission) : 'R$ •••••••'}
                  </Text>
                  <Text style={[styles.commissionCardDesc, themeStyles.commissionCardDesc]}>
                    Baseado em {showCommission ? formatCurrency(metrics.vendasMes) : 'R$ •••••••'} de vendas fechadas.
                  </Text>
                </View>

                <Text style={[styles.sectionTitle, themeStyles.sectionTitle, { marginTop: 28 }]}>Alertas e Oportunidades</Text>
                {metrics.boletosProximos.length > 0 && (
                  metrics.boletosProximos.slice(0, 2).map((alert, idx) => (
                    <TouchableOpacity 
                      key={`bol_${idx}`} 
                      style={[styles.alertCardBoleto, themeStyles.alertCardBoleto]} 
                      onPress={() => onOpenClient && onOpenClient(alert.client, alert.originalPhaseId)}
                    >
                      <Text style={[styles.alertTitleBoleto, themeStyles.alertTitleBoleto]}>🗓️ Vencimento Próximo</Text>
                      <Text style={[styles.alertTextBoleto, themeStyles.alertTextBoleto]}>
                        O boleto de <Text style={{fontWeight: '700'}}>{alert.clientName}</Text> ({alert.contractCat}) vence {alert.diffDays === 0 ? 'hoje' : `em ${alert.diffDays} dia(s)`}.
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
                {metrics.parcelasAtrasadas.length > 0 && (
                  metrics.parcelasAtrasadas.slice(0, 2).map((alert, idx) => (
                    <TouchableOpacity 
                      key={`atr_${idx}`} 
                      style={[styles.alertCardDanger, themeStyles.alertCardDanger]} 
                      onPress={() => onOpenClient && onOpenClient(alert.client, alert.originalPhaseId)}
                    >
                      <Text style={[styles.alertTitleDanger, themeStyles.alertTitleDanger]}>⚠️ Atualize o Pós-Venda</Text>
                      <Text style={[styles.alertTextDanger, themeStyles.alertTextDanger]}>
                        O contrato de <Text style={{fontWeight: '700'}}>{alert.clientName}</Text> fechou há {alert.monthsPassed} meses, mas só {alert.parcelasPagasCount} parcela(s) constam como paga(s).
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
                {metrics.estagnadosNovoCliente.length > 0 && (
                  <View style={[styles.alertCardDanger, themeStyles.alertCardDanger]}>
                    <Text style={[styles.alertTitleDanger, themeStyles.alertTitleDanger]}>⚠️ Atenção Crítica de Base</Text>
                    <Text style={[styles.alertTextDanger, themeStyles.alertTextDanger]}>
                      {firstName}, existem {metrics.estagnadosNovoCliente.length} leads parados há mais de 7 dias na coluna inicial. O risco de perda de interesse é alto.
                    </Text>
                  </View>
                )}
                {metrics.standByAlerts.length > 0 && (
                  metrics.standByAlerts.slice(0, 2).map((client) => (
                    <TouchableOpacity 
                      key={client.id} 
                      style={[styles.alertCardInfo, themeStyles.alertCardInfo]} 
                      onPress={() => onOpenClient && onOpenClient(client, client.originalPhaseId)}
                    >
                      <Text style={[styles.alertTitleInfo, themeStyles.alertTitleInfo]}>🔄 Reengajamento StandBy</Text>
                      <Text style={[styles.alertTextInfo, themeStyles.alertTextInfo]}>
                        O cliente <Text style={{fontWeight: '700'}}>{client.name}</Text> está há {client.daysInPhase} dias em StandBy. Que tal enviar uma nova condição de consórcio?
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
                {metrics.estagnadosNovoCliente.length === 0 && metrics.standByAlerts.length === 0 && metrics.boletosProximos.length === 0 && metrics.parcelasAtrasadas.length === 0 && (
                  <View style={[styles.emptyStateCard, themeStyles.emptyStateCard]}>
                    <Text style={[styles.emptyStateText, themeStyles.emptyStateText]}>✨ Pipeline saudável! Sem gargalos críticos no momento.</Text>
                  </View>
                )}
              </View>
            )}

          </View>
        )}

        {/* ABA: MENTORIA & DICAS */}
        {activeTab === 'mentoria' && (
          <View style={[styles.tabContentContainer, themeStyles.tabContentContainer]}>
            <View style={[styles.mentoriaHeroCard, themeStyles.mentoriaHeroCard]}>
              <Text style={[styles.mentoriaHeroTitle, themeStyles.mentoriaHeroTitle]}>🧠 Mentoria de Alta Performance em Vendas</Text>
              <Text style={[styles.mentoriaHeroSubtitle, themeStyles.mentoriaHeroSubtitle]}>
                Orientações diárias geradas com base no seu volume atual de conversão, estratégias de grandes CRMs e técnicas avançadas de fechamento de consórcios.
              </Text>
            </View>

            <Text style={[styles.sectionTitle, themeStyles.sectionTitle, { marginTop: 24 }]}>Sugestões Estratégicas para o Momento Atual</Text>
            
            {salesTips.map((tip, index) => (
              <View key={index} style={[styles.tipCard, themeStyles.tipCard]}>
                <Text style={[styles.tipCardTitle, themeStyles.tipCardTitle]}>{tip.title}</Text>
                <Text style={[styles.tipCardDesc, themeStyles.tipCardDesc]}>{tip.desc}</Text>
              </View>
            ))}

            <View style={[styles.quoteCard, themeStyles.quoteCard]}>
              <Text style={[styles.quoteText, themeStyles.quoteText]}>
                "No consórcio, você não vende apenas um bem futuro; você vende planejamento, segurança e realização de patrimônio. Ouça mais as necessidades do cliente antes de falar de parcelas."
              </Text>
              <Text style={[styles.quoteAuthor, themeStyles.quoteAuthor]}>— Masterclass de Fechamento de Vendas</Text>
            </View>
          </View>
        )}

        {/* ABA: ANÁLISE DE FUNIL */}
        {activeTab === 'desempenho' && (
          <View style={[styles.tabContentContainer, themeStyles.tabContentContainer]}>
            <View style={styles.funnelHeaderBox}>
              <Text style={[styles.funnelHeaderTitle, themeStyles.funnelHeaderTitle]}>📊 Raio-X do Funil Comercial</Text>
              <Text style={[styles.funnelHeaderDesc, themeStyles.funnelHeaderDesc]}>
                Acompanhe a distribuição financeira do seu pipeline de vendas atual dividido por estágios.
              </Text>
            </View>

            <View style={styles.funnelMetricsGrid}>
              <View style={[styles.funnelBox, themeStyles.funnelBox]}>
                <Text style={[styles.funnelBoxLabel, themeStyles.funnelBoxLabel]}>Vendas Concluídas no Mês</Text>
                <Text style={[styles.funnelBoxVal, {color: '#16a34a'}]}>{formatCurrency(metrics.vendasMes)}</Text>
              </View>
              <View style={[styles.funnelBox, themeStyles.funnelBox]}>
                <Text style={[styles.funnelBoxLabel, themeStyles.funnelBoxLabel]}>Em Negociação (Mês Atual)</Text>
                <Text style={[styles.funnelBoxVal, {color: '#2563eb'}]}>{formatCurrency(metrics.negMesAtual)}</Text>
              </View>
              <View style={[styles.funnelBox, themeStyles.funnelBox]}>
                <Text style={[styles.funnelBoxLabel, themeStyles.funnelBoxLabel]}>Negociações Antigas Pendentes</Text>
                <Text style={[styles.funnelBoxVal, {color: '#d97706'}]}>{formatCurrency(metrics.negMesesAnteriores)}</Text>
              </View>
            </View>

            <View style={[styles.conversionTipsBox, themeStyles.conversionTipsBox]}>
              <Text style={[styles.conversionTipsTitle, themeStyles.conversionTipsTitle]}>💡 Como acelerar o ciclo de conversão:</Text>
              <Text style={[styles.conversionTipsText, themeStyles.conversionTipsText]}>1. Clientes em negociação há mais de 10 dias devem receber uma mensagem de escassez sobre reajustes de tabela.</Text>
              <Text style={[styles.conversionTipsText, themeStyles.conversionTipsText]}>2. Valide se todos os leads quentes possuem simulações em PDF enviadas no chat.</Text>
              <Text style={[styles.conversionTipsText, themeStyles.conversionTipsText]}>3. Mantenha suas ligações diárias alinhadas à meta configurada para garantir previsibilidade de comissão.</Text>
            </View>
          </View>
        )}

        {/* ABA: ENGAJAMENTO & DISPARAZAP */}
        {activeTab === 'engajamento' && (
          <View style={[styles.tabContentContainer, themeStyles.tabContentContainer]}>
            <View style={styles.funnelHeaderBox}>
              <Text style={[styles.funnelHeaderTitle, themeStyles.funnelHeaderTitle]}>⚡ Análise Consolidada de Engajamento e DisparaZap</Text>
              <Text style={[styles.funnelHeaderDesc, themeStyles.funnelHeaderDesc]}>
                Métricas extraídas diretamente dos registros de dados salvos nos boards do sistema para apoiar e motivar sua rotina de vendas, {firstName}.
              </Text>
            </View>

            <View style={styles.funnelMetricsGrid}>
              <View style={[styles.funnelBox, themeStyles.funnelBox]}>
                <Text style={[styles.funnelBoxLabel, themeStyles.funnelBoxLabel]}>Disparos / Uso DisparaZap</Text>
                <Text style={[styles.funnelBoxVal, {color: '#9333ea'}]}>{boardsEngagementMetrics.disparazapCount} <Text style={{fontSize: 14, color: '#64748b'}}>envios</Text></Text>
              </View>
              <View style={[styles.funnelBox, themeStyles.funnelBox]}>
                <Text style={[styles.funnelBoxLabel, themeStyles.funnelBoxLabel]}>Comentários Registrados</Text>
                <Text style={[styles.funnelBoxVal, {color: '#0284c7'}]}>{boardsEngagementMetrics.totalCommentsCount} <Text style={{fontSize: 14, color: '#64748b'}}>notas</Text></Text>
              </View>
              <View style={[styles.funnelBox, themeStyles.funnelBox]}>
                <Text style={[styles.funnelBoxLabel, themeStyles.funnelBoxLabel]}>Notificações / Agendas</Text>
                <Text style={[styles.funnelBoxVal, {color: '#ca8a04'}]}>{boardsEngagementMetrics.totalNotificationsCount} <Text style={{fontSize: 14, color: '#64748b'}}>avisos</Text></Text>
              </View>
            </View>

            <View style={[styles.motivationPayloadBox, themeStyles.motivationPayloadBox]}>
              <Text style={[styles.motivationPayloadTitle, themeStyles.motivationPayloadTitle]}>🎯 Avaliação de Produtividade Baseada em Engajamento</Text>
              <Text style={[styles.motivationPayloadText, themeStyles.motivationPayloadText]}>
                {boardsEngagementMetrics.disparazapCount > 5 
                  ? `Parabéns, ${firstName}! Você está utilizando ativamente o DisparaZap para prospectar em massa. Continue alimentando o funil com novos contatos para manter suas colunas de negociação aquecidas.`
                  : `Dica de Ouro: Identificamos que o uso do DisparaZap pode ser intensificado. Utilize as ferramentas de automação para disparar mensagens em massa e acelerar a captação de novos clientes.`}
              </Text>
              <Text style={[styles.motivationPayloadText, themeStyles.motivationPayloadText, {marginTop: 12}]}>
                Além disso, seus cards acumulam um total de <Text style={{fontWeight: '700', color: isDarkMode ? '#f8fafc' : '#1e293b'}}>{boardsEngagementMetrics.totalCommentsCount} comentários</Text> de histórico. Histórico detalhado é sinônimo de fechamento certeiro!
              </Text>
            </View>
          </View>
        )}

        {/* ABA: COMISSIONAMENTO */}
        {activeTab === 'comissao' && (
          <View style={[styles.tabContentContainer, themeStyles.tabContentContainer]}>
            <View style={[styles.mentoriaHeroCard, themeStyles.commissionHeroCard]}>
              <View style={styles.commissionHeaderRow}>
                <View>
                  <Text style={[styles.mentoriaHeroTitle, themeStyles.commissionHeroTitle]}>💸 Comissionamento Atual</Text>
                  <Text style={[styles.mentoriaHeroSubtitle, themeStyles.commissionHeroSubtitle]}>
                    Acompanhe sua projeção de ganhos com base nas vendas concluídas neste mês.
                  </Text>
                </View>
                <EyeToggle isVisible={showCommission} onPress={toggleCommissionVisibility} color={isDarkMode ? '#34d399' : '#065f46'} />
              </View>
              <Text style={[styles.commissionMainValue, themeStyles.commissionMainValue]}>
                {showCommission ? formatCurrency(estimatedCommission) : 'R$ •••••••'}
              </Text>
            </View>

            <Text style={[styles.sectionTitle, themeStyles.sectionTitle, { marginTop: 24 }]}>Detalhamento (Em Construção 🚧)</Text>
            <View style={[styles.tipCard, themeStyles.tipCard]}>
              <Text style={[styles.tipCardDesc, themeStyles.tipCardDesc]}>
                Futuramente, este painel exibirá o cálculo exato do seu comissionamento, incluindo bônus por engajamento, taxas de conversão de funil e aceleradores de meta. Continue cadastrando suas vendas para manter os dados atualizados.
              </Text>
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1 },
  container: { flex: 1 },
  centerAll: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '500' },
  content: { padding: 32, maxWidth: 1200, marginHorizontal: 'auto', width: '100%', paddingBottom: 85 },
  
  heroSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 16, flexWrap: 'wrap' },
  heroSectionMobile: { flexDirection: 'column', alignItems: 'flex-start' },
  greeting: { fontFamily: MODERN_FONT, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  dateText: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '500', marginTop: 4 }, 
  
  navTabsContainer: { flexDirection: 'row', padding: 4, borderRadius: 12, gap: 4, flexWrap: 'wrap' },
  navTabsWrapperMobile: { width: '100%', borderRadius: 12, paddingVertical: 4 },
  navTabsContainerMobileInner: { flexDirection: 'row', paddingHorizontal: 4, gap: 6, alignItems: 'center' },
  navTabsContainerMobile: { width: '100%' },
  navTabBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, ...Platform.select({ web: { transition: 'all 0.15s ease', cursor: 'pointer' } }) },
  navTabText: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '600' },

  grid: { flexDirection: 'row', gap: 24 },
  gridMobile: { flexDirection: 'column', gap: 0 },
  mainColumn: { flex: 1.8 },
  sideColumn: { flex: 1.2 },
  columnMobile: { width: '100%', flex: undefined },
  
  sectionTitle: { fontFamily: MODERN_FONT, fontSize: 15, fontWeight: '700', letterSpacing: -0.2, marginBottom: 12, textTransform: 'uppercase' },
  
  goalCardHero: { 
    borderRadius: 20, 
    padding: 24, 
    marginBottom: 24, 
    borderWidth: 1,
    borderTopWidth: 3,
    ...Platform.select({ web: { boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06)' } }) 
  },
  goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  goalTitleTag: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  goalValueLarge: { fontFamily: MODERN_FONT, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  goalBadgeContainer: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9999, borderWidth: 1 },
  goalBadgeText: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '800' },
  progressBarBg: { height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 12, position: 'relative' },
  progressBarFill: { height: '100%', borderRadius: 6 },
  goalMilestonesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 10, paddingHorizontal: 2 },
  goalMilestoneText: { fontFamily: MODERN_FONT, fontSize: 10, fontWeight: '600', color: '#94a3b8' },
  goalFooterRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  goalSubText: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '500' },

  summaryCard: { borderRadius: 16, padding: 18, borderWidth: 1, ...Platform.select({ web: { boxShadow: '0 2px 6px rgba(0,0,0,0.03)' } }) },
  summaryItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 14 },
  iconBox: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  summaryIcon: { fontSize: 16 },
  summaryText: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },

  tasksRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  taskBox: { 
    flex: 1, 
    minWidth: 110, 
    borderRadius: 14, 
    paddingVertical: 18, 
    paddingHorizontal: 12, 
    alignItems: 'center', 
    borderWidth: 1, 
    ...Platform.select({ web: { boxShadow: '0 2px 6px rgba(0,0,0,0.03)', transition: 'transform 0.15s ease' } }) 
  },
  taskIcon: { fontSize: 20, marginBottom: 6 },
  taskCount: { fontFamily: MODERN_FONT, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  taskLabel: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },

  executiveSummary: { 
    padding: 20, 
    borderRadius: 14, 
    borderLeftWidth: 4, 
    borderWidth: 1,
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.04)' } })
  },
  executiveSummaryText: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 22, fontWeight: '500' },
  highlightText: { color: '#2563eb', fontWeight: '800' },

  recentCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.03)' } }) },
  recentItem: { paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentName: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '700' },
  recentCredit: { fontFamily: MODERN_FONT, fontSize: 12, color: '#059669', fontWeight: '700', marginTop: 2 },
  recentPhase: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden', maxWidth: 120, textAlign: 'center' },
  emptyRecentText: { fontFamily: MODERN_FONT, fontSize: 13, paddingVertical: 20, textAlign: 'center', fontStyle: 'italic' },

  commissionCard: { 
    borderRadius: 16, 
    padding: 20, 
    borderWidth: 1, 
    marginTop: 20, 
    ...Platform.select({ web: { boxShadow: '0 4px 12px rgba(0,0,0,0.04)' } }) 
  },
  commissionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  commissionCardTitle: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  commissionCardValue: { fontFamily: MODERN_FONT, fontSize: 26, fontWeight: '800', marginBottom: 4, letterSpacing: -0.5 },
  commissionCardDesc: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '500' },

  alertCardDanger: { borderRadius: 14, padding: 16, borderWidth: 1, borderLeftWidth: 4, borderLeftColor: '#ef4444', marginBottom: 12 },
  alertTitleDanger: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  alertTextDanger: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 19 },

  alertCardInfo: { borderRadius: 14, padding: 16, borderWidth: 1, borderLeftWidth: 4, borderLeftColor: '#0284c7', marginBottom: 12, ...Platform.select({ web: { cursor: 'pointer' } }) },
  alertTitleInfo: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  alertTextInfo: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 19 },

  alertCardBoleto: { borderRadius: 14, padding: 16, borderWidth: 1, borderLeftWidth: 4, borderLeftColor: '#d97706', marginBottom: 12, ...Platform.select({ web: { cursor: 'pointer' } }) },
  alertTitleBoleto: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  alertTextBoleto: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 19 },

  emptyStateCard: { borderRadius: 14, padding: 24, borderWidth: 1, alignItems: 'center' },
  emptyStateText: { fontFamily: MODERN_FONT, fontSize: 13, textAlign: 'center', fontWeight: '500' },

  tabContentContainer: { borderRadius: 16, padding: 28, borderWidth: 1, ...Platform.select({ web: { boxShadow: '0 4px 14px rgba(0,0,0,0.03)' } }) },
  mentoriaHeroCard: { padding: 24, borderRadius: 14, borderWidth: 1 },
  mentoriaHeroTitle: { fontFamily: MODERN_FONT, fontSize: 18, fontWeight: '800', marginBottom: 8, letterSpacing: -0.3 },
  mentoriaHeroSubtitle: { fontFamily: MODERN_FONT, fontSize: 14, lineHeight: 22, fontWeight: '500' },

  commissionMainValue: { fontFamily: MODERN_FONT, fontSize: 36, fontWeight: '800', marginTop: 16, letterSpacing: -1 },

  tipCard: { padding: 18, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  tipCardTitle: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  tipCardDesc: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 20, fontWeight: '500' },

  quoteCard: { marginTop: 16, padding: 20, borderRadius: 14, borderWidth: 1 },
  quoteText: { fontFamily: MODERN_FONT, fontSize: 13, fontStyle: 'italic', lineHeight: 22, marginBottom: 8 },
  quoteAuthor: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  funnelHeaderBox: { marginBottom: 20 },
  funnelHeaderTitle: { fontFamily: MODERN_FONT, fontSize: 18, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
  funnelHeaderDesc: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '500' },

  funnelMetricsGrid: { flexDirection: 'row', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  funnelBox: { flex: 1, minWidth: 180, padding: 20, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  funnelBoxLabel: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 },
  funnelBoxVal: { fontFamily: MODERN_FONT, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },

  conversionTipsBox: { padding: 20, borderRadius: 14, borderWidth: 1 },
  conversionTipsTitle: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '800', marginBottom: 10 },
  conversionTipsText: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 22, marginBottom: 4, fontWeight: '500' },

  motivationPayloadBox: { padding: 22, borderRadius: 14, borderWidth: 1 },
  motivationPayloadTitle: { fontFamily: MODERN_FONT, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  motivationPayloadText: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 22, fontWeight: '500' }
});

// Estilos de Tema Claro
const lightStyles = StyleSheet.create({
  outerContainer: { backgroundColor: TOKENS.light.background },
  loadingText: { color: TOKENS.light.textSecondary },
  greeting: { color: TOKENS.light.textPrimary },
  dateText: { color: TOKENS.light.textMuted },
  navTabsContainer: { backgroundColor: TOKENS.light.surfaceSubtle, borderWidth: 1, borderColor: TOKENS.light.border },
  navTabActive: { backgroundColor: '#ffffff', ...TOKENS.light.cardShadow },
  navTabText: { color: TOKENS.light.textSecondary },
  navTabTextActive: { color: TOKENS.light.primary, fontWeight: '700' },
  sectionTitle: { color: TOKENS.light.textSecondary },
  goalCardHero: { backgroundColor: '#0f172a', borderColor: '#1e293b', borderTopColor: '#38bdf8' },
  goalTitleTag: { color: '#94a3b8' },
  goalValueLarge: { color: '#ffffff' },
  goalBadgeContainer: { backgroundColor: 'rgba(56, 189, 248, 0.12)', borderColor: 'rgba(56, 189, 248, 0.3)' },
  goalBadgeText: { color: '#38bdf8' },
  progressBarBg: { backgroundColor: '#1e293b' },
  progressBarFill: { backgroundColor: '#10b981' },
  goalSubText: { color: '#94a3b8' },
  summaryCard: { backgroundColor: TOKENS.light.surface, borderColor: TOKENS.light.border },
  summaryText: { color: TOKENS.light.textPrimary },
  taskBox: { backgroundColor: TOKENS.light.surface, borderColor: TOKENS.light.border },
  taskCount: { color: TOKENS.light.textPrimary },
  taskLabel: { color: TOKENS.light.textSecondary },
  executiveSummary: { backgroundColor: TOKENS.light.surface, borderLeftColor: TOKENS.light.primary, borderColor: TOKENS.light.border },
  executiveSummaryText: { color: TOKENS.light.textPrimary },
  recentCard: { backgroundColor: TOKENS.light.surface, borderColor: TOKENS.light.border },
  recentBorder: { borderBottomWidth: 1, borderBottomColor: TOKENS.light.borderSubtle },
  recentName: { color: TOKENS.light.textPrimary },
  recentPhase: { color: TOKENS.light.textSecondary, backgroundColor: TOKENS.light.surfaceSubtle },
  emptyRecentText: { color: TOKENS.light.textMuted },
  commissionCard: { backgroundColor: TOKENS.light.surface, borderColor: TOKENS.light.border },
  commissionCardTitle: { color: TOKENS.light.textPrimary },
  commissionCardValue: { color: TOKENS.light.success },
  commissionCardDesc: { color: TOKENS.light.textSecondary },
  alertCardDanger: { backgroundColor: TOKENS.light.dangerSubtle, borderColor: TOKENS.light.dangerBorder },
  alertTitleDanger: { color: TOKENS.light.danger },
  alertTextDanger: { color: '#991b1b' },
  alertCardInfo: { backgroundColor: TOKENS.light.infoSubtle, borderColor: TOKENS.light.infoBorder },
  alertTitleInfo: { color: TOKENS.light.info },
  alertTextInfo: { color: '#0369a1' },
  alertCardBoleto: { backgroundColor: TOKENS.light.warningSubtle, borderColor: TOKENS.light.warningBorder },
  alertTitleBoleto: { color: TOKENS.light.warning },
  alertTextBoleto: { color: '#92400e' },
  emptyStateCard: { backgroundColor: TOKENS.light.surface, borderColor: TOKENS.light.border },
  emptyStateText: { color: TOKENS.light.textSecondary },
  tabContentContainer: { backgroundColor: TOKENS.light.surface, borderColor: TOKENS.light.border },
  mentoriaHeroCard: { backgroundColor: TOKENS.light.primarySubtle, borderColor: '#bfdbfe' },
  mentoriaHeroTitle: { color: '#1e40af' },
  mentoriaHeroSubtitle: { color: '#1e3a8a' },
  commissionHeroCard: { backgroundColor: TOKENS.light.successSubtle, borderColor: TOKENS.light.successBorder },
  commissionHeroTitle: { color: '#065f46' },
  commissionHeroSubtitle: { color: '#047857' },
  commissionMainValue: { color: '#064e3b' },
  tipCard: { backgroundColor: TOKENS.light.surfaceSubtle, borderColor: TOKENS.light.border },
  tipCardTitle: { color: TOKENS.light.textPrimary },
  tipCardDesc: { color: TOKENS.light.textSecondary },
  quoteCard: { backgroundColor: '#fdf4ff', borderColor: '#f5d0fe' },
  quoteText: { color: '#86198f' },
  quoteAuthor: { color: '#701a75' },
  funnelHeaderTitle: { color: TOKENS.light.textPrimary },
  funnelHeaderDesc: { color: TOKENS.light.textSecondary },
  funnelBox: { backgroundColor: TOKENS.light.surfaceSubtle, borderColor: TOKENS.light.border },
  funnelBoxLabel: { color: TOKENS.light.textMuted },
  conversionTipsBox: { backgroundColor: TOKENS.light.successSubtle, borderColor: TOKENS.light.successBorder },
  conversionTipsTitle: { color: '#166534' },
  conversionTipsText: { color: '#14532d' },
  motivationPayloadBox: { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
  motivationPayloadTitle: { color: '#7e22ce' },
  motivationPayloadText: { color: '#6b21a8' }
});

// Estilos de Tema Escuro
const darkStyles = StyleSheet.create({
  outerContainer: { backgroundColor: TOKENS.dark.background },
  loadingText: { color: TOKENS.dark.textSecondary },
  greeting: { color: TOKENS.dark.textPrimary },
  dateText: { color: TOKENS.dark.textMuted },
  navTabsContainer: { backgroundColor: TOKENS.dark.surfaceSubtle, borderWidth: 1, borderColor: TOKENS.dark.border },
  navTabActive: { backgroundColor: TOKENS.dark.surfaceHover, ...TOKENS.dark.cardShadow },
  navTabText: { color: TOKENS.dark.textMuted },
  navTabTextActive: { color: '#ffffff', fontWeight: '700' },
  sectionTitle: { color: TOKENS.dark.textSecondary },
  goalCardHero: { backgroundColor: '#101726', borderColor: TOKENS.dark.border, borderTopColor: '#38bdf8' },
  goalTitleTag: { color: '#94a3b8' },
  goalValueLarge: { color: '#f8fafc' },
  goalBadgeContainer: { backgroundColor: 'rgba(56, 189, 248, 0.12)', borderColor: 'rgba(56, 189, 248, 0.3)' },
  goalBadgeText: { color: '#38bdf8' },
  progressBarBg: { backgroundColor: '#0b0f19' },
  progressBarFill: { backgroundColor: '#10b981' },
  goalSubText: { color: '#94a3b8' },
  summaryCard: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  summaryText: { color: TOKENS.dark.textPrimary },
  taskBox: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  taskCount: { color: TOKENS.dark.textPrimary },
  taskLabel: { color: TOKENS.dark.textSecondary },
  executiveSummary: { backgroundColor: TOKENS.dark.surface, borderLeftColor: TOKENS.dark.primary, borderColor: TOKENS.dark.border },
  executiveSummaryText: { color: TOKENS.dark.textPrimary },
  recentCard: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  recentBorder: { borderBottomWidth: 1, borderBottomColor: TOKENS.dark.borderSubtle },
  recentName: { color: TOKENS.dark.textPrimary },
  recentPhase: { color: TOKENS.dark.textSecondary, backgroundColor: TOKENS.dark.surfaceSubtle },
  emptyRecentText: { color: TOKENS.dark.textMuted },
  commissionCard: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  commissionCardTitle: { color: TOKENS.dark.textPrimary },
  commissionCardValue: { color: TOKENS.dark.success },
  commissionCardDesc: { color: TOKENS.dark.textSecondary },
  alertCardDanger: { backgroundColor: TOKENS.dark.dangerSubtle, borderColor: TOKENS.dark.dangerBorder },
  alertTitleDanger: { color: TOKENS.dark.danger },
  alertTextDanger: { color: '#fecaca' },
  alertCardInfo: { backgroundColor: TOKENS.dark.infoSubtle, borderColor: TOKENS.dark.infoBorder },
  alertTitleInfo: { color: TOKENS.dark.info },
  alertTextInfo: { color: '#7dd3fc' },
  alertCardBoleto: { backgroundColor: TOKENS.dark.warningSubtle, borderColor: TOKENS.dark.warningBorder },
  alertTitleBoleto: { color: TOKENS.dark.warning },
  alertTextBoleto: { color: '#fde68a' },
  emptyStateCard: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  emptyStateText: { color: TOKENS.dark.textSecondary },
  tabContentContainer: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  mentoriaHeroCard: { backgroundColor: '#172554', borderColor: '#1d4ed8' },
  mentoriaHeroTitle: { color: '#93c5fd' },
  mentoriaHeroSubtitle: { color: '#bfdbfe' },
  commissionHeroCard: { backgroundColor: '#064e3b', borderColor: '#047857' },
  commissionHeroTitle: { color: '#34d399' },
  commissionHeroSubtitle: { color: '#a7f3d0' },
  commissionMainValue: { color: '#f8fafc' },
  tipCard: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  tipCardTitle: { color: TOKENS.dark.textPrimary },
  tipCardDesc: { color: TOKENS.dark.textSecondary },
  quoteCard: { backgroundColor: '#4a044e', borderColor: '#701a75' },
  quoteText: { color: '#f5d0fe' },
  quoteAuthor: { color: '#e879f9' },
  funnelHeaderTitle: { color: TOKENS.dark.textPrimary },
  funnelHeaderDesc: { color: TOKENS.dark.textMuted },
  funnelBox: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  funnelBoxLabel: { color: TOKENS.dark.textMuted },
  conversionTipsBox: { backgroundColor: '#052e16', borderColor: '#14532d' },
  conversionTipsTitle: { color: '#86efac' },
  conversionTipsText: { color: '#bbf7d0' },
  motivationPayloadBox: { backgroundColor: '#3b0764', borderColor: '#6b21a8' },
  motivationPayloadTitle: { color: '#d8b4fe' },
  motivationPayloadText: { color: '#e9d5ff' }
});