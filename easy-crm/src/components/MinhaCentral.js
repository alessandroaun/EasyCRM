import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, useWindowDimensions, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../services/supabaseClient';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

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

export default function MinhaCentral({ boardData, onOpenClient, isDarkMode }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 850;

  const [config, setConfig] = useState(null);
  const [userProfileName, setUserProfileName] = useState(null);
  
  // Alterado nome do estado para evitar termos técnicos
  const [boardsEngagementMetrics, setBoardsEngagementMetrics] = useState({
    disparazapCount: 0,
    totalCommentsCount: 0,
    totalNotificationsCount: 0,
    activeCampaigns: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'mentoria' | 'desempenho' | 'engajamento'

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

  const getGreeting = () => {
    const hour = getBrazilTime().getHours();
    if (hour >= 6 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const currentDate = getBrazilTime();
  const weekDays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const months = ['agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho'];
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

  return (
    <View style={[styles.outerContainer, themeStyles.outerContainer]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* HEADER EXECUTIVO */}
        <View style={[styles.heroSection, isMobile && styles.heroSectionMobile]}>
          <View>
            <Text style={[styles.greeting, themeStyles.greeting]}>{getGreeting()}, {firstName}!</Text>
            <Text style={[styles.dateText, themeStyles.dateText]}>{dateFormatted}</Text>
          </View>
          <View style={[styles.navTabsContainer, themeStyles.navTabsContainer, isMobile && styles.navTabsContainerMobile]}>
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
              <Text style={[styles.navTabText, themeStyles.navTabText, activeTab === 'engajamento' && themeStyles.navTabTextActive]}>Engajamento & DisparaZap</Text>
            </TouchableOpacity>
          </View>
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
                <View style={styles.goalFooterRow}>
                  <Text style={[styles.goalSubText, themeStyles.goalSubText]}>Meta Alvo: <Text style={{fontWeight: '700', color: isDarkMode ? '#f8fafc' : '#ffffff'}}>{formatCurrency(metaMensalNumerica)}</Text></Text>
                  <Text style={[styles.goalSubText, themeStyles.goalSubText]}>Falta: <Text style={{fontWeight: '700', color: '#38bdf8'}}>{formatCurrency(Math.max(0, metaMensalNumerica - metrics.vendasMes))}</Text></Text>
                </View>
              </View>

              {/* RESUMO DIÁRIO */}
              <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Indicadores Operacionais de Hoje</Text>
              <View style={[styles.summaryCard, themeStyles.summaryCard]}>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: '#450a0a'} : {backgroundColor: '#fee2e2'}]}><Text style={styles.summaryIcon}>🔴</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '700'}}>{metrics.inactive}</Text> leads sem movimentações há mais de 3 dias</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: '#431407'} : {backgroundColor: '#ffedd5'}]}><Text style={styles.summaryIcon}>🟠</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '700'}}>{metrics.noContact}</Text> leads ainda aguardando primeiro contato</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: '#052e16'} : {backgroundColor: '#dcfce7'}]}><Text style={styles.summaryIcon}>🟢</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '700'}}>{metrics.hot}</Text> clientes sinalizados como quentes no perfil</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: '#3b0764'} : {backgroundColor: '#f3e8ff'}]}><Text style={styles.summaryIcon}>⭐</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '700'}}>{metrics.highChance}</Text> clientes com alta probabilidade de fechamento (&gt;=80%)</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={[styles.iconBox, isDarkMode ? {backgroundColor: '#082f49'} : {backgroundColor: '#e0f2fe'}]}><Text style={styles.summaryIcon}>📅</Text></View>
                  <Text style={[styles.summaryText, themeStyles.summaryText]}><Text style={{fontWeight: '700'}}>{metrics.todayAppts}</Text> agendamentos e compromissos programados para hoje</Text>
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

              {/* ÚLTIMAS INTERAÇÕES (Exibido apenas no celular) */}
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

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1 },
  container: { flex: 1 },
  centerAll: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontFamily: MODERN_FONT, fontSize: 13 },
  content: { padding: 32, maxWidth: 1150, marginHorizontal: 'auto', width: '100%', paddingBottom: 85 },
  
  heroSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 16, flexWrap: 'wrap' },
  heroSectionMobile: { flexDirection: 'column', alignItems: 'flex-start' },
  greeting: { fontFamily: MODERN_FONT, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  dateText: { fontFamily: MODERN_FONT, fontSize: 14, marginTop: 4 }, // Removido capitalize para ficar tudo minúsculo conforme solicitado
  
  navTabsContainer: { flexDirection: 'row', padding: 4, borderRadius: 10, gap: 4, flexWrap: 'wrap' },
  navTabsContainerMobile: { width: '100%' },
  navTabBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  navTabText: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '600' },

  grid: { flexDirection: 'row', gap: 24 },
  gridMobile: { flexDirection: 'column', gap: 0 },
  mainColumn: { flex: 1.8 },
  sideColumn: { flex: 1.2 },
  columnMobile: { width: '100%', flex: undefined },
  
  sectionTitle: { fontFamily: MODERN_FONT, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  
  goalCardHero: { borderRadius: 16, padding: 24, marginBottom: 24, ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(0, 0, 0, 0.15)' } }) },
  goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  goalTitleTag: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  goalValueLarge: { fontFamily: MODERN_FONT, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  goalBadgeContainer: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  goalBadgeText: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '800' },
  progressBarBg: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
  progressBarFill: { height: '100%', borderRadius: 5 },
  goalFooterRow: { flexDirection: 'row', justifyContent: 'space-between' },
  goalSubText: { fontFamily: MODERN_FONT, fontSize: 12 },

  summaryCard: { borderRadius: 14, padding: 20, borderWidth: 1, ...Platform.select({ web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.02)' } }) },
  summaryItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  iconBox: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  summaryIcon: { fontSize: 16 },
  summaryText: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '500', flex: 1 },

  tasksRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  taskBox: { flex: 1, minWidth: 110, borderRadius: 12, paddingVertical: 18, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, ...Platform.select({ web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.02)' } }) },
  taskIcon: { fontSize: 22, marginBottom: 8 },
  taskCount: { fontFamily: MODERN_FONT, fontSize: 22, fontWeight: '900' },
  taskLabel: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },

  executiveSummary: { 
    padding: 18, 
    borderRadius: 12, 
    borderLeftWidth: 4, 
    borderWidth: 1,
    ...Platform.select({ web: { boxShadow: '0px 2px 5px rgba(0,0,0,0.02)' } })
  },
  executiveSummaryText: { fontFamily: MODERN_FONT, fontSize: 14, lineHeight: 22 },
  highlightText: { color: '#2563eb', fontWeight: '800' },

  recentCard: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 6, ...Platform.select({ web: { boxShadow: '0px 4px 10px rgba(0,0,0,0.02)' } }) },
  recentItem: { paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentName: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '700' },
  recentCredit: { fontFamily: MODERN_FONT, fontSize: 12, color: '#16a34a', fontWeight: '600', marginTop: 2 },
  recentPhase: { fontFamily: MODERN_FONT, fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden', maxWidth: 110, textAlign: 'center' },
  emptyRecentText: { fontFamily: MODERN_FONT, fontSize: 13, paddingVertical: 20, textAlign: 'center', fontStyle: 'italic' },

  alertCardDanger: { borderRadius: 14, padding: 18, borderWidth: 1, marginBottom: 14 },
  alertTitleDanger: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
  alertTextDanger: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 20 },

  alertCardInfo: { borderRadius: 14, padding: 18, borderWidth: 1, marginBottom: 12, ...Platform.select({ web: { cursor: 'pointer' } }) },
  alertTitleInfo: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
  alertTextInfo: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 20 },

  alertCardBoleto: { borderRadius: 14, padding: 18, borderWidth: 1, marginBottom: 12, ...Platform.select({ web: { cursor: 'pointer' } }) },
  alertTitleBoleto: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
  alertTextBoleto: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 20 },

  emptyStateCard: { borderRadius: 14, padding: 20, borderWidth: 1, alignItems: 'center' },
  emptyStateText: { fontFamily: MODERN_FONT, fontSize: 13, textAlign: 'center' },

  tabContentContainer: { borderRadius: 16, padding: 28, borderWidth: 1 },
  mentoriaHeroCard: { padding: 24, borderRadius: 12, borderWidth: 1 },
  mentoriaHeroTitle: { fontFamily: MODERN_FONT, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  mentoriaHeroSubtitle: { fontFamily: MODERN_FONT, fontSize: 14, lineHeight: 22 },

  tipCard: { padding: 18, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  tipCardTitle: { fontFamily: MODERN_FONT, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  tipCardDesc: { fontFamily: MODERN_FONT, fontSize: 14, lineHeight: 20 },

  quoteCard: { marginTop: 16, padding: 20, borderRadius: 12, borderWidth: 1 },
  quoteText: { fontFamily: MODERN_FONT, fontSize: 14, fontStyle: 'italic', lineHeight: 22, marginBottom: 8 },
  quoteAuthor: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  funnelHeaderBox: { marginBottom: 20 },
  funnelHeaderTitle: { fontFamily: MODERN_FONT, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  funnelHeaderDesc: { fontFamily: MODERN_FONT, fontSize: 14 },

  funnelMetricsGrid: { flexDirection: 'row', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  funnelBox: { flex: 1, minWidth: 200, padding: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  funnelBoxLabel: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  funnelBoxVal: { fontFamily: MODERN_FONT, fontSize: 24, fontWeight: '900' },

  conversionTipsBox: { padding: 20, borderRadius: 12, borderWidth: 1 },
  conversionTipsTitle: { fontFamily: MODERN_FONT, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  conversionTipsText: { fontFamily: MODERN_FONT, fontSize: 14, lineHeight: 22, marginBottom: 4 },

  motivationPayloadBox: { padding: 22, borderRadius: 12, borderWidth: 1 },
  motivationPayloadTitle: { fontFamily: MODERN_FONT, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  motivationPayloadText: { fontFamily: MODERN_FONT, fontSize: 14, lineHeight: 22 }
});

// Estilos de Tema Claro
const lightStyles = StyleSheet.create({
  outerContainer: { backgroundColor: '#f1f5f9' },
  loadingText: { color: '#64748b' },
  greeting: { color: '#0f172a' },
  dateText: { color: '#64748b' },
  navTabsContainer: { backgroundColor: '#e2e8f0' },
  navTabActive: { backgroundColor: '#ffffff', ...Platform.select({ web: { boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' } }) },
  navTabText: { color: '#475569' },
  navTabTextActive: { color: '#2563eb', fontWeight: '700' },
  sectionTitle: { color: '#1e293b' },
  goalCardHero: { backgroundColor: '#0f172a' },
  goalTitleTag: { color: '#94a3b8' },
  goalValueLarge: { color: '#ffffff' },
  goalBadgeContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  goalBadgeText: { color: '#38bdf8' },
  progressBarBg: { backgroundColor: '#1e293b' },
  progressBarFill: { backgroundColor: '#38bdf8' },
  goalSubText: { color: '#94a3b8' },
  summaryCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  summaryText: { color: '#334155' },
  taskBox: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  taskCount: { color: '#0f172a' },
  taskLabel: { color: '#64748b' },
  executiveSummary: { backgroundColor: '#ffffff', borderLeftColor: '#2563eb', borderColor: '#e2e8f0' },
  executiveSummaryText: { color: '#334155' },
  recentCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  recentBorder: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  recentName: { color: '#1e293b' },
  recentPhase: { color: '#475569', backgroundColor: '#f1f5f9' },
  emptyRecentText: { color: '#94a3b8' },
  alertCardDanger: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  alertTitleDanger: { color: '#b91c1c' },
  alertTextDanger: { color: '#991b1b' },
  alertCardInfo: { backgroundColor: '#f0fdfa', borderColor: '#ccfbf1' },
  alertTitleInfo: { color: '#0f766e' },
  alertTextInfo: { color: '#115e59' },
  alertCardBoleto: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  alertTitleBoleto: { color: '#b45309' },
  alertTextBoleto: { color: '#92400e' },
  emptyStateCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  emptyStateText: { color: '#64748b' },
  tabContentContainer: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  mentoriaHeroCard: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  mentoriaHeroTitle: { color: '#1e40af' },
  mentoriaHeroSubtitle: { color: '#1e3a8a' },
  tipCard: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  tipCardTitle: { color: '#0f172a' },
  tipCardDesc: { color: '#475569' },
  quoteCard: { backgroundColor: '#fdf4ff', borderColor: '#f5d0fe' },
  quoteText: { color: '#86198f' },
  quoteAuthor: { color: '#701a75' },
  funnelHeaderTitle: { color: '#0f172a' },
  funnelHeaderDesc: { color: '#64748b' },
  funnelBox: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  funnelBoxLabel: { color: '#64748b' },
  conversionTipsBox: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  conversionTipsTitle: { color: '#166534' },
  conversionTipsText: { color: '#14532d' },
  motivationPayloadBox: { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
  motivationPayloadTitle: { color: '#7e22ce' },
  motivationPayloadText: { color: '#6b21a8' }
});

// Estilos de Tema Escuro
const darkStyles = StyleSheet.create({
  outerContainer: { backgroundColor: '#0f172a' },
  loadingText: { color: '#94a3b8' },
  greeting: { color: '#f8fafc' },
  dateText: { color: '#94a3b8' },
  navTabsContainer: { backgroundColor: '#1e293b' },
  navTabActive: { backgroundColor: '#334155' },
  navTabText: { color: '#94a3b8' },
  navTabTextActive: { color: '#ffffff', fontWeight: '700' },
  sectionTitle: { color: '#f8fafc' },
  goalCardHero: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  goalTitleTag: { color: '#94a3b8' },
  goalValueLarge: { color: '#f8fafc' },
  goalBadgeContainer: { backgroundColor: '#0f172a', borderColor: '#334155' },
  goalBadgeText: { color: '#38bdf8' },
  progressBarBg: { backgroundColor: '#0f172a' },
  progressBarFill: { backgroundColor: '#38bdf8' },
  goalSubText: { color: '#94a3b8' },
  summaryCard: { backgroundColor: '#1e293b', borderColor: '#334155' },
  summaryText: { color: '#cbd5e1' },
  taskBox: { backgroundColor: '#1e293b', borderColor: '#334155' },
  taskCount: { color: '#f8fafc' },
  taskLabel: { color: '#94a3b8' },
  executiveSummary: { backgroundColor: '#1e293b', borderLeftColor: '#3b82f6', borderColor: '#334155' },
  executiveSummaryText: { color: '#cbd5e1' },
  recentCard: { backgroundColor: '#1e293b', borderColor: '#334155' },
  recentBorder: { borderBottomWidth: 1, borderBottomColor: '#334155' },
  recentName: { color: '#f8fafc' },
  recentPhase: { color: '#cbd5e1', backgroundColor: '#334155' },
  emptyRecentText: { color: '#64748b' },
  alertCardDanger: { backgroundColor: '#450a0a', borderColor: '#7f1d1d' },
  alertTitleDanger: { color: '#fca5a5' },
  alertTextDanger: { color: '#fecaca' },
  alertCardInfo: { backgroundColor: '#042f2e', borderColor: '#115e59' },
  alertTitleInfo: { color: '#5eead4' },
  alertTextInfo: { color: '#99f6e4' },
  alertCardBoleto: { backgroundColor: '#422006', borderColor: '#713f12' },
  alertTitleBoleto: { color: '#fcd34d' },
  alertTextBoleto: { color: '#fde68a' },
  emptyStateCard: { backgroundColor: '#1e293b', borderColor: '#334155' },
  emptyStateText: { color: '#94a3b8' },
  tabContentContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  mentoriaHeroCard: { backgroundColor: '#172554', borderColor: '#1d4ed8' },
  mentoriaHeroTitle: { color: '#93c5fd' },
  mentoriaHeroSubtitle: { color: '#bfdbfe' },
  tipCard: { backgroundColor: '#0f172a', borderColor: '#334155' },
  tipCardTitle: { color: '#f8fafc' },
  tipCardDesc: { color: '#94a3b8' },
  quoteCard: { backgroundColor: '#4a044e', borderColor: '#701a75' },
  quoteText: { color: '#f5d0fe' },
  quoteAuthor: { color: '#e879f9' },
  funnelHeaderTitle: { color: '#f8fafc' },
  funnelHeaderDesc: { color: '#94a3b8' },
  funnelBox: { backgroundColor: '#0f172a', borderColor: '#334155' },
  funnelBoxLabel: { color: '#94a3b8' },
  conversionTipsBox: { backgroundColor: '#052e16', borderColor: '#14532d' },
  conversionTipsTitle: { color: '#86efac' },
  conversionTipsText: { color: '#bbf7d0' },
  motivationPayloadBox: { backgroundColor: '#3b0764', borderColor: '#6b21a8' },
  motivationPayloadTitle: { color: '#d8b4fe' },
  motivationPayloadText: { color: '#e9d5ff' }
});