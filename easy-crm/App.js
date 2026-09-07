import React, { useState, useEffect, createContext, useRef } from 'react';
import { SafeAreaView, StatusBar, View, ActivityIndicator, Platform, BackHandler, Modal, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/services/supabaseClient';

import DashboardScreen from './src/screens/DashboardScreen';
import AuthScreen from './src/components/AuthScreen';
import ForceChangePasswordScreen from './src/components/ForceChangePasswordScreen';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

// Cria o contexto de histórico com a nova função logout()
export const HistoryContext = createContext({
  pushRoute: (path, onBack) => {},
  popRoute: () => {},
  logout: () => {}
});

export default function App() {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // ==========================================
  // ESTADOS DO GERENCIADOR DE HISTÓRICO E ROTAS
  // ==========================================
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const historyIndex = useRef(0);
  const callbacks = useRef({});
  
  // Ref para rastrear o estado atual do App sem problemas de atraso na renderização (closure)
  const appState = useRef({ session: null, mustChangePassword: false });
  // O ESCUDO DE REBOBINAMENTO (Evita que popstate ative modais durante o logout)
  const isRewinding = useRef(false);

  useEffect(() => {
    appState.current = { session, mustChangePassword };
  }, [session, mustChangePassword]);

  useEffect(() => {
    // Injeta dinamicamente a fonte personalizada via CSS na versão Web
    if (Platform.OS === 'web') {
      const styleId = 'supabase-global-font';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
          @font-face {
            font-family: 'FriendsCustom';
            src: url('https://omgkvkooitmdqulasdmx.supabase.co/storage/v1/object/public/fonts/Friends-SemiBold.ttf') format('truetype');
            font-weight: 600;
            font-style: normal;
            font-display: swap;
          }
          *, body, input, select, textarea, button {
            font-family: 'FriendsCustom', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          }
        `;
        document.head.appendChild(style);
      }
    }

    AsyncStorage.getItem('@a11_dark_mode').then((val) => {
      if (val !== null) setIsDarkMode(val === 'true');
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitializing(false);
      if (session) fetchUserProfileTheme(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserProfileTheme(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfileTheme = async (userId) => {
    try {
      const { data } = await supabase.from('user_profiles').select('is_dark_mode').eq('id', userId).single();
      if (data && typeof data.is_dark_mode === 'boolean') {
        setIsDarkMode(data.is_dark_mode);
        AsyncStorage.setItem('@a11_dark_mode', String(data.is_dark_mode));
      }
    } catch (e) { }
  };

  const toggleDarkMode = async (newValue) => {
    setIsDarkMode(newValue);
    await AsyncStorage.setItem('@a11_dark_mode', String(newValue));
    if (session && session.user) {
      await supabase.from('user_profiles').update({ is_dark_mode: newValue }).eq('id', session.user.id);
    }
  };

  // ==========================================
  // INICIALIZAÇÃO DE ROTAS (BASEADAS NO ESTADO)
  // ==========================================
  useEffect(() => {
    if (initializing) return;

    if (Platform.OS === 'web') {
      if (!session) {
        // Sem sessão: Limpa o rastro e NÃO arma a armadilha. Botão voltar sai do sistema nativamente.
        window.history.replaceState({ step: 'login', idx: 0 }, '', '/login');
        historyIndex.current = 0;
        callbacks.current = {};
        setShowExitConfirm(false);
      } else if (mustChangePassword) {
        // Atualizar Senha: Arma uma armadilha leve. Voltar = Deslogar
        window.history.replaceState({ step: 'login-trap', idx: 0 }, '', '/login');
        window.history.pushState({ step: 'force-pass', idx: 1 }, '', '/atualizar-senha');
        historyIndex.current = 1;
        callbacks.current = {}; 
        setShowExitConfirm(false);
      } else {
        // Dashboard: Arma a armadilha de Sair do Sistema
        window.history.replaceState({ step: 'exit-trap', idx: 0 }, '', '/login');
        window.history.pushState({ step: 'root', idx: 1 }, '', '/principal');
        historyIndex.current = 1;
        callbacks.current = {};
        setShowExitConfirm(false);
      }
    } else {
        historyIndex.current = session ? 1 : 0;
        callbacks.current = {};
    }
  }, [session, mustChangePassword, initializing]);

  // ==========================================
  // ESCUTADOR DE HISTÓRICO E BOTÃO VOLTAR
  // ==========================================
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handlePopState = (e) => {
        // SE O ESCUDO DE REBOBINAMENTO ESTIVER ATIVO, IGNORA QUALQUER INTERRUPÇÃO!
        if (isRewinding.current) return;

        const state = e.state;
        const { session: currSession, mustChangePassword: currMustChange } = appState.current;

        // 1. Tela de Login Deslogado
        if (!currSession) {
          if (historyIndex.current > 0) {
            if (callbacks.current[historyIndex.current]) {
              callbacks.current[historyIndex.current]();
              delete callbacks.current[historyIndex.current];
            }
            historyIndex.current--;
          }
          return; // Deixa o navegador fluir para fora do site
        }

        // 2. Tela de Forçar Senha
        if (currSession && currMustChange) {
          if (state && state.step === 'login-trap') {
            isRewinding.current = true;
            supabase.auth.signOut(); // Desloga silenciosamente ao invés de mostrar Modal
            setTimeout(() => { isRewinding.current = false; }, 100);
          }
          return;
        }

        // 3. Dashboard Principal e Armadilha
        if (state && state.step === 'exit-trap') {
          // O usuário tentou sair pela raiz. Rearmamos a raiz e subimos o aviso.
          window.history.pushState({ step: 'root', idx: 1 }, '', '/principal');
          historyIndex.current = 1;
          setShowExitConfirm(true); // Exibe o modal de saída
          return;
        }

        // Caso ele volte para um ponto do navegador onde não havia nosso histórico (estado null)
        if (!state || state.idx === undefined) {
          window.history.pushState({ step: 'root', idx: 1 }, '', '/principal');
          historyIndex.current = 1;
          setShowExitConfirm(true);
          return;
        }

        // Fluxo normal de fechar modais internos do CRM
        if (historyIndex.current > 1) {
          if (callbacks.current[historyIndex.current]) {
            callbacks.current[historyIndex.current]();
            delete callbacks.current[historyIndex.current];
          }
          historyIndex.current--;
        }
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    } else {
      // Regra Nativa para APK Android (Botão Físico)
      const handleBackPress = () => {
        const { session: currSession, mustChangePassword: currMustChange } = appState.current;

        if (!currSession) {
          if (historyIndex.current > 0) {
            if (callbacks.current[historyIndex.current]) {
              callbacks.current[historyIndex.current]();
              delete callbacks.current[historyIndex.current];
            }
            historyIndex.current--;
            return true;
          }
          return false; // Deixa sair nativamente do App no Login
        }

        if (currSession && currMustChange) {
          supabase.auth.signOut();
          return true;
        }

        if (historyIndex.current > 1) {
          if (callbacks.current[historyIndex.current]) {
            callbacks.current[historyIndex.current]();
            delete callbacks.current[historyIndex.current];
          }
          historyIndex.current--;
          return true;
        } else {
          setShowExitConfirm(true);
          return true; 
        }
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
      return () => backHandler.remove();
    }
  }, []);

  const pushRoute = (path, onBackCallback) => {
    historyIndex.current++;
    const idx = historyIndex.current;
    callbacks.current[idx] = onBackCallback;

    if (Platform.OS === 'web') {
      window.history.pushState({ step: 'modal', idx }, '', path);
    }
  };

  const popRoute = () => {
    if (historyIndex.current > 0) {
      if (Platform.OS === 'web') {
        window.history.back(); 
      } else {
        if (callbacks.current[historyIndex.current]) {
          callbacks.current[historyIndex.current]();
          delete callbacks.current[historyIndex.current];
        }
        historyIndex.current--;
      }
    }
  };

  const logout = async () => {
    if (Platform.OS === 'web') {
      isRewinding.current = true; // Ativa o escudo para que a viagem no histórico não chame eventos indesejados
      const steps = historyIndex.current; // Calcula o retrocesso exato para cair na armadilha /login invisivel
      
      if (steps > 0) {
        window.history.go(-steps);
      }
      
      // Dá o tempo de viagem do navegador ser concluída com folga
      setTimeout(async () => {
        isRewinding.current = false; // Desliga o escudo
        await supabase.auth.signOut(); // Desloga. O useEffect inicial muda magicamente a armadilha pro login real.
      }, 150);
    } else {
      await supabase.auth.signOut();
    }
  };

  const confirmExitApp = () => {
    setShowExitConfirm(false);
    if (Platform.OS === 'web') {
      isRewinding.current = true; // Impede que o popstate da viagem atrapalhe
      window.history.go(-2); // Fura a armadilha do CRM e devolve pro histórico nativo
      setTimeout(() => { isRewinding.current = false; }, 1000);
    } else {
      BackHandler.exitApp();
    }
  };

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <HistoryContext.Provider value={{ pushRoute, popRoute, logout }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9' }}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={isDarkMode ? '#0f172a' : '#ffffff'} />
        
        {session && session.user ? (
          mustChangePassword ? (
            <ForceChangePasswordScreen 
              isDarkMode={isDarkMode} 
              toggleDarkMode={toggleDarkMode} 
              onPasswordChanged={() => setMustChangePassword(false)} 
            />
          ) : (
            <DashboardScreen 
              isDarkMode={isDarkMode} 
              toggleDarkMode={toggleDarkMode} 
            />
          )
        ) : (
          <AuthScreen 
            isDarkMode={isDarkMode} 
            toggleDarkMode={toggleDarkMode} 
            onRequirePasswordChange={() => setMustChangePassword(true)} 
          />
        )}

        {/* MODAL GLOBAL INTERCEPTADOR: SAIR DO SISTEMA */}
        <Modal visible={showExitConfirm} transparent animationType="fade" onRequestClose={() => setShowExitConfirm(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, isDarkMode && styles.modalContentDark]}>
              <Text style={[styles.modalTitle, isDarkMode && styles.modalTitleDark]}>Sair do Sistema</Text>
              <Text style={[styles.modalText, isDarkMode && styles.modalTextDark]}>Deseja realmente sair e fechar o aplicativo?</Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.btn, styles.cancelBtn, isDarkMode && styles.cancelBtnDark]} onPress={() => setShowExitConfirm(false)}>
                  <Text style={[styles.cancelBtnText, isDarkMode && styles.cancelBtnTextDark]}>Não</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.confirmBtn]} onPress={confirmExitApp}>
                  <Text style={styles.confirmBtnText}>Sim, sair</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </HistoryContext.Provider>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    ...Platform.select({ web: { boxShadow: '0px 15px 35px rgba(0,0,0,0.2)' } })
  },
  modalContentDark: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: MODERN_FONT
  },
  modalTitleDark: { color: '#f8fafc' },
  modalText: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    fontFamily: MODERN_FONT
  },
  modalTextDark: { color: '#94a3b8' },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%'
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  cancelBtnDark: {
    backgroundColor: '#0f172a',
    borderColor: '#334155'
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: MODERN_FONT
  },
  cancelBtnTextDark: { color: '#cbd5e1' },
  confirmBtn: {
    backgroundColor: '#ef4444'
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: MODERN_FONT
  }
});