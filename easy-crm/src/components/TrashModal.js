import React, { useState } from 'react';
import { 
  Modal, View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView, ActivityIndicator 
} from 'react-native';
import { supabase } from '../services/supabaseClient'; // Importação do Supabase adicionada

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

export default function TrashModal({ visible, onClose, trashClients, onPermanentDelete, onRestore, onEmptyTrash, isDarkMode }) {
  const themeStyles = isDarkMode ? darkStyles : lightStyles;
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); // Estado para controlar o loading

  const handleEmptyTrashPress = () => {
    if (!trashClients || trashClients.length === 0) return;
    setConfirmModalVisible(true);
  };

  const handleConfirmEmpty = async () => {
    setIsDeleting(true);
    try {
      // 1. Pega o usuário logado atualmente
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // 2. Busca o board correspondente ao usuário
        const { data: boards, error: fetchError } = await supabase
          .from('crm_boards')
          .select('id, data_payload')
          .eq('user_id', user.id)
          .ilike('id', 'board_%')
          .limit(1);

        if (!fetchError && boards && boards.length > 0) {
          const board = boards[0];
          
          // 3. Clona o payload atual e esvazia apenas a chave 'trash'
          const updatedPayload = { 
            ...board.data_payload, 
            trash: [] 
          };

          // 4. Salva a alteração no banco de dados
          await supabase
            .from('crm_boards')
            .update({ data_payload: updatedPayload })
            .eq('id', board.id);
        }
      }

      // 5. Aciona o callback do pai para atualizar a UI localmente (se necessário)
      if (onEmptyTrash) {
        onEmptyTrash();
      }
    } catch (error) {
      console.error("Erro ao esvaziar lixeira:", error);
    } finally {
      setIsDeleting(false);
      setConfirmModalVisible(false);
    }
  };

  return (
    <>
      <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={[styles.modalContainer, themeStyles.modalContainer]}>
            
            <View style={[styles.header, themeStyles.header]}>
              <Text style={[styles.title, themeStyles.title]}>Lixeira de Clientes</Text>
              
              <View style={styles.headerRightContainer}>
                {trashClients && trashClients.length > 0 && (
                  <TouchableOpacity 
                    style={styles.emptyTrashButton} 
                    onPress={handleEmptyTrashPress}
                  >
                    <Text style={styles.emptyTrashButtonText}>Esvazia Lixeira</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Text style={[styles.closeButtonText, themeStyles.closeButtonText]}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContentContainer} showsVerticalScrollIndicator={true}>
              {trashClients && trashClients.length > 0 ? (
                trashClients.map(client => (
                  <View key={client.id} style={[styles.trashCard, themeStyles.trashCard]}>
                    <View style={styles.clientInfo}>
                      <Text style={[styles.clientName, themeStyles.clientName]} numberOfLines={1}>{client.name}</Text>
                      <Text style={[styles.clientPhone, themeStyles.clientPhone]} numberOfLines={1}>{client.phone}</Text>
                    </View>
                    
                    {/* Container para agrupar os botões */}
                    <View style={styles.actionButtons}>
                      <TouchableOpacity 
                        style={styles.restoreButton} 
                        onPress={() => onRestore(client.id)}
                      >
                        <Text style={styles.restoreButtonText}>Restaurar</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.deleteButton} 
                        onPress={() => onPermanentDelete(client.id)}
                      >
                        <Text style={styles.deleteButtonText}>Excluir</Text>
                      </TouchableOpacity>
                    </View>

                  </View>
                ))
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, themeStyles.emptyText]}>A lixeira está vazia.</Text>
                </View>
              )}
            </ScrollView>

          </View>
        </View>
      </Modal>

      {/* Modal de Confirmação para Esvaziar Lixeira */}
      <Modal animationType="fade" transparent={true} visible={confirmModalVisible} onRequestClose={() => !isDeleting && setConfirmModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.confirmModalBox, themeStyles.confirmModalBox]}>
            <Text style={[styles.confirmModalText, themeStyles.confirmModalText]}>
              Tem certeza que deseja excluir todo o conteúdo da lixeira? Essa ação é irreversível
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity 
                style={[styles.confirmCancelBtn, themeStyles.confirmCancelBtn]} 
                onPress={() => setConfirmModalVisible(false)}
                disabled={isDeleting}
              >
                <Text style={[styles.confirmCancelBtnText, themeStyles.confirmCancelBtnText]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.confirmOkBtn} 
                onPress={handleConfirmEmpty}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.confirmOkBtnText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center',
  },
  modalContainer: {
    width: '100%', 
    maxWidth: 550, 
    height: 520, 
    borderRadius: 16, 
    padding: 24,
    ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 10px 25px rgba(0,0,0,0.15)' } })
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, paddingBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', fontFamily: MODERN_FONT },
  headerRightContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyTrashButton: { 
    backgroundColor: '#ef4444', 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 6 
  },
  emptyTrashButtonText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold', fontFamily: MODERN_FONT },
  closeButton: { padding: 8 },
  closeButtonText: { fontSize: 20, fontWeight: 'bold' },
  
  listContainer: { flex: 1 },
  listContentContainer: { paddingBottom: 16 },
  
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 250 },
  emptyText: { textAlign: 'center', fontFamily: MODERN_FONT, fontSize: 14 },
  
  trashCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, borderRadius: 8, marginBottom: 8,
    borderWidth: 1
  },
  clientInfo: {
    flex: 1, 
    paddingRight: 10,
  },
  clientName: { fontSize: 15, fontWeight: '600', fontFamily: MODERN_FONT },
  clientPhone: { fontSize: 13, fontFamily: MODERN_FONT },
  actionButtons: {
    flexDirection: 'row',
    gap: 8, 
  },
  restoreButton: { 
    backgroundColor: '#3b82f6', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 6 
  },
  restoreButtonText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold', fontFamily: MODERN_FONT },
  deleteButton: { 
    backgroundColor: '#ef4444', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 6 
  },
  deleteButtonText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold', fontFamily: MODERN_FONT },

  confirmModalBox: {
    width: '90%',
    maxWidth: 380,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 10px 25px rgba(0,0,0,0.2)' } })
  },
  confirmModalText: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: MODERN_FONT,
    marginBottom: 24,
    lineHeight: 22,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  confirmCancelBtnText: {
    fontWeight: '600',
    fontSize: 14,
    fontFamily: MODERN_FONT,
  },
  confirmOkBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  confirmOkBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: MODERN_FONT,
  }
});

/* Estilos de Tema Claro */
const lightStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#ffffff' },
  header: { borderBottomColor: '#f1f5f9' },
  title: { color: '#1e293b' },
  closeButtonText: { color: '#64748b' },
  emptyText: { color: '#64748b' },
  trashCard: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  clientName: { color: '#0f172a' },
  clientPhone: { color: '#64748b' },
  confirmModalBox: { backgroundColor: '#ffffff' },
  confirmModalText: { color: '#1e293b' },
  confirmCancelBtn: { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  confirmCancelBtnText: { color: '#475569' }
});

/* Estilos de Tema Escuro */
const darkStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  header: { borderBottomColor: '#334155' },
  title: { color: '#f8fafc' },
  closeButtonText: { color: '#94a3b8' },
  emptyText: { color: '#94a3b8' },
  trashCard: { backgroundColor: '#0f172a', borderColor: '#334155' },
  clientName: { color: '#f8fafc' },
  clientPhone: { color: '#94a3b8' },
  confirmModalBox: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  confirmModalText: { color: '#f8fafc' },
  confirmCancelBtn: { backgroundColor: '#334155', borderColor: '#475569' },
  confirmCancelBtnText: { color: '#cbd5e1' }
});