// InformacoesGerais (Visão Geral)
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Platform, 
  useWindowDimensions, 
  TouchableOpacity, 
  TextInput, 
  ActivityIndicator,
  Alert,
  Animated,
  Modal
} from 'react-native';
import { supabase } from '../services/supabaseClient';
import ReportModal from './ReportModal'; 

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

// ============================================================================
// UTILITÁRIOS GERAIS E DE CONVERSÃO
// ============================================================================

const parseMoney = (val) => {
  if (!val) return 0;
  const s = String(val);
  if (s.includes(',')) {
    return parseInt(s.split(',')[0].replace(/\D/g, ''), 10) || 0;
  }
  return parseInt(s.replace(/\D/g, ''), 10) || 0;
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

const parseCustomDate = (dateStr) => {
  if (!dateStr || dateStr.length !== 10) return null;
  const [day, month, year] = dateStr.split('/');
  return new Date(`${year}-${month}-${day}T12:00:00Z`);
};

const formatFirstAndLastName = (fullName) => {
  if (!fullName) return 'Desconhecido';
  const parts = fullName.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

// ============================================================================
// SISTEMA DE EXPORTAÇÃO CSV DE ALTA PRECISÃO (Padrão Excel PT-BR)
// ============================================================================
const exportLeadsToCSV = (leadsArray, fileName = 'relatorio_leads') => {
  if (Platform.OS !== 'web') {
    Alert.alert("Aviso", "A exportação CSV está disponível apenas na versão Web.");
    return;
  }

  if (!leadsArray || leadsArray.length === 0) {
    Alert.alert("Aviso", "Não há dados para exportar com os filtros atuais.");
    return;
  }

  const headers = [
    "Nome", 
    "Telefone", 
    "E-mail",
    "CPF",
    "Profissao",
    "Renda Mensal",
    "Fase Atual", 
    "Categoria/Produto", 
    "Urgencia",
    "Origem/Plataforma", 
    "Valor Credito (R$)",
    "Parcela Ideal (R$)",
    "Valor Lance",
    "Tipo Lance",
    "Possui Financiamento",
    "Temperatura",
    "Prob. Fechamento (%)",
    "Data de Criacao"
  ];
  
  const csvRows = [];
  const delimiter = ';';
  csvRows.push(headers.join(delimiter));

  const safeString = (str) => {
    if (str === null || str === undefined || str === '') return '""';
    const cleanStr = String(str).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, " ");
    return `"${cleanStr}"`;
  };

  for (const lead of leadsArray) {
    const row = [
      safeString(lead.name),
      safeString(lead.phone),
      safeString(lead.email),
      safeString(lead.cpf),
      safeString(lead.profession),
      safeString(lead.monthlyIncome),
      safeString(lead.phaseTitle),
      safeString(lead.category),
      safeString(lead.urgency),
      safeString(lead.platform || lead.origin),
      safeString(lead.desiredCredit),
      safeString(lead.idealInstallment),
      safeString(lead.bidAmount),
      safeString(lead.bidType),
      safeString(lead.hasFinancing),
      safeString(lead.leadTemp),
      safeString(lead.winProbability),
      safeString(lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('pt-BR') : '')
    ];
    csvRows.push(row.join(delimiter));
  }

  const csvString = "\uFEFF" + csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${fileName}_${new Date().getTime()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};


// ============================================================================
// COMPONENTES DO DASHBOARD EXECUTIVO (ADMIN)
// ============================================================================
const PulseIndicator = () => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  return (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
      <Text style={styles.liveText}>AO VIVO</Text>
    </View>
  );
};

const DashboardRankBar = ({ label, value, max, color, isDarkMode, suffix = '', displayValue }) => {
  const fillWidth = max > 0 ? (value / max) * 100 : 0;
  
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: fillWidth,
      duration: 1000,
      useNativeDriver: false
    }).start();
  }, [fillWidth]);

  return (
    <View style={styles.rankBarContainer}>
      <View style={styles.rankBarHeader}>
        <Text numberOfLines={1} style={[styles.rankBarLabel, isDarkMode ? darkStyles.rankBarLabel : lightStyles.rankBarLabel]}>
          {label}
        </Text>
        <Text style={[styles.rankBarValue, isDarkMode ? darkStyles.rankBarValue : lightStyles.rankBarValue]}>
          {displayValue !== undefined ? displayValue : `${value}${suffix}`}
        </Text>
      </View>
      <View style={[styles.rankBarTrack, isDarkMode ? darkStyles.rankBarTrack : lightStyles.rankBarTrack]}>
        <Animated.View 
          style={[styles.rankBarFill, { backgroundColor: color, width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} 
        />
      </View>
    </View>
  );
};

const DashboardModule = ({ title, icon, children, isDarkMode, highlight = false }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true })
    ]).start();
  }, []);

  return (
    <Animated.View style={[
      styles.dashModule, 
      isDarkMode ? darkStyles.dashModule : lightStyles.dashModule,
      highlight && (isDarkMode ? darkStyles.dashModuleHighlight : lightStyles.dashModuleHighlight),
      { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
    ]}>
      <View style={styles.dashModuleHeader}>
        {icon && <Text style={styles.dashModuleIcon}>{icon}</Text>}
        <Text style={[styles.dashModuleTitle, isDarkMode ? darkStyles.dashModuleTitle : lightStyles.dashModuleTitle, highlight && {color: isDarkMode ? '#fca5a5' : '#991b1b'}]}>
          {title}
        </Text>
      </View>
      <View style={styles.dashModuleContent}>
        {children}
      </View>
    </Animated.View>
  );
};


// ============================================================================
// COMPONENTE PRINCIPAL DE VISÃO ANALÍTICA
// ============================================================================

export default function InformacoesGerais({ isDarkMode }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 850;
  const isTablet = width >= 850 && width < 1100;

  const [loading, setLoading] = useState(true);
  
  const [allLeads, setAllLeads] = useState([]);
  const [availablePhases, setAvailablePhases] = useState([]);
  const [rawBoardsData, setRawBoardsData] = useState([]);
  const [rawDisparosData, setRawDisparosData] = useState([]);

  const [isExportAlertVisible, setIsExportAlertVisible] = useState(false);

  // Estados de Admin e Usuários
  const [loggedUserId, setLoggedUserId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [selectedTargetUser, setSelectedTargetUser] = useState('ALL');

  // Estados dos Filtros
  const [filterType, setFilterType] = useState('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedPhase, setSelectedPhase] = useState('ALL');
  const [selectedOrigin, setSelectedOrigin] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Estados dos Modais
  const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const fetchAnalyticsData = async (userId, userIsAdmin) => {
    try {
      let query = supabase.from('crm_boards').select('id, user_id, data_payload').ilike('id', 'board_%');

      if (!userIsAdmin) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRawBoardsData(data || []);

      if (userIsAdmin) {
        const { data: disparos, error: dispErr } = await supabase.from('disparos_historico').select('*');
        if (!dispErr) setRawDisparosData(disparos || []);
      }

      let compiledLeads = [];
      let phasesMap = new Set();

      if (data && data.length > 0) {
        data.forEach(boardRecord => {
          const payload = boardRecord.data_payload;
          const recordUserId = boardRecord.user_id;

          if (payload && payload.phases) {
            payload.phases.forEach(phase => {
              phasesMap.add(phase.title);
              if (phase.clients && phase.clients.length > 0) {
                phase.clients.forEach(client => {
                  compiledLeads.push({
                    ...client,
                    boardId: boardRecord.id,
                    userId: recordUserId,
                    phaseTitle: phase.title,
                    isTrash: false
                  });
                });
              }
            });
          }

          if (payload && payload.trash && payload.trash.length > 0) {
            payload.trash.forEach(client => {
              compiledLeads.push({
                ...client,
                boardId: boardRecord.id,
                userId: recordUserId,
                phaseTitle: 'Perdido',
                isTrash: true
              });
            });
          }
        });
      }

      setAvailablePhases(Array.from(phasesMap));
      setAllLeads(compiledLeads);

    } catch (error) {
      console.error("Erro Crítico ao buscar dados de BI:", error);
    }
  };

  useEffect(() => {
    let boardsSub = null;
    let disparosSub = null;

    const initData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      setLoggedUserId(user.id);

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();

      let userIsAdmin = false;
      if (!profileError && profileData) {
        if ((profileData.role || '').toLowerCase() === 'admin') {
          userIsAdmin = true;
        }
      }
      setIsAdmin(userIsAdmin);

      if (userIsAdmin) {
        const { data: profiles, error: profErr } = await supabase
          .from('user_profiles')
          .select('id, email, role, name');
        if (!profErr && profiles) {
          const sortedProfiles = [...profiles].sort((a, b) => {
            if (a.id === user.id) return -1;
            if (b.id === user.id) return 1;
            return 0;
          });
          setUsersList(sortedProfiles);
        }
      }

      await fetchAnalyticsData(user.id, userIsAdmin);
      setLoading(false);

      boardsSub = supabase.channel('visal_geral_boards')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_boards' }, () => {
          fetchAnalyticsData(user.id, userIsAdmin);
        })
        .subscribe();

      if (userIsAdmin) {
        disparosSub = supabase.channel('visal_geral_disparos')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'disparos_historico' }, () => {
            fetchAnalyticsData(user.id, userIsAdmin);
          })
          .subscribe();
      }
    };

    initData();

    return () => {
      if (boardsSub) supabase.removeChannel(boardsSub);
      if (disparosSub) supabase.removeChannel(disparosSub);
    };
  }, []);

  const filteredLeads = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    return allLeads.filter(client => {
      if (isAdmin && selectedTargetUser !== 'ALL' && client.userId !== selectedTargetUser) {
        return false;
      }

      const createdDate = new Date(client.createdAt || Date.now());
      
      let timeMatch = false;
      if (filterType === 'current') {
        timeMatch = createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear;
      } else if (filterType === 'previous') {
        timeMatch = createdDate.getMonth() === previousMonth && createdDate.getFullYear() === previousYear;
      } else if (filterType === 'all_time') {
        timeMatch = true;
      } else if (filterType === 'custom') {
        const start = parseCustomDate(customStart);
        const end = parseCustomDate(customEnd);
        if (start && end) {
          end.setHours(23, 59, 59, 999);
          timeMatch = createdDate >= start && createdDate <= end;
        } else {
          timeMatch = true; 
        }
      }

      if (!timeMatch) return false;

      if (selectedPhase !== 'ALL' && client.phaseTitle !== selectedPhase) return false;
      
      const clientOrigin = client.platform || client.origin || 'Desconhecida';
      if (selectedOrigin !== 'ALL' && clientOrigin !== selectedOrigin) return false;
      
      const clientCategory = client.category || 'Geral';
      if (selectedCategory !== 'ALL' && clientCategory !== selectedCategory) return false;

      return true;
    });
  }, [allLeads, filterType, customStart, customEnd, selectedPhase, selectedOrigin, selectedCategory, isAdmin, selectedTargetUser]);

  const reportData = useMemo(() => {
    let totalLeads = filteredLeads.length;
    let countNegociacao = 0, countTentativa = 0, countPerdido = 0, countFechado = 0;
    
    let totalCalls = 0, totalWA = 0, totalSims = 0;
    let closedCalls = 0, closedWA = 0, closedSims = 0;
    let lostCalls = 0, lostWA = 0, lostSims = 0;

    let targetPhasesTitles = new Set();
    if (isAdmin && selectedTargetUser === 'ALL') {
      rawBoardsData.forEach(board => {
        board.data_payload?.phases?.forEach(p => {
          if (p.title) targetPhasesTitles.add(p.title);
        });
      });
    } else {
      const activeBoardUserId = isAdmin && selectedTargetUser !== 'ALL' ? selectedTargetUser : loggedUserId;
      const targetBoard = rawBoardsData.find(b => b.user_id === activeBoardUserId);
      targetBoard?.data_payload?.phases?.forEach(p => {
        if (p.title) targetPhasesTitles.add(p.title);
      });
    }

    const financialSums = {};
    targetPhasesTitles.forEach(phaseTitle => {
      financialSums[phaseTitle] = 0;
    });
    financialSums['Perdido'] = 0;

    const originsMap = new Set();
    const categoriesMap = new Set();
    
    let maxTouches = 1;
    const rawEffortPoints = filteredLeads.map(l => {
        const touches = (l.comments?.length || 0) + (l.appointments?.length || 0);
        if (touches > maxTouches) maxTouches = touches;
        
        const isPerdido = l.isTrash || (l.phaseTitle || '').toLowerCase().includes('perdid');
        const isFechado = (l.phaseTitle || '').toLowerCase().includes('fechad');
        
        let statusCategory = 'Andamento';
        if (isPerdido) statusCategory = 'Perdido';
        if (isFechado) statusCategory = 'Fechado';

        return { touches, statusCategory };
    });

    const timelineMap = {};
    filteredLeads.forEach(l => {
        const dateKey = l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'S/Data';
        const credit = parseMoney(l.desiredCredit || l.valor || 0);
        if (!timelineMap[dateKey]) timelineMap[dateKey] = 0;
        timelineMap[dateKey] += credit;
    });

    const ticketTimeline = Object.keys(timelineMap).map(date => ({
        date,
        totalVal: timelineMap[date]
    }));

    let maxTimelineVal = Math.max(...ticketTimeline.map(t => t.totalVal), 1);

    const effortVsOutcome = rawEffortPoints.map(p => ({
        xPercent: Math.min(Math.max((p.touches / maxTouches) * 85 + 5, 5), 95),
        yPercent: p.statusCategory === 'Fechado' ? 82 : (p.statusCategory === 'Andamento' ? 50 : 18),
        status: p.statusCategory
    }));

    filteredLeads.forEach(client => {
      const credit = parseMoney(client.desiredCredit || client.valor || 0);
      
      const clientOrigin = client.platform || client.origin;
      if (clientOrigin) originsMap.add(clientOrigin);
      if (client.category) categoriesMap.add(client.category);

      let isNegociacao = false, isTentou = false, isPerdido = false, isFechado = false;
      
      if (client.isTrash) {
        isPerdido = true;
        financialSums['Perdido'] = (financialSums['Perdido'] || 0) + credit;
        countPerdido++;
      } else {
        const phaseTitle = client.phaseTitle || '';
        if (financialSums[phaseTitle] !== undefined) {
          financialSums[phaseTitle] += credit;
        } else {
          financialSums[phaseTitle] = credit;
        }

        const phaseLower = phaseTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (phaseLower.includes('tentou')) { countTentativa++; isTentou = true; }
        if (phaseLower.includes('negocia')) { countNegociacao++; isNegociacao = true; }
        if (phaseLower.includes('fechad')) { countFechado++; isFechado = true; }
        if (phaseLower.includes('perdid')) { countPerdido++; isPerdido = true; }
      }

      let leadCalls = 0, leadWA = 0, leadSims = 0;
      
      if (client.comments && Array.isArray(client.comments)) {
        client.comments.forEach(c => {
          const txt = (c.text || '').toLowerCase();
          if (txt.includes('botão de ligar') || txt.includes('ligação') || txt.includes('liguei')) leadCalls++;
          if (txt.includes('falar no whatsapp') || txt.includes('whatsapp') || txt.includes('wpp')) leadWA++;
        });
      }

      if (client.appointments && Array.isArray(client.appointments)) {
        client.appointments.forEach(a => {
          const txt = (a.title || a.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (txt.includes('simulaca')) leadSims++;
        });
      }

      totalCalls += leadCalls;
      totalWA += leadWA;
      totalSims += leadSims;

      if (isFechado) { closedCalls += leadCalls; closedWA += leadWA; closedSims += leadSims; }
      if (isPerdido) { lostCalls += leadCalls; lostWA += leadWA; lostSims += leadSims; }
    });

    const txNegociacao = totalLeads > 0 ? ((countNegociacao / totalLeads) * 100).toFixed(1) : 0;
    const txConversao = totalLeads > 0 ? ((countFechado / totalLeads) * 100).toFixed(1) : 0;
    const txPerda = totalLeads > 0 ? ((countPerdido / totalLeads) * 100).toFixed(1) : 0;
    const ticketMedio = countFechado > 0 ? ((financialSums['Fechado'] || Object.entries(financialSums).find(([k]) => k.toLowerCase().includes('fechad'))?.[1] || 0) / countFechado) : 0;
    const totalFinanceiro = Object.values(financialSums).reduce((a, b) => a + b, 0);

    const avgClosedTouches = countFechado > 0 ? ((closedCalls + closedWA + closedSims) / countFechado).toFixed(1) : 0;
    const avgLostTouches = countPerdido > 0 ? ((lostCalls + lostWA + lostSims) / countPerdido).toFixed(1) : 0;

    return {
      totalLeads, countFechado, countPerdido, countNegociacao,
      txNegociacao, txConversao, txPerda, ticketMedio,
      financialSums, totalFinanceiro,
      originsAvailable: Array.from(originsMap),
      categoriesAvailable: Array.from(categoriesMap),
      effortVsOutcome,
      ticketTimeline,
      maxTimelineVal,
      efforts: {
        totalCalls, totalWA, totalSims,
        avgClosedTouches, avgLostTouches,
        closedCalls: countFechado > 0 ? (closedCalls / countFechado).toFixed(1) : 0,
        closedWA: countFechado > 0 ? (closedWA / countFechado).toFixed(1) : 0,
      }
    };
  }, [filteredLeads, rawBoardsData, isAdmin, selectedTargetUser, loggedUserId]);

  // ============================================================================
  // PROCESSAMENTO DE INSIGHTS ESTRUTURADO (ADMIN ONLY)
  // ============================================================================
  const adminInsightsData = useMemo(() => {
    if (!isAdmin || !usersList.length) return null;

    const stats = usersList.map(u => ({
      id: u.id,
      name: formatFirstAndLastName(u.name || u.email),
      novoCliente: 0,
      novoClienteOld: 0,
      interacoes: 0,
      propostas: 0,
      negociacao: 0,
      disparos: 0,
      vendasCredito: 0,
      vendasCotas: 0,
      perdidos: 0
    }));

    const getStat = (uid) => stats.find(s => s.id === uid);

    rawBoardsData.forEach(board => {
      const st = getStat(board.user_id);
      if (!st) return;

      const phases = board.data_payload?.phases || [];
      phases.forEach(p => {
        const pTitleLower = (p.title || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const isNovo = pTitleLower === 'novo cliente';
        const isNeg = pTitleLower.includes('negocia');
        const isFechado = pTitleLower.includes('fechad');
        const isPerdido = pTitleLower.includes('perdid');

        (p.clients || []).forEach(client => {
          if (isNovo) {
            st.novoCliente++;
            const daysOld = (Date.now() - new Date(client.createdAt || Date.now()).getTime()) / (1000 * 60 * 60 * 24);
            if (daysOld > 3) st.novoClienteOld++;
          }
          if (isNeg) {
            st.negociacao++;
          }
          if (isFechado) {
             const credit = parseMoney(client.desiredCredit || client.valor || 0);
             st.vendasCredito += credit;
             if (client.contracts && Array.isArray(client.contracts)) {
                 st.vendasCotas += client.contracts.length;
             }
          }
          if (isPerdido) {
             st.perdidos++;
          }

          const comments = client.comments || [];
          const appointments = client.appointments || [];
          st.interacoes += (comments.length + appointments.length);

          comments.forEach(cm => {
            if ((cm.text || '').toLowerCase().includes('proposta')) st.propostas++;
          });
        });
      });

      // Capturar leads na lixeira (trash)
      const trash = board.data_payload?.trash || [];
      st.perdidos += trash.length;
    });

    rawDisparosData.forEach(disp => {
      const st = getStat(disp.user_id);
      if (st) st.disparos++;
    });

    const totalNovo = stats.reduce((acc, s) => acc + s.novoCliente, 0);
    const totalNovoOld = stats.reduce((acc, s) => acc + s.novoClienteOld, 0);
    const totalVendasCredito = stats.reduce((acc, s) => acc + s.vendasCredito, 0);
    const totalVendasCotas = stats.reduce((acc, s) => acc + s.vendasCotas, 0);
    const totalEngajamento = stats.reduce((acc, s) => acc + s.interacoes, 0);
    const totalPerdidos = stats.reduce((acc, s) => acc + s.perdidos, 0);

    return {
      stats,
      totalNovo,
      totalNovoOld,
      totalVendasCredito,
      totalVendasCotas,
      totalEngajamento,
      totalPerdidos
    };
  }, [isAdmin, usersList, rawBoardsData, rawDisparosData]);

  const filteredHistory = useMemo(() => {
    let data = [...rawDisparosData].sort((a, b) => b.id - a.id);
    if (selectedTargetUser === 'ALL') return data;
    return data.filter(d => d.user_id === selectedTargetUser);
  }, [rawDisparosData, selectedTargetUser]);

  const handleDateMask = (text, setter) => {
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.length > 2) cleaned = cleaned.replace(/^(\d{2})(\d)/, '$1/$2');
    if (cleaned.length > 5) cleaned = cleaned.replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
    setter(cleaned.substring(0, 10));
  };

  const executeExport = () => {
    if (!isAdmin) return; 
    if (!filteredLeads || filteredLeads.length === 0) {
      setIsExportAlertVisible(true);
      return;
    }
    const targetLabel = isAdmin && selectedTargetUser !== 'ALL' 
      ? (usersList.find(u => u.id === selectedTargetUser)?.email || 'Usuario') 
      : (isAdmin ? 'Todos_Usuarios' : 'Meus_Leads');
    exportLeadsToCSV(filteredLeads, `Leads_${targetLabel}_${filterType}`);
  };

  const dynamicPageTitle = useMemo(() => {
    if (isAdmin && selectedTargetUser === 'ALL') {
      return "Visão Geral de Todos";
    }
    if (selectedTargetUser === loggedUserId || !isAdmin) {
      return "Sua Visão Geral";
    }

    const targetUserObj = usersList.find(u => u.id === selectedTargetUser);
    if (targetUserObj && targetUserObj.name) {
      const nameParts = targetUserObj.name.trim().split(' ').filter(n => n);
      if (nameParts.length > 1) {
        return `Visão Geral de ${nameParts[0]} ${nameParts[nameParts.length - 1]}`;
      } else if (nameParts.length === 1) {
        return `Visão Geral de ${nameParts[0]}`;
      }
    }
    return "Visão Geral";
  }, [selectedTargetUser, loggedUserId, isAdmin, usersList]);
  
  const getHistoryModalTitle = () => {
    if (selectedTargetUser === 'ALL') return "Histórico de Disparos de Todos";
    if (selectedTargetUser === loggedUserId) return "Seu Histórico de Disparos";
    const targetUserObj = usersList.find(u => u.id === selectedTargetUser);
    if (targetUserObj) {
      return `Histórico de Disparos de ${formatFirstAndLastName(targetUserObj.name || targetUserObj.email)}`;
    }
    return "Histórico de Disparos";
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerAll, isDarkMode && darkStyles.container]}>
        <ActivityIndicator size="large" color={isDarkMode ? '#38bdf8' : '#0f172a'} />
        <Text style={[styles.loadingText, isDarkMode && darkStyles.loadingText]}>Processando Inteligência de Dados...</Text>
      </View>
    );
  }

  const themeStyles = isDarkMode ? darkStyles : lightStyles;
  const webOptionStyle = { backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', color: isDarkMode ? '#f8fafc' : '#0f172a' };

  const HorizontalBar = ({ label, valueText, percent, color }) => {
    const safePercent = isNaN(percent) || percent < 0 ? 0 : Math.min(percent, 100);
    return (
      <View style={styles.barContainer}>
        <View style={styles.barHeader}>
          <Text style={[styles.barLabel, themeStyles.barLabel]}>{label}</Text>
          <Text style={[styles.barValue, themeStyles.barValue]}>{valueText}</Text>
        </View>
        <View style={[styles.barTrack, themeStyles.barTrack]}>
          <View style={[styles.barFill, { width: `${safePercent}%`, backgroundColor: color }]} />
        </View>
      </View>
    );
  };

  const getCleanMessage = (fullText) => {
    if (!fullText) return 'Sem mensagem.';
    if (fullText.includes('[DADOS_EXTRA:')) {
      return fullText.split('[DADOS_EXTRA:')[0].trim();
    }
    return fullText;
  };

  return (
    <View style={[styles.container, themeStyles.container]}>
      <ScrollView contentContainerStyle={[styles.content, isMobile && styles.contentMobile]} showsVerticalScrollIndicator={false}>
        
        {/* CABEÇALHO COMPACTO */}
        <View style={[styles.headerArea, isMobile && styles.headerAreaMobile]}>
          <View>
            <Text style={[styles.pageTitle, themeStyles.pageTitle]}>{dynamicPageTitle}</Text>
            <Text style={[styles.pageSubtitle, themeStyles.pageSubtitle]}>Inspeção de métricas operacionais, conversão e saúde financeira.</Text>
          </View>
          
          <View style={[styles.headerActions, isMobile && styles.headerActionsMobile]}>
            
            {isAdmin && Platform.OS === 'web' && (
              <View style={[styles.adminNavbar, themeStyles.adminNavbar, isMobile && styles.adminNavbarMobile]}>
                <select 
                  style={{ ...styles.adminNavSelect, ...themeStyles.adminNavSelect, ...(isMobile ? {width: '100%'} : {}) }} 
                  value={selectedTargetUser} 
                  onChange={(e) => setSelectedTargetUser(e.target.value)}
                >
                  <option value="ALL" style={webOptionStyle}>🌐 Todos os Usuários (Geral)</option>
                  {usersList.map((u) => {
                    const isMe = u.id === loggedUserId;
                    const roleName = (u.role || 'vendedor').charAt(0).toUpperCase() + (u.role || 'vendedor').slice(1).toLowerCase();
                    const displayName = isMe ? 'Suas Métricas' : formatFirstAndLastName(u.name || u.email);
                    return (
                      <option key={u.id} value={u.id} style={webOptionStyle}>
                        {isMe ? '👤' : '👥'} {displayName} ({roleName})
                      </option>
                    );
                  })}
                </select>

                {!isMobile && <View style={[styles.navDivider, themeStyles.navDivider]} />}

                <TouchableOpacity style={[styles.navHistoryBtn, isMobile && {flex: 1, alignItems: 'center', justifyContent: 'center'}]} onPress={() => setIsHistoryModalVisible(true)}>
                  <Text style={[styles.navHistoryBtnText, themeStyles.navHistoryBtnText]}>Histórico de Disparos</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.navExportBtn, isMobile && {flex: 1, alignItems: 'center', justifyContent: 'center'}]} onPress={executeExport}>
                  <Text style={styles.navExportBtnText}>Exportar Leads</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>

        {/* FERRAMENTAS & FILTROS ULTRA COMPACTOS */}
        <View style={[styles.toolsContainer, themeStyles.toolsContainer]}>
          <View style={[styles.filterSectionBase, isMobile && styles.filterSectionBaseMobile]}>
            <View style={[styles.filterGroup, isMobile && styles.filterGroupMobile]}>
              <Text style={[styles.filterGroupLabel, themeStyles.filterGroupLabel]}>Período</Text>
              <View style={{ ...styles.filterButtonGroup, ...themeStyles.filterButtonGroup, ...(isMobile ? styles.filterButtonGroupMobile : {}) }}>
                <TouchableOpacity style={[styles.filterBtn, filterType === 'current' && themeStyles.filterBtnActive, isMobile && {flexGrow: 1, alignItems: 'center'}]} onPress={() => setFilterType('current')}>
                  <Text style={[styles.filterText, themeStyles.filterText, filterType === 'current' && themeStyles.filterTextActive]}>Atual</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.filterBtn, filterType === 'previous' && themeStyles.filterBtnActive, isMobile && {flexGrow: 1, alignItems: 'center'}]} onPress={() => setFilterType('previous')}>
                  <Text style={[styles.filterText, themeStyles.filterText, filterType === 'previous' && themeStyles.filterTextActive]}>Anterior</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.filterBtn, filterType === 'all_time' && themeStyles.filterBtnActive, isMobile && {flexGrow: 1, alignItems: 'center'}]} onPress={() => setFilterType('all_time')}>
                  <Text style={[styles.filterText, themeStyles.filterText, filterType === 'all_time' && themeStyles.filterTextActive]}>Todos</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.filterBtn, filterType === 'custom' && themeStyles.filterBtnActive, isMobile && {flexGrow: 1, alignItems: 'center'}]} onPress={() => setFilterType('custom')}>
                  <Text style={[styles.filterText, themeStyles.filterText, filterType === 'custom' && themeStyles.filterTextActive]}>Manual</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.advancedFiltersRow, isMobile && styles.advancedFiltersRowMobile]}>
              <View style={[styles.pickerBox, isMobile && styles.pickerBoxMobile]}>
                <Text style={[styles.pickerLabel, themeStyles.pickerLabel]}>Fase</Text>
                {Platform.OS === 'web' ? (
                  <select style={{ ...styles.webSelect, ...themeStyles.webSelect }} value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)}>
                    <option value="ALL" style={webOptionStyle}>Todas as Fases</option>
                    {availablePhases.map((phase, idx) => <option key={idx} value={phase} style={webOptionStyle}>{phase}</option>)}
                    <option value="Perdido" style={webOptionStyle}>Perdidos / Lixeira</option>
                  </select>
                ) : <Text style={styles.pickerFallback}>Disponível na Web</Text>}
              </View>
              <View style={[styles.pickerBox, isMobile && styles.pickerBoxMobile]}>
                <Text style={[styles.pickerLabel, themeStyles.pickerLabel]}>Origem</Text>
                {Platform.OS === 'web' ? (
                  <select style={{ ...styles.webSelect, ...themeStyles.webSelect }} value={selectedOrigin} onChange={(e) => setSelectedOrigin(e.target.value)}>
                    <option value="ALL" style={webOptionStyle}>Todas</option>
                    {reportData.originsAvailable.map((ori, idx) => <option key={idx} value={ori} style={webOptionStyle}>{ori}</option>)}
                  </select>
                ) : <Text style={styles.pickerFallback}>Web Apenas</Text>}
              </View>
              <View style={[styles.pickerBox, isMobile && styles.pickerBoxMobile]}>
                <Text style={[styles.pickerLabel, themeStyles.pickerLabel]}>Categoria</Text>
                {Platform.OS === 'web' ? (
                  <select style={{ ...styles.webSelect, ...themeStyles.webSelect }} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                    <option value="ALL" style={webOptionStyle}>Todas</option>
                    {reportData.categoriesAvailable.map((cat, idx) => <option key={idx} value={cat} style={webOptionStyle}>{cat}</option>)}
                  </select>
                ) : <Text style={styles.pickerFallback}>Web Apenas</Text>}
              </View>
            </View>
          </View>

          {filterType === 'custom' && (
            <View style={[styles.customDateWrapper, themeStyles.customDateWrapper, isMobile && styles.customDateWrapperMobile]}>
              <View style={[styles.customDateInputBox, isMobile && styles.customDateInputBoxMobile]}>
                <Text style={[styles.customDateLabel, themeStyles.customDateLabel]}>Inicial</Text>
                <TextInput style={[styles.customDateInput, themeStyles.customDateInput]} placeholder="DD/MM/AAAA" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} value={customStart} onChangeText={t => handleDateMask(t, setCustomStart)} maxLength={10} />
              </View>
              <View style={[styles.customDateInputBox, isMobile && styles.customDateInputBoxMobile]}>
                <Text style={[styles.customDateLabel, themeStyles.customDateLabel]}>Final</Text>
                <TextInput style={[styles.customDateInput, themeStyles.customDateInput]} placeholder="DD/MM/AAAA" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} value={customEnd} onChangeText={t => handleDateMask(t, setCustomEnd)} maxLength={10} />
              </View>
            </View>
          )}
        </View>

        {/* KPIS COMPACTOS - OTIMIZADOS PARA CELULAR */}
        <View style={[styles.kpiGrid, isMobile && styles.kpiGridMobile]}>
          <View style={[styles.kpiCard, themeStyles.kpiCard, isMobile && styles.kpiCardMobile]}>
            <Text style={[styles.kpiTitle, themeStyles.kpiTitle]}>Total Leads</Text>
            <Text style={[styles.kpiValue, themeStyles.kpiValue]}>{reportData.totalLeads}</Text>
          </View>
          <View style={[styles.kpiCard, themeStyles.kpiCard, isMobile && styles.kpiCardMobile]}>
            <Text style={[styles.kpiTitle, themeStyles.kpiTitle]}>Conversão</Text>
            <Text style={[styles.kpiValue, { color: isDarkMode ? '#34d399' : '#059669' }]}>{reportData.txConversao}%</Text>
          </View>
          <View style={[styles.kpiCard, themeStyles.kpiCard, isMobile && styles.kpiCardMobile]}>
            <Text style={[styles.kpiTitle, themeStyles.kpiTitle]}>Perda Geral</Text>
            <Text style={[styles.kpiValue, { color: isDarkMode ? '#f87171' : '#dc2626' }]}>{reportData.txPerda}%</Text>
          </View>
          <View style={[styles.kpiCard, themeStyles.kpiCard, isMobile && styles.kpiCardMobile, isDarkMode ? { backgroundColor: '#0f172a', borderColor: '#334155' } : { backgroundColor: '#0f172a' }]}>
            <Text style={[styles.kpiTitle, { color: '#94a3b8' }]}>Ticket Médio</Text>
            <Text style={[styles.kpiValue, { color: '#38bdf8' }]}>{formatCurrency(reportData.ticketMedio)}</Text>
          </View>
        </View>

        {/* LAYOUT PRINCIPAL REDUZIDO */}
        <View style={[styles.mainLayout, isMobile && styles.mainLayoutMobile]}>
          
          {/* COLUNA ESQUERDA */}
          <View style={[styles.leftColumn, !isMobile && { flex: 1.5 }]}>
            <View style={[styles.dashboardCard, themeStyles.dashboardCard]}>
              <Text style={[styles.cardHeader, themeStyles.cardHeader]}>Arquitetura de Funil</Text>
              <View style={styles.chartArea}>
                <HorizontalBar label="Entrada Total" valueText={`${reportData.totalLeads}`} percent={100} color={isDarkMode ? '#475569' : '#cbd5e1'} />
                <HorizontalBar label="Qualificados" valueText={`${reportData.countNegociacao}`} percent={reportData.txNegociacao} color="#3b82f6" />
                <HorizontalBar label="Fechados" valueText={`${reportData.countFechado}`} percent={reportData.txConversao} color="#10b981" />
              </View>
            </View>

            <View style={[styles.dashboardCard, themeStyles.dashboardCard]}>
              <Text style={[styles.cardHeader, themeStyles.cardHeader]}>Esforço vs. Resultado</Text>
              <View style={[styles.effortGrid, isMobile && styles.effortGridMobile]}>
                <View style={[styles.effortBox, themeStyles.effortBox]}>
                  <Text style={[styles.effortLabel, themeStyles.effortLabel]}>Interações p/ Venda</Text>
                  <Text style={[styles.effortNumber, themeStyles.effortNumber]}>{reportData.efforts.avgClosedTouches}</Text>
                </View>
                <View style={[styles.effortBox, isDarkMode ? { borderColor: '#7f1d1d', backgroundColor: '#450a0a' } : { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}>
                  <Text style={[styles.effortLabel, isDarkMode ? { color: '#fca5a5' } : { color: '#991b1b' }]}>Interações p/ Perda</Text>
                  <Text style={[styles.effortNumber, {color: isDarkMode ? '#f87171' : '#dc2626'}]}>{reportData.efforts.avgLostTouches}</Text>
                </View>
              </View>

              <View style={[styles.infoBalloon, themeStyles.infoBalloon]}>
                <View style={styles.infoIconBox}>
                  <Text style={styles.infoIconText}>i</Text>
                </View>
                <Text style={[styles.infoBalloonText, themeStyles.infoBalloonText]}>
                  <Text style={{fontWeight: '700'}}>Como ler isso?</Text> "Interações p/ Venda" indica o esforço médio investido para fechar um negócio.
                </Text>
              </View>
            </View>
          </View>

          {/* COLUNA DIREITA */}
          <View style={[styles.rightColumn, !isMobile && { flex: 1 }]}>
            <View style={[styles.dashboardCard, isDarkMode ? { backgroundColor: '#1e293b', borderColor: '#334155' } : { backgroundColor: '#0f172a' }]}>
              <Text style={[styles.cardHeader, { color: '#f8fafc' }]}>Distribuição Financeira</Text>
              <Text style={styles.financialTotalValue}>{formatCurrency(reportData.totalFinanceiro)}</Text>
              <View style={styles.financialList}>
                {Object.entries(reportData.financialSums).map(([phaseName, sumVal], idx, arr) => {
                  const isLast = idx === arr.length - 1;
                  const lowerName = phaseName.toLowerCase();
                  let customColor = isDarkMode ? '#94a3b8' : '#cbd5e1';
                  if (lowerName.includes('negocia')) customColor = '#60a5fa';
                  else if (lowerName.includes('fechad')) customColor = '#34d399';
                  else if (lowerName.includes('perdid') || lowerName.includes('lixeira')) customColor = '#f87171';

                  return (
                    <View key={idx} style={[styles.finItem, isDarkMode ? { borderBottomColor: '#334155' } : {}, isLast && { borderBottomWidth: 0, paddingBottom: 0 }]}>
                      <Text style={[styles.finLabel, { color: customColor }]}>{phaseName}</Text>
                      <Text style={[styles.finValue, { color: customColor }]}>{formatCurrency(sumVal)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* GRÁFICOS INFERIORES */}
        <View style={[styles.chartsFooterSection, isMobile && styles.chartsFooterMobile]}>
          <View style={[styles.dashboardCard, themeStyles.dashboardCard, !isMobile && {flex: 1}]}>
              <Text style={[styles.cardHeader, themeStyles.cardHeader]}>Eficiência (Esforço x Desfecho)</Text>
              <View style={[styles.axisGraphContainer, themeStyles.axisGraphContainer]}>
                  <View style={[styles.axisYContainer, themeStyles.axisYContainer]}>
                    <Text style={[styles.axisLabel, themeStyles.axisLabel]}>Fechado</Text>
                    <Text style={[styles.axisLabel, themeStyles.axisLabel]}>Andamento</Text>
                    <Text style={[styles.axisLabel, themeStyles.axisLabel]}>Perdido</Text>
                  </View>
                  <View style={styles.axisContentArea}>
                      <View style={[styles.gridLineH1, themeStyles.gridLine]} />
                      <View style={[styles.gridLineH2, themeStyles.gridLine]} />
                      {reportData.effortVsOutcome.map((pt, i) => (
                          <View key={i} style={[styles.dot, { left: `${pt.xPercent}%`, top: `${pt.yPercent}%`, backgroundColor: pt.status === 'Fechado' ? '#10b981' : (pt.status === 'Perdido' ? '#ef4444' : '#3b82f6') }]} />
                      ))}
                  </View>
              </View>
          </View>
          
          <View style={[styles.dashboardCard, themeStyles.dashboardCard, !isMobile && {flex: 1}]}>
              <Text style={[styles.cardHeader, themeStyles.cardHeader]}>Evolução de Ticket</Text>
              <View style={[styles.axisGraphContainer, themeStyles.axisGraphContainer]}>
                  <View style={styles.timelineBarsWrapper}>
                      {reportData.ticketTimeline.length === 0 ? (
                          <Text style={[styles.emptyGraphText, themeStyles.emptyGraphText]}>Sem dados no período.</Text>
                      ) : (
                          reportData.ticketTimeline.map((item, idx) => {
                              const heightPct = Math.max((item.totalVal / reportData.maxTimelineVal) * 85, 8);
                              return (
                                  <View key={idx} style={styles.timelineBarCol}>
                                      <View style={[styles.timelineBarFill, { height: `${heightPct}%` }]} />
                                      <Text style={[styles.timelineBarText, themeStyles.timelineBarText]} numberOfLines={1}>{item.date}</Text>
                                  </View>
                              );
                          })
                      )}
                  </View>
              </View>
          </View>
        </View>

        {/* NOVO DASHBOARD DE INSIGHTS DA EQUIPE (EXCLUSIVO PARA ADMIN) */}
        {isAdmin && adminInsightsData && (
          <View style={[styles.adminSectionWrapper, themeStyles.adminSectionWrapper]}>
            <View style={styles.adminSectionHeader}>
              <View>
                <Text style={[styles.adminSectionTitle, themeStyles.adminSectionTitle]}>
                  Insights da Equipe
                </Text>
                <Text style={[styles.adminSectionSubtitle, themeStyles.adminSectionSubtitle]}>
                  Painel executivo em tempo real sobre o desempenho da operação comercial.
                </Text>
              </View>
              <PulseIndicator />
            </View>
            
            <View style={styles.dashGrid}>
              
              {/* FILEIRA 1 */}
              <View style={[styles.dashGridItem, isMobile ? {width: '100%'} : isTablet ? {width: '48%'} : {width: '31%'}]}>
                <DashboardModule title="RANKING DE VENDAS (CRÉDITO)" isDarkMode={isDarkMode}>
                  <View style={styles.moduleTopInfo}>
                    <Text style={[styles.moduleBigNum, themeStyles.moduleBigNum]}>{formatCurrency(adminInsightsData.totalVendasCredito)}</Text>
                    <Text style={[styles.moduleSmallDesc, themeStyles.moduleSmallDesc]}>Crédito total vendido</Text>
                  </View>
                  <View style={styles.moduleList}>
                    {[...adminInsightsData.stats].sort((a,b) => b.vendasCredito - a.vendasCredito).map(s => (
                      <DashboardRankBar 
                        key={s.id} label={s.name} value={s.vendasCredito} 
                        max={Math.max(...adminInsightsData.stats.map(x=>x.vendasCredito))} 
                        color="#10b981" isDarkMode={isDarkMode} displayValue={formatCurrency(s.vendasCredito)}
                      />
                    ))}
                  </View>
                </DashboardModule>
              </View>

              <View style={[styles.dashGridItem, isMobile ? {width: '100%'} : isTablet ? {width: '48%'} : {width: '31%'}]}>
                <DashboardModule title="RANKING DE VENDAS (COTAS)" isDarkMode={isDarkMode}>
                  <View style={styles.moduleTopInfo}>
                    <Text style={[styles.moduleBigNum, themeStyles.moduleBigNum]}>{adminInsightsData.totalVendasCotas}</Text>
                    <Text style={[styles.moduleSmallDesc, themeStyles.moduleSmallDesc]}>Contratos fechados</Text>
                  </View>
                  <View style={styles.moduleList}>
                    {[...adminInsightsData.stats].sort((a,b) => b.vendasCotas - a.vendasCotas).map(s => (
                      <DashboardRankBar 
                        key={s.id} label={s.name} value={s.vendasCotas} 
                        max={Math.max(...adminInsightsData.stats.map(x=>x.vendasCotas))} 
                        color="#34d399" isDarkMode={isDarkMode} suffix=" cotas"
                      />
                    ))}
                  </View>
                </DashboardModule>
              </View>

              <View style={[styles.dashGridItem, isMobile ? {width: '100%'} : isTablet ? {width: '48%'} : {width: '31%'}]}>
                <DashboardModule title="RANKING DE ENGAJAMENTO" isDarkMode={isDarkMode}>
                  <View style={styles.moduleTopInfo}>
                    <Text style={[styles.moduleBigNum, themeStyles.moduleBigNum]}>{adminInsightsData.totalEngajamento}</Text>
                    <Text style={[styles.moduleSmallDesc, themeStyles.moduleSmallDesc]}>Interações totais</Text>
                  </View>
                  <View style={styles.moduleList}>
                    {[...adminInsightsData.stats].sort((a,b) => b.interacoes - a.interacoes).map(s => (
                      <DashboardRankBar 
                        key={s.id} label={s.name} value={s.interacoes} 
                        max={Math.max(...adminInsightsData.stats.map(x=>x.interacoes))} 
                        color="#8b5cf6" isDarkMode={isDarkMode} 
                      />
                    ))}
                  </View>
                </DashboardModule>
              </View>

              {/* FILEIRA 2 */}
              <View style={[styles.dashGridItem, isMobile ? {width: '100%'} : isTablet ? {width: '48%'} : {width: '31%'}]}>
                <DashboardModule title="AGUARDANDO ATENDIMENTO" isDarkMode={isDarkMode}>
                  <View style={styles.moduleTopInfo}>
                    <Text style={[styles.moduleBigNum, themeStyles.moduleBigNum]}>{adminInsightsData.totalNovo}</Text>
                    <Text style={[styles.moduleSmallDesc, themeStyles.moduleSmallDesc]}>Leads em "Novo Cliente"</Text>
                  </View>
                  <View style={styles.moduleList}>
                    {[...adminInsightsData.stats].sort((a,b) => b.novoCliente - a.novoCliente).map(s => (
                      <DashboardRankBar 
                        key={s.id} label={s.name} value={s.novoCliente} 
                        max={Math.max(...adminInsightsData.stats.map(x=>x.novoCliente))} 
                        color="#3b82f6" isDarkMode={isDarkMode} 
                      />
                    ))}
                  </View>
                </DashboardModule>
              </View>

              <View style={[styles.dashGridItem, isMobile ? {width: '100%'} : isTablet ? {width: '48%'} : {width: '31%'}]}>
                <DashboardModule title="PARADOS POR MAIS DE 3 DIAS (Novo Cliente)" isDarkMode={isDarkMode} highlight={adminInsightsData.totalNovoOld > 0}>
                  <View style={styles.moduleTopInfo}>
                    <Text style={[styles.moduleBigNum, themeStyles.moduleBigNum, {color: isDarkMode ? '#f87171' : '#dc2626'}]}>{adminInsightsData.totalNovoOld}</Text>
                    <Text style={[styles.moduleSmallDesc, themeStyles.moduleSmallDesc]}>Leads parados</Text>
                  </View>
                  <View style={styles.moduleList}>
                    {[...adminInsightsData.stats].sort((a,b) => b.novoClienteOld - a.novoClienteOld).map(s => (
                      <DashboardRankBar 
                        key={s.id} label={s.name} value={s.novoClienteOld} 
                        max={Math.max(...adminInsightsData.stats.map(x=>x.novoClienteOld))} 
                        color={isDarkMode ? "#f87171" : "#ef4444"} isDarkMode={isDarkMode} 
                      />
                    ))}
                  </View>
                </DashboardModule>
              </View>

              <View style={[styles.dashGridItem, isMobile ? {width: '100%'} : isTablet ? {width: '48%'} : {width: '31%'}]}>
                <DashboardModule title="RANKING DE PERDIDOS" isDarkMode={isDarkMode}>
                  <View style={styles.moduleTopInfo}>
                    <Text style={[styles.moduleBigNum, themeStyles.moduleBigNum]}>{adminInsightsData.totalPerdidos}</Text>
                    <Text style={[styles.moduleSmallDesc, themeStyles.moduleSmallDesc]}>Leads perdidos ou na Lixeira</Text>
                  </View>
                  <View style={styles.moduleList}>
                    {/* Rankeado do menor para o maior (quem perdeu menos fica no topo) */}
                    {[...adminInsightsData.stats].sort((a,b) => a.perdidos - b.perdidos).map(s => (
                      <DashboardRankBar 
                        key={s.id} label={s.name} value={s.perdidos} 
                        max={Math.max(...adminInsightsData.stats.map(x=>x.perdidos))} 
                        color={isDarkMode ? "#94a3b8" : "#64748b"} isDarkMode={isDarkMode} 
                      />
                    ))}
                  </View>
                </DashboardModule>
              </View>

              {/* FILEIRA 3 */}
              <View style={[styles.dashGridItem, isMobile ? {width: '100%'} : isTablet ? {width: '48%'} : {width: '31%'}]}>
                <DashboardModule title="AQUECIDOS PARA FECHAMENTO" isDarkMode={isDarkMode}>
                  <Text style={[styles.moduleDesc, themeStyles.moduleDesc]}>Leads ativos na etapa de Negociação</Text>
                  <View style={styles.moduleList}>
                    {[...adminInsightsData.stats].sort((a,b) => b.negociacao - a.negociacao).map(s => (
                      <DashboardRankBar 
                        key={s.id} label={s.name} value={s.negociacao} 
                        max={Math.max(...adminInsightsData.stats.map(x=>x.negociacao))} 
                        color="#10b981" isDarkMode={isDarkMode} 
                      />
                    ))}
                  </View>
                </DashboardModule>
              </View>

              <View style={[styles.dashGridItem, isMobile ? {width: '100%'} : isTablet ? {width: '48%'} : {width: '31%'}]}>
                <DashboardModule title="PROPOSTAS ENVIADAS" isDarkMode={isDarkMode}>
                  <Text style={[styles.moduleDesc, themeStyles.moduleDesc]}>Simulações ou propostas oficiais registradas</Text>
                  <View style={styles.moduleList}>
                    {[...adminInsightsData.stats].sort((a,b) => b.propostas - a.propostas).map(s => (
                      <DashboardRankBar 
                        key={s.id} label={s.name} value={s.propostas} 
                        max={Math.max(...adminInsightsData.stats.map(x=>x.propostas))} 
                        color="#14b8a6" isDarkMode={isDarkMode} 
                      />
                    ))}
                  </View>
                </DashboardModule>
              </View>

              <View style={[styles.dashGridItem, isMobile ? {width: '100%'} : isTablet ? {width: '100%'} : {width: '31%'}]}>
                <DashboardModule title="USO DE DISPAROS WHATSAPP" isDarkMode={isDarkMode}>
                  <Text style={[styles.moduleDesc, themeStyles.moduleDesc]}>Campanhas de disparo em massa efetuadas</Text>
                  <View style={styles.moduleList}>
                    {[...adminInsightsData.stats].sort((a,b) => b.disparos - a.disparos).map(s => (
                      <DashboardRankBar 
                        key={s.id} label={s.name} value={s.disparos} 
                        max={Math.max(...adminInsightsData.stats.map(x=>x.disparos))} 
                        color="#22c55e" isDarkMode={isDarkMode} suffix=" msg"
                      />
                    ))}
                  </View>
                </DashboardModule>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ====================================================================== */}
      {/* MODAL DE HISTÓRICO DE DISPAROS (SOMENTE ADMIN)                         */}
      {/* ====================================================================== */}
      {isAdmin && (
        <Modal visible={isHistoryModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsHistoryModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.historyModalContainer, themeStyles.historyModalContainer, isMobile && {padding: 16, width: '95%'}]}>
              <View style={[styles.historyModalHeader, themeStyles.historyModalHeader]}>
                <Text style={[styles.historyModalTitle, themeStyles.historyModalTitle, isMobile && {fontSize: 16}]}>
                  {getHistoryModalTitle()}
                </Text>
                <TouchableOpacity onPress={() => setIsHistoryModalVisible(false)} style={styles.closeButton}>
                  <Text style={[styles.closeButtonText, themeStyles.closeButtonText]}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.historyModalContent} showsVerticalScrollIndicator={false}>
                {filteredHistory.length === 0 ? (
                  <Text style={[styles.emptyText, themeStyles.emptyText]}>Nenhum disparo registrado para o(s) usuário(s) neste período.</Text>
                ) : (
                  filteredHistory.map(item => {
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
                      <TouchableOpacity key={item.id} onPress={() => setSelectedReport(item)} style={[styles.historyCard, themeStyles.historyCard]}>
                        <View style={styles.historyHeader}>
                          <Text style={[styles.historyStatus, item.status === 'Cancelado' ? {color: '#ef4444'} : {color: '#16a34a'}]}>{item.status}</Text>
                          <Text style={[styles.historyDate, themeStyles.historyDate]}>Início: {item.inicio}</Text>
                        </View>
                        <Text style={[styles.historyMsg, themeStyles.historyMsg]}>
                          <Text style={[{fontWeight:'bold'}, themeStyles.historyMsg]}>Conta WhatsApp:</Text> +{item.whatsapp_numero || 'N/A'}
                        </Text>
                        <View style={{ marginVertical: 4 }}>
                          <Text style={[{ fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }, themeStyles.historyDate]}>Informações:</Text>
                          <Text style={[styles.historyMsgClean, themeStyles.historyMsgClean]} numberOfLines={2}>
                            {getCleanMessage(item.mensagem)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[styles.historyDate, themeStyles.historyDate]}><Text style={[{fontWeight:'bold'}, themeStyles.historyDate]}>Fim:</Text> {item.fim}</Text>
                          {hasVariations && (
                            <Text style={[styles.historyItalicHint, themeStyles.historyItalicHint]}>
                              (mensagens disparadas alternadamente)
                            </Text>
                          )}
                        </View>
                        <View style={[styles.historyStatsRow, themeStyles.historyStatsRow]}>
                          <Text style={[styles.historyStatItem, themeStyles.historyStatItem]}>👥 Leads: {item.total_alvos}</Text>
                          <Text style={[styles.historyStatItem, {color: '#16a34a'}]}>✅ Sucesso: {item.sucesso}</Text>
                          <Text style={[styles.historyStatItem, {color: '#ef4444'}]}>❌ Falha: {item.falha}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
      
      {/* ====================================================================== */}
      {/* MODAL DE ALERTA DE EXPORTAÇÃO (PADRÃO DO SISTEMA)                      */}
      {/* ====================================================================== */}
      <Modal 
        visible={isExportAlertVisible} 
        transparent={true} 
        animationType="fade" 
        onRequestClose={() => setIsExportAlertVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.historyModalContainer, themeStyles.historyModalContainer, isMobile && {padding: 16, width: '95%'}, {maxWidth: 400}]}>
            
            {/* Cabeçalho do Alerta com título e fechar posicionados corretamente */}
            <View style={[styles.historyModalHeader, themeStyles.historyModalHeader, {marginBottom: 16, position: 'relative', justifyContent: 'center'}]}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                <Text style={[styles.historyModalTitle, themeStyles.historyModalTitle, {fontSize: 18, textAlign: 'center'}]}>
                  ⚠️ Atenção
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsExportAlertVisible(false)} style={[styles.closeButton, {position: 'absolute', right: 0}]}>
                <Text style={[styles.closeButtonText, themeStyles.closeButtonText]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Conteúdo do Alerta */}
            <View style={{ marginBottom: 24 }}>
              <Text style={[styles.historyMsg, themeStyles.historyMsg, {textAlign: 'center', fontSize: 14}]}>
                Não há dados de leads disponíveis para exportar com os filtros atuais selecionados.
              </Text>
            </View>

            {/* Botão de Ação alinhado */}
            <TouchableOpacity 
              style={[styles.navExportBtn, { alignSelf: 'center', paddingHorizontal: 32, paddingVertical: 10 }]} 
              onPress={() => setIsExportAlertVisible(false)}
            >
              <Text style={[styles.navExportBtnText, {fontSize: 14}]}>Entendido</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* ====================================================================== */}
      {/* MODAL DE RELATÓRIO INDIVIDUAL (COMPARTILHADO)                          */}
      {/* ====================================================================== */}
      <ReportModal 
        visible={!!selectedReport} 
        report={selectedReport} 
        boardData={{ phases: availablePhases.map(p => ({ id: p, title: p })) }} 
        onClose={() => setSelectedReport(null)} 
        isDarkMode={isDarkMode} 
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerAll: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontFamily: MODERN_FONT, fontSize: 13 },
  content: { padding: 16, maxWidth: 1200, marginHorizontal: 'auto', width: '100%', paddingBottom: 40 },
  contentMobile: { padding: 12 },
  
  headerArea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerAreaMobile: { flexDirection: 'column', alignItems: 'flex-start', gap: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerActionsMobile: { flexDirection: 'column', width: '100%', alignItems: 'stretch', gap: 8 },

  adminNavbar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 6,
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' } })
  },
  adminNavbarMobile: {
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
    justifyContent: 'space-between'
  },
  adminNavSelect: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 0,
    fontSize: 12,
    fontFamily: MODERN_FONT,
    outlineStyle: 'none',
    fontWeight: '700',
    backgroundColor: 'transparent',
    cursor: 'pointer'
  },
  navDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 8
  },
  navHistoryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  navHistoryBtnText: {
    fontFamily: MODERN_FONT,
    fontSize: 12,
    fontWeight: '700'
  },
  navExportBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  navExportBtnText: {
    fontFamily: MODERN_FONT,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12
  },

  pageTitle: { fontFamily: MODERN_FONT, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  pageSubtitle: { fontFamily: MODERN_FONT, fontSize: 12, marginTop: 2 },

  toolsContainer: { marginBottom: 16, padding: 16, borderRadius: 12, borderWidth: 1 },
  filterSectionBase: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  filterSectionBaseMobile: { flexDirection: 'column', alignItems: 'stretch' },
  filterGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filterGroupMobile: { flexDirection: 'column', alignItems: 'flex-start', width: '100%' },
  filterGroupLabel: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  filterButtonGroup: { flexDirection: 'row', borderRadius: 8, padding: 2 },
  filterButtonGroupMobile: { flexWrap: 'wrap', width: '100%', gap: 4 },
  filterBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  filterText: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '700' },

  advancedFiltersRow: { flexDirection: 'row', gap: 12, flex: 1, justifyContent: 'flex-end' },
  advancedFiltersRowMobile: { flexDirection: 'column', width: '100%', gap: 8 },
  pickerBox: { width: 140 },
  pickerBoxMobile: { width: '100%' },
  pickerLabel: { fontFamily: MODERN_FONT, fontSize: 10, fontWeight: '700', marginBottom: 4 },
  webSelect: { width: '100%', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, fontSize: 11, fontFamily: MODERN_FONT, outlineStyle: 'none' },
  pickerFallback: { fontFamily: MODERN_FONT, fontSize: 11, color: '#94a3b8' },

  customDateWrapper: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  customDateWrapperMobile: { flexDirection: 'column', gap: 12 },
  customDateInputBox: { width: 120 },
  customDateInputBoxMobile: { width: '100%' },
  customDateLabel: { fontFamily: MODERN_FONT, fontSize: 10, fontWeight: '800', marginBottom: 4 },
  customDateInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 11, fontFamily: MODERN_FONT },

  kpiGrid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  kpiGridMobile: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: { flex: 1, borderRadius: 12, padding: 16, borderWidth: 1 },
  kpiCardMobile: { flexBasis: '45%', flexGrow: 1, minWidth: 140 },
  kpiTitle: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  kpiValue: { fontFamily: MODERN_FONT, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },

  mainLayout: { flexDirection: 'row', gap: 16 },
  mainLayoutMobile: { flexDirection: 'column', gap: 12 },
  leftColumn: { gap: 16 },
  rightColumn: { gap: 16 },

  dashboardCard: { borderRadius: 12, padding: 20, borderWidth: 1 },
  cardHeader: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '800', marginBottom: 12 },
  
  barContainer: { marginBottom: 12 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, alignItems: 'flex-end' },
  barLabel: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '700' },
  barValue: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '800' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },

  effortGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  effortGridMobile: { flexDirection: 'column' },
  effortBox: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  effortLabel: { fontFamily: MODERN_FONT, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  effortNumber: { fontFamily: MODERN_FONT, fontSize: 20, fontWeight: '900' },

  infoBalloon: { flexDirection: 'row', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 16, alignItems: 'center', gap: 10 },
  infoIconBox: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  infoIconText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold', fontFamily: MODERN_FONT },
  infoBalloonText: { flex: 1, fontFamily: MODERN_FONT, fontSize: 11, lineHeight: 16 },

  financialTotalValue: { fontFamily: MODERN_FONT, fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: -1, marginVertical: 12 },
  financialList: { marginTop: 0 },
  finItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  finLabel: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '600' },
  finValue: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '700' },

  chartsFooterSection: { flexDirection: 'row', gap: 16, marginTop: 16 },
  chartsFooterMobile: { flexDirection: 'column', gap: 12 },
  axisGraphContainer: { height: 130, marginTop: 10, borderWidth: 1, flexDirection: 'row', borderRadius: 8, overflow: 'hidden' },
  axisYContainer: { width: 75, justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderRightWidth: 1, alignItems: 'flex-end' },
  axisLabel: { fontSize: 10, fontWeight: '700', fontFamily: MODERN_FONT },
  axisContentArea: { flex: 1, position: 'relative' },
  gridLineH1: { position: 'absolute', left: 0, right: 0, top: '33%', height: 1 },
  gridLineH2: { position: 'absolute', left: 0, right: 0, top: '66%', height: 1 },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, marginLeft: -5, marginTop: -5 },
  timelineBarsWrapper: { flexDirection: 'row', flex: 1, alignItems: 'flex-end', justifyContent: 'space-around', paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 },
  timelineBarCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', maxWidth: 40 },
  timelineBarFill: { width: '70%', backgroundColor: '#2563eb', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  timelineBarText: { fontFamily: MODERN_FONT, fontSize: 9, marginTop: 4 },
  emptyGraphText: { position: 'absolute', top: '45%', left: '35%', fontFamily: MODERN_FONT, fontSize: 11, fontStyle: 'italic' },

  adminSectionWrapper: { marginTop: 30, paddingTop: 20, borderTopWidth: 1 },
  adminSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  adminSectionTitle: { fontFamily: MODERN_FONT, fontSize: 20, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  adminSectionSubtitle: { fontFamily: MODERN_FONT, fontSize: 13 },
  
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#fca5a5' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444', marginRight: 6 },
  liveText: { fontSize: 10, fontWeight: '800', color: '#b91c1c', fontFamily: MODERN_FONT },

  dashGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  dashGridItem: { minWidth: 280, flexGrow: 1 },
  
  dashModule: { padding: 16, borderRadius: 12, borderWidth: 1, flex: 1, ...Platform.select({ web: { boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' } }) },
  dashModuleHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  dashModuleIcon: { fontSize: 16 },
  dashModuleTitle: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '800' },
  dashModuleContent: { flex: 1 },
  
  moduleTopInfo: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 12 },
  moduleBigNum: { fontFamily: MODERN_FONT, fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  moduleSmallDesc: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '600' },
  moduleDesc: { fontFamily: MODERN_FONT, fontSize: 11, marginBottom: 12 },
  
  moduleList: { flex: 1, justifyContent: 'flex-start' },
  
  rankBarContainer: { marginBottom: 10 },
  rankBarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' },
  rankBarLabel: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '600', flex: 1, paddingRight: 8 },
  rankBarValue: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '800' },
  rankBarTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  rankBarFill: { height: '100%', borderRadius: 3 },

  moduleEmptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },
  moduleEmptyIcon: { fontSize: 24, marginBottom: 8 },
  moduleEmptyText: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  moduleEmptySub: { fontFamily: MODERN_FONT, fontSize: 11, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  historyModalContainer: { width: '100%', maxWidth: 640, borderRadius: 16, padding: 24, maxHeight: '85%', ...Platform.select({ web: { boxShadow: '0px 10px 30px rgba(0,0,0,0.3)' } }) },
  historyModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  historyModalTitle: { fontSize: 18, fontWeight: '800', fontFamily: MODERN_FONT, flexShrink: 1, marginRight: 10 },
  closeButton: { padding: 4 },
  closeButtonText: { fontSize: 20, fontWeight: 'bold' },
  historyModalContent: { flex: 1 },
  emptyText: { textAlign: 'center', fontStyle: 'italic', marginTop: 40, fontFamily: MODERN_FONT, fontSize: 14 },

  historyCard: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 10 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  historyStatus: { fontWeight: 'bold', fontSize: 13, fontFamily: MODERN_FONT },
  historyDate: { fontSize: 12, fontFamily: MODERN_FONT },
  historyMsg: { fontSize: 13, marginBottom: 6, fontFamily: MODERN_FONT },
  historyMsgClean: { fontSize: 13, padding: 6, borderRadius: 4, borderWidth: 1, fontStyle: 'italic', marginTop: 2, fontFamily: MODERN_FONT },
  historyItalicHint: { fontSize: 10, fontStyle: 'italic', textAlign: 'right', flex: 1 },
  historyStatsRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 6, marginTop: 4 },
  historyStatItem: { fontSize: 12, fontWeight: '600', fontFamily: MODERN_FONT },
});

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#f1f5f9' },
  loadingText: { color: '#475569' },
  pageTitle: { color: '#0f172a' },
  pageSubtitle: { color: '#64748b' },
  
  adminNavbar: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  adminNavSelect: { color: '#0f172a' },
  navDivider: { backgroundColor: '#e2e8f0' },
  navHistoryBtnText: { color: '#475569' },

  toolsContainer: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  filterGroupLabel: { color: '#334155' },
  filterButtonGroup: { backgroundColor: '#f8fafc' },
  filterBtnActive: { backgroundColor: '#ffffff' },
  filterText: { color: '#64748b' },
  filterTextActive: { color: '#0f172a' },
  pickerLabel: { color: '#64748b' },
  webSelect: { borderColor: '#cbd5e1', backgroundColor: '#f8fafc', color: '#0f172a' },
  customDateWrapper: { borderTopColor: '#f1f5f9' },
  customDateLabel: { color: '#475569' },
  customDateInput: { backgroundColor: '#f8fafc', borderColor: '#cbd5e1', color: '#0f172a' },
  kpiCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  kpiTitle: { color: '#64748b' },
  kpiValue: { color: '#0f172a' },
  dashboardCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  cardHeader: { color: '#0f172a' },
  barLabel: { color: '#334155' },
  barValue: { color: '#64748b' },
  barTrack: { backgroundColor: '#f1f5f9' },
  effortBox: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  effortLabel: { color: '#64748b' },
  effortNumber: { color: '#10b981' },
  infoBalloon: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  infoBalloonText: { color: '#1e3a8a' },
  finItem: { borderBottomColor: '#1e293b' },
  finLabel: { color: '#cbd5e1' },
  finValue: { color: '#f8fafc' },
  axisGraphContainer: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  axisYContainer: { backgroundColor: '#f1f5f9', borderRightColor: '#e2e8f0' },
  axisLabel: { color: '#64748b' },
  gridLine: { backgroundColor: '#e2e8f0' },
  timelineBarText: { color: '#64748b' },
  emptyGraphText: { color: '#94a3b8' },

  adminSectionWrapper: { borderTopColor: '#cbd5e1' },
  adminSectionTitle: { color: '#0f172a' },
  adminSectionSubtitle: { color: '#475569' },
  dashModule: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  dashModuleHighlight: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  dashModuleTitle: { color: '#1e293b' },
  moduleBigNum: { color: '#0f172a' },
  moduleSmallDesc: { color: '#64748b' },
  moduleDesc: { color: '#64748b' },
  rankBarLabel: { color: '#475569' },
  rankBarValue: { color: '#0f172a' },
  rankBarTrack: { backgroundColor: '#f1f5f9' },
  moduleEmptyText: { color: '#0f172a' },
  moduleEmptySub: { color: '#64748b' },

  historyModalContainer: { backgroundColor: '#ffffff' },
  historyModalTitle: { color: '#0f172a' },
  closeButtonText: { color: '#64748b' },
  emptyText: { color: '#94a3b8' },
  historyCard: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  historyDate: { color: '#64748b' },
  historyMsg: { color: '#334155' },
  historyMsgClean: { backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#475569' },
  historyItalicHint: { color: '#64748b' },
  historyStatsRow: { borderTopColor: '#e2e8f0' },
  historyStatItem: { color: '#475569' }
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#0f172a' },
  loadingText: { color: '#94a3b8' },
  pageTitle: { color: '#f8fafc' },
  pageSubtitle: { color: '#94a3b8' },
  
  adminNavbar: { backgroundColor: '#1e293b', borderColor: '#334155' },
  adminNavSelect: { color: '#f8fafc' },
  navDivider: { backgroundColor: '#334155' },
  navHistoryBtnText: { color: '#cbd5e1' },

  toolsContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  filterGroupLabel: { color: '#cbd5e1' },
  filterButtonGroup: { backgroundColor: '#0f172a' },
  filterBtnActive: { backgroundColor: '#334155' },
  filterText: { color: '#94a3b8' },
  filterTextActive: { color: '#ffffff' },
  pickerLabel: { color: '#94a3b8' },
  webSelect: { borderColor: '#334155', backgroundColor: '#0f172a', color: '#f8fafc' },
  customDateWrapper: { borderTopColor: '#334155' },
  customDateLabel: { color: '#cbd5e1' },
  customDateInput: { backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' },
  kpiCard: { backgroundColor: '#1e293b', borderColor: '#334155' },
  kpiTitle: { color: '#94a3b8' },
  kpiValue: { color: '#f8fafc' },
  dashboardCard: { backgroundColor: '#1e293b', borderColor: '#334155' },
  cardHeader: { color: '#f8fafc' },
  barLabel: { color: '#cbd5e1' },
  barValue: { color: '#94a3b8' },
  barTrack: { backgroundColor: '#0f172a' },
  effortBox: { backgroundColor: '#0f172a', borderColor: '#334155' },
  effortLabel: { color: '#94a3b8' },
  effortNumber: { color: '#34d399' },
  infoBalloon: { backgroundColor: '#1e3a8a', borderColor: '#1d4ed8' },
  infoBalloonText: { color: '#93c5fd' },
  finItem: { borderBottomColor: '#334155' },
  finLabel: { color: '#94a3b8' },
  finValue: { color: '#f8fafc' },
  axisGraphContainer: { backgroundColor: '#0f172a', borderColor: '#334155' },
  axisYContainer: { backgroundColor: '#1e293b', borderRightColor: '#334155' },
  axisLabel: { color: '#94a3b8' },
  gridLine: { backgroundColor: '#334155' },
  timelineBarText: { color: '#94a3b8' },
  emptyGraphText: { color: '#64748b' },

  adminSectionWrapper: { borderTopColor: '#334155' },
  adminSectionTitle: { color: '#f8fafc' },
  adminSectionSubtitle: { color: '#94a3b8' },
  dashModule: { backgroundColor: '#1e293b', borderColor: '#334155' },
  dashModuleHighlight: { borderColor: '#7f1d1d', backgroundColor: '#450a0a' },
  dashModuleTitle: { color: '#f8fafc' },
  moduleBigNum: { color: '#f8fafc' },
  moduleSmallDesc: { color: '#94a3b8' },
  moduleDesc: { color: '#94a3b8' },
  rankBarLabel: { color: '#cbd5e1' },
  rankBarValue: { color: '#f8fafc' },
  rankBarTrack: { backgroundColor: '#0f172a' },
  moduleEmptyText: { color: '#f8fafc' },
  moduleEmptySub: { color: '#94a3b8' },

  historyModalContainer: { backgroundColor: '#1e293b' },
  historyModalTitle: { color: '#f8fafc' },
  closeButtonText: { color: '#94a3b8' },
  emptyText: { color: '#64748b' },
  historyCard: { backgroundColor: '#0f172a', borderColor: '#334155' },
  historyDate: { color: '#94a3b8' },
  historyMsg: { color: '#cbd5e1' },
  historyMsgClean: { backgroundColor: '#1e293b', borderColor: '#334155', color: '#cbd5e1' },
  historyItalicHint: { color: '#94a3b8' },
  historyStatsRow: { borderTopColor: '#334155' },
  historyStatItem: { color: '#cbd5e1' }
});