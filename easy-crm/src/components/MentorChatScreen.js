import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  StyleSheet, 
  useWindowDimensions,
  Animated,
  Easing,
  Modal
} from 'react-native';
import { supabase } from '../services/supabaseClient'; 

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// ============================================================================
// ÍCONES VETORIAIS E ANIMAÇÕES
// ============================================================================
const SendIcon = () => (
  Platform.OS === 'web' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5"></line>
      <polyline points="5 12 12 5 19 12"></polyline>
    </svg>
  ) : <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>↑</Text>
);

const MicIcon = ({ isListening, color }) => (
  Platform.OS === 'web' ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isListening ? "#ef4444" : color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="22"></line>
    </svg>
  ) : <Text style={{color: isListening ? '#ef4444' : color, fontSize: 16}}>🎤</Text>
);

const DeleteIcon = () => (
  Platform.OS === 'web' ? (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ) : <Text style={{color: '#fff', fontSize: 8, fontWeight: 'bold'}}>✕</Text>
);

const TypingIndicator = ({ isDarkMode }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot, delay) => {
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.delay(600)
          ])
        )
      ]).start();
    };

    animateDot(dot1, 0);
    animateDot(dot2, 200);
    animateDot(dot3, 400);
  }, []);

  const dotColor = isDarkMode ? '#94a3b8' : '#64748b';

  return (
    <View style={styles.typingIndicatorWrapper}>
      <Animated.View style={[styles.typingDot, { backgroundColor: dotColor, transform: [{ translateY: dot1 }] }]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: dotColor, transform: [{ translateY: dot2 }] }]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: dotColor, transform: [{ translateY: dot3 }] }]} />
    </View>
  );
};

const MarkdownText = ({ text, baseStyle, isDarkMode }) => {
  if (!text) return null;
  const themeStyles = isDarkMode ? darkStyles : lightStyles;
  
  const blocks = text.split('\n');

  return (
    <View style={styles.markdownWrapper}>
      {blocks.map((line, index) => {
        if (line.trim() === '') return <View key={index} style={{ height: 8 }} />;

        let content = line;
        let isQuote = false;
        let isBullet = false;
        let headingLevel = 0;

        if (content.trim().startsWith('>')) {
          isQuote = true;
          content = content.replace(/^>\s*/, '');
        } else if (content.match(/^#{1,6}\s/)) {
          headingLevel = content.match(/^(#{1,6})\s/)[1].length;
          content = content.replace(/^#{1,6}\s/, '');
        } else if (content.match(/^[-*]\s/)) {
          isBullet = true;
          content = content.replace(/^[-*]\s/, '');
        } else if (content.match(/^\d+\.\s/)) {
          isBullet = true;
        } else if (content.trim() === '---') {
          return <View key={index} style={[styles.mdDivider, themeStyles.mdDivider]} />;
        }

        const formatInline = (str) => {
          const boldParts = str.split(/(\*\*.*?\*\*)/g);
          return boldParts.map((bPart, bIdx) => {
            if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 4) {
              return <Text key={`b_${bIdx}`} style={styles.mdBold}>{bPart.slice(2, -2)}</Text>;
            }
            const italicParts = bPart.split(/(\*.*?\*)/g);
            return italicParts.map((iPart, iIdx) => {
               if (iPart.startsWith('*') && iPart.endsWith('*') && iPart.length > 2) {
                  return <Text key={`i_${iIdx}`} style={styles.mdItalic}>{iPart.slice(1, -1)}</Text>;
               }
               return <Text key={`t_${iIdx}`}>{iPart}</Text>;
            });
          });
        };

        const formattedText = formatInline(content);

        if (headingLevel > 0) {
           const hStyles = [styles.mdHeading1, styles.mdHeading2, styles.mdHeading3, styles.mdHeading3, styles.mdHeading3, styles.mdHeading3];
           return <Text key={index} style={[baseStyle, styles.mdHeadingBase, hStyles[headingLevel - 1], themeStyles.mdHeading]}>{formattedText}</Text>;
        }
        
        if (isQuote) {
           return (
             <View key={index} style={[styles.mdQuoteBlock, themeStyles.mdQuoteBlock]}>
               <Text style={[baseStyle, styles.mdQuoteText, themeStyles.mdQuoteText]}>{formattedText}</Text>
             </View>
           );
        }

        if (isBullet) {
           return (
             <View key={index} style={styles.mdBulletRow}>
               {!content.match(/^\d+\.\s/) && <Text style={[baseStyle, styles.mdBulletPoint]}>•</Text>}
               <Text style={[baseStyle, styles.mdParagraph]}>{formattedText}</Text>
             </View>
           );
        }

        return (
           <Text key={index} style={[baseStyle, styles.mdParagraph]}>
             {formattedText}
           </Text>
        );
      })}
    </View>
  );
};

const TypewriterMessage = ({ text, onComplete, onType, style, isDarkMode }) => {
  const [displayedLength, setDisplayedLength] = useState(0);

  useEffect(() => {
    if (displayedLength < text.length) {
      const timer = setTimeout(() => {
        setDisplayedLength(prev => prev + 4);
        if (onType) onType(); // Força a rolagem a cada novo bloco de texto gerado
      }, 10);
      return () => clearTimeout(timer);
    } else {
      if (onComplete) onComplete();
    }
  }, [displayedLength, text, onComplete, onType]);

  return <MarkdownText text={text.substring(0, displayedLength)} baseStyle={style} isDarkMode={isDarkMode} />;
};

// ============================================================================
// COMPONENTE: BOLINHA FLUTUANTE ANIMADA COM BOTÃO DE EXCLUIR
// ============================================================================
const FloatingBubble = ({ item, index, isNewBtn, onPress, onDelete, disabled, isChatOpen, isDarkMode }) => {
  const themeStyles = isDarkMode ? darkStyles : lightStyles;
  
  const floatAnim = useRef(new Animated.Value(0)).current;
  const hoverScale = useRef(new Animated.Value(0)).current; 
  const enterExitAnim = useRef(new Animated.Value(isChatOpen ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(hoverScale, { toValue: 1, friction: 6, useNativeDriver: false }).start();
  }, []);

  useEffect(() => {
    if (isChatOpen) {
      Animated.timing(enterExitAnim, {
        toValue: 1, duration: 400, delay: index * 40, easing: Easing.out(Easing.back(1.5)), useNativeDriver: false
      }).start();
    } else {
      Animated.timing(enterExitAnim, {
        toValue: 0, duration: 250, delay: index * 20, easing: Easing.in(Easing.ease), useNativeDriver: false
      }).start();
    }
  }, [isChatOpen]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 1500 + (index * 200), easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1500 + (index * 200), easing: Easing.inOut(Easing.sin), useNativeDriver: false })
      ])
    ).start();
  }, []);

  const handleHoverIn = () => { Animated.spring(hoverScale, { toValue: 1.15, friction: 5, useNativeDriver: false }).start(); };
  const handleHoverOut = () => { Animated.spring(hoverScale, { toValue: 1, friction: 5, useNativeDriver: false }).start(); };

  const translateY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const enterTranslateY = enterExitAnim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] });
  const opacity = enterExitAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  const hoverProps = Platform.OS === 'web' ? { onMouseEnter: handleHoverIn, onMouseLeave: handleHoverOut } : { onPressIn: handleHoverIn, onPressOut: handleHoverOut };

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: enterTranslateY }, { translateY: translateY }, { scale: hoverScale }], marginBottom: 8, alignSelf: 'center' }}>
      <View style={{ position: 'relative' }}>
        <TouchableOpacity 
          style={[
            styles.sessionBubble, 
            themeStyles.sessionBubble, 
            isNewBtn && styles.newSessionBubble,
            isNewBtn && themeStyles.newSessionBubbleTheme,
            disabled && { opacity: 0.4 }
          ]}
          onPress={() => !disabled && onPress()}
          activeOpacity={0.8}
          disabled={disabled}
          {...hoverProps}
        >
          {isNewBtn ? (
            <Text style={[styles.newSessionPlus, themeStyles.newSessionPlus]}>+</Text>
          ) : (
            <Text style={[styles.sessionBubbleNumber, themeStyles.sessionBubbleNumber]}>
              {item.displayNumber}
            </Text>
          )}
        </TouchableOpacity>
        
        {/* Ícone de Deletar Discreto no topo esquerdo da bolinha */}
        {!isNewBtn && (
          <TouchableOpacity 
            style={styles.deleteBubbleBtn} 
            onPress={(e) => { 
              if (Platform.OS === 'web') {
                e.stopPropagation(); 
                e.preventDefault();
              }
              onDelete(); 
            }}
            activeOpacity={0.7}
          >
            <DeleteIcon />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

// ============================================================================
// TELA PRINCIPAL DO CHAT
// ============================================================================
export default function MentorChatScreen({ isDarkMode, isChatOpen, onAiThinking }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const initialGreeting = {
    id: '1',
    role: 'assistant',
    text: 'Você está conversando com o MentorIA de Vendas, comigo você encontra o caminho para bater suas metas, pergunte o que quiser, posso demorar um pouco nas respostas mas elas serão respondidas.',
    isTyping: false
  };

  const [messages, setMessages] = useState([initialGreeting]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [sessions, setSessions] = useState([]); 
  const [activeSessionId, setActiveSessionId] = useState(null); 
  const [loggedUserId, setLoggedUserId] = useState(null);

  const [expansion, setExpansion] = useState({ active: false, posY: 0 });
  const expandAnim = useRef(new Animated.Value(0)).current;

  // Estados do Modal de Exclusão
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);

  const flatListRef = useRef(null);

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  useEffect(() => {
    const fetchUserAndSessions = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const uid = session.user.id;
      setLoggedUserId(uid);

      const { data, error } = await supabase
        .from('mentor_chat_history')
        .select('session_id, role')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const validSessionIds = data.filter(msg => msg.role === 'user').map(item => item.session_id);
        const uniqueSessions = [...new Set(validSessionIds.filter(id => id != null))];
        // Limite alterado para 5 bolinhas
        setSessions(uniqueSessions.slice(0, 5));
      }
      
      startNewSession(); 
    };

    fetchUserAndSessions();
  }, []);

  const startNewSession = () => {
    const newId = generateUUID();
    setActiveSessionId(newId);
    setMessages([initialGreeting]);
  };

  const triggerExpansion = (indexOffset, callback) => {
    const startY = 40 + (indexOffset * 56); 
    setExpansion({ active: true, posY: startY });
    expandAnim.setValue(0);
    Animated.timing(expandAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: false }).start(() => {
      setExpansion({ active: false, posY: 0 });
    });
    setTimeout(callback, 300);
  };

  const handlePlusClick = () => {
    if (messages.length <= 1) return;
    triggerExpansion(0, () => startNewSession());
  };

  const handleBubbleClick = (sessionId, index) => {
    if (sessionId === activeSessionId) return;
    triggerExpansion(index + 1, () => loadSessionHistory(sessionId));
  };

  const loadSessionHistory = async (targetSessionId) => {
    if (!loggedUserId) return;
    setActiveSessionId(targetSessionId);
    setMessages([initialGreeting]); 
    
    const { data, error } = await supabase
      .from('mentor_chat_history')
      .select('*')
      .eq('user_id', loggedUserId)
      .eq('session_id', targetSessionId)
      .order('created_at', { ascending: true });

    if (!error && data && data.length > 0) {
      const historyMessages = data.map(msg => ({
        id: msg.id, role: msg.role, text: msg.message, isTyping: false
      }));
      setMessages([initialGreeting, ...historyMessages]);

      forceScrollRef.current = true;
      setTimeout(() => scrollToBottom(false), 10);
      setTimeout(() => { scrollToBottom(false); forceScrollRef.current = false; }, 150);
    }
  };

  // Funções de Exclusão da Sessão
  const handleDeleteRequest = (sessionId) => {
    setSessionToDelete(sessionId);
    setDeleteModalVisible(true);
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete || !loggedUserId) return;
    
    try {
      await supabase.from('mentor_chat_history').delete().eq('session_id', sessionToDelete);
      setSessions(prev => prev.filter(id => id !== sessionToDelete));
    } catch (error) {
      console.error("Erro ao excluir histórico: ", error);
    } finally {
      setDeleteModalVisible(false);
      setSessionToDelete(null);
    }
  };

  useEffect(() => { if (onAiThinking) onAiThinking(isLoading); }, [isLoading, onAiThinking]);

  useEffect(() => {
    if (isChatOpen) {
      forceScrollRef.current = true;
      setTimeout(() => scrollToBottom(false), 10);
      setTimeout(() => { scrollToBottom(false); forceScrollRef.current = false; }, 150);
    }
  }, [isChatOpen]);

  const [inputHeight, setInputHeight] = useState(36);
  const animatedHeight = useRef(new Animated.Value(36)).current;
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const inputTextRef = useRef(inputText);
  const silenceTimerRef = useRef(null);

  const [isMobileWeb, setIsMobileWeb] = useState(false);
  const isMobileBrowserRef = useRef(false);
  const forceScrollRef = useRef(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  useEffect(() => {
    if (Platform.OS === 'web') {
      const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobileWeb(mobileCheck);
      isMobileBrowserRef.current = mobileCheck;
    }
  }, []);

  const handleContentSizeChange = (event) => {
    if (!inputText) return;
    const contentHeight = Math.floor(event.nativeEvent.contentSize.height);
    const targetHeight = Math.min(Math.max(36, contentHeight), 140);
    if (targetHeight !== inputHeight) {
      setInputHeight(targetHeight);
      Animated.timing(animatedHeight, { toValue: targetHeight, duration: 150, useNativeDriver: false }).start(() => scrollToBottom(true));
    }
  };

  const scrollToBottom = (animated = true) => {
    if (flatListRef.current) flatListRef.current.scrollToEnd({ animated });
  };

  const toggleListening = () => {
    if (isListening) recognitionRef.current?.stop();
    else recognitionRef.current?.start();
  };

  useEffect(() => { inputTextRef.current = inputText; }, [inputText]);

  useEffect(() => {
    if (inputText === '') {
      setInputHeight(36);
      Animated.timing(animatedHeight, { toValue: 36, duration: 150, useNativeDriver: false }).start();
    }
  }, [inputText]);

  useEffect(() => {
    if (Platform.OS === 'web' && isMobileWeb) {
      const handleResize = () => {
        if (window.visualViewport) {
          const offset = window.innerHeight - window.visualViewport.height;
          setKeyboardOffset(offset > 50 ? offset : 0);
          setTimeout(() => { window.scrollTo(0, 0); document.body.scrollTop = 0; }, 10);
        }
      };
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleResize);
        window.visualViewport.addEventListener('scroll', handleResize);
        handleResize();
      }
      return () => {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleResize);
          window.visualViewport.removeEventListener('scroll', handleResize);
        }
      };
    }
  }, [isMobileWeb]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const styleId = 'custom-chat-scrollbar';
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      const mobileCSS = isMobileWeb ? `html, body, #root { background-color: ${isDarkMode ? '#0f172a' : '#f1f5f9'} !important; overscroll-behavior-y: none !important; }` : '';
      styleEl.innerHTML = `
        textarea::-webkit-scrollbar { width: 5px; height: 5px; }
        textarea::-webkit-scrollbar-track { background: transparent; }
        textarea::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.4); border-radius: 10px; }
        textarea::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.7); }
        textarea { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.4) transparent; }
        ${mobileCSS}
      `;
    }
  }, [isDarkMode, isMobileWeb]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        if (isMobileBrowserRef.current) { recognition.continuous = true; recognition.interimResults = false; } 
        else { recognition.continuous = true; recognition.interimResults = true; }
        recognition.lang = 'pt-BR';
        let startText = '';

        const resetSilenceTimer = () => {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          if (!isMobileBrowserRef.current) {
            silenceTimerRef.current = setTimeout(() => { if (recognitionRef.current) recognitionRef.current.stop(); }, 3000); 
          }
        };

        recognition.onstart = () => { setIsListening(true); startText = inputTextRef.current.trim(); resetSilenceTimer(); };
        recognition.onresult = (event) => {
          resetSilenceTimer(); 
          if (isMobileBrowserRef.current) {
             let currentVoice = '';
             for (let i = 0; i < event.results.length; ++i) currentVoice += event.results[i][0].transcript;
             const separator = (startText && currentVoice.trim()) ? ' ' : '';
             setInputText(startText + separator + currentVoice.trim());
          } else {
             let currentTranscript = '';
             for (let i = 0; i < event.results.length; ++i) currentTranscript += event.results[i][0].transcript;
             const newText = startText ? startText + ' ' + currentTranscript : currentTranscript;
             setInputText(newText);
          }
        };
        recognition.onerror = (e) => { setIsListening(false); if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); };
        recognition.onend = () => { setIsListening(false); if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); };
        recognitionRef.current = recognition;
      }
    }
    return () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); };
  }, []);

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    if (isListening) recognitionRef.current?.stop();

    const userText = inputText.trim();
    const newUserMessage = { id: Date.now().toString(), role: 'user', text: userText, isTyping: false };
    const thinkingMessage = { id: 'thinking_temp', role: 'assistant', isThinking: true };

    const currentMessages = [...messages, newUserMessage];
    setMessages([...currentMessages, thinkingMessage]);
    
    setInputText('');
    setIsLoading(true);
    
    forceScrollRef.current = true;
    setTimeout(() => { scrollToBottom(true); forceScrollRef.current = false; }, 50);

    let loggedUserId = null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        loggedUserId = session.user.id;
        
        // A INTELIGÊNCIA: Se for a primeira mensagem, a bolinha é oficializada com o limite ajustado para 5
        if (messages.length === 1) {
          setSessions(prev => [activeSessionId, ...prev].slice(0, 5));
        }

        await supabase.from('mentor_chat_history').insert([
          { user_id: loggedUserId, session_id: activeSessionId, role: 'user', message: userText }
        ]);
      }
    } catch (e) {}

    try {
      const recentMessages = currentMessages.slice(-8); 
      const historyForAPI = recentMessages.map(msg => ({ role: msg.role === 'assistant' ? 'model' : 'user', text: msg.text }));

      const response = await fetch('https://backend-ia-569310383004.southamerica-east1.run.app/chat-mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: historyForAPI, user_id: loggedUserId })
      });

      const data = await response.json().catch(() => ({}));
      const errorMsg = (data.error || '').toString().toUpperCase();
      const isHighDemand = response.status === 503 || response.status === 429 || errorMsg.includes('ALTA_DEMANDA') || errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE') || errorMsg.includes('HIGH DEMAND');

      if (!response.ok) {
        if (isHighDemand) throw new Error('ALTA_DEMANDA');
        throw new Error(data.error || 'Falha na resposta do servidor');
      }
      
      const aiReplyText = data.reply;
      const aiMessage = { id: Date.now().toString(), role: 'assistant', text: aiReplyText, isTyping: true };

      setMessages(prev => prev.filter(m => m.id !== 'thinking_temp').concat(aiMessage));
      
      forceScrollRef.current = true;
      setTimeout(() => { scrollToBottom(true); forceScrollRef.current = false; }, 50);

      try {
        if (loggedUserId && activeSessionId) {
          await supabase.from('mentor_chat_history').insert([
            { user_id: loggedUserId, session_id: activeSessionId, role: 'assistant', message: aiReplyText }
          ]);
          
          const { data: userSessions } = await supabase.from('mentor_chat_history').select('session_id').eq('user_id', loggedUserId).order('created_at', { ascending: false });

          if (userSessions) {
            const uniqueSessionsForDelete = [...new Set(userSessions.map(item => item.session_id).filter(id => id != null))];
            // EXCLUSÃO EM CASCATA COM LIMITE DE 5
            if (uniqueSessionsForDelete.length > 5) {
              const sessionsToDelete = uniqueSessionsForDelete.slice(5); 
              for (const oldSessionId of sessionsToDelete) {
                await supabase.from('mentor_chat_history').delete().eq('session_id', oldSessionId);
              }
            }
          }
        }
      } catch (e) {}

    } catch (error) {
      let errorText = 'Desculpe, tive um problema de conexão com o servidor.';
      if (error.message === 'ALTA_DEMANDA') {
        errorText = 'Estou atendendo muitos vendedores neste exato segundo e a rede da inteligência artificial está com alta demanda! 🥵 Pode mandar sua pergunta de novo em alguns instantes?';
      }
      const errorMessage = { id: Date.now().toString(), role: 'assistant', text: errorText, isTyping: true };
      setMessages(prev => prev.filter(m => m.id !== 'thinking_temp').concat(errorMessage));
      
      forceScrollRef.current = true;
      setTimeout(() => { scrollToBottom(true); forceScrollRef.current = false; }, 50);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    const isThinking = item.isThinking;

    if (item.id === '1') {
      return (
        <View style={[styles.messageRow, styles.aiRow]}>
          <View style={[styles.messageBubble, styles.aiBubble, themeStyles.aiBubble]}>
            <Text style={[styles.messageText, themeStyles.aiMessageText]}>{item.text}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.aiRow]}>
        <View style={[styles.messageBubble, isUser ? styles.userBubble : [styles.aiBubble, themeStyles.aiBubble]]}>
          {isThinking ? (
            <TypingIndicator isDarkMode={isDarkMode} />
          ) : isUser ? (
            <Text style={[styles.messageText, styles.userMessageText]}>{item.text}</Text>
          ) : item.isTyping ? (
            <TypewriterMessage 
              text={item.text} 
              isDarkMode={isDarkMode} 
              style={[styles.messageText, themeStyles.aiMessageText]} 
              onComplete={() => item.isTyping = false} 
              onType={() => scrollToBottom(false)} // Rola a lista instantaneamente sem engasgos
            />
          ) : (
            <MarkdownText text={item.text} baseStyle={[styles.messageText, themeStyles.aiMessageText]} isDarkMode={isDarkMode} />
          )}
        </View>
      </View>
    );
  };

  const historicalSessions = sessions.filter(id => id !== activeSessionId);

  return (
    <KeyboardAvoidingView 
      style={[styles.container, themeStyles.container, isMobileWeb && keyboardOffset > 0 ? { paddingBottom: keyboardOffset } : {}]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={!isMobileWeb}
    >
      <View style={styles.mainLayout}>
        
        {/* SIDEBAR FLUTUANTE UNIFICADA */}
        <View style={styles.floatingSidebar} pointerEvents="box-none">
          <View pointerEvents="auto" style={styles.bubblesListWrapper}>
            <FlatList
              data={historicalSessions}
              keyExtractor={item => item}
              showsVerticalScrollIndicator={false}
              // Os paddings extras evitam que o + corte em cima e que a última bolinha corte embaixo
              contentContainerStyle={{ alignItems: 'center', paddingTop: 16, paddingBottom: 80 }}
              ListHeaderComponent={
                <FloatingBubble 
                  isNewBtn 
                  index={0} 
                  isChatOpen={isChatOpen} 
                  isDarkMode={isDarkMode}
                  onPress={handlePlusClick}
                  disabled={messages.length <= 1} 
                />
              }
              renderItem={({ item, index }) => {
                const displayNumber = sessions.length - sessions.indexOf(item);
                return (
                  <FloatingBubble 
                    item={{ id: item, displayNumber }} 
                    index={index + 1} 
                    isChatOpen={isChatOpen} 
                    isDarkMode={isDarkMode}
                    onPress={() => handleBubbleClick(item, index)}
                    onDelete={() => handleDeleteRequest(item)}
                  />
                );
              }}
            />
          </View>
        </View>

        {/* OVERLAY DE EXPANSÃO INFINITA */}
        {expansion.active && (
          <Animated.View style={[
            styles.expansionOverlay,
            { backgroundColor: isDarkMode ? '#1e293b' : '#2563eb' },
            {
              top: expansion.posY,
              transform: [{ scale: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 120] }) }],
              opacity: expandAnim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] })
            }
          ]} pointerEvents="none" />
        )}

        <View style={styles.contentWrapper}>
          <FlatList
            ref={flatListRef}
            data={messages}
            style={{ flex: 1 }} 
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={[styles.chatListContent, isMobile && styles.chatListContentMobile]}
            initialNumToRender={50}
            onContentSizeChange={() => { if (forceScrollRef.current) scrollToBottom(true); }}
            onLayout={() => { if (forceScrollRef.current) scrollToBottom(false); }}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.floatingInputWrapper}>
            <View style={[styles.inputContainer, themeStyles.inputContainer]}>
              <AnimatedTextInput
                style={[styles.input, themeStyles.input, { height: animatedHeight, overflow: inputHeight >= 140 ? 'auto' : 'hidden' }]}
                value={inputText}
                onChangeText={setInputText}
                onContentSizeChange={handleContentSizeChange}
                onFocus={() => {
                  if (isMobileWeb) { setTimeout(() => { window.scrollTo(0, 0); document.body.scrollTop = 0; }, 50); }
                  forceScrollRef.current = true;
                  setTimeout(() => { scrollToBottom(true); forceScrollRef.current = false; }, 300); 
                }}
                placeholder={isListening ? "Ouvindo... Fale agora." : "Pergunte sobre lances, objeções..."}
                placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                multiline
                onKeyPress={handleKeyPress}
                maxLength={2500}
              />
              
              {Platform.OS === 'web' && (
                <TouchableOpacity style={styles.micButton} onPress={toggleListening} activeOpacity={0.7}>
                  <MicIcon isListening={isListening} color={isDarkMode ? '#94a3b8' : '#64748b'} />
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={[styles.sendButtonVector, (!inputText.trim() && !isLoading) && styles.sendButtonDisabled]} 
                onPress={sendMessage}
                disabled={isLoading || !inputText.trim()}
                activeOpacity={0.8}
              >
                <SendIcon />
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.disclaimerText, themeStyles.disclaimerText]}>
              O MentorIA é uma IA e pode cometer erros
            </Text>
          </View>
        </View>
      </View>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DA CONVERSA */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.deleteModalContent, themeStyles.deleteModalContent]}>
            <Text style={[styles.deleteModalTitle, themeStyles.deleteModalTitle]}>Excluir Conversa</Text>
            <Text style={[styles.deleteModalText, themeStyles.deleteModalText]}>
              Tem certeza que deseja apagar permanentemente o histórico desta conversa?
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteModalVisible(false)} activeOpacity={0.7}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteBtn} onPress={confirmDeleteSession} activeOpacity={0.7}>
                <Text style={styles.confirmDeleteBtnText}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  mainLayout: { flex: 1, position: 'relative' },
  contentWrapper: { flex: 1, width: '100%', alignSelf: 'center' },
  
  floatingSidebar: { position: 'absolute', left: 4, top: 30, bottom: 90, width: 76, zIndex: 100, overflow: 'visible' },
  bubblesListWrapper: { 
    flex: 1, 
    width: '100%', 
    overflow: 'visible',
    ...Platform.select({
      web: {
        maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)'
      }
    })
  }, 
  sessionBubble: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, justifyContent: 'center', alignItems: 'center', overflow: 'visible', ...Platform.select({ web: { cursor: 'pointer', boxShadow: '0px 4px 10px rgba(0,0,0,0.1)' } }) },
  newSessionBubble: { borderStyle: 'dashed', backgroundColor: 'transparent', borderWidth: 2 },
  newSessionPlus: { fontSize: 26, fontWeight: '400', textAlign: 'center', marginTop: -2 },
  sessionBubbleNumber: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '800' },

  // Botão de excluir bolinha
  deleteBubbleBtn: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#073a75',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...Platform.select({ web: { cursor: 'pointer' } })
  },

  expansionOverlay: { position: 'absolute', left: 30, width: 20, height: 20, borderRadius: 10, zIndex: 90 },

  // MARGENS INTERNAS ATUALIZADAS (PADDING REDUZIDO PARA BALÕES OCUPAREM MAIS ESPAÇO)
  chatListContent: { padding: 16, paddingLeft: 74, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' },
  chatListContentMobile: { padding: 12, paddingLeft: 76, paddingBottom: 8 },
  
  // MARGEM ENTRE BALÕES REDUZIDA DE 24 PARA 12
  messageRow: { flexDirection: 'row', marginBottom: 12, width: '100%', alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  aiRow: { justifyContent: 'flex-start' },
  
  // BALÕES COM MAXWIDTH ESTICADO PARA 95% E PADDINGS INTERNOS MAIS COMPACTOS
  messageBubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, flexShrink: 1, maxWidth: '95%' },
  userBubble: { backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  aiBubble: { borderBottomLeftRadius: 4, borderWidth: 1, ...Platform.select({ web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.04)' } }) },
  
  markdownWrapper: { flexShrink: 1, flexDirection: 'column' },
  
  // FONTE REDUZIDA (13.5) E LINHAS MAIS APROXIMADAS (LINEHEIGHT 19)
  messageText: { fontFamily: MODERN_FONT, fontSize: 13.5, lineHeight: 19 },
  userMessageText: { color: '#ffffff' },
  
  // MARGEM REDUZIDA ENTRE PARÁGRAFOS DO TEXTO 
  mdParagraph: { marginBottom: 4, flexShrink: 1 },
  mdBold: { fontWeight: '900' },
  mdItalic: { fontStyle: 'italic' },
  mdHeadingBase: { fontWeight: '900', letterSpacing: -0.3, marginTop: 8, marginBottom: 4 },
  mdHeading1: { fontSize: 20 },
  mdHeading2: { fontSize: 18 },
  mdHeading3: { fontSize: 16 },
  mdQuoteBlock: { borderLeftWidth: 4, paddingLeft: 12, paddingVertical: 4, marginVertical: 8, borderRadius: 2 },
  mdQuoteText: { fontStyle: 'italic', fontSize: 14 },
  mdBulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  mdBulletPoint: { fontSize: 16, marginRight: 8, marginTop: -2 },
  mdDivider: { height: 1, marginVertical: 8, width: '100%', opacity: 0.5 },

  typingIndicatorWrapper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 24, width: 40, gap: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3 },
  
  floatingInputWrapper: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, backgroundColor: 'transparent' },
  
  inputContainer: { 
    flexDirection: 'row', padding: 6, paddingLeft: 16, borderRadius: 24, alignItems: 'flex-end', borderWidth: 1, 
    ...Platform.select({ web: { boxShadow: '0px -4px 20px rgba(0,0,0,0.05)' } }) 
  },
  input: { flex: 1, paddingTop: 8, paddingBottom: 8, fontSize: 14, fontFamily: MODERN_FONT, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  
  micButton: { height: 36, width: 36, justifyContent: 'center', alignItems: 'center', marginRight: 2 },
  sendButtonVector: { backgroundColor: '#2563eb', height: 36, width: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  sendButtonDisabled: { opacity: 0.5 },
  disclaimerText: { textAlign: 'center', fontSize: 10, marginTop: 6, fontStyle: 'italic', fontFamily: MODERN_FONT },

  // Estilos do Modal de Exclusão
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  deleteModalContent: { width: 320, padding: 24, borderRadius: 12, ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(0,0,0,0.2)' } }) },
  deleteModalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, fontFamily: MODERN_FONT },
  deleteModalText: { fontSize: 14, marginBottom: 24, fontFamily: MODERN_FONT, lineHeight: 20 },
  deleteModalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, backgroundColor: '#e2e8f0' },
  cancelBtnText: { color: '#475569', fontWeight: 'bold', fontFamily: MODERN_FONT },
  confirmDeleteBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, backgroundColor: '#ef4444' },
  confirmDeleteBtnText: { color: '#ffffff', fontWeight: 'bold', fontFamily: MODERN_FONT }
});

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#f1f5f9' },
  sessionBubble: { backgroundColor: '#ffffff', borderColor: '#cbd5e1' },
  sessionBubbleNumber: { color: '#475569' },
  newSessionBubbleTheme: { borderColor: '#2563eb' },
  newSessionPlus: { color: '#2563eb' },

  aiBubble: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  aiMessageText: { color: '#1e293b' },
  mdHeading: { color: '#0f172a' },
  mdQuoteBlock: { borderLeftColor: '#94a3b8', backgroundColor: '#f8fafc' },
  mdQuoteText: { color: '#475569' },
  mdDivider: { backgroundColor: '#cbd5e1' },
  
  inputContainer: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  input: { color: '#0f172a' },
  disclaimerText: { color: '#94a3b8' },

  deleteModalContent: { backgroundColor: '#ffffff' },
  deleteModalTitle: { color: '#0f172a' },
  deleteModalText: { color: '#475569' }
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#0f172a' },
  sessionBubble: { backgroundColor: '#1e293b', borderColor: '#475569' },
  sessionBubbleNumber: { color: '#cbd5e1' },
  newSessionBubbleTheme: { borderColor: '#3b82f6' },
  newSessionPlus: { color: '#3b82f6' },

  aiBubble: { backgroundColor: '#1e293b', borderColor: '#334155' },
  aiMessageText: { color: '#e2e8f0' },
  mdHeading: { color: '#f8fafc' },
  mdQuoteBlock: { borderLeftColor: '#475569', backgroundColor: '#0f172a' },
  mdQuoteText: { color: '#cbd5e1' },
  mdDivider: { backgroundColor: '#334155' },
  
  inputContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  input: { color: '#f8fafc' },
  disclaimerText: { color: '#64748b' },

  deleteModalContent: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  deleteModalTitle: { color: '#f8fafc' },
  deleteModalText: { color: '#94a3b8' }
});