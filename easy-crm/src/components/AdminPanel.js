// AdminPanel
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput, Platform, useWindowDimensions, ScrollView, Pressable } from 'react-native';
import { supabase } from '../services/supabaseClient';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

export default function AdminPanel({ isDarkMode }) {
  const { width } = useWindowDimensions();
  const numColumns = width > 850 ? 3 : 1; 

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados de Filtro e Busca
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Estados do Modal de Alerta
  const [isAlertModalVisible, setIsAlertModalVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  // Estados do Modal de Configuração
  const [isConfigModalVisible, setIsConfigModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [newEmailInput, setNewEmailInput] = useState('');
  const [editRole, setEditRole] = useState('vendedor'); 
  const [goalInput, setGoalInput] = useState('');
  const [callsInput, setCallsInput] = useState('');
  const [simsInput, setSimsInput] = useState('');
  const [negsInput, setNegsInput] = useState('');
  const [ticketInput, setTicketInput] = useState('');
  const [convInput, setConvInput] = useState('');

  // Estados de Importação de Dados
  const [selectedImportPhaseUser, setSelectedImportPhaseUser] = useState('');
  const [selectedImportLeadUser, setSelectedImportLeadUser] = useState('');
  const [isPhaseDropdownOpen, setIsPhaseDropdownOpen] = useState(false);
  const [isLeadDropdownOpen, setIsLeadDropdownOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Estados do Modal de Novo Usuário
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState('vendedor'); 
  const [isCreating, setIsCreating] = useState(false);

  // Estados do Modal de Exclusão Permanente
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setIsAlertModalVisible(true);
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data: usersData, error: usersError } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
    const { data: configsData } = await supabase.from('crm_boards').select('id, data_payload').ilike('id', 'config_%');

    if (!usersError && usersData) {
      const configsMap = {};
      if (configsData) {
        configsData.forEach(c => {
          const uid = c.id.replace('config_', '');
          configsMap[uid] = c.data_payload || {};
        });
      }
      
      const mergedUsers = usersData.map(u => ({
        ...u,
        config: configsMap[u.id] || {},
        hasPendingRequest: !!(configsMap[u.id] && configsMap[u.id].pendingRequest)
      }));
      setUsers(mergedUsers);
    }
    setLoading(false);
  };

  const updateUserStatus = async (id, newStatus) => {
    const { error } = await supabase.from('user_profiles').update({ status: newStatus }).eq('id', id);
    if (!error) {
      showAlert("Sucesso", `Status atualizado para: ${newStatus}`);
      fetchUsers();
    } else {
      showAlert("Erro", error.message);
    }
  };

  const handleOpenConfigModal = (user) => {
    setSelectedUser(user);
    setNewEmailInput(user.email);
    setEditRole(user.role || 'vendedor');
    setGoalInput(user.config.monthlyGoal || '0');
    setCallsInput(user.config.dailyCalls || '0');
    setSimsInput(user.config.dailySims || '0');
    setNegsInput(user.config.dailyNeg || '0');
    setTicketInput(user.config.ticketMedio || '0');
    setConvInput(user.config.conversionRateGoal || '0');
    setSelectedImportPhaseUser('');
    setSelectedImportLeadUser('');
    setIsPhaseDropdownOpen(false);
    setIsLeadDropdownOpen(false);
    setIsConfigModalVisible(true);
  };

  const handleResetCredentials = async () => {
    if (!selectedUser || !newEmailInput) return;
    try {
      setLoading(true);
      const { error } = await supabase.rpc('admin_reset_user_credentials', {
        target_user_id: selectedUser.id,
        new_email: newEmailInput,
        new_password: 'Senha123!'
      });

      if (error) throw error;
      showAlert("Sucesso", `Credenciais alteradas!\nNova senha padrão: Senha123!`);
      fetchUsers();
    } catch (err) {
      showAlert("Erro", "Erro ao redefinir: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (importType, sourceUserId) => {
    if (!sourceUserId) {
      showAlert("Erro", "Selecione um usuário para importar.");
      return;
    }
    try {
      setIsImporting(true);

      const { data: sourceBoards } = await supabase.from('crm_boards').select('data_payload').eq('user_id', sourceUserId).ilike('id', 'board_%').limit(1);
      if (!sourceBoards || sourceBoards.length === 0) throw new Error("Quadro do usuário origem não encontrado.");
      const sourcePayload = sourceBoards[0].data_payload || { phases: [] };

      const { data: targetBoards } = await supabase.from('crm_boards').select('id, data_payload').eq('user_id', selectedUser.id).ilike('id', 'board_%').limit(1);
      if (!targetBoards || targetBoards.length === 0) throw new Error("Quadro do usuário destino não encontrado.");
      const targetBoardId = targetBoards[0].id;
      let targetPayload = targetBoards[0].data_payload || { phases: [] };

      let targetPhases = [...targetPayload.phases];

      sourcePayload.phases.forEach((sPhase) => {
        let incomingPhase = {
          ...sPhase,
          id: `phase_imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          clients: importType === 'leads' ? JSON.parse(JSON.stringify(sPhase.clients || [])) : []
        };

        if (importType === 'leads') {
          incomingPhase.clients = incomingPhase.clients.map(c => ({
            ...c,
            id: `lead_imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            comments: (c.comments || []).map(comm => ({ ...comm, text: `[Importado] ${comm.text}` }))
          }));
        }

        const existingTargetIndex = targetPhases.findIndex(t => t.title.trim().toLowerCase() === sPhase.title.trim().toLowerCase());

        if (existingTargetIndex !== -1) {
          const oldTargetLeads = targetPhases[existingTargetIndex].clients || [];
          incomingPhase.clients = [...oldTargetLeads, ...incomingPhase.clients];
          targetPhases[existingTargetIndex] = incomingPhase;
        } else {
          targetPhases.push(incomingPhase);
        }
      });

      targetPayload.phases = targetPhases;

      const { error: updateError } = await supabase.from('crm_boards').update({ data_payload: targetPayload }).eq('id', targetBoardId);
      if (updateError) throw updateError;

      showAlert("Sucesso", `Importação de ${importType === 'leads' ? 'Leads e Fases' : 'Fases'} concluída!`);
      setIsPhaseDropdownOpen(false);
      setIsLeadDropdownOpen(false);
      if (importType === 'phases') setSelectedImportPhaseUser('');
      if (importType === 'leads') setSelectedImportLeadUser('');

    } catch (err) {
      showAlert("Erro", "Falha na importação: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveParameters = async () => {
    if (!selectedUser) return;
    try {
      setLoading(true);

      const hasChanges = (
        goalInput !== (selectedUser.config.monthlyGoal || '0') ||
        callsInput !== (selectedUser.config.dailyCalls || '0') ||
        simsInput !== (selectedUser.config.dailySims || '0') ||
        negsInput !== (selectedUser.config.dailyNeg || '0') ||
        ticketInput !== (selectedUser.config.ticketMedio || '0') ||
        convInput !== (selectedUser.config.conversionRateGoal || '0') ||
        editRole !== (selectedUser.role || 'vendedor')
      );
      
      if (editRole && editRole !== selectedUser.role) {
        const { error: roleError } = await supabase
          .from('user_profiles')
          .update({ role: editRole })
          .eq('id', selectedUser.id);
        if (roleError) throw roleError;
      }

      const updatedConfig = { ...selectedUser.config };
      updatedConfig.monthlyGoal = goalInput;
      updatedConfig.dailyCalls = callsInput;
      updatedConfig.dailySims = simsInput;
      updatedConfig.dailyNeg = negsInput;
      updatedConfig.ticketMedio = ticketInput;
      updatedConfig.conversionRateGoal = convInput;

      delete updatedConfig.pendingRequest;

      const { error: configError } = await supabase
        .from('crm_boards')
        .update({ data_payload: updatedConfig })
        .eq('id', `config_${selectedUser.id}`);
      if (configError) throw configError;

      // Somente envia notificação de atualização de parâmetros se houver uma real alteração
      if (hasChanges) {
        const { data: boardData } = await supabase.from('crm_boards').select('data_payload, id').eq('user_id', selectedUser.id).ilike('id', 'board_%').limit(1);
        if (boardData && boardData.length > 0) {
          let payload = boardData[0].data_payload;
          payload.unreadNotifications = [{
            id: `param_update_${Date.now()}`,
            type: 'Sistema',
            text: `⚙️ As suas metas, parâmetros ou nível de acesso foram atualizados pelo administrador.`,
            date: new Date().toISOString()
          }, ...(payload.unreadNotifications || [])];
          await supabase.from('crm_boards').update({ data_payload: payload }).eq('id', boardData[0].id);
        }
      }

      setIsConfigModalVisible(false);
      showAlert("Sucesso", "Configurações do usuário atualizadas com sucesso!");
      fetchUsers();
    } catch (err) {
      showAlert("Erro", "Falha ao salvar configurações: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveParamRequest = async (user) => {
    if (!user) return;
    try {
      setLoading(true);
      const req = user.config.pendingRequest;
      const updatedConfig = { ...user.config };
      
      updatedConfig.monthlyGoal = req.goal;
      updatedConfig.dailyCalls = req.calls;
      updatedConfig.dailySims = req.sims;
      updatedConfig.dailyNeg = req.negs;
      updatedConfig.ticketMedio = req.ticket;
      updatedConfig.conversionRateGoal = req.conv;
      
      delete updatedConfig.pendingRequest;

      setGoalInput(req.goal);
      setCallsInput(req.calls);
      setSimsInput(req.sims);
      setNegsInput(req.negs);
      setTicketInput(req.ticket);
      setConvInput(req.conv);

      const { error: configError } = await supabase.from('crm_boards').update({ data_payload: updatedConfig }).eq('id', `config_${user.id}`);
      if (configError) throw configError;

      const { data: boardData } = await supabase.from('crm_boards').select('data_payload, id').eq('user_id', user.id).ilike('id', 'board_%').limit(1);
      if (boardData && boardData.length > 0) {
        let payload = boardData[0].data_payload;
        payload.unreadNotifications = [{
          id: `param_approved_${Date.now()}`,
          type: 'Sistema',
          text: `✅ Sua solicitação de alteração de metas e parâmetros foi APROVADA pelo administrador.`,
          date: new Date().toISOString()
        }, ...(payload.unreadNotifications || [])];
        await supabase.from('crm_boards').update({ data_payload: payload }).eq('id', boardData[0].id);
      }

      setSelectedUser(prev => ({...prev, hasPendingRequest: false, config: updatedConfig}));
      await addAdminActionToHistory(`Aprovou alteração de metas solicitada pelo vendedor: ${user.name || user.email}`);

      setIsConfigModalVisible(false); // Fecha o modal imediatamente
      showAlert("Sucesso", "A solicitação foi aceita e os parâmetros foram atualizados no perfil do vendedor.");
      fetchUsers();
    } catch (err) {
      showAlert("Erro", "Falha ao aceitar solicitação: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectParamRequest = async (user) => {
    if (!user) return;
    try {
      setLoading(true);
      const updatedConfig = { ...user.config };
      delete updatedConfig.pendingRequest;

      const { error: configError } = await supabase.from('crm_boards').update({ data_payload: updatedConfig }).eq('id', `config_${user.id}`);
      if (configError) throw configError;

      const { data: boardData } = await supabase.from('crm_boards').select('data_payload, id').eq('user_id', user.id).ilike('id', 'board_%').limit(1);
      if (boardData && boardData.length > 0) {
        let payload = boardData[0].data_payload;
        payload.unreadNotifications = [{
          id: `param_rejected_${Date.now()}`,
          type: 'Sistema',
          text: `❌ Sua solicitação de alteração de metas e parâmetros foi RECUSADA pelo administrador.`,
          date: new Date().toISOString()
        }, ...(payload.unreadNotifications || [])];
        await supabase.from('crm_boards').update({ data_payload: payload }).eq('id', boardData[0].id);
      }

      setSelectedUser(prev => ({...prev, hasPendingRequest: false, config: updatedConfig}));
      await addAdminActionToHistory(`Recusou a alteração de metas solicitada pelo vendedor: ${user.name || user.email}`);

      setIsConfigModalVisible(false); // Fecha o modal imediatamente
      showAlert("Aviso", "A solicitação foi recusada e o usuário foi notificado.");
      fetchUsers();
    } catch (err) {
      showAlert("Erro", "Falha ao recusar solicitação: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createName || !createEmail) {
      showAlert("Atenção", "Preencha o nome e o e-mail.");
      return;
    }

    try {
      setIsCreating(true);
      const { error } = await supabase.rpc('admin_create_user', {
        new_email: createEmail.toLowerCase().trim(),
        new_name: createName,
        new_role: createRole
      });

      if (error) throw error;
      setIsCreateModalVisible(false);
      setCreateName('');
      setCreateEmail('');
      setCreateRole('vendedor');
      showAlert("Sucesso", "Usuário criado com sucesso!\nSenha padrão: Senha123!");
      fetchUsers();
    } catch (err) {
      showAlert("Erro", "Erro ao criar conta: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      setLoading(true);
      const { error } = await supabase.rpc('admin_delete_user', {
        target_user_id: userToDelete.id
      });
      if (error) throw error;
      
      setIsDeleteModalVisible(false);
      setUserToDelete(null);
      showAlert("Sucesso", "Usuário excluído permanentemente do sistema.");
      fetchUsers();
    } catch (err) {
      showAlert("Erro", "Erro ao excluir: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const addAdminActionToHistory = async (message) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: boards } = await supabase.from('crm_boards').select('id, data_payload').eq('user_id', user.id).ilike('id', 'board_%').limit(1);
      if (boards && boards.length > 0) {
        const boardId = boards[0].id;
        const payload = boards[0].data_payload || {};
        if (!payload.notificationHistory) payload.notificationHistory = [];
        
        payload.notificationHistory.unshift({
          id: `hist_admin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          text: `Ação Admin: ${message}`,
          date: new Date().toISOString(),
          type: 'Sistema' 
        });
        
        await supabase.from('crm_boards').update({ data_payload: payload }).eq('id', boardId);
      }
    } catch (error) {
      console.error("Erro ao salvar histórico do admin:", error);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      (user.name?.toLowerCase().includes(searchQuery.toLowerCase())) || 
      (user.email?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'todos' || 
                          user.status === statusFilter || 
                          (statusFilter === 'pendente' && user.hasPendingRequest);
    
    return matchesSearch && matchesStatus;
  });

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  const handleCurrencyChange = (text, setter) => {
    const rawNumber = text.replace(/\D/g, '');
    if (!rawNumber) return setter('');
    setter(new Intl.NumberFormat('pt-BR').format(parseInt(rawNumber, 10)));
  };

  const renderUserCard = ({ item }) => (
    <View style={[styles.card, themeStyles.card, { flex: 1, margin: 8, maxWidth: numColumns === 3 ? '32%' : '100%' }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.userName, themeStyles.userName]} numberOfLines={1}>{item.name || 'Sem Nome'}</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Text style={[styles.badge, item.status === 'ativo' ? styles.badgeActive : item.status === 'pendente' ? styles.badgePending : styles.badgeInactive]}>
            {item.status.toUpperCase()}
          </Text>
          {item.hasPendingRequest && (
            <Text style={[styles.badge, styles.badgePending]}>PENDENTE</Text>
          )}
        </View>
      </View>
      
      <Text style={[styles.email, themeStyles.email]} numberOfLines={1}>{item.email}</Text>
      <Text style={[styles.role, themeStyles.role]}>Nível: {item.role}</Text>

      <View style={styles.actions}>
        {item.status === 'pendente' && (
          <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={() => updateUserStatus(item.id, 'ativo')}>
            <Text style={styles.btnText}>Aprovar</Text>
          </TouchableOpacity>
        )}
        {item.status === 'ativo' && (
          <TouchableOpacity style={[styles.btn, styles.btnDeactivate]} onPress={() => updateUserStatus(item.id, 'inativo')}>
            <Text style={styles.btnText}>Desativar</Text>
          </TouchableOpacity>
        )}
        {item.status === 'inativo' && (
          <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={() => updateUserStatus(item.id, 'ativo')}>
            <Text style={styles.btnText}>Reativar</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={[styles.btn, themeStyles.btnReset]} onPress={() => handleOpenConfigModal(item)}>
          <Text style={[styles.btnTextReset, themeStyles.btnTextReset]}>Configuração</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btn, themeStyles.btnDelete]} 
          onPress={() => { setUserToDelete(item); setIsDeleteModalVisible(true); }}
        >
          <Text style={[styles.btnTextDelete, themeStyles.btnTextDelete]}>Excluir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, themeStyles.container]}>
      
      <View style={styles.innerContainer}>
        
        <View style={styles.topBar}>
          <View style={styles.headerInfo}>
            <Text style={[styles.title, themeStyles.title]}>Gerenciamento de Usuários</Text>
            <Text style={[styles.subtitle, themeStyles.subtitle]}>Administre a gestão de usuários do sistema</Text>
          </View>
          <TouchableOpacity style={styles.createBtn} onPress={() => setIsCreateModalVisible(true)}>
            <Text style={styles.createBtnText}>Novo Usuário</Text>
          </TouchableOpacity>
        </View>
        
        <View style={[styles.filterSection, themeStyles.filterSection]}>
          <TextInput 
            style={[styles.searchInput, themeStyles.searchInput]} 
            placeholder="Buscar por nome ou e-mail..." 
            placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <View style={styles.statusFilters}>
            <TouchableOpacity style={[styles.filterTag, themeStyles.filterTag, statusFilter === 'todos' && themeStyles.filterTagActive]} onPress={() => setStatusFilter('todos')}>
              <Text style={[styles.filterTagText, themeStyles.filterTagText, statusFilter === 'todos' && themeStyles.filterTagTextActive]}>Todos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTag, themeStyles.filterTag, statusFilter === 'ativo' && themeStyles.filterTagActive]} onPress={() => setStatusFilter('ativo')}>
              <Text style={[styles.filterTagText, themeStyles.filterTagText, statusFilter === 'ativo' && themeStyles.filterTagTextActive]}>Ativos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTag, themeStyles.filterTag, statusFilter === 'inativo' && themeStyles.filterTagActive]} onPress={() => setStatusFilter('inativo')}>
              <Text style={[styles.filterTagText, themeStyles.filterTagText, statusFilter === 'inativo' && themeStyles.filterTagTextActive]}>Inativos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTag, themeStyles.filterTag, statusFilter === 'pendente' && themeStyles.filterTagActive]} onPress={() => setStatusFilter('pendente')}>
              <Text style={[styles.filterTagText, themeStyles.filterTagText, statusFilter === 'pendente' && themeStyles.filterTagTextActive]}>Pendentes</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={isDarkMode ? '#38bdf8' : '#2563eb'} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={filteredUsers}
            key={numColumns} 
            numColumns={numColumns}
            keyExtractor={(item) => item.id}
            renderItem={renderUserCard}
            contentContainerStyle={{ paddingBottom: 100 }}
            columnWrapperStyle={numColumns > 1 ? { justifyContent: 'flex-start' } : undefined}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={[styles.emptyText, themeStyles.emptyText]}>Nenhum usuário encontrado.</Text>}
          />
        )}
      </View>

      <Modal animationType="fade" transparent={true} visible={isConfigModalVisible} onRequestClose={() => setIsConfigModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsConfigModalVisible(false)}>
          <Pressable style={[styles.modalContent, themeStyles.modalContent, { maxWidth: 900, padding: 0, overflow: 'hidden' }]} onPress={(e) => e.stopPropagation()}>
            
            {/* Header Fixo do Modal */}
            <View style={[styles.configModalHeader, themeStyles.configModalHeader]}>
              <View>
                <Text style={[styles.configModalTitle, themeStyles.configModalTitle]}>Configurações Avançadas</Text>
                <Text style={[styles.configModalSubtitle, themeStyles.configModalSubtitle]}>Gerenciando perfil de <Text style={{fontWeight: '700'}}>{selectedUser?.name}</Text></Text>
              </View>
              <TouchableOpacity onPress={() => setIsConfigModalVisible(false)} style={styles.configModalCloseBtn}>
                <Text style={[styles.configModalCloseText, themeStyles.configModalCloseText]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* ScrollView Interno para corrigir o modal gigante */}
            <ScrollView style={{ width: '100%', maxHeight: '75vh' }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              
              <View style={styles.configGridRow}>
                {/* COLUNA ESQUERDA: CREDENCIAIS E PERMISSÕES */}
                <View style={[styles.configCardCol, themeStyles.configCardCol]}>
                  <View style={styles.configCardHeader}>
                    <Text style={[styles.configCardTitle, themeStyles.configCardTitle]}> Acesso & Segurança</Text>
                  </View>

                  <Text style={[styles.inputLabel, themeStyles.inputLabel]}>E-mail do Usuário</Text>
                  <TextInput style={[styles.textInput, themeStyles.textInput]} value={newEmailInput} onChangeText={setNewEmailInput} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} />
                  
                  <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Nível de Acesso (Role)</Text>
                  <View style={styles.roleSelector}>
                    <TouchableOpacity style={[styles.roleBtn, themeStyles.roleBtn, editRole === 'vendedor' && themeStyles.roleBtnActive]} onPress={() => setEditRole('vendedor')}>
                      <Text style={[styles.roleBtnText, themeStyles.roleBtnText, editRole === 'vendedor' && themeStyles.roleBtnTextActive]}>Vendedor</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.roleBtn, themeStyles.roleBtn, editRole === 'admin' && themeStyles.roleBtnActive]} onPress={() => setEditRole('admin')}>
                      <Text style={[styles.roleBtnText, themeStyles.roleBtnText, editRole === 'admin' && themeStyles.roleBtnTextActive]}>Admin</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ alignItems: 'center', width: '100%', marginTop: 2 }}>
                    <TouchableOpacity style={styles.resetPasswordBtn} onPress={handleResetCredentials}>
                      <Text style={styles.resetPasswordBtnText}>Resetar Senha (Senha123!)</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* COLUNA DIREITA: IMPORTAÇÃO REFINADA COM Z-INDEX GLOBAL */}
                <View style={[styles.configCardCol, themeStyles.configCardCol, { overflow: 'visible' }]}>
                  <View style={styles.configCardHeader}>
                    <Text style={[styles.configCardTitle, themeStyles.configCardTitle]}>Importação de Dados</Text>
                  </View>

                  {/* Fases */}
                  <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Importar Fases de:</Text>
                  <View style={{ zIndex: 9999, marginBottom: 10, position: 'relative' }}>
                    <View style={styles.dropdownRowBox}>
                      <TouchableOpacity 
                        style={styles.dropdownTriggerBox} 
                        onPress={() => { setIsPhaseDropdownOpen(!isPhaseDropdownOpen); setIsLeadDropdownOpen(false); }}
                      >
                        <Text style={[styles.dropdownTriggerText, { color: selectedImportPhaseUser ? (isDarkMode ? '#f8fafc' : '#0f172a') : (isDarkMode ? '#64748b' : '#94a3b8') }]} numberOfLines={1}>
                          {selectedImportPhaseUser ? users.find(u => u.id === selectedImportPhaseUser)?.name || users.find(u => u.id === selectedImportPhaseUser)?.email : 'Selecionar usuário origem...'}
                        </Text>
                        <Text style={{ fontSize: 10, color: isDarkMode ? '#94a3b8' : '#64748b' }}>▼</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.actionImportBtnBlue}
                        onPress={() => handleImport('phases', selectedImportPhaseUser)}
                        disabled={isImporting}
                      >
                        {isImporting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionImportBtnText}>Importar</Text>}
                      </TouchableOpacity>
                    </View>

                    {isPhaseDropdownOpen && (
                      <View style={[styles.dropdownListPopup, themeStyles.dropdownListPopup]}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 110 }}>
                          {users.filter(u => u.id !== selectedUser?.id).map(u => (
                            <TouchableOpacity key={`p_${u.id}`} style={[styles.dropdownItemRow, themeStyles.dropdownItemRow]} onPress={() => { setSelectedImportPhaseUser(u.id); setIsPhaseDropdownOpen(false); }}>
                              <Text style={[styles.dropdownItemText, themeStyles.dropdownItemText]} numberOfLines={1}>{u.name || u.email}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Leads */}
                  <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Importar Leads de:</Text>
                  <View style={{ zIndex: 8888, position: 'relative' }}>
                    <View style={styles.dropdownRowBox}>
                      <TouchableOpacity 
                        style={styles.dropdownTriggerBox} 
                        onPress={() => { setIsLeadDropdownOpen(!isLeadDropdownOpen); setIsPhaseDropdownOpen(false); }}
                      >
                        <Text style={[styles.dropdownTriggerText, { color: selectedImportLeadUser ? (isDarkMode ? '#f8fafc' : '#0f172a') : (isDarkMode ? '#64748b' : '#94a3b8') }]} numberOfLines={1}>
                          {selectedImportLeadUser ? users.find(u => u.id === selectedImportLeadUser)?.name || users.find(u => u.id === selectedImportLeadUser)?.email : 'Selecionar usuário origem...'}
                        </Text>
                        <Text style={{ fontSize: 10, color: isDarkMode ? '#94a3b8' : '#64748b' }}>▼</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.actionImportBtnGreen}
                        onPress={() => handleImport('leads', selectedImportLeadUser)}
                        disabled={isImporting}
                      >
                        {isImporting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionImportBtnText}>Importar</Text>}
                      </TouchableOpacity>
                    </View>

                    {isLeadDropdownOpen && (
                      <View style={[styles.dropdownListPopup, themeStyles.dropdownListPopup]}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 110 }}>
                          {users.filter(u => u.id !== selectedUser?.id).map(u => (
                            <TouchableOpacity key={`l_${u.id}`} style={[styles.dropdownItemRow, themeStyles.dropdownItemRow]} onPress={() => { setSelectedImportLeadUser(u.id); setIsLeadDropdownOpen(false); }}>
                              <Text style={[styles.dropdownItemText, themeStyles.dropdownItemText]} numberOfLines={1}>{u.name || u.email}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {/* SESSÃO DE PENDÊNCIAS (SE HOUVER) */}
              {selectedUser?.hasPendingRequest && selectedUser.config.pendingRequest && (
                <View style={[styles.configCardCol, themeStyles.pendingCard, { marginBottom: 10 }]}>
                  <Text style={[styles.sectionTitle, themeStyles.pendingCardTitle]}>⚠️ Solicitação Pendente de Metas</Text>
                  
                  <Text style={[styles.pendingText, themeStyles.pendingCardText]}>
                    <Text style={{fontWeight: 'bold'}}>Metas solicitadas:</Text> Meta: R$ {selectedUser.config.pendingRequest.goal} | Ticket: R$ {selectedUser.config.pendingRequest.ticket} | Ligações: {selectedUser.config.pendingRequest.calls} | Sims: {selectedUser.config.pendingRequest.sims} | Negs: {selectedUser.config.pendingRequest.negs} | Conv: {selectedUser.config.pendingRequest.conv}%
                  </Text>
                  
                  <Text style={[styles.pendingText, themeStyles.pendingCardText, { marginTop: 8, fontStyle: 'italic' }]}>
                    <Text style={{fontWeight: 'bold'}}>Justificativa do usuário:</Text> {selectedUser.config.pendingRequest.justification || 'Nenhuma justificativa foi informada pelo usuário.'}
                  </Text>
                  
                  <View style={styles.pendingActionButtons}>
                    <TouchableOpacity style={[styles.pendingBtn, { backgroundColor: '#10b981' }]} onPress={() => handleApproveParamRequest(selectedUser)}>
                      <Text style={styles.pendingBtnText}>Aceitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.pendingBtn, { backgroundColor: '#ef4444' }]} onPress={() => handleRejectParamRequest(selectedUser)}>
                      <Text style={styles.pendingBtnText}>Recusar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* SESSÃO DE PARÂMETROS / METAS */}
              <View style={[styles.configCardCol, themeStyles.configCardCol, { marginBottom: 0 }]}>
                <View style={styles.configCardHeader}>
                  <Text style={[styles.configCardTitle, themeStyles.configCardTitle]}>Metas e Parâmetros Operacionais Individuais</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <View style={{ flex: 1, minWidth: 180 }}>
                    <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Meta do Mês (R$)</Text>
                    <TextInput style={[styles.textInput, themeStyles.textInput, { marginBottom: 0, paddingVertical: 7 }]} value={goalInput} onChangeText={(t) => handleCurrencyChange(t, setGoalInput)} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1, minWidth: 180 }}>
                    <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Ticket Médio (R$)</Text>
                    <TextInput style={[styles.textInput, themeStyles.textInput, { marginBottom: 0, paddingVertical: 7 }]} value={ticketInput} onChangeText={(t) => handleCurrencyChange(t, setTicketInput)} keyboardType="numeric" />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 90 }}>
                    <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Ligações Diárias</Text>
                    <TextInput style={[styles.textInput, themeStyles.textInput, { marginBottom: 0, paddingVertical: 7 }]} value={callsInput} onChangeText={setCallsInput} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1, minWidth: 90 }}>
                    <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Simulações</Text>
                    <TextInput style={[styles.textInput, themeStyles.textInput, { marginBottom: 0, paddingVertical: 7 }]} value={simsInput} onChangeText={setSimsInput} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1, minWidth: 90 }}>
                    <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Negociações</Text>
                    <TextInput style={[styles.textInput, themeStyles.textInput, { marginBottom: 0, paddingVertical: 7 }]} value={negsInput} onChangeText={setNegsInput} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1, minWidth: 90 }}>
                    <Text style={[styles.inputLabel, themeStyles.inputLabel]}>Conversão (%)</Text>
                    <TextInput style={[styles.textInput, themeStyles.textInput, { marginBottom: 0, paddingVertical: 7 }]} value={convInput} onChangeText={setConvInput} keyboardType="numeric" />
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Footer Fixo do Modal com Botão Cancelar Estilizado */}
            <View style={[styles.configModalFooter, themeStyles.configModalFooter]}>
              <TouchableOpacity style={[styles.modalBtn, themeStyles.cancelBtnStyle]} onPress={() => setIsConfigModalVisible(false)}>
                <Text style={[styles.cancelBtnTextStyle, themeStyles.cancelBtnTextStyle]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn, { backgroundColor: '#10b981', paddingVertical: 11 }]} onPress={handleSaveParameters}>
                <Text style={styles.confirmBtnText}>Salvar Alterações</Text>
              </TouchableOpacity>
            </View>

          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="fade" transparent={true} visible={isCreateModalVisible} onRequestClose={() => setIsCreateModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsCreateModalVisible(false)}>
          <Pressable style={[styles.modalContent, themeStyles.modalContent, { padding: 24, maxWidth: 400 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.alertModalTitle, themeStyles.alertModalTitle, { textAlign: 'left', width: '100%' }]}>Criar Novo Usuário</Text>
            <Text style={[styles.alertModalMessage, themeStyles.alertModalMessage, { textAlign: 'left', width: '100%', marginBottom: 14 }]}>Preencha os dados. A senha padrão inicial será <Text style={{fontWeight: 'bold'}}>Senha123!</Text>.</Text>

            <Text style={[styles.inputLabel, themeStyles.inputLabel, { alignSelf: 'flex-start' }]}>Nome Completo</Text>
            <TextInput style={[styles.textInput, themeStyles.textInput, { width: '100%', marginBottom: 10 }]} placeholder="Ex: João Silva" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} value={createName} onChangeText={setCreateName} />

            <Text style={[styles.inputLabel, themeStyles.inputLabel, { alignSelf: 'flex-start' }]}>E-mail</Text>
            <TextInput style={[styles.textInput, themeStyles.textInput, { width: '100%', marginBottom: 10 }]} placeholder="joao@email.com" placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'} value={createEmail} onChangeText={setCreateEmail} autoCapitalize="none" keyboardType="email-address" />

            <Text style={[styles.inputLabel, themeStyles.inputLabel, { alignSelf: 'flex-start' }]}>Nível de Acesso</Text>
            <View style={[styles.roleSelector, { width: '100%', marginBottom: 16 }]}>
              <TouchableOpacity style={[styles.roleBtn, themeStyles.roleBtn, createRole === 'vendedor' && themeStyles.roleBtnActive]} onPress={() => setCreateRole('vendedor')}>
                <Text style={[styles.roleBtnText, themeStyles.roleBtnText, createRole === 'vendedor' && themeStyles.roleBtnTextActive]}>Vendedor</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roleBtn, themeStyles.roleBtn, createRole === 'admin' && themeStyles.roleBtnActive]} onPress={() => setCreateRole('admin')}>
                <Text style={[styles.roleBtnText, themeStyles.roleBtnText, createRole === 'admin' && themeStyles.roleBtnTextActive]}>Administrador</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, themeStyles.cancelBtnStyle]} onPress={() => setIsCreateModalVisible(false)}>
                <Text style={[styles.cancelBtnTextStyle, themeStyles.cancelBtnTextStyle]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn, { backgroundColor: '#10b981' }]} onPress={handleCreateUser} disabled={isCreating}>
                {isCreating ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Criar Conta</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ====================================================================== */}
      {/* MODAIS DE ALERTA RENDERIZADOS NO FINAL (Z-INDEX GLOBAL E DESIGN NOVO)  */}
      {/* ====================================================================== */}
      <Modal animationType="fade" transparent={true} visible={isAlertModalVisible} onRequestClose={() => setIsAlertModalVisible(false)}>
        <View style={[styles.modalOverlay, { zIndex: 999999, elevation: 100 }]}>
          <View style={[styles.alertModalBox, themeStyles.alertModalBox, { padding: 24, maxWidth: 400 }]}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, position: 'relative', width: '100%'}}>
              <Text style={[styles.alertModalTitle, themeStyles.alertModalTitle, {marginBottom: 0, fontSize: 18, textAlign: 'center'}]}>
                {alertTitle.toLowerCase().includes('erro') ? '❌ ' : alertTitle.toLowerCase().includes('sucesso') ? '✅ ' : '⚠️ '}{alertTitle}
              </Text>
              <TouchableOpacity onPress={() => setIsAlertModalVisible(false)} style={{position: 'absolute', right: 0}}>
                <Text style={[{fontSize: 20, fontWeight: 'bold'}, isDarkMode ? {color: '#94a3b8'} : {color: '#64748b'}]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ marginBottom: 24, width: '100%' }}>
              <Text style={[styles.alertModalMessage, themeStyles.alertModalMessage, {textAlign: 'center', fontSize: 14, marginBottom: 0}]}>{alertMessage}</Text>
            </View>
            <TouchableOpacity style={[styles.alertModalBtn, { alignSelf: 'center', paddingHorizontal: 32, width: 'auto' }]} onPress={() => setIsAlertModalVisible(false)}>
              <Text style={styles.alertModalBtnText}>Compreendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent={true} visible={isDeleteModalVisible} onRequestClose={() => setIsDeleteModalVisible(false)}>
        <View style={[styles.modalOverlay, { zIndex: 999999, elevation: 100 }]}>
          <View style={[styles.alertModalBox, themeStyles.alertModalBox, { padding: 24, maxWidth: 400 }]}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, position: 'relative', width: '100%'}}>
              <Text style={[styles.alertModalTitle, themeStyles.alertModalTitle, {marginBottom: 0, fontSize: 18, textAlign: 'center', color: '#ef4444'}]}>
                ⚠️ Aviso Crítico
              </Text>
            </View>
            <View style={{ marginBottom: 24, width: '100%' }}>
              <Text style={[styles.alertModalMessage, themeStyles.alertModalMessage, {textAlign: 'center', fontSize: 14, marginBottom: 0}]}>
                Tem certeza que deseja apagar permanentemente a conta de <Text style={{fontWeight: 'bold', color: '#ef4444'}}>{userToDelete?.name}</Text>? Esta ação <Text style={{fontWeight: 'bold'}}>NÃO PODE</Text> ser desfeita e todos os dados vinculados serão perdidos.
              </Text>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, themeStyles.cancelBtnStyle]} onPress={() => setIsDeleteModalVisible(false)}>
                <Text style={[styles.cancelBtnTextStyle, themeStyles.cancelBtnTextStyle]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn, { backgroundColor: '#ef4444' }]} onPress={confirmDeleteUser}>
                <Text style={styles.confirmBtnText}>Sim, Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  
  innerContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 1050, 
    alignSelf: 'center',
  },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 },
  headerInfo: { flexShrink: 1, marginRight: 16 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, marginTop: 4 },
  createBtn: { backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginTop: Platform.OS === 'web' ? 0 : 12 },
  createBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14, fontFamily: MODERN_FONT },
  
  filterSection: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1 },
  searchInput: { flex: 1, minWidth: 200, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, fontFamily: MODERN_FONT, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  statusFilters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterTag: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
  filterTagText: { fontSize: 12, fontWeight: '600', fontFamily: MODERN_FONT },
  emptyText: { textAlign: 'center', marginTop: 32, fontSize: 16, fontFamily: MODERN_FONT },

  card: { padding: 16, borderRadius: 12, borderWidth: 1, minWidth: 280 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  userName: { fontSize: 16, fontWeight: '900', flex: 1, marginRight: 8, fontFamily: MODERN_FONT },
  email: { fontSize: 13, marginBottom: 4, fontFamily: MODERN_FONT },
  role: { fontSize: 12, fontWeight: '600', marginBottom: 16, fontFamily: MODERN_FONT },
  
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, fontSize: 10, fontWeight: 'bold', color: '#fff', overflow: 'hidden', fontFamily: MODERN_FONT },
  badgeActive: { backgroundColor: '#10b981' },
  badgePending: { backgroundColor: '#f59e0b' },
  badgeInactive: { backgroundColor: '#ef4444' },
  
  actions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  btn: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 6, alignItems: 'center', minWidth: '45%' },
  btnApprove: { backgroundColor: '#10b981' },
  btnDeactivate: { backgroundColor: '#f59e0b' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 11, fontFamily: MODERN_FONT },
  btnTextReset: { fontWeight: 'bold', fontSize: 11, fontFamily: MODERN_FONT },
  btnTextDelete: { fontWeight: 'bold', fontSize: 11, fontFamily: MODERN_FONT },

  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', zIndex: 10000 },
  
  alertModalBox: { width: '100%', maxWidth: 380, borderRadius: 16, alignItems: 'center', ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 15px 35px rgba(0,0,0,0.25)' } }) },
  alertModalTitle: { fontSize: 17, fontWeight: '700', fontFamily: MODERN_FONT },
  alertModalMessage: { fontSize: 13, lineHeight: 18, fontFamily: MODERN_FONT },
  alertModalBtn: { backgroundColor: '#2563eb', paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  alertModalBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13, fontFamily: MODERN_FONT },

  modalContent: { borderRadius: 16, width: '100%', maxWidth: 400, ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 10px 25px rgba(0,0,0,0.15)' } }) },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, fontFamily: MODERN_FONT },
  modalSubtitle: { fontSize: 13, marginBottom: 20, lineHeight: 18, fontFamily: MODERN_FONT },
  
  configModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  configModalTitle: { fontSize: 16, fontWeight: '700', fontFamily: MODERN_FONT },
  configModalSubtitle: { fontSize: 12, marginTop: 1, fontFamily: MODERN_FONT },
  configModalCloseBtn: { padding: 4 },
  configModalCloseText: { fontSize: 18, fontWeight: 'bold' },
  configModalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1 },

  configGridRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 10, zIndex: 10 },
  configCardCol: { flex: 1, minWidth: 320, padding: 14, borderRadius: 12, borderWidth: 1, position: 'relative' },
  configCardHeader: { marginBottom: 10, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(100,116,139,0.15)' },
  configCardTitle: { fontSize: 13, fontWeight: '700', fontFamily: MODERN_FONT },

  // Estilos da Solicitação Pendente de Metas
  pendingActionButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pendingBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  pendingBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13, fontFamily: MODERN_FONT },

  dropdownRowBox: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dropdownTriggerBox: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownTriggerText: { fontSize: 13, fontFamily: MODERN_FONT },
  dropdownListPopup: { 
    position: 'absolute', 
    top: 38, 
    left: 0, 
    right: 74, 
    borderWidth: 1, 
    borderRadius: 8, 
    zIndex: 9999999, 
    elevation: 99,
    ...Platform.select({ web: { boxShadow: '0px 12px 30px rgba(0,0,0,0.4)' } })
  },
  dropdownItemRow: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 13, fontFamily: MODERN_FONT },

  actionImportBtnBlue: { backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  actionImportBtnGreen: { backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  actionImportBtnText: { color: '#fff', fontWeight: '700', fontSize: 12, fontFamily: MODERN_FONT },

  resetPasswordBtn: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  resetPasswordBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12, fontFamily: MODERN_FONT },

  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8, fontFamily: MODERN_FONT },
  pendingText: { fontSize: 12, fontFamily: MODERN_FONT, fontWeight: '500', lineHeight: 18 },

  inputLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4, fontFamily: MODERN_FONT },
  textInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, marginBottom: 10, fontFamily: MODERN_FONT, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  
  roleSelector: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  roleBtn: { flex: 1, paddingVertical: 7, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
  roleBtnText: { fontSize: 12, fontWeight: '600', fontFamily: MODERN_FONT },

  modalButtons: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  confirmBtn: { backgroundColor: '#2563eb' },
  confirmBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13, fontFamily: MODERN_FONT },
  
  cancelBtnStyle: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnTextStyle: { fontWeight: '700', fontSize: 13, fontFamily: MODERN_FONT }
});

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F9FAFB' },
  title: { color: '#0f172a' },
  subtitle: { color: '#64748b' },
  filterSection: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  searchInput: { backgroundColor: '#f8fafc', borderColor: '#cbd5e1', color: '#0f172a' },
  filterTag: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  filterTagActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  filterTagText: { color: '#64748b' },
  filterTagTextActive: { color: '#2563eb' },
  emptyText: { color: '#94a3b8' },
  card: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  userName: { color: '#0f172a' },
  email: { color: '#475569' },
  role: { color: '#94a3b8' },
  btnReset: { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  btnTextReset: { color: '#475569' },
  btnDelete: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  btnTextDelete: { color: '#ef4444' },
  modalContent: { backgroundColor: '#ffffff' },
  alertModalBox: { backgroundColor: '#ffffff' },
  alertModalTitle: { color: '#1e293b' },
  alertModalMessage: { color: '#475569' },
  modalTitle: { color: '#1e293b' },
  modalSubtitle: { color: '#64748b' },
  configModalHeader: { backgroundColor: '#f8fafc', borderBottomColor: '#e2e8f0' },
  configModalTitle: { color: '#1e293b' },
  configModalSubtitle: { color: '#64748b' },
  configModalCloseText: { color: '#64748b' },
  configModalFooter: { backgroundColor: '#f8fafc', borderTopColor: '#e2e8f0' },
  configCardCol: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  configCardTitle: { color: '#1e293b' },
  dropdownTriggerBox: { backgroundColor: '#ffffff', borderColor: '#cbd5e1' },
  dropdownListPopup: { backgroundColor: '#ffffff', borderColor: '#cbd5e1' },
  dropdownItemRow: { borderBottomColor: '#f1f5f9' },
  dropdownItemText: { color: '#1e293b' },
  sectionTitle: { color: '#334155' },
  inputLabel: { color: '#475569' },
  textInput: { backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a' },
  roleBtn: { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  roleBtnActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  roleBtnText: { color: '#64748b' },
  roleBtnTextActive: { color: '#2563eb' },
  cancelBtnStyle: { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  cancelBtnTextStyle: { color: '#475569' },
  pendingCard: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  pendingCardTitle: { color: '#d97706' },
  pendingCardText: { color: '#92400e' }
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#0f172a' },
  title: { color: '#f8fafc' },
  subtitle: { color: '#94a3b8' },
  filterSection: { backgroundColor: '#1e293b', borderColor: '#334155' },
  searchInput: { backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' },
  filterTag: { backgroundColor: '#0f172a', borderColor: '#334155' },
  filterTagActive: { backgroundColor: '#1e3a8a', borderColor: '#3b82f6' },
  filterTagText: { color: '#94a3b8' },
  filterTagTextActive: { color: '#93c5fd' },
  emptyText: { color: '#64748b' },
  card: { backgroundColor: '#1e293b', borderColor: '#334155' },
  userName: { color: '#f8fafc' },
  email: { color: '#94a3b8' },
  role: { color: '#64748b' },
  btnReset: { backgroundColor: '#0f172a', borderColor: '#334155' },
  btnTextReset: { color: '#cbd5e1' },
  btnDelete: { backgroundColor: '#450a0a', borderColor: '#7f1d1d' },
  btnTextDelete: { color: '#fca5a5' },
  modalContent: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  alertModalBox: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  alertModalTitle: { color: '#f8fafc' },
  alertModalMessage: { color: '#94a3b8' },
  modalTitle: { color: '#f8fafc' },
  modalSubtitle: { color: '#94a3b8' },
  configModalHeader: { backgroundColor: '#0f172a', borderBottomColor: '#334155' },
  configModalTitle: { color: '#f8fafc' },
  configModalSubtitle: { color: '#94a3b8' },
  configModalCloseText: { color: '#94a3b8' },
  configModalFooter: { backgroundColor: '#0f172a', borderTopColor: '#334155' },
  configCardCol: { backgroundColor: '#0f172a', borderColor: '#334155' },
  configCardTitle: { color: '#f8fafc' },
  dropdownTriggerBox: { backgroundColor: '#0f172a', borderColor: '#334155' },
  dropdownListPopup: { backgroundColor: '#1e293b', borderColor: '#334155' },
  dropdownItemRow: { borderBottomColor: '#334155' },
  dropdownItemText: { color: '#f8fafc' },
  sectionTitle: { color: '#cbd5e1' },
  inputLabel: { color: '#cbd5e1' },
  textInput: { backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' },
  roleBtn: { borderColor: '#334155', backgroundColor: '#0f172a' },
  roleBtnActive: { borderColor: '#3b82f6', backgroundColor: '#1e3a8a' },
  roleBtnText: { color: '#94a3b8' },
  roleBtnTextActive: { color: '#93c5fd' },
  cancelBtnStyle: { backgroundColor: '#334155', borderColor: '#475569' },
  cancelBtnTextStyle: { color: '#cbd5e1' },
  pendingCard: { backgroundColor: '#451a03', borderColor: '#d97706' },
  pendingCardTitle: { color: '#fcd34d' },
  pendingCardText: { color: '#fde68a' }
});