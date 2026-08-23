// ForceChangePasswordScreen
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView, Modal, Image, useWindowDimensions } from 'react-native';
import { supabase } from '../services/supabaseClient';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

const validatePassword = (pwd) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
  return regex.test(pwd);
};

export default function ForceChangePasswordScreen({ onPasswordChanged, isDarkMode }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Estados do Modal de Alerta Customizado
  const [isAlertModalVisible, setIsAlertModalVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  // Ref para controlar se a senha já foi alterada com sucesso antes de atualizar a página
  const passwordChangedRef = useRef(false);

  // Efeito para interceptar o F5/Refresh e deslogar o usuário caso ele tente pular essa tela
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleBeforeUnload = () => {
        if (!passwordChangedRef.current) {
          // Desloga o usuário limpando a sessão antes da página recarregar
          supabase.auth.signOut();
        }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, []);

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setIsAlertModalVisible(true);
  };

  const handleAlertConfirm = () => {
    setIsAlertModalVisible(false);
    if (alertTitle.includes('Sucesso')) {
      if (onPasswordChanged) onPasswordChanged();
    }
  };

  const handleSubmit = async () => {
    if (loading) return; // Trava contra duplo-clique / dupla submissão

    if (!validatePassword(newPassword)) {
      setErrorMessage('A senha deve conter no mínimo 6 caracteres, incluindo letra maiúscula, minúscula, número e caractere especial.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      let msg = error.message;
      // Tradução amigável do erro nativo do Supabase de reutilização de senha
      if (msg.includes('should be different from the old password') || msg.includes('different from the old password')) {
        msg = 'A nova senha não pode ser igual à senha atual. Por favor, escolha uma senha diferente.';
      }
      setErrorMessage(msg);
    } else {
      passwordChangedRef.current = true; // Marca como sucesso para não ser deslogado ao recarregar a página no futuro
      showAlert('✅ Sucesso', 'Senha atualizada com sucesso! Bem-vindo ao CRM.');
    }
  };

  const handleKeyPress = (e) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter') {
      handleSubmit();
    }
  };

  const currentTheme = isDarkMode ? darkStyles : lightStyles;
  const iconColor = isDarkMode ? '#94a3b8' : '#64748b';

  return (
    <KeyboardAvoidingView style={[styles.container, currentTheme.container]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, currentTheme.card, isMobile && styles.cardMobile]}>
          
          <View style={styles.headerContainer}>
            <Image 
                source={require('../../assets/logo_A11_sem_fundo.png')} 
                style={styles.logoImage} 
                resizeMode="contain" 
            />
            <Text style={[styles.title, currentTheme.title]}>Atualização de Segurança</Text>
            <Text style={[styles.subtitle, currentTheme.subtitle]}>
              Sua conta está utilizando uma senha temporária. Por segurança, crie uma nova senha forte que contenha letras maiúsculas, minúsculas, números e caracteres especiais.
            </Text>
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, currentTheme.label]}>Nova Senha</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={[styles.input, currentTheme.input, styles.passwordInputWithIcon]}
                placeholder="Ex: Senha@123"
                placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                secureTextEntry={!showNewPassword}
                value={newPassword}
                onChangeText={setNewPassword}
                onSubmitEditing={handleSubmit}
                onKeyPress={handleKeyPress}
                textContentType="password"
                autoComplete="off"
                {...Platform.select({
                  web: {
                    style: {
                      ...styles.input,
                      ...currentTheme.input,
                      ...styles.passwordInputWithIcon,
                      outlineStyle: 'none',
                      WebkitTextSecurity: showNewPassword ? 'none' : 'disc'
                    }
                  }
                })}
              />
              <TouchableOpacity 
                style={styles.eyeIconContainer} 
                onPress={() => setShowNewPassword(!showNewPassword)}
                activeOpacity={0.7}
              >
                <View style={styles.vectorEyeWrapper}>
                  <View style={[styles.eyeOuterFrame, { borderColor: iconColor }]}>
                    <View style={[styles.eyeInnerPupil, { backgroundColor: iconColor }]} />
                  </View>
                  {!showNewPassword && (
                    <View style={[styles.eyeSlashLine, { backgroundColor: iconColor }]} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, currentTheme.label]}>Confirmar Nova Senha</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={[styles.input, currentTheme.input, styles.passwordInputWithIcon]}
                placeholder="Confirme a nova senha"
                placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onSubmitEditing={handleSubmit}
                onKeyPress={handleKeyPress}
                textContentType="password"
                autoComplete="off"
                {...Platform.select({
                  web: {
                    style: {
                      ...styles.input,
                      ...currentTheme.input,
                      ...styles.passwordInputWithIcon,
                      outlineStyle: 'none',
                      WebkitTextSecurity: showConfirmPassword ? 'none' : 'disc'
                    }
                  }
                })}
              />
              <TouchableOpacity 
                style={styles.eyeIconContainer} 
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                activeOpacity={0.7}
              >
                <View style={styles.vectorEyeWrapper}>
                  <View style={[styles.eyeOuterFrame, { borderColor: iconColor }]}>
                    <View style={[styles.eyeInnerPupil, { backgroundColor: iconColor }]} />
                  </View>
                  {!showConfirmPassword && (
                    <View style={[styles.eyeSlashLine, { backgroundColor: iconColor }]} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={[styles.primaryButton, currentTheme.primaryButton, loading && styles.primaryButtonDisabled]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Salvar e Acessar CRM</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL DE ALERTA CUSTOMIZADO COM FADE E DESIGN PADRÃO */}
      <Modal animationType="fade" transparent={true} visible={isAlertModalVisible} onRequestClose={handleAlertConfirm}>
        <View style={styles.modalOverlay}>
          <View style={[styles.alertModalContent, currentTheme.alertModalContent]}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, position: 'relative', width: '100%'}}>
              <Text style={[styles.modalTitle, currentTheme.modalTitle]}>{alertTitle}</Text>
            </View>
            <View style={{ marginBottom: 24, width: '100%' }}>
              <Text style={[styles.modalSubtitle, currentTheme.modalSubtitle]}>{alertMessage}</Text>
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={handleAlertConfirm}>
              <Text style={styles.modalBtnText}>Acessar CRM</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 440, borderRadius: 24, padding: 36, marginVertical: 24, position: 'relative' },
  cardMobile: { padding: 24 },
  headerContainer: { alignItems: 'center', marginBottom: 24 },
  logoImage: { width: 130, height: 130, marginBottom: 8 },
  title: { fontFamily: MODERN_FONT, fontSize: 18, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontFamily: MODERN_FONT, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  errorBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', padding: 14, borderRadius: 8, marginBottom: 20, width: '100%' },
  errorText: { color: '#ef4444', fontSize: 13, textAlign: 'center', fontWeight: '600', fontFamily: MODERN_FONT, lineHeight: 18 },
  inputGroup: { marginBottom: 20 },
  label: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  
  // Estilização do Campo com Ícone Vetorial de Senha
  passwordInputContainer: { position: 'relative', justifyContent: 'center', width: '100%' },
  passwordInputWithIcon: { paddingRight: 45 },
  eyeIconContainer: { position: 'absolute', right: 12, height: '100%', justifyContent: 'center', alignItems: 'center', width: 30 },
  vectorEyeWrapper: { width: 18, height: 14, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  eyeOuterFrame: { width: 18, height: 12, borderWidth: 1.5, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  eyeInnerPupil: { width: 5, height: 5, borderRadius: 2.5 },
  eyeSlashLine: { position: 'absolute', width: 20, height: 1.5, transform: [{ rotate: '-45deg' }] },

  input: { borderRadius: 12, padding: 14, fontSize: 14, fontFamily: MODERN_FONT, ...Platform.select({ web: { outlineStyle: 'none', WebkitTextSecurity: 'none' } }) },
  primaryButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8, ...Platform.select({ web: { transition: 'background-color 0.2s ease' } }) },
  primaryButtonDisabled: { backgroundColor: '#93c5fd' },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700', fontFamily: MODERN_FONT },

  // Estilos do Modal de Alerta Atualizado
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 16, zIndex: 99999, elevation: 100 },
  alertModalContent: { borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, alignItems: 'center', ...Platform.select({ web: { outlineStyle: 'none', boxShadow: '0px 15px 35px rgba(0,0,0,0.25)' } }) },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 0, textAlign: 'center', fontFamily: MODERN_FONT },
  modalSubtitle: { fontSize: 14, marginBottom: 0, textAlign: 'center', lineHeight: 22, fontFamily: MODERN_FONT },
  modalBtn: { width: '100%', paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#2563eb' },
  modalBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14, fontFamily: MODERN_FONT }
});

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#ffffff', ...Platform.select({ web: { boxShadow: '0px 10px 40px rgba(0, 0, 0, 0.08)' }, default: { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 } }) },
  title: { color: '#0f172a' },
  subtitle: { color: '#64748b' },
  label: { color: '#475569' },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', color: '#0f172a' },
  primaryButton: { backgroundColor: '#2563eb' },
  alertModalContent: { backgroundColor: '#ffffff' },
  modalTitle: { color: '#1e293b' },
  modalSubtitle: { color: '#475569' }
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#0f172a' },
  card: { backgroundColor: '#1e293b', ...Platform.select({ web: { boxShadow: '0px 10px 40px rgba(0,0,0,0.4)' }, default: { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 } }) },
  title: { color: '#f8fafc' },
  subtitle: { color: '#94a3b8' },
  label: { color: '#cbd5e1' },
  input: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', color: '#f8fafc' },
  primaryButton: { backgroundColor: '#3b82f6' },
  alertModalContent: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  modalTitle: { color: '#f8fafc' },
  modalSubtitle: { color: '#94a3b8' }
});