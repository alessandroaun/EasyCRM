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

import { MODERN_FONT, TOKENS } from '../theme/tokens';

export default function AddClientModal({ visible, onClose, onSave, isDarkMode }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [initialInfo, setInitialInfo] = useState('');
  
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  const handleClose = () => {
    setName('');
    setPhone('');
    setInitialInfo('');
    onClose();
  };

  const handleSave = () => {
    if (!name.trim()) {
      setErrorModal({ visible: true, message: 'O nome do cliente é obrigatório!' });
      return;
    }

    const phoneDigits = phone.replace(/\D/g, ''); 
    if (phoneDigits.length < 8) {
      setErrorModal({ visible: true, message: 'Por favor, informe um número de telefone válido.' });
      return;
    }

    const newClient = {
      id: `client_${Date.now()}`,
      name,
      phone,
      initialInfo,
    };

    onSave(newClient);
    handleClose();
  };

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  return (
    <>
      {/* Modal Principal */}
      <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={[styles.modalContainer, themeStyles.modalContainer]}>
            <View style={styles.header}>
              <Text style={[styles.title, themeStyles.title]}>Novo Cliente</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Text style={[styles.closeButtonText, themeStyles.closeButtonText]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <Text style={[styles.label, themeStyles.label]}>Nome do Cliente *</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="Ex: João da Silva"
                placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                value={name}
                onChangeText={setName}
              />
              <Text style={[styles.label, themeStyles.label]}>Número de Telefone/WhatsApp</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="Ex: (11) 99999-9999"
                placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
              <Text style={[styles.label, themeStyles.label]}>Informações Iniciais</Text>
              <TextInput
                style={[styles.input, themeStyles.input, styles.textArea]}
                placeholder="Como esse cliente chegou? Qual o interesse?"
                placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                multiline={true}
                numberOfLines={4}
                value={initialInfo}
                onChangeText={setInitialInfo}
              />
            </View>

            <View style={styles.footer}>
              <TouchableOpacity style={[styles.cancelButton, themeStyles.cancelButton]} onPress={handleClose}>
                <Text style={[styles.cancelButtonText, themeStyles.cancelButtonText]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Salvar Cliente</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Alerta Customizado (Refinado) */}
      <Modal transparent={true} visible={errorModal.visible} animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.alertContainer, themeStyles.modalContainer]}>
            <View style={styles.alertIconContainer}>
              <Text style={styles.alertIconSymbol}>⚠️</Text>
            </View>
            <Text style={[styles.alertTitle, themeStyles.title]}>Atenção</Text>
            <Text style={[styles.alertMessage, themeStyles.alertMessageText]}>{errorModal.message}</Text>
            
            <TouchableOpacity 
              style={styles.alertButton} 
              onPress={() => setErrorModal({ visible: false, message: '' })}
              activeOpacity={0.8}
            >
              <Text style={styles.alertButtonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
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
    maxWidth: 520,
    borderRadius: 20,
    padding: 28,
    ...Platform.select({
      web: { 
        outlineStyle: 'none',
        boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)'
      }
    })
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: MODERN_FONT,
    letterSpacing: -0.4,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    ...Platform.select({ web: { cursor: 'pointer' } })
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
    marginTop: 14,
    fontFamily: MODERN_FONT,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: MODERN_FONT,
    ...Platform.select({
      web: { outlineStyle: 'none' }
    })
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    ...Platform.select({ web: { cursor: 'pointer', transition: 'all 0.15s ease' } })
  },
  cancelButtonText: {
    fontWeight: '700',
    fontSize: 13,
    fontFamily: MODERN_FONT,
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    ...Platform.select({ 
      web: { 
        cursor: 'pointer', 
        transition: 'all 0.15s ease',
        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)' 
      } 
    })
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: MODERN_FONT,
  },
  alertContainer: {
    width: '90%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 26,
    alignItems: 'center',
    ...Platform.select({
      web: { outlineStyle: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }
    })
  },
  alertIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  alertIconSymbol: {
    fontSize: 22,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: MODERN_FONT,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  alertMessageText: {
    fontSize: 13,
    fontFamily: MODERN_FONT,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
    fontWeight: '500',
  },
  alertButton: {
    width: '100%',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    ...Platform.select({ web: { cursor: 'pointer' } })
  },
  alertButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: MODERN_FONT,
  }
});

/* Estilos de Tema Claro */
const lightStyles = StyleSheet.create({
  modalContainer: {
    backgroundColor: TOKENS.light.surface,
  },
  title: {
    color: TOKENS.light.textPrimary,
  },
  closeButtonText: {
    color: TOKENS.light.textMuted,
  },
  label: {
    color: TOKENS.light.textSecondary,
  },
  input: {
    backgroundColor: TOKENS.light.surfaceSubtle,
    borderColor: TOKENS.light.border,
    color: TOKENS.light.textPrimary,
  },
  cancelButton: {
    backgroundColor: TOKENS.light.surfaceSubtle,
  },
  cancelButtonText: {
    color: TOKENS.light.textSecondary,
  },
  alertMessageText: {
    color: TOKENS.light.textSecondary,
  }
});

/* Estilos de Tema Escuro */
const darkStyles = StyleSheet.create({
  modalContainer: {
    backgroundColor: TOKENS.dark.surface,
    borderColor: TOKENS.dark.border,
    borderWidth: 1,
  },
  title: {
    color: TOKENS.dark.textPrimary,
  },
  closeButtonText: {
    color: TOKENS.dark.textMuted,
  },
  label: {
    color: TOKENS.dark.textSecondary,
  },
  input: {
    backgroundColor: TOKENS.dark.surfaceSubtle,
    borderColor: TOKENS.dark.border,
    color: TOKENS.dark.textPrimary,
  },
  cancelButton: {
    backgroundColor: TOKENS.dark.surfaceSubtle,
    borderColor: TOKENS.dark.border,
    borderWidth: 1,
  },
  cancelButtonText: {
    color: TOKENS.dark.textSecondary,
  },
  alertMessageText: {
    color: TOKENS.dark.textSecondary,
  }
});