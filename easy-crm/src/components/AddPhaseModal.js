import React, { useState } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet,
  Platform
} from 'react-native';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

export default function AddPhaseModal({ visible, onClose, onSave, isDarkMode }) {
  const [title, setTitle] = useState('');

  const handleClose = () => {
    setTitle('');
    onClose();
  };

  const handleSave = () => {
    if (!title.trim()) {
      alert('O nome da fase é obrigatório!');
      return;
    }

    onSave(title);
    handleClose();
  };

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, themeStyles.modalContainer]}>
          
          <View style={styles.header}>
            <Text style={[styles.title, themeStyles.title]}>Nova Fase do Funil</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={[styles.closeButtonText, themeStyles.closeButtonText]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={[styles.label, themeStyles.label]}>Nome da Fase *</Text>
            <TextInput
              style={[styles.input, themeStyles.input]}
              placeholder="Ex: Reunião Agendada, Contrato Assinado..."
              placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
              value={title}
              onChangeText={setTitle}
              autoFocus={true} // Já foca no input ao abrir o modal na web
            />
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.cancelButton, themeStyles.cancelButton]} onPress={handleClose}>
              <Text style={[styles.cancelButtonText, themeStyles.cancelButtonText]}>Cancelar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Criar Fase</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400, // Um pouco menor que o modal de cliente pois tem menos campos
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
    ...Platform.select({
      web: { outlineStyle: 'none' }
    })
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: MODERN_FONT,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    fontFamily: MODERN_FONT,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    fontFamily: MODERN_FONT,
    ...Platform.select({
      web: { outlineStyle: 'none', transition: 'border-color 0.2s' }
    })
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontWeight: '600',
    fontSize: 15,
    fontFamily: MODERN_FONT,
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#10b981', // Verde moderno para diferenciar da adição de cliente
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
    fontFamily: MODERN_FONT,
  },
});

/* Estilos de Tema Claro */
const lightStyles = StyleSheet.create({
  modalContainer: {
    backgroundColor: '#ffffff',
  },
  title: {
    color: '#1e293b',
  },
  closeButtonText: {
    color: '#64748b',
  },
  label: {
    color: '#475569',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    color: '#0f172a',
  },
  cancelButton: {
    backgroundColor: '#f1f5f9',
  },
  cancelButtonText: {
    color: '#475569',
  },
});

/* Estilos de Tema Escuro */
const darkStyles = StyleSheet.create({
  modalContainer: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
  },
  title: {
    color: '#f8fafc',
  },
  closeButtonText: {
    color: '#94a3b8',
  },
  label: {
    color: '#94a3b8',
  },
  input: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    color: '#f8fafc',
  },
  cancelButton: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    borderWidth: 1,
  },
  cancelButtonText: {
    color: '#cbd5e1',
  },
});