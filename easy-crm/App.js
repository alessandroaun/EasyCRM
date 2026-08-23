import React, { useState, useEffect } from 'react';
import { SafeAreaView, StatusBar, View, ActivityIndicator, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/services/supabaseClient';

import DashboardScreen from './src/screens/DashboardScreen';
import AuthScreen from './src/components/AuthScreen';
import ForceChangePasswordScreen from './src/components/ForceChangePasswordScreen';

export default function App() {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

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

    // 1. Carrega a preferência de tema salva localmente ao abrir o app
    AsyncStorage.getItem('@a11_dark_mode').then((val) => {
      if (val !== null) {
        setIsDarkMode(val === 'true');
      }
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

  // Busca o tema preferido do usuário direto do banco de dados (caso esteja logado)
  const fetchUserProfileTheme = async (userId) => {
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('is_dark_mode')
        .eq('id', userId)
        .single();
      
      if (data && typeof data.is_dark_mode === 'boolean') {
        setIsDarkMode(data.is_dark_mode);
        AsyncStorage.setItem('@a11_dark_mode', String(data.is_dark_mode));
      }
    } catch (e) {
      console.log("Erro ao buscar tema do perfil:", e);
    }
  };

  // Função central para alternar e salvar o tema persistentemente
  const toggleDarkMode = async (newValue) => {
    setIsDarkMode(newValue);
    await AsyncStorage.setItem('@a11_dark_mode', String(newValue));

    // Se houver usuário logado, salva também na tabela do Supabase para persistir entre dispositivos
    if (session && session.user) {
      await supabase
        .from('user_profiles')
        .update({ is_dark_mode: newValue })
        .eq('id', session.user.id);
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

    </SafeAreaView>
  );
}