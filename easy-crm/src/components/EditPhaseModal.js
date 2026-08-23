import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

const LIGHT_COLORS = [
  '#f1f5f9', '#e0f2fe', '#dcfce7', '#fef9c3', '#ffedd5', '#fee2e2', '#f3e8ff',
];

const DARK_COLORS = [
  '#1e293b', '#0369a1', '#15803d', '#a16207', '#c2410c', '#b91c1c', '#7e22ce',
];

export default function EditPhaseModal({ visible, onClose, phase, allPhases, onSave, onDelete, isDarkMode }) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#f1f5f9');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [localPhases, setLocalPhases] = useState([]);

  // Estados do Modal de Alerta Customizado
  const [isAlertModalVisible, setIsAlertModalVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setIsAlertModalVisible(true);
  };

  useEffect(() => {
    if (phase) {
      setTitle(phase.title || '');
      setColor(phase.color || (isDarkMode ? '#1e293b' : '#f1f5f9'));
      setIsConfirmingDelete(false);
      
      const safePhases = (Array.isArray(allPhases) && allPhases.length > 0) ? allPhases : [phase];
      let sorted = [...safePhases].sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Garantir que a fase "Novo Cliente" fique sempre fixada na primeira posição ao carregar
      const novoClienteIndex = sorted.findIndex(p => (p.title || '').trim().toLowerCase() === 'novo cliente');
      if (novoClienteIndex > 0) {
        const [novoClienteObj] = sorted.splice(novoClienteIndex, 1);
        sorted.unshift(novoClienteObj);
      }

      setLocalPhases(sorted);
    }
  }, [phase, allPhases, isDarkMode]);

  const handleClose = () => {
    setIsConfirmingDelete(false);
    onClose();
  };

  const movePhase = (direction) => {
    const isCurrentProtected = (phase.title || '').trim().toLowerCase() === 'novo cliente';
    if (isCurrentProtected) return; // Trava absoluta para a fase protegida não se mover

    const currentIndex = localPhases.findIndex(p => p.id === phase.id);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;
    if (newIndex <= 0 || newIndex >= localPhases.length) return; // Impede ir para a posição 0 (topo)

    const newList = [...localPhases];
    const temp = newList[currentIndex];
    newList[currentIndex] = newList[newIndex];
    newList[newIndex] = temp;

    setLocalPhases(newList);
  };

  const handleSave = () => {
    if (!title.trim()) {
      showAlert('Atenção', 'O nome da fase não pode ficar vazio.');
      return;
    }

    const updatedPhases = localPhases.map((p, index) => {
      if (p.id === phase.id) {
        return { ...p, title, color, order: index + 1 };
      }
      return { ...p, order: index + 1 };
    });

    onSave(phase.id, title, color, updatedPhases);
    handleClose();
  };

  if (!phase) return null;

  const themeStyles = isDarkMode ? darkStyles : lightStyles;
  const currentColorsPalette = isDarkMode ? DARK_COLORS : LIGHT_COLORS;

  // Regra de Negócio: Blindar a fase "Novo Cliente" contra exclusões e edição de nome
  const isProtectedPhase = (phase.title || '').trim().toLowerCase() === 'novo cliente';

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, themeStyles.modalContainer]}>
          
          {!isConfirmingDelete ? (
            <>
              <View style={styles.header}>
                <Text style={[styles.title, themeStyles.title]}>Configurar Fase</Text>
                <TouchableOpacity onPress={handleClose} style={[styles.closeButton, themeStyles.closeButton]}>
                  <Text style={[styles.closeButtonText, themeStyles.closeButtonText]}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formBody}>
                <Text style={[styles.label, themeStyles.label]}>Nome da Fase</Text>
                <TextInput
                  style={[styles.input, themeStyles.input, isProtectedPhase && styles.inputDisabled]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Ex: Em Negociação"
                  placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                  editable={!isProtectedPhase} 
                />

                <Text style={[styles.label, themeStyles.label]}>Cor da fase</Text>
                <View style={styles.colorPicker}>
                  {currentColorsPalette.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchSelected]}
                      onPress={() => setColor(c)}
                    />
                  ))}
                </View>

                <View style={styles.kanbanOrgHeader}>
                  <Text style={[styles.label, themeStyles.label]}>Posicionamento no fluxo de vendas</Text>
                </View>
                
                <View style={[styles.orderingContainer, themeStyles.orderingContainer]}>
                  <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true} style={{ flexShrink: 1 }}>
                    {localPhases.map((p, index) => {
                      const isEditing = p.id === phase.id;
                      const displayTitle = isEditing ? (title || 'Fase sem nome') : p.title;
                      const displayColor = isEditing ? color : (p.color || (isDarkMode ? '#1e293b' : '#f1f5f9'));
                      const isItemProtected = (p.title || '').trim().toLowerCase() === 'novo cliente';

                      return (
                        <View key={p.id || index} style={[styles.phaseRow, themeStyles.phaseRow, isEditing && (isDarkMode ? darkStyles.phaseRowEditing : styles.phaseRowEditing)]}>
                          <View style={styles.phaseRowHeader}>
                            <View style={[styles.positionBadge, themeStyles.positionBadge]}>
                              <Text style={[styles.positionBadgeText, themeStyles.positionBadgeText, isEditing && (isDarkMode ? darkStyles.positionBadgeTextEditing : styles.positionBadgeTextEditing)]}>{index + 1}</Text>
                            </View>
                            <View style={[styles.colorIndicator, { backgroundColor: displayColor }]} />
                            <Text style={[styles.phaseRowTitle, themeStyles.phaseRowTitle, isEditing && (isDarkMode ? darkStyles.phaseRowTitleEditing : styles.phaseRowTitleEditing)]} numberOfLines={1}>
                              {displayTitle}
                            </Text>
                          </View>

                          {isEditing && (
                            <View style={styles.phaseRowControls}>
                              <TouchableOpacity 
                                onPress={() => movePhase(-1)} 
                                disabled={isProtectedPhase || index === 0 || index === 1} 
                                style={[styles.moveBtn, themeStyles.moveBtn, (isProtectedPhase || index === 0 || index === 1) && styles.moveBtnDisabled]}
                              >
                                <Text style={[styles.moveBtnText, themeStyles.moveBtnText]}>▲</Text>
                              </TouchableOpacity>
                              <TouchableOpacity 
                                onPress={() => movePhase(1)} 
                                disabled={isProtectedPhase || index === localPhases.length - 1} 
                                style={[styles.moveBtn, themeStyles.moveBtn, (isProtectedPhase || index === localPhases.length - 1) && styles.moveBtnDisabled]}
                              >
                                <Text style={[styles.moveBtnText, themeStyles.moveBtnText]}>▼</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
                <Text style={[styles.helpText, themeStyles.helpText]}>Use as setas para reposicionar esta fase no seu funil de vendas.</Text>
              </View>

              <View style={[styles.footer, themeStyles.footer]}>
                {!isProtectedPhase ? (
                  <TouchableOpacity style={styles.deletePhaseButton} onPress={() => setIsConfirmingDelete(true)}>
                    <Text style={styles.deletePhaseText}>Excluir Fase</Text>
                  </TouchableOpacity>
                ) : (
                  <View /> 
                )}
                
                <View style={styles.footerActionsRight}>
                  <TouchableOpacity style={[styles.cancelButton, themeStyles.cancelButton]} onPress={handleClose}>
                    <Text style={[styles.cancelButtonText, themeStyles.cancelButtonText]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                    <Text style={styles.saveButtonText}>Salvar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.confirmContainer}>
              <Text style={styles.confirmTitle}>⚠️ Atenção</Text>
              <Text style={[styles.confirmMessage, themeStyles.confirmMessage]}>
                Você tem certeza que deseja excluir a fase <Text style={{fontWeight: 'bold'}}>"{phase.title}"</Text>?
              </Text>
              <Text style={[styles.confirmSubMessage, themeStyles.confirmSubMessage]}>
                Todos os clientes que estão nesta coluna serão movidos para a Lixeira e poderão ser restaurados posteriormente para a coluna inicial.
              </Text>

              <View style={[styles.footer, themeStyles.footer, { justifyContent: 'flex-end', marginTop: 20, width: '100%', borderTopWidth: 0 }]}>
                <TouchableOpacity style={[styles.cancelButton, themeStyles.cancelButton]} onPress={() => setIsConfirmingDelete(false)}>
                  <Text style={[styles.cancelButtonText, themeStyles.cancelButtonText]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#ef4444' }]} onPress={() => { onDelete(phase.id); handleClose(); }}>
                  <Text style={styles.saveButtonText}>Sim, Excluir Fase</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

        </View>
      </View>

      {/* MODAL DE ALERTA CUSTOMIZADO COM FADE */}
      <Modal animationType="fade" transparent={true} visible={isAlertModalVisible} onRequestClose={() => setIsAlertModalVisible(false)}>
        <View style={styles.alertOverlay}>
          <View style={[styles.alertContent, themeStyles.alertContent]}>
            <Text style={[styles.alertTitle, themeStyles.alertTitle]}>{alertTitle}</Text>
            <Text style={[styles.alertSubtitle, themeStyles.alertSubtitle]}>{alertMessage}</Text>
            <TouchableOpacity style={styles.alertBtn} onPress={() => setIsAlertModalVisible(false)}>
              <Text style={styles.alertBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContainer: {
    width: '100%', maxWidth: 480, maxHeight: '90%', borderRadius: 16, padding: 24, flexShrink: 1,
    ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 10px 25px rgba(0,0,0,0.15)' } })
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', fontFamily: MODERN_FONT },
  closeButton: { borderRadius: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 16, fontWeight: 'bold' },
  
  formBody: { flexShrink: 1, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 12, fontFamily: MODERN_FONT },
  input: {
    borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15, fontFamily: MODERN_FONT,
    ...Platform.select({ web: { outlineStyle: 'none' } })
  },
  inputDisabled: { opacity: 0.6 },
  colorPicker: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#e2e8f0' },
  colorSwatchSelected: { borderColor: '#2563eb', transform: [{ scale: 1.1 }] },
  
  kanbanOrgHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderingContainer: {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 70,
    flexShrink: 1,
    padding: 6,
    marginTop: 4,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
  },
  phaseRowEditing: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
  },
  phaseRowHeader: { flexDirection: 'row', alignItems: 'center', flex: 1, overflow: 'hidden', paddingRight: 8 },
  positionBadge: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  positionBadgeText: { fontSize: 12, fontWeight: '700', fontFamily: MODERN_FONT },
  positionBadgeTextEditing: { color: '#2563eb', backgroundColor: '#dbeafe', width: '100%', height: '100%', textAlign: 'center', lineHeight: 22, borderRadius: 6 },
  colorIndicator: { width: 12, height: 12, borderRadius: 4, marginRight: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  phaseRowTitle: { fontSize: 14, fontWeight: '600', flexShrink: 1, fontFamily: MODERN_FONT },
  phaseRowTitleEditing: { color: '#1e40af', fontWeight: '700' },
  
  phaseRowControls: { flexDirection: 'row', gap: 4 },
  moveBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, ...Platform.select({ web: { cursor: 'pointer' } }) },
  moveBtnDisabled: { opacity: 0.3 },
  moveBtnText: { fontSize: 12, fontWeight: 'bold', fontFamily: MODERN_FONT },

  helpText: { fontSize: 11, fontStyle: 'italic', marginTop: 6, textAlign: 'center', fontFamily: MODERN_FONT },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 14, flexWrap: 'wrap', gap: 8 },
  footerActionsRight: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  deletePhaseButton: { padding: 10, backgroundColor: '#fee2e2', borderRadius: 8 },
  deletePhaseText: { color: '#ef4444', fontWeight: '700', fontSize: 13, fontFamily: MODERN_FONT },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  cancelButtonText: { fontWeight: '700', fontSize: 13, fontFamily: MODERN_FONT },
  saveButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#2563eb' },
  saveButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 13, fontFamily: MODERN_FONT },
  
  confirmContainer: { alignItems: 'center', paddingTop: 6, paddingBottom: 6 },
  confirmTitle: { fontSize: 22, fontWeight: '900', color: '#ef4444', marginBottom: 12, fontFamily: MODERN_FONT },
  confirmMessage: { fontSize: 15, textAlign: 'center', marginBottom: 12, lineHeight: 22, fontFamily: MODERN_FONT },
  confirmSubMessage: { fontSize: 12, textAlign: 'center', padding: 12, borderRadius: 10, borderWidth: 1, fontFamily: MODERN_FONT },

  // Estilos do Modal de Alerta Customizado
  alertOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  alertContent: { borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center', ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 10px 20px rgba(0,0,0,0.15)' } }) },
  alertTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, textAlign: 'center', fontFamily: MODERN_FONT },
  alertSubtitle: { fontSize: 13, marginBottom: 20, textAlign: 'center', lineHeight: 18, fontFamily: MODERN_FONT },
  alertBtn: { width: '100%', backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  alertBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14, fontFamily: MODERN_FONT }
});

/* Estilos de Tema Claro */
const lightStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#ffffff' },
  title: { color: '#0f172a' },
  closeButton: { backgroundColor: '#f1f5f9' },
  closeButtonText: { color: '#64748b' },
  label: { color: '#475569' },
  input: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#0f172a' },
  orderingContainer: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  phaseRow: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  positionBadge: { backgroundColor: '#f1f5f9' },
  positionBadgeText: { color: '#64748b' },
  phaseRowTitle: { color: '#334155' },
  moveBtn: { backgroundColor: '#ffffff', borderColor: '#cbd5e1' },
  moveBtnDisabled: { backgroundColor: '#f8fafc' },
  moveBtnText: { color: '#334155' },
  helpText: { color: '#64748b' },
  footer: { borderTopColor: '#f1f5f9' },
  cancelButton: { backgroundColor: '#f1f5f9' },
  cancelButtonText: { color: '#475569' },
  confirmMessage: { color: '#1e293b' },
  confirmSubMessage: { color: '#64748b', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  alertContent: { backgroundColor: '#ffffff' },
  alertTitle: { color: '#1e293b' },
  alertSubtitle: { color: '#64748b' }
});

/* Estilos de Tema Escuro */
const darkStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  title: { color: '#f8fafc' },
  closeButton: { backgroundColor: '#334155' },
  closeButtonText: { color: '#94a3b8' },
  label: { color: '#94a3b8' },
  input: { backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' },
  orderingContainer: { backgroundColor: '#0f172a', borderColor: '#334155' },
  phaseRow: { backgroundColor: '#1e293b', borderColor: '#334155' },
  phaseRowEditing: { borderColor: '#3b82f6', backgroundColor: '#1e3a8a', borderWidth: 1.5 },
  positionBadge: { backgroundColor: '#334155' },
  positionBadgeText: { color: '#94a3b8' },
  positionBadgeTextEditing: { color: '#93c5fd', backgroundColor: '#1d4ed8', width: '100%', height: '100%', textAlign: 'center', lineHeight: 22, borderRadius: 6 },
  phaseRowTitle: { color: '#f8fafc' },
  phaseRowTitleEditing: { color: '#93c5fd', fontWeight: '700' },
  moveBtn: { backgroundColor: '#0f172a', borderColor: '#334155' },
  moveBtnDisabled: { backgroundColor: '#1e293b' },
  moveBtnText: { color: '#f8fafc' },
  helpText: { color: '#94a3b8' },
  footer: { borderTopColor: '#334155' },
  cancelButton: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1 },
  cancelButtonText: { color: '#cbd5e1' },
  confirmMessage: { color: '#f8fafc' },
  confirmSubMessage: { color: '#94a3b8', backgroundColor: '#0f172a', borderColor: '#334155' },
  alertContent: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  alertTitle: { color: '#f8fafc' },
  alertSubtitle: { color: '#94a3b8' }
});