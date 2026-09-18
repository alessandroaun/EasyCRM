import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, useWindowDimensions, ActivityIndicator, Modal } from 'react-native';
import { supabase } from '../services/supabaseClient';

import { MODERN_FONT, TOKENS } from '../theme/tokens';

export default function Configuracao({ onConfigSaved, isDarkMode }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 850;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingNameChange, setRequestingNameChange] = useState(false);

  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [originalName, setOriginalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [canEditName, setCanEditName] = useState(false);
  const [nameChangeRequested, setNameChangeRequested] = useState(false);

  const [monthlyGoal, setMonthlyGoal] = useState('');
  const [dailyCalls, setDailyCalls] = useState('');
  const [dailyNeg, setDailyNeg] = useState('');
  const [dailySims, setDailySims] = useState('');
  const [ticketMedio, setTicketMedio] = useState('');
  const [conversionRateGoal, setConversionRateGoal] = useState('');
  const [goalHistory, setGoalHistory] = useState([]);
  
  const [hasPendingParamRequest, setHasPendingParamRequest] = useState(false);
  const [lastParamRequestDate, setLastParamRequestDate] = useState(null);

  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  const [customModal, setCustomModal] = useState({ visible: false, title: '', message: '', type: 'info' });
  
  // Modal de Pedido de Parâmetros
  const [isParamRequestModalVisible, setIsParamRequestModalVisible] = useState(false);
  const [reqGoal, setReqGoal] = useState('');
  const [reqCalls, setReqCalls] = useState('');
  const [reqSims, setReqSims] = useState('');
  const [reqNegs, setReqNegs] = useState('');
  const [reqTicket, setReqTicket] = useState('');
  const [reqConv, setReqConv] = useState('');
  const [reqJustification, setReqJustification] = useState('');

  const showAlertModal = (title, message, type = 'info') => {
    setCustomModal({ visible: true, title, message, type });
  };

  const closeAlertModal = () => {
    setCustomModal({ visible: false, title: '', message: '', type: 'info' });
  };

  const getCurrentMonthLabel = () => {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const d = new Date();
    return `${months[d.getMonth()]} / ${d.getFullYear()}`;
  };

  useEffect(() => {
    fetchConfigAndProfile();
  }, []);

  const fetchConfigAndProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email);

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('name, name_change_requested, can_edit_name, role')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profileError && profileError.code !== 'PGRST116') {
        console.error("Erro ao buscar perfil.", profileError);
      }

      if (profileData) {
        setUserRole(profileData.role);
        const loadedName = profileData.name || '';
        setDisplayName(loadedName);
        setOriginalName(loadedName);
        setNameChangeRequested(profileData.name_change_requested || false);
        setCanEditName(profileData.role === 'admin' ? true : (profileData.can_edit_name || false));
      }

      const { data: configs } = await supabase
        .from('crm_boards')
        .select('data_payload')
        .eq('id', `config_${user.id}`)
        .order('id', { ascending: false })
        .limit(1);
      
      const configData = configs && configs.length > 0 ? configs[0] : null;

      if (configData && configData.data_payload) {
        const p = configData.data_payload;
        setMonthlyGoal(p.monthlyGoal || '2.500.000');
        setDailyCalls(p.dailyCalls || '15');
        setDailyNeg(p.dailyNeg || '5');
        setDailySims(p.dailySims || '3');
        setTicketMedio(p.ticketMedio || '100.000');
        setConversionRateGoal(p.conversionRateGoal || '12');
        setGoalHistory(p.goalHistory || []);
        setHasPendingParamRequest(!!p.pendingRequest);
        setLastParamRequestDate(p.lastParamRequestDate || null);
      } else {
        const defaultHistory = [
          { id: 1, month: 'Julho / 2026', goal: '2.000.000', reached: '2.430.000', status: 'success' },
          { id: 2, month: 'Junho / 2026', goal: '1.800.000', reached: '1.500.000', status: 'warning' },
        ];
        const defaultData = {
          monthlyGoal: '2.500.000', dailyCalls: '15', dailyNeg: '5', dailySims: '3', 
          ticketMedio: '100.000', conversionRateGoal: '12', goalHistory: defaultHistory
        };
        await supabase.from('crm_boards').insert([{ id: `config_${user.id}`, user_id: user.id, data_payload: defaultData }]);
        
        setMonthlyGoal(defaultData.monthlyGoal);
        setDailyCalls(defaultData.dailyCalls);
        setDailyNeg(defaultData.dailyNeg);
        setDailySims(defaultData.dailySims);
        setTicketMedio(defaultData.ticketMedio);
        setConversionRateGoal(defaultData.conversionRateGoal);
        setGoalHistory(defaultHistory);
      }
    } catch (err) {
      showAlertModal("Erro de Conexão", "Não foi possível carregar os dados.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestNameChange = async () => {
    try {
      setRequestingNameChange(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('user_profiles').update({ 
        name_change_requested: true,
        old_name: originalName 
      }).eq('id', user.id);

      if (error) throw error;

      setNameChangeRequested(true);
      showAlertModal("Solicitação Enviada", "O administrador avaliará a alteração do seu nome.", "success");
    } catch (err) {
      showAlertModal("Erro", "Não foi possível enviar a solicitação.", "error");
    } finally {
      setRequestingNameChange(false);
    }
  };

  const openParamRequestModal = () => {
    if (lastParamRequestDate) {
      const lastDate = new Date(lastParamRequestDate);
      const now = new Date();
      const diffTime = Math.abs(now - lastDate);
      const totalMsLeft = (7 * 24 * 60 * 60 * 1000) - diffTime;
      
      if (totalMsLeft > 0) {
        const d = Math.floor(totalMsLeft / (1000 * 60 * 60 * 24));
        const h = Math.floor((totalMsLeft / (1000 * 60 * 60)) % 24);
        const m = Math.floor((totalMsLeft / 1000 / 60) % 60);

        let timeParts = [];
        if (d > 0) timeParts.push(`${d} dia(s)`);
        if (h > 0) timeParts.push(`${h} hora(s)`);
        if (m > 0 || (d === 0 && h === 0)) timeParts.push(`${m} minuto(s)`);

        const timeLeftStr = timeParts.join(', ').replace(/,([^,]*)$/, ' e$1');

        showAlertModal(
          "Aguarde", 
          `Você só poderá enviar uma nova solicitação de alteração de metas e parâmetros a cada 7 dias.\nTempo restante: ${timeLeftStr}`, 
          "warning"
        );
        return;
      }
    }

    setReqGoal(monthlyGoal);
    setReqCalls(dailyCalls);
    setReqSims(dailySims);
    setReqNegs(dailyNeg);
    setReqTicket(ticketMedio);
    setReqConv(conversionRateGoal);
    setReqJustification('');
    setIsParamRequestModalVisible(true);
  };

  const handleSubmitParamRequest = async () => {
    if (!reqJustification.trim()) {
      showAlertModal("Atenção", "Por favor, insira uma justificativa para a alteração.", "error");
      return;
    }
    
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: configs } = await supabase.from('crm_boards').select('data_payload').eq('id', `config_${user.id}`).limit(1);
      const p = configs && configs.length > 0 ? configs[0].data_payload : {};

      p.pendingRequest = {
        goal: reqGoal, calls: reqCalls, sims: reqSims, negs: reqNegs, ticket: reqTicket, conv: reqConv, justification: reqJustification
      };
      p.lastParamRequestDate = new Date().toISOString();

      const { error } = await supabase.from('crm_boards').update({ data_payload: p }).eq('id', `config_${user.id}`);
      if (error) throw error;

      setLastParamRequestDate(p.lastParamRequestDate);
      setHasPendingParamRequest(true);
      setIsParamRequestModalVisible(false);
      showAlertModal("Solicitação Enviada", "O administrador avaliará as mudanças nas suas metas e parâmetros.", "success");
    } catch (err) {
      showAlertModal("Erro", "Não foi possível enviar a solicitação.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (userRole === 'admin') {
        const { data: configs } = await supabase.from('crm_boards').select('data_payload').eq('id', `config_${user.id}`).limit(1);
        let p = configs && configs.length > 0 ? configs[0].data_payload : {};
        
        p.monthlyGoal = monthlyGoal;
        p.dailyCalls = dailyCalls;
        p.dailyNeg = dailyNeg;
        p.dailySims = dailySims;
        p.ticketMedio = ticketMedio;
        p.conversionRateGoal = conversionRateGoal;
        p.goalHistory = goalHistory;

        await supabase.from('crm_boards').update({ data_payload: p }).eq('id', `config_${user.id}`);
      }

      const hasChanged = originalName !== displayName;
      if (hasChanged) {
        const updatePayload = { name: displayName };
        
        if (userRole !== 'admin') {
          updatePayload.can_edit_name = false;
          updatePayload.name_change_requested = false;
          updatePayload.name_change_alert = true;
        }

        const { error: profileError } = await supabase.from('user_profiles').update(updatePayload).eq('id', user.id);
        if (profileError) throw profileError;
        
        setOriginalName(displayName);
        if (userRole !== 'admin') {
          setCanEditName(false);
          setNameChangeRequested(false);
        }
      }
      
      if (onConfigSaved) onConfigSaved();
      showAlertModal("Salvo com Sucesso", "Suas configurações de perfil foram atualizadas.", "success");
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
      showAlertModal("Erro", "Ocorreu um erro ao salvar as configurações.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    const validatePassword = (pwd) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(pwd);
    if (!validatePassword(newPass)) {
      showAlertModal("Senha Inválida", "A senha requer 6 caracteres, contendo maiúscula, minúscula, número e símbolo.", "error");
      return;
    }
    if (newPass !== newPassConfirm) {
      showAlertModal("Erro", "As senhas informadas não coincidem.", "error");
      return;
    }

    setIsChangingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      showAlertModal("Senha Atualizada", "Sua senha de acesso foi alterada.", "success");
      setNewPass('');
      setNewPassConfirm('');
    } catch (err) {
      showAlertModal("Erro", "Erro ao alterar senha: " + err.message, "error");
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleCurrencyChange = (text, setter) => {
    const rawNumber = text.replace(/\D/g, '');
    if (!rawNumber) return setter('');
    setter(new Intl.NumberFormat('pt-BR').format(parseInt(rawNumber, 10)));
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerAll, isDarkMode && darkStyles.container]}>
        <ActivityIndicator size="large" color={isDarkMode ? '#38bdf8' : '#2563eb'} />
      </View>
    );
  }

  const themeStyles = isDarkMode ? darkStyles : lightStyles;
  const isReadOnly = userRole !== 'admin';

  return (
    <View style={[styles.container, themeStyles.container]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        
        <View style={styles.header}>
          <Text style={[styles.pageTitle, themeStyles.pageTitle]}>Configurações</Text>
          <Text style={[styles.pageSubtitle, themeStyles.pageSubtitle]}>Ajuste suas metas e credenciais</Text>
        </View>

        <View style={[styles.grid, isMobile && styles.gridMobile]}>
          
          {/* COLUNA 1: IDENTIDADE E SEGURANÇA */}
          <View style={styles.column}>
            <View style={[styles.card, themeStyles.card]}>
              <Text style={[styles.cardTitle, themeStyles.cardTitle]}>Identidade</Text>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, themeStyles.label]}>E-mail</Text>
                <TextInput style={[styles.input, themeStyles.input, themeStyles.inputDisabled]} value={userEmail} editable={false} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, themeStyles.label]}>Nome de Exibição</Text>
                <View style={styles.rowInline}>
                  <TextInput 
                    style={[styles.input, themeStyles.input, { flex: 1 }, !canEditName && themeStyles.inputDisabled]} 
                    value={displayName} 
                    onChangeText={setDisplayName} 
                    editable={canEditName} 
                    placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                  />
                  {userRole !== 'admin' && !canEditName && (
                    <TouchableOpacity 
                      style={[styles.requestButton, themeStyles.requestButton, nameChangeRequested && styles.requestButtonDisabled]} 
                      onPress={handleRequestNameChange} 
                      disabled={nameChangeRequested || requestingNameChange}
                    >
                      <Text style={[styles.requestButtonText, themeStyles.requestButtonText]}>
                        {nameChangeRequested ? 'Pendente' : 'Alterar'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            <View style={[styles.card, themeStyles.card]}>
              <Text style={[styles.cardTitle, themeStyles.cardTitle]}>Segurança</Text>
              <View style={styles.inputGroup}>
                <TextInput style={[styles.input, themeStyles.input]} secureTextEntry value={newPass} onChangeText={setNewPass} placeholder="Nova Senha" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} />
              </View>
              <View style={styles.inputGroup}>
                <TextInput style={[styles.input, themeStyles.input]} secureTextEntry value={newPassConfirm} onChangeText={setNewPassConfirm} placeholder="Confirmar Senha" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} />
              </View>
              <TouchableOpacity style={[styles.secondaryButton, themeStyles.secondaryButton, isChangingPass && { opacity: 0.7 }]} onPress={handleUpdatePassword} disabled={isChangingPass}>
                <Text style={[styles.secondaryButtonText, themeStyles.secondaryButtonText]}>{isChangingPass ? 'Atualizando...' : 'Atualizar Senha'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* COLUNA 2: METAS E PARÂMETROS */}
          <View style={styles.column}>
            <View style={[styles.card, themeStyles.card]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, paddingBottom: 6 }}>
                <Text style={[styles.cardTitle, themeStyles.cardTitle, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>Meta ({getCurrentMonthLabel()})</Text>
                {isReadOnly && (
                  <TouchableOpacity style={[styles.requestButton, themeStyles.requestButton, hasPendingParamRequest && styles.requestButtonDisabled, { paddingVertical: 4 }]} onPress={openParamRequestModal} disabled={hasPendingParamRequest}>
                    <Text style={[styles.requestButtonText, themeStyles.requestButtonText]}>{hasPendingParamRequest ? 'Solicitação Pendente' : 'Solicitar Alteração'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              <View style={[styles.currencyInputContainer, themeStyles.currencyInputContainer, isReadOnly && themeStyles.inputDisabled]}>
                <Text style={[styles.currencySymbol, themeStyles.currencySymbol]}>R$</Text>
                <TextInput style={[styles.currencyInput, themeStyles.currencyInput, isReadOnly && themeStyles.inputDisabled]} value={monthlyGoal} onChangeText={(t) => handleCurrencyChange(t, setMonthlyGoal)} keyboardType="numeric" editable={!isReadOnly} />
              </View>
            </View>

            <View style={[styles.card, themeStyles.card]}>
              <Text style={[styles.cardTitle, themeStyles.cardTitle]}>Parâmetros (Diários)</Text>
              <View style={[styles.row, isMobile && styles.rowMobile]}>
                <View style={styles.inputGroupRow}>
                  <Text style={[styles.label, themeStyles.label]}>Ligações</Text>
                  <TextInput style={[styles.inputSmall, themeStyles.input, isReadOnly && themeStyles.inputDisabled]} value={dailyCalls} onChangeText={setDailyCalls} keyboardType="numeric" editable={!isReadOnly} />
                </View>
                <View style={styles.inputGroupRow}>
                  <Text style={[styles.label, themeStyles.label]}>Simulações</Text>
                  <TextInput style={[styles.inputSmall, themeStyles.input, isReadOnly && themeStyles.inputDisabled]} value={dailySims} onChangeText={setDailySims} keyboardType="numeric" editable={!isReadOnly} />
                </View>
                <View style={styles.inputGroupRow}>
                  <Text style={[styles.label, themeStyles.label]}>Negociações</Text>
                  <TextInput style={[styles.inputSmall, themeStyles.input, isReadOnly && themeStyles.inputDisabled]} value={dailyNeg} onChangeText={setDailyNeg} keyboardType="numeric" editable={!isReadOnly} />
                </View>
              </View>
              <View style={[styles.row, { marginTop: 12 }, isMobile && styles.rowMobile]}>
                <View style={styles.inputGroupRow}>
                  <Text style={[styles.label, themeStyles.label]}>Ticket Médio (R$)</Text>
                  <TextInput style={[styles.input, themeStyles.input, isReadOnly && themeStyles.inputDisabled]} value={ticketMedio} onChangeText={(t) => handleCurrencyChange(t, setTicketMedio)} keyboardType="numeric" editable={!isReadOnly} />
                </View>
                <View style={styles.inputGroupRow}>
                  <Text style={[styles.label, themeStyles.label]}>Conversão (%)</Text>
                  <TextInput style={[styles.input, themeStyles.input, isReadOnly && themeStyles.inputDisabled]} value={conversionRateGoal} onChangeText={setConversionRateGoal} keyboardType="numeric" editable={!isReadOnly} />
                </View>
              </View>
            </View>
          </View>

          {/* COLUNA 3: HISTÓRICO */}
          <View style={styles.column}>
            <View style={[styles.card, themeStyles.card]}>
              <Text style={[styles.cardTitle, themeStyles.cardTitle]}>Histórico</Text>
              <View style={styles.historyList}>
                {goalHistory.map((item) => (
                  <View key={item.id} style={[styles.historyItem, themeStyles.historyItem]}>
                    <View style={styles.historyHeader}>
                      <Text style={[styles.historyMonth, themeStyles.historyMonth]}>{item.month}</Text>
                      <View style={[styles.statusBadge, item.status === 'success' ? themeStyles.badgeSuccess : themeStyles.badgeWarning]}>
                        <Text style={[styles.statusBadgeText, item.status === 'success' ? themeStyles.badgeSuccessText : themeStyles.badgeWarningText]}>
                          {item.status === 'success' ? 'Meta Batida' : 'Abaixo da Meta'}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.historyDataRow, themeStyles.historyDataRow]}>
                      <View>
                        <Text style={[styles.historyDataLabel, themeStyles.historyDataLabel]}>Meta Fixada</Text>
                        <Text style={[styles.historyDataValue, themeStyles.historyDataValue]}>R$ {item.goal}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.historyDataLabel, themeStyles.historyDataLabel]}>Alcançado</Text>
                        <Text style={[styles.historyDataValue, { color: item.status === 'success' ? (isDarkMode ? '#34d399' : '#059669') : (isDarkMode ? '#fbbf24' : '#d97706') }]}>
                          R$ {item.reached}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>

        </View>

        <TouchableOpacity style={[styles.saveButton, saving && { backgroundColor: '#94a3b8' }]} onPress={handleSaveConfig} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Salvando...' : 'Salvar Perfil'}</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* MODAL DE SOLICITAÇÃO DE PARÂMETROS */}
      <Modal visible={isParamRequestModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsParamRequestModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, themeStyles.modalContainer, { maxWidth: 500, width: '95%' }]}>
            <Text style={[styles.modalHeaderTitle, themeStyles.modalHeaderTitle, { marginBottom: 12 }]}>Solicitar Alteração de Metas e Parâmetros</Text>
            <Text style={[styles.modalMessageText, themeStyles.modalMessageText, { marginBottom: 16 }]}>Altere os valores desejados e insira uma justificativa para enviar ao Administrador.</Text>

            <ScrollView style={{ maxHeight: '60vh', marginBottom: 16 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, themeStyles.label]}>Nova Meta do Mês (R$)</Text>
              <TextInput style={[styles.input, themeStyles.input, { marginBottom: 10 }]} value={reqGoal} onChangeText={(t) => handleCurrencyChange(t, setReqGoal)} keyboardType="numeric" />

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, themeStyles.label]}>Ligações Diárias</Text>
                  <TextInput style={[styles.input, themeStyles.input]} value={reqCalls} onChangeText={setReqCalls} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, themeStyles.label]}>Simulações</Text>
                  <TextInput style={[styles.input, themeStyles.input]} value={reqSims} onChangeText={setReqSims} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, themeStyles.label]}>Negociações</Text>
                  <TextInput style={[styles.input, themeStyles.input]} value={reqNegs} onChangeText={setReqNegs} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, themeStyles.label]}>Conversão (%)</Text>
                  <TextInput style={[styles.input, themeStyles.input]} value={reqConv} onChangeText={setReqConv} keyboardType="numeric" />
                </View>
              </View>

              <Text style={[styles.label, themeStyles.label]}>Novo Ticket Médio (R$)</Text>
              <TextInput style={[styles.input, themeStyles.input, { marginBottom: 16 }]} value={reqTicket} onChangeText={(t) => handleCurrencyChange(t, setReqTicket)} keyboardType="numeric" />

              <Text style={[styles.label, themeStyles.label]}>Justificativa da Solicitação</Text>
              <TextInput 
                style={[styles.input, themeStyles.input, { height: 80, textAlignVertical: 'top' }]} 
                value={reqJustification} 
                onChangeText={setReqJustification} 
                multiline={true} 
                placeholder="Explique o motivo da alteração..." 
                placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} 
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[styles.modalBtn, themeStyles.cancelBtnStyle, { flex: 1 }]} onPress={() => setIsParamRequestModalVisible(false)}>
                <Text style={[styles.cancelBtnTextStyle, themeStyles.cancelBtnTextStyle]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { flex: 1, backgroundColor: '#2563eb' }]} onPress={handleSubmitParamRequest}>
                <Text style={styles.modalButtonPrimaryText}>Enviar Solicitação</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ====================================================================== */}
      {/* MODAIS DE ALERTA RENDERIZADOS NO FINAL (Z-INDEX GLOBAL E DESIGN NOVO)  */}
      {/* ====================================================================== */}
      <Modal visible={customModal.visible} transparent={true} animationType="fade" onRequestClose={closeAlertModal}>
        <View style={[styles.modalOverlay, { zIndex: 999999, elevation: 100 }]}>
          <View style={[styles.alertModalBox, themeStyles.alertModalBox, { padding: 24, maxWidth: 400 }]}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, position: 'relative', width: '100%'}}>
              <Text style={[styles.alertModalTitle, themeStyles.alertModalTitle, {marginBottom: 0, fontSize: 18, textAlign: 'center'}]}>
                {customModal.type === 'error' ? '❌ ' : customModal.type === 'warning' ? '⏳ ' : '✅ '}{customModal.title}
              </Text>
              <TouchableOpacity onPress={closeAlertModal} style={{position: 'absolute', right: 0}}>
                <Text style={[{fontSize: 20, fontWeight: 'bold'}, isDarkMode ? {color: '#94a3b8'} : {color: '#64748b'}]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ marginBottom: 24, width: '100%' }}>
              <Text style={[styles.alertModalMessage, themeStyles.alertModalMessage, {textAlign: 'center', fontSize: 14, marginBottom: 0}]}>{customModal.message}</Text>
            </View>
            <TouchableOpacity style={[styles.alertModalBtn, { alignSelf: 'center', paddingHorizontal: 32, width: 'auto' }]} onPress={closeAlertModal}>
              <Text style={styles.alertModalBtnText}>Compreendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerAll: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 32, maxWidth: 1100, marginHorizontal: 'auto', width: '100%', flexGrow: 1, paddingBottom: 85 },
  header: { marginBottom: 24, alignItems: 'flex-start' },
  pageTitle: { fontFamily: MODERN_FONT, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  pageSubtitle: { fontFamily: MODERN_FONT, fontSize: 13, marginTop: 4, fontWeight: '500' },
  grid: { flexDirection: 'row', gap: 20, flex: 1 },
  gridMobile: { flexDirection: 'column' },
  column: { flex: 1 },
  card: { borderRadius: 16, padding: 22, marginBottom: 20, borderWidth: 1, ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.03)' } }) },
  cardTitle: { fontFamily: MODERN_FONT, fontSize: 14, fontWeight: '800', letterSpacing: -0.2, marginBottom: 16, borderBottomWidth: 1, paddingBottom: 8 },
  inputGroup: { marginBottom: 14 },
  label: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 },
  input: { fontFamily: MODERN_FONT, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  rowInline: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  requestButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', ...Platform.select({ web: { cursor: 'pointer', transition: 'all 0.15s ease' } }) },
  requestButtonDisabled: { opacity: 0.5 },
  requestButtonText: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '800' },
  currencyInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  currencySymbol: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '800', paddingLeft: 14, paddingRight: 6 },
  currencyInput: { flex: 1, fontFamily: MODERN_FONT, paddingVertical: 10, paddingRight: 14, fontSize: 13, fontWeight: '700', ...Platform.select({ web: { outlineStyle: 'none' } }) },
  row: { flexDirection: 'row', gap: 12 },
  rowMobile: { flexDirection: 'column', gap: 10 },
  inputGroupRow: { flex: 1 },
  inputSmall: { fontFamily: MODERN_FONT, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 13, textAlign: 'center', ...Platform.select({ web: { outlineStyle: 'none' } }) },
  saveButton: { 
    backgroundColor: '#2563eb', 
    borderRadius: 12, 
    paddingVertical: 12, 
    paddingHorizontal: 40, 
    alignItems: 'center', 
    alignSelf: 'flex-start', 
    marginTop: 12, 
    ...Platform.select({ 
      web: { 
        cursor: 'pointer', 
        transition: 'all 0.15s ease',
        boxShadow: '0 4px 14px rgba(37,99,235,0.3)' 
      } 
    }) 
  },
  saveButtonText: { fontFamily: MODERN_FONT, color: '#ffffff', fontSize: 13, fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 6, ...Platform.select({ web: { cursor: 'pointer' } }) },
  secondaryButtonText: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '700' },
  historyList: { marginTop: 4 },
  historyItem: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historyMonth: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusBadgeText: { fontFamily: MODERN_FONT, fontSize: 10, fontWeight: '800' },
  historyDataRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8 },
  historyDataLabel: { fontFamily: MODERN_FONT, fontSize: 10, fontWeight: '700', marginBottom: 2, textTransform: 'uppercase' },
  historyDataValue: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '800' },
  
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', zIndex: 10000 },
  
  alertModalBox: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 26, alignItems: 'center', ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' } }) },
  alertModalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, fontFamily: MODERN_FONT, textAlign: 'center', letterSpacing: -0.3 },
  alertModalMessage: { fontSize: 13, lineHeight: 19, marginBottom: 20, fontFamily: MODERN_FONT, textAlign: 'center', fontWeight: '500' },
  alertModalBtn: { width: '100%', backgroundColor: '#2563eb', paddingVertical: 11, borderRadius: 10, alignItems: 'center', ...Platform.select({ web: { cursor: 'pointer' } }) },
  alertModalBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13, fontFamily: MODERN_FONT },

  modalContainer: { borderRadius: 16, padding: 22, width: '90%', maxWidth: 360, ...Platform.select({ web: { boxShadow: '0 15px 35px rgba(0,0,0,0.2)' } }) },
  modalHeaderTitle: { fontFamily: MODERN_FONT, fontSize: 16, fontWeight: '800' },
  modalMessageText: { fontFamily: MODERN_FONT, fontSize: 13, lineHeight: 19 },
  modalButtonPrimaryText: { fontFamily: MODERN_FONT, color: '#ffffff', fontSize: 12, fontWeight: '800' },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...Platform.select({ web: { cursor: 'pointer' } }) },
  
  cancelBtnStyle: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, ...Platform.select({ web: { cursor: 'pointer' } }) },
  cancelBtnTextStyle: { fontWeight: '700', fontSize: 12, fontFamily: MODERN_FONT }
});

/* Estilos de Tema Claro */
const lightStyles = StyleSheet.create({
  container: { backgroundColor: TOKENS.light.background },
  pageTitle: { color: TOKENS.light.textPrimary },
  pageSubtitle: { color: TOKENS.light.textMuted },
  card: { backgroundColor: TOKENS.light.surface, borderColor: TOKENS.light.border },
  cardTitle: { color: TOKENS.light.textPrimary, borderBottomColor: TOKENS.light.borderSubtle },
  label: { color: TOKENS.light.textSecondary },
  input: { backgroundColor: TOKENS.light.surfaceSubtle, borderColor: TOKENS.light.border, color: TOKENS.light.textPrimary },
  inputDisabled: { backgroundColor: TOKENS.light.surfaceSubtle, color: TOKENS.light.textMuted, borderColor: TOKENS.light.borderSubtle },
  requestButton: { backgroundColor: TOKENS.light.surfaceSubtle },
  requestButtonText: { color: TOKENS.light.textPrimary },
  currencyInputContainer: { backgroundColor: TOKENS.light.surfaceSubtle, borderColor: TOKENS.light.border },
  currencySymbol: { color: TOKENS.light.textSecondary },
  currencyInput: { color: TOKENS.light.textPrimary },
  secondaryButton: { backgroundColor: TOKENS.light.surfaceSubtle, borderColor: TOKENS.light.border },
  secondaryButtonText: { color: TOKENS.light.textSecondary },
  historyItem: { backgroundColor: TOKENS.light.surfaceSubtle, borderColor: TOKENS.light.border },
  historyMonth: { color: TOKENS.light.textPrimary },
  badgeSuccess: { backgroundColor: TOKENS.light.successSubtle },
  badgeWarning: { backgroundColor: TOKENS.light.warningSubtle },
  badgeSuccessText: { color: TOKENS.light.success },
  badgeWarningText: { color: TOKENS.light.warning },
  historyDataRow: { borderTopColor: TOKENS.light.borderSubtle },
  historyDataLabel: { color: TOKENS.light.textMuted },
  historyDataValue: { color: TOKENS.light.textPrimary },
  modalContainer: { backgroundColor: TOKENS.light.surface },
  modalHeaderTitle: { color: TOKENS.light.textPrimary },
  modalMessageText: { color: TOKENS.light.textSecondary },
  alertModalBox: { backgroundColor: TOKENS.light.surface },
  alertModalTitle: { color: TOKENS.light.textPrimary },
  alertModalMessage: { color: TOKENS.light.textSecondary },
  cancelBtnStyle: { backgroundColor: TOKENS.light.surfaceSubtle, borderColor: TOKENS.light.border },
  cancelBtnTextStyle: { color: TOKENS.light.textSecondary }
});

/* Estilos de Tema Escuro */
const darkStyles = StyleSheet.create({
  container: { backgroundColor: TOKENS.dark.background },
  pageTitle: { color: TOKENS.dark.textPrimary },
  pageSubtitle: { color: TOKENS.dark.textMuted },
  card: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  cardTitle: { color: TOKENS.dark.textPrimary, borderBottomColor: TOKENS.dark.borderSubtle },
  label: { color: TOKENS.dark.textSecondary },
  input: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border, color: TOKENS.dark.textPrimary },
  inputDisabled: { backgroundColor: TOKENS.dark.surfaceSubtle, color: TOKENS.dark.textMuted, borderColor: TOKENS.dark.borderSubtle },
  requestButton: { backgroundColor: TOKENS.dark.surfaceSubtle },
  requestButtonText: { color: TOKENS.dark.textPrimary },
  currencyInputContainer: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  currencySymbol: { color: TOKENS.dark.textSecondary },
  currencyInput: { color: TOKENS.dark.textPrimary },
  secondaryButton: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  secondaryButtonText: { color: TOKENS.dark.textSecondary },
  historyItem: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  historyMonth: { color: TOKENS.dark.textPrimary },
  badgeSuccess: { backgroundColor: TOKENS.dark.successSubtle },
  badgeWarning: { backgroundColor: TOKENS.dark.warningSubtle },
  badgeSuccessText: { color: TOKENS.dark.success },
  badgeWarningText: { color: TOKENS.dark.warning },
  historyDataRow: { borderTopColor: TOKENS.dark.borderSubtle },
  historyDataLabel: { color: TOKENS.dark.textMuted },
  historyDataValue: { color: TOKENS.dark.textPrimary },
  modalContainer: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border, borderWidth: 1 },
  modalHeaderTitle: { color: TOKENS.dark.textPrimary },
  modalMessageText: { color: TOKENS.dark.textSecondary },
  alertModalBox: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border, borderWidth: 1 },
  alertModalTitle: { color: TOKENS.dark.textPrimary },
  alertModalMessage: { color: TOKENS.dark.textSecondary },
  cancelBtnStyle: { backgroundColor: TOKENS.dark.surfaceSubtle, borderColor: TOKENS.dark.border },
  cancelBtnTextStyle: { color: TOKENS.dark.textSecondary }
});