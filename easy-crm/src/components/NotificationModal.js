import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView, useWindowDimensions, Animated, TouchableWithoutFeedback } from 'react-native';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

export default function NotificationModal({ 
  visible, onClose, notifications = [], historyNotifications = [], onDismiss, onDismissSystem, 
  onApproveReset, onRejectReset, onApproveNameChange, onRejectNameChange,
  onDismissNameChangeAlert, onClearHistory, isDarkMode 
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 850;
  
  // Animações
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          useNativeDriver: Platform.OS !== 'web'
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web'
        })
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      fadeAnim.setValue(0);
    }
  }, [visible, scaleAnim, fadeAnim]);
  
  const formatTime = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const totalItems = notifications.length + historyNotifications.length;

  const getHistoryText = (hist) => {
    if (hist.text || hist.title) return hist.text || hist.title;
    
    switch (hist.type) {
      case 'NameChangeApproved': return 'Alteração de Nome Autorizada pelo Administrador.';
      case 'NameChangeAlert': return 'Alerta: Identidade de consultor atualizada.';
      case 'NameChangeRequest': return 'Solicitação de Alteração de Nome processada.';
      case 'ResetRequest': return 'Solicitação de Nova Senha processada.';
      case 'ParamChangeRequest': return 'Solicitação de Alteração de Metas processada.';
      default: 
        if (hist.appt) return `Agendamento Concluído: ${hist.appt.type}`;
        return 'Notificação de Sistema';
    }
  };

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <TouchableOpacity 
        style={[styles.overlay, isMobile ? styles.overlayMobile : styles.overlayDesktop]} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <TouchableWithoutFeedback>
          <Animated.View style={[
            styles.modalContainer, 
            isMobile ? styles.modalContainerMobile : styles.modalContainerDesktop, 
            themeStyles.modalContainer,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
          ]}>
            
            <View style={[styles.header, themeStyles.header]}>
              <Text style={[styles.title, themeStyles.title]}>Central de Notificações</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {historyNotifications.length > 0 && (
                  <TouchableOpacity onPress={onClearHistory} style={[styles.clearHistoryButton, themeStyles.clearHistoryButton]}>
                    <Text style={[styles.clearHistoryButtonText, themeStyles.clearHistoryButtonText]}>Limpar Histórico</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} style={[styles.closeButton, themeStyles.closeButton]}>
                  <Text style={[styles.closeButtonText, themeStyles.closeButtonText]}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.listArea} showsVerticalScrollIndicator={false}>
              {totalItems === 0 ? (
                <View style={[styles.emptyState, themeStyles.emptyState]}>
                  <Text style={[styles.emptyText, themeStyles.emptyText]}>Sem notificações ou histórico no momento.</Text>
                </View>
              ) : (
                <>
                  {/* 1. NOTIFICAÇÕES ATIVAS / PENDENTES */}
                  {notifications.map((item) => {
                    
                    if (item.type === 'ParamChangeRequest') {
                      return (
                        <View key={item.id} style={[styles.notificationCard, isDarkMode ? darkStyles.cardRequest : { borderColor: '#fcd34d', backgroundColor: '#fef3c7' }]}>
                          <Text style={[{ fontFamily: MODERN_FONT, fontWeight: '800', marginBottom: 5 }, isDarkMode ? { color: '#fcd34d' } : { color: '#92400e' }]}>Alteração de Metas / Parâmetros</Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 13, marginBottom: 8, lineHeight: 18 }, isDarkMode ? { color: '#fde68a' } : { color: '#b45309' }]}>
                            O vendedor <Text style={{fontWeight: 'bold'}}>{item.userName}</Text> enviou uma solicitação para alterar metas e parâmetros.
                          </Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 11, marginBottom: 12 }, isDarkMode ? { color: '#fbbf24' } : { color: '#d97706' }]}>
                            Acesse a aba Painel Administrativo e clique em "Configuração" no usuário para ler a justificativa e responder ao chamado.
                          </Text>
                          {/* Botão de ciente removido propositalmente: essa notificação some automaticamente quando a pendência é aprovada/recusada no Painel Admin */}
                        </View>
                      );
                    }

                    if (item.type === 'NameChangeRequest') {
                      return (
                        <View key={item.id} style={[styles.notificationCard, isDarkMode ? darkStyles.cardRequest : { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' }]}>
                          <Text style={[{ fontFamily: MODERN_FONT, fontWeight: '800', marginBottom: 5 }, isDarkMode ? { color: '#f8fafc' } : { color: '#1e293b' }]}>Solicitação de Alteração de Nome</Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 13, marginBottom: 3 }, isDarkMode ? { color: '#cbd5e1' } : { color: '#475569' }]}>
                            Usuário: <Text style={{fontWeight: 'bold'}}>{item.currentName || 'N/A'}</Text>
                          </Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 13, marginBottom: 12 }, isDarkMode ? { color: '#cbd5e1' } : { color: '#475569' }]}>
                            E-mail: {item.userEmail}
                          </Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 11, marginBottom: 12 }, isDarkMode ? { color: '#94a3b8' } : { color: '#64748b' }]}>O consultor solicitou permissão para editar o nome de exibição no CRM.</Text>
                          
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity 
                              style={[styles.dismissButton, { flex: 1, backgroundColor: '#2563eb' }]} 
                              onPress={() => onApproveNameChange(item.userId, item.id)}
                            >
                              <Text style={styles.dismissButtonText}>Autorizar Alteração</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={[styles.dismissButton, { flex: 1 }, isDarkMode ? darkStyles.btnSecondaryDark : { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }]} 
                              onPress={() => onRejectNameChange(item.userId, item.id)}
                            >
                              <Text style={[styles.dismissButtonText, isDarkMode ? { color: '#cbd5e1' } : { color: '#475569' }]}>Recusar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    }

                    if (item.type === 'NameChangeAlert') {
                      return (
                        <View key={item.id} style={[styles.notificationCard, isDarkMode ? darkStyles.cardAlert : { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
                          <Text style={[{ fontFamily: MODERN_FONT, fontWeight: '800', marginBottom: 5 }, isDarkMode ? { color: '#4ade80' } : { color: '#166534' }]}>Identidade Atualizada</Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 13, marginBottom: 8, lineHeight: 18 }, isDarkMode ? { color: '#bbf7d0' } : { color: '#15803d' }]}>
                            O usuário <Text style={{fontWeight: 'bold'}}>{item.userEmail}</Text> concluiu a alteração de identidade.{'\n'}
                            De: <Text style={{fontWeight: 'bold', color: isDarkMode ? '#f87171' : '#dc2626'}}>{item.oldName}</Text>{'\n'}
                            Para: <Text style={{fontWeight: 'bold', color: isDarkMode ? '#4ade80' : '#16a34a'}}>{item.newName}</Text>
                          </Text>
                          <TouchableOpacity 
                            style={[styles.dismissButton, { backgroundColor: '#16a34a' }]} 
                            onPress={() => {
                              if (onDismissNameChangeAlert) {
                                onDismissNameChangeAlert(item.userId, item.id);
                              } else {
                                onDismissSystem(item.id);
                              }
                            }}
                          >
                            <Text style={styles.dismissButtonText}>Ocultar Aviso</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    if (item.type === 'NameChangeApproved') {
                      return (
                        <View key={item.id} style={[styles.notificationCard, isDarkMode ? darkStyles.cardApproved : { borderColor: '#86efac', backgroundColor: '#dcfce7' }]}>
                          <Text style={[{ fontFamily: MODERN_FONT, fontWeight: '800', marginBottom: 5 }, isDarkMode ? { color: '#4ade80' } : { color: '#166534' }]}>Alteração de Nome Autorizada!</Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 13, marginBottom: 12, lineHeight: 18 }, isDarkMode ? { color: '#bbf7d0' } : { color: '#15803d' }]}>
                            O administrador concedeu permissão para você editar o seu nome de exibição.
                          </Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 11, marginBottom: 12 }, isDarkMode ? { color: '#86efac' } : { color: '#166534' }]}>
                            Acesse as Configurações do Sistema para atualizar seus dados.
                          </Text>
                          <TouchableOpacity style={[styles.dismissButton, { backgroundColor: '#16a34a' }]} onPress={() => onDismissSystem(item.id)}>
                            <Text style={styles.dismissButtonText}>Ocultar Aviso</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    if (item.type === 'ResetRequest') {
                      return (
                        <View key={item.id} style={[styles.notificationCard, isDarkMode ? darkStyles.cardReset : { borderColor: '#fca5a5', backgroundColor: '#fef2f2' }]}>
                          <Text style={[{ fontFamily: MODERN_FONT, fontWeight: '800', marginBottom: 5 }, isDarkMode ? { color: '#f87171' } : { color: '#991b1b' }]}>Solicitação de Nova Senha</Text>
                          {item.name && (
                            <Text style={[{ fontFamily: MODERN_FONT, fontSize: 13, marginBottom: 3 }, isDarkMode ? { color: '#fca5a5' } : { color: '#7f1d1d' }]}>Nome: <Text style={{fontWeight: 'bold'}}>{item.name}</Text></Text>
                          )}
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 13, marginBottom: 5 }, isDarkMode ? { color: '#fca5a5' } : { color: '#7f1d1d' }]}>E-mail: <Text style={{fontWeight: 'bold'}}>{item.email}</Text></Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 11, marginBottom: 12 }, isDarkMode ? { color: '#fca5a5' } : { color: '#b91c1c' }]}>Autorize o reset para a senha padrão (Senha123!).</Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={[styles.dismissButton, { flex: 1, backgroundColor: '#ef4444' }]} onPress={() => onApproveReset(item.userId, item.email)}>
                              <Text style={styles.dismissButtonText}>Resetar (Senha123!)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.dismissButton, { flex: 1, backgroundColor: '#f87171' }]} onPress={() => onRejectReset(item.userId)}>
                              <Text style={styles.dismissButtonText}>Recusar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    }

                    if (item.type === 'Sistema') {
                      return (
                        <View key={item.id} style={[styles.notificationCard, isDarkMode ? darkStyles.cardSystem : { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }]}>
                          <Text style={[{ fontFamily: MODERN_FONT, fontWeight: '800', marginBottom: 5 }, isDarkMode ? { color: '#93c5fd' } : { color: '#1e40af' }]}>{item.text}</Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 11, marginBottom: 10 }, isDarkMode ? { color: '#60a5fa' } : { color: '#1d4ed8' }]}>{formatTime(item.date)}</Text>
                          <TouchableOpacity style={[styles.dismissButton, { backgroundColor: '#2563eb' }]} onPress={() => onDismissSystem(item.id)}>
                            <Text style={styles.dismissButtonText}>Compreendido</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    if (item.appt) {
                      const { client, appt, phaseId } = item;
                      return (
                        <View key={appt.id} style={[styles.notificationCard, isDarkMode ? darkStyles.cardAppt : {}]}>
                          <View style={styles.notifHeader}>
                            <Text style={[styles.notifType, isDarkMode ? { color: '#facc15' } : {}]}>Ação Requerida: {appt.type}</Text>
                            <Text style={[styles.notifTime, isDarkMode ? { color: '#eab308' } : {}]}>{formatTime(appt.dateTime)}</Text>
                          </View>
                          <Text style={[styles.notifClient, isDarkMode ? { color: '#bef264' } : {}]}>Cliente: <Text style={{fontWeight: '800'}}>{client.name}</Text></Text>
                          <TouchableOpacity style={[styles.dismissButton, { backgroundColor: '#f59e0b' }]} onPress={() => onDismiss(client.id, phaseId, appt.id)}>
                            <Text style={styles.dismissButtonText}>Marcar como Concluído</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    return null;
                  })}

                  {/* 2. HISTÓRICO DE NOTIFICAÇÕES ANTERIORES */}
                  {historyNotifications.length > 0 && (
                    <>
                      <View style={[styles.historyDivider, themeStyles.historyDivider]}>
                        <Text style={[styles.historyDividerText, themeStyles.historyDividerText]}>Histórico Recente</Text>
                      </View>
                      {historyNotifications.map((hist) => (
                        <View key={hist.id} style={[styles.notificationCard, themeStyles.historyCard]}>
                          <Text style={[{ fontFamily: MODERN_FONT, fontWeight: '700', marginBottom: 4, fontSize: 12 }, themeStyles.historyText]}>
                            {getHistoryText(hist)}
                          </Text>
                          <Text style={[{ fontFamily: MODERN_FONT, fontSize: 10 }, themeStyles.historyDate]}>{formatTime(hist.date)}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}
            </ScrollView>

          </Animated.View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  overlayDesktop: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  overlayMobile: { justifyContent: 'center', alignItems: 'center', padding: 16 },

  modalContainer: {
    width: '100%', 
    maxWidth: 400, 
    borderRadius: 16, 
    padding: 24,
    maxHeight: '80%',
    ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 10px 25px rgba(0,0,0,0.15)' } })
  },
  modalContainerDesktop: { marginTop: 80, marginRight: 24 },
  modalContainerMobile: { marginTop: 0, marginRight: 0 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, paddingBottom: 12 },
  title: { fontFamily: MODERN_FONT, fontSize: 16, fontWeight: '800' },
  
  clearHistoryButton: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  clearHistoryButtonText: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '700' },

  closeButton: { padding: 4, borderRadius: 6, borderWidth: 1, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 13, fontWeight: 'bold' },
  listArea: { flex: 1 },
  emptyState: { padding: 20, alignItems: 'center', borderRadius: 8, borderWidth: 1 },
  emptyText: { fontFamily: MODERN_FONT, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  
  notificationCard: { borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 12 },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  notifType: { fontFamily: MODERN_FONT, fontWeight: '800', color: '#ca8a04', fontSize: 13 },
  notifTime: { fontFamily: MODERN_FONT, color: '#a16207', fontSize: 11, fontWeight: '600' },
  notifClient: { fontFamily: MODERN_FONT, color: '#3f6212', fontSize: 13, marginBottom: 12 },
  dismissButton: { paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  dismissButtonText: { fontFamily: MODERN_FONT, color: '#ffffff', fontWeight: '700', fontSize: 12 },

  historyDivider: { marginVertical: 8, borderBottomWidth: 1, paddingBottom: 4 },
  historyDividerText: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }
});

/* Estilos de Tema Claro */
const lightStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#ffffff' },
  header: { borderBottomColor: '#f1f5f9' },
  title: { color: '#0f172a' },
  clearHistoryButton: { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  clearHistoryButtonText: { color: '#475569' },
  closeButton: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  closeButtonText: { color: '#64748b' },
  emptyState: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  emptyText: { color: '#64748b' },
  historyDivider: { borderBottomColor: '#e2e8f0' },
  historyDividerText: { color: '#94a3b8' },
  historyCard: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc', opacity: 0.85 },
  historyText: { color: '#334155' },
  historyDate: { color: '#64748b' }
});

/* Estilos de Tema Escuro */
const darkStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  header: { borderBottomColor: '#334155' },
  title: { color: '#f8fafc' },
  clearHistoryButton: { backgroundColor: '#0f172a', borderColor: '#334155' },
  clearHistoryButtonText: { color: '#cbd5e1' },
  closeButton: { backgroundColor: '#0f172a', borderColor: '#334155' },
  closeButtonText: { color: '#94a3b8' },
  emptyState: { backgroundColor: '#0f172a', borderColor: '#334155' },
  emptyText: { color: '#94a3b8' },
  historyDivider: { borderBottomColor: '#334155' },
  historyDividerText: { color: '#64748b' },
  historyCard: { borderColor: '#334155', backgroundColor: '#0f172a', opacity: 0.9 },
  historyText: { color: '#cbd5e1' },
  historyDate: { color: '#94a3b8' },
  cardRequest: { borderColor: '#451a03', backgroundColor: '#78350f' }, 
  cardAlert: { borderColor: '#14532d', backgroundColor: '#052e16' },
  cardApproved: { borderColor: '#14532d', backgroundColor: '#052e16' },
  cardReset: { borderColor: '#7f1d1d', backgroundColor: '#450a0a' },
  cardSystem: { borderColor: '#1e3a8a', backgroundColor: '#172554' },
  cardAppt: { borderColor: '#713f12', backgroundColor: '#422006' },
  btnSecondaryDark: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' }
});