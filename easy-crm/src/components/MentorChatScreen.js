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
  ActivityIndicator,
  useWindowDimensions,
  Animated
} from 'react-native';
import { supabase } from '../services/supabaseClient'; 

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

// Transforma o TextInput em um componente capaz de sofrer animações fluidas
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// ============================================================================
// ÍCONES VETORIAIS (SVG) DE ALTA PRECISÃO
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

// ============================================================================
// COMPONENTE: Avatar Vetorial Elegante da IA
// ============================================================================
const ElegantAIAvatar = ({ isDarkMode }) => {
  const themeStyles = isDarkMode ? darkStyles : lightStyles;
  return (
    <View style={[styles.avatarContainer, themeStyles.avatarContainer]}>
      <View style={[styles.avatarOuterRing, themeStyles.avatarOuterRing]} />
      <View style={[styles.avatarInnerDiamond, themeStyles.avatarInnerDiamond]} />
      <View style={[styles.avatarCore, themeStyles.avatarCore]} />
    </View>
  );
};

// ============================================================================
// COMPONENTE: Animação "Pensando..." 
// ============================================================================
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

// ============================================================================
// COMPONENTE: Processador de Markdown Customizado
// ============================================================================
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

// ============================================================================
// COMPONENTE: Efeito Máquina de Escrever
// ============================================================================
const TypewriterMessage = ({ text, onComplete, style, isDarkMode }) => {
  const [displayedLength, setDisplayedLength] = useState(0);

  useEffect(() => {
    if (displayedLength < text.length) {
      const timer = setTimeout(() => {
        setDisplayedLength(prev => prev + 4);
      }, 10);
      return () => clearTimeout(timer);
    } else {
      if (onComplete) onComplete();
    }
  }, [displayedLength, text, onComplete]);

  return <MarkdownText text={text.substring(0, displayedLength)} baseStyle={style} isDarkMode={isDarkMode} />;
};

// ============================================================================
// TELA PRINCIPAL DO CHAT
// ============================================================================
export default function MentorChatScreen({ isDarkMode }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant',
      text: 'Você está conversando com o MentorIA de Vendas, comigo você encontra o caminho para bater suas metas, pergunte o que quiser, posso demorar um pouco nas respostas mas elas serão respondidas.',
      isTyping: false
    }
  ]);
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef(null);

  // Estados Dinâmicos para a Caixa de Texto Animada
  const [inputHeight, setInputHeight] = useState(36);
  const animatedHeight = useRef(new Animated.Value(36)).current;
  
  // Estados para o Sistema de Voz e Timer
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const inputTextRef = useRef(inputText);
  const silenceTimerRef = useRef(null);

  // BARREIRA DE ISOLAMENTO: Celular Web vs Desktop PC
  const [isMobileWeb, setIsMobileWeb] = useState(false);
  const isMobileBrowserRef = useRef(false);

  // Trava para o Scroll Automático (Garante fluidez sem travar o touch do usuário)
  const forceScrollRef = useRef(false);

  // Controle de deslocamento dinâmico para o teclado no Celular
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  // Montagem da Barreira de Isolamento Logo na Inicialização
  useEffect(() => {
    if (Platform.OS === 'web') {
      const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobileWeb(mobileCheck);
      isMobileBrowserRef.current = mobileCheck;
    }
  }, []);

  // Função Global para Tratar o Tamanho da Caixa de Digitação
  const handleContentSizeChange = (event) => {
    if (!inputText) return; // Se vazio, deixa o useEffect forçar o reset

    const contentHeight = Math.floor(event.nativeEvent.contentSize.height);
    const targetHeight = Math.min(Math.max(36, contentHeight), 140); // Limite máximo fluído em 140px

    if (targetHeight !== inputHeight) {
      setInputHeight(targetHeight);
      Animated.timing(animatedHeight, {
        toValue: targetHeight,
        duration: 150,
        useNativeDriver: false
      }).start(() => scrollToBottom(true));
    }
  };

  const scrollToBottom = (animated = true) => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated });
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  // Mantém a referência do texto sempre atualizada
  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  // Espião que reseta a altura da caixa caso o usuário apague todo o texto no backspace
  useEffect(() => {
    if (inputText === '') {
      setInputHeight(36);
      Animated.timing(animatedHeight, {
        toValue: 36,
        duration: 150,
        useNativeDriver: false
      }).start();
    }
  }, [inputText]);

  // Motor Adaptativo Exclusivo Mobile Web (Anula o Gap do Android)
  useEffect(() => {
    if (Platform.OS === 'web' && isMobileWeb) {
      const handleResize = () => {
        if (window.visualViewport) {
          // Calcula a diferença real gerada pelo teclado
          const offset = window.innerHeight - window.visualViewport.height;
          // Adiciona margem na base apenas se a diferença for significativa (>50px)
          setKeyboardOffset(offset > 50 ? offset : 0);
          
          // O pulo do gato: Força a tela de volta pro topo, matando a subida da área branca (scroll fantasma)
          setTimeout(() => {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
          }, 10);
        }
      };

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleResize);
        window.visualViewport.addEventListener('scroll', handleResize); // Protege contra scroll
        handleResize(); // Dispara na hora
      }

      return () => {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleResize);
          window.visualViewport.removeEventListener('scroll', handleResize);
        }
      };
    }
  }, [isMobileWeb]);

  // Injeção de CSS Dinâmico (Scrollbar e Prevenção do fundo offset do teclado)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const styleId = 'custom-chat-scrollbar';
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      
      const mobileCSS = isMobileWeb ? `
        /* Bloqueia o empurrão do body no Android Chrome APENAS NO CELULAR */
        html, body, #root {
          background-color: ${isDarkMode ? '#0f172a' : '#f1f5f9'} !important;
          overscroll-behavior-y: none !important;
        }
      ` : '';

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

  // Inicializa o Sistema Nativo de Voz e Estilos Globais
  useEffect(() => {
    if (Platform.OS === 'web') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();

        // ISOLAMENTO DE SISTEMAS
        if (isMobileBrowserRef.current) {
           // Celular: Não mostra resultados parciais (evita repetição em eco do Android)
           recognition.continuous = true; 
           recognition.interimResults = false; 
        } else {
           // PC: Mostra digitação em tempo real (Opção original perfeita para PC)
           recognition.continuous = true; 
           recognition.interimResults = true; 
        }
        
        recognition.lang = 'pt-BR';

        let startText = '';

        const resetSilenceTimer = () => {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          
          // No Celular, desativamos o timer de silêncio para ele não cortar você no meio da frase.
          // No PC, mantemos o timer original que funciona perfeito.
          if (!isMobileBrowserRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              if (recognitionRef.current) {
                recognitionRef.current.stop(); 
              }
            }, 3000); 
          }
        };

        recognition.onstart = () => {
          setIsListening(true);
          startText = inputTextRef.current.trim();
          resetSilenceTimer(); 
        };

        recognition.onresult = (event) => {
          resetSilenceTimer(); 
          
          if (isMobileBrowserRef.current) {
             // LÓGICA DE CELULAR: 
             // Pega o texto e envia, não lê interimResults, impossibilitando eco/gagueira
             let currentVoice = '';
             for (let i = 0; i < event.results.length; ++i) {
               currentVoice += event.results[i][0].transcript;
             }
             const separator = (startText && currentVoice.trim()) ? ' ' : '';
             setInputText(startText + separator + currentVoice.trim());
          } else {
             // LÓGICA DE PC:
             // Exatamente a lógica original que funciona sem falhas no Edge/Chrome Desktop
             let currentTranscript = '';
             for (let i = 0; i < event.results.length; ++i) {
               currentTranscript += event.results[i][0].transcript;
             }
             const newText = startText ? startText + ' ' + currentTranscript : currentTranscript;
             setInputText(newText);
          }
        };

        recognition.onerror = (e) => {
          console.log("Speech recognition error:", e.error);
          setIsListening(false);
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };

        recognition.onend = () => {
          setIsListening(false);
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // Carrega o histórico do banco de dados ao iniciar com SCROLL FORÇADO NA INICIALIZAÇÃO
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { data, error } = await supabase
          .from('mentor_chat_history')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true });

        if (data && data.length > 0) {
          const historyMessages = data.map(msg => ({
            id: msg.id,
            role: msg.role,
            text: msg.message,
            isTyping: false
          }));
          setMessages(historyMessages);

          // Puxa o scroll para baixo sem animação de forma forçada logo na carga
          // O initialNumToRender ajuda a não travar no meio
          forceScrollRef.current = true;
          setTimeout(() => scrollToBottom(false), 50);
          setTimeout(() => scrollToBottom(false), 200);
          setTimeout(() => {
            scrollToBottom(false);
            forceScrollRef.current = false; // Solta a trava para o usuário
          }, 600);
        }
      } catch (error) {
        console.error("Erro ao carregar histórico:", error);
      }
    };
    loadHistory();
  }, []);

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    
    if (isListening) {
      recognitionRef.current?.stop();
    }

    const userText = inputText.trim();
    const newUserMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
      isTyping: false
    };

    const thinkingMessage = {
      id: 'thinking_temp',
      role: 'assistant',
      isThinking: true
    };

    const currentMessages = [...messages, newUserMessage];
    setMessages([...currentMessages, thinkingMessage]);
    
    // Retorna a caixa de texto fluidamente ao tamanho original ao enviar a mensagem
    setInputText('');
    
    setIsLoading(true);
    
    // Auto-Scroll garantido no envio
    forceScrollRef.current = true;
    setTimeout(() => {
      scrollToBottom(true);
      forceScrollRef.current = false;
    }, 50);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase.from('mentor_chat_history').insert([
          { user_id: session.user.id, role: 'user', message: userText }
        ]);
      }
    } catch (e) {
      console.error("Erro ao salvar mensagem do usuário:", e);
    }

    try {
      const historyForAPI = currentMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        text: msg.text
      }));

      const response = await fetch('https://mentor-ia-crm.onrender.com/chat-mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: historyForAPI })
      });

      const data = await response.json().catch(() => ({}));
      
      const errorMsg = (data.error || '').toString().toUpperCase();
      const isHighDemand = response.status === 503 || response.status === 429 || errorMsg.includes('ALTA_DEMANDA') || errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE') || errorMsg.includes('HIGH DEMAND');

      if (!response.ok) {
        if (isHighDemand) throw new Error('ALTA_DEMANDA');
        throw new Error(data.error || 'Falha na resposta do servidor');
      }
      
      const aiReplyText = data.reply;
      
      const aiMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        text: aiReplyText,
        isTyping: true 
      };

      setMessages(prev => prev.filter(m => m.id !== 'thinking_temp').concat(aiMessage));
      
      // Auto-Scroll garantido no recebimento
      forceScrollRef.current = true;
      setTimeout(() => {
        scrollToBottom(true);
        forceScrollRef.current = false;
      }, 50);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await supabase.from('mentor_chat_history').insert([
            { user_id: session.user.id, role: 'assistant', message: aiReplyText }
          ]);
        }
      } catch (e) {
        console.error("Erro ao salvar resposta da IA:", e);
      }

    } catch (error) {
      console.error("Erro no chat:", error);
      
      let errorText = 'Desculpe, tive um problema de conexão com o servidor.';
      if (error.message === 'ALTA_DEMANDA') {
        errorText = 'Estou atendendo muitos vendedores neste exato segundo e a rede da inteligência artificial está com alta demanda! 🥵 Pode mandar sua pergunta de novo em alguns instantes?';
      }

      const errorMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        text: errorText,
        isTyping: true
      };
      
      setMessages(prev => prev.filter(m => m.id !== 'thinking_temp').concat(errorMessage));
      
      forceScrollRef.current = true;
      setTimeout(() => {
        scrollToBottom(true);
        forceScrollRef.current = false;
      }, 50);
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

    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.aiRow]}>
        {!isUser && <ElegantAIAvatar isDarkMode={isDarkMode} />}
        
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
            />
          ) : (
            <MarkdownText text={item.text} baseStyle={[styles.messageText, themeStyles.aiMessageText]} isDarkMode={isDarkMode} />
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={[
        styles.container, 
        themeStyles.container,
        // ISOLAMENTO: Aplica offset dinâmico apenas se for celular, deixando a UI do PC intocável sem recortes
        isMobileWeb && keyboardOffset > 0 ? { paddingBottom: keyboardOffset } : {}
      ]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // No celular web desativa a lógica nativa defeituosa para não brigar com nossa trava customizada
      enabled={!isMobileWeb}
    >
      <View style={styles.contentWrapper}>
        
        <FlatList
          ref={flatListRef}
          data={messages}
          style={{ flex: 1 }} 
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.chatListContent, isMobile && styles.chatListContentMobile]}
          // InitialNumToRender impede o chat de travar no meio em históricos grandes
          initialNumToRender={50}
          // O Auto-scroll do chat só é ativado de forma impositiva quando a trava forceScrollRef está True (inicialização ou nova msg)
          onContentSizeChange={() => { if (forceScrollRef.current) scrollToBottom(true); }}
          onLayout={() => { if (forceScrollRef.current) scrollToBottom(false); }}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.floatingInputWrapper}>
          <View style={[styles.inputContainer, themeStyles.inputContainer]}>
            
            <AnimatedTextInput
              style={[
                styles.input, 
                themeStyles.input, 
                { 
                  height: animatedHeight,
                  overflow: inputHeight >= 140 ? 'auto' : 'hidden' 
                }
              ]}
              value={inputText}
              onChangeText={setInputText}
              onContentSizeChange={handleContentSizeChange}
              // Ao clicar na caixa, cancela a sobra do navegador (Apenas no Mobile) e puxa o chat para a última mensagem
              onFocus={() => {
                if (isMobileWeb) {
                  setTimeout(() => {
                    window.scrollTo(0, 0);
                    document.body.scrollTop = 0;
                  }, 50);
                }
                forceScrollRef.current = true;
                setTimeout(() => {
                  scrollToBottom(true);
                  forceScrollRef.current = false;
                }, 300); 
              }}
              placeholder={isListening ? "Ouvindo... Fale agora." : "Pergunte sobre lances, objeções..."}
              placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
              multiline
              onKeyPress={handleKeyPress}
              maxLength={2500}
            />
            
            {Platform.OS === 'web' && (
              <TouchableOpacity 
                style={styles.micButton} 
                onPress={toggleListening}
                activeOpacity={0.7}
              >
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
          
          {/* Disclaimer de IA super discreto abaixo do input */}
          <Text style={[styles.disclaimerText, themeStyles.disclaimerText]}>
            O MentorIA é uma IA e pode cometer erros
          </Text>

        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentWrapper: { flex: 1, width: '100%', alignSelf: 'center' },
  
  chatListContent: { padding: 24, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' },
  chatListContentMobile: { padding: 16, paddingBottom: 8 },
  
  messageRow: { flexDirection: 'row', marginBottom: 24, width: '100%', alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  aiRow: { justifyContent: 'flex-start' },
  
  avatarContainer: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, position: 'relative' },
  avatarOuterRing: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1, opacity: 0.5 },
  avatarInnerDiamond: { position: 'absolute', width: 12, height: 12, borderWidth: 2, transform: [{ rotate: '45deg' }] },
  avatarCore: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
  
  messageBubble: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 24, flexShrink: 1, maxWidth: '88%' },
  userBubble: { backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  aiBubble: { borderBottomLeftRadius: 4, borderWidth: 1, ...Platform.select({ web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.04)' } }) },
  
  markdownWrapper: { flexShrink: 1, flexDirection: 'column' },
  messageText: { fontFamily: MODERN_FONT, fontSize: 14.5, lineHeight: 22 },
  userMessageText: { color: '#ffffff' },
  mdParagraph: { marginBottom: 6, flexShrink: 1 },
  mdBold: { fontWeight: '900' },
  mdItalic: { fontStyle: 'italic' },
  mdHeadingBase: { fontWeight: '900', letterSpacing: -0.3, marginTop: 12, marginBottom: 8 },
  mdHeading1: { fontSize: 20 },
  mdHeading2: { fontSize: 18 },
  mdHeading3: { fontSize: 16 },
  mdQuoteBlock: { borderLeftWidth: 4, paddingLeft: 12, paddingVertical: 4, marginVertical: 8, borderRadius: 2 },
  mdQuoteText: { fontStyle: 'italic', fontSize: 14 },
  mdBulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  mdBulletPoint: { fontSize: 16, marginRight: 8, marginTop: -2 },
  mdDivider: { height: 1, marginVertical: 12, width: '100%', opacity: 0.5 },

  typingIndicatorWrapper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 24, width: 40, gap: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3 },
  
  floatingInputWrapper: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, backgroundColor: 'transparent' },
  
  inputContainer: { 
    flexDirection: 'row', 
    padding: 6, 
    paddingLeft: 16, 
    borderRadius: 24, 
    alignItems: 'flex-end',
    borderWidth: 1, 
    ...Platform.select({ web: { boxShadow: '0px -4px 20px rgba(0,0,0,0.05)' } }) 
  },
  input: { 
    flex: 1, 
    paddingTop: 8, 
    paddingBottom: 8, 
    fontSize: 14, 
    fontFamily: MODERN_FONT, 
    ...Platform.select({ web: { outlineStyle: 'none' } }) 
  },
  
  micButton: { 
    height: 36, 
    width: 36, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 2 
  },
  sendButtonVector: { 
    backgroundColor: '#2563eb', 
    height: 36, 
    width: 36, 
    borderRadius: 18, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginLeft: 4 
  },
  sendButtonDisabled: { opacity: 0.5 },

  disclaimerText: {
    textAlign: 'center',
    fontSize: 10,
    marginTop: 6,
    fontStyle: 'italic',
    fontFamily: MODERN_FONT,
  }
});

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#f1f5f9' },
  
  avatarContainer: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  avatarOuterRing: { borderColor: '#3b82f6' },
  avatarInnerDiamond: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  avatarCore: { backgroundColor: '#1d4ed8' },

  aiBubble: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  aiMessageText: { color: '#1e293b' },
  mdHeading: { color: '#0f172a' },
  mdQuoteBlock: { borderLeftColor: '#94a3b8', backgroundColor: '#f8fafc' },
  mdQuoteText: { color: '#475569' },
  mdDivider: { backgroundColor: '#cbd5e1' },
  
  inputContainer: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  input: { color: '#0f172a' },
  
  disclaimerText: { color: '#94a3b8' }
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#0f172a' },
  
  avatarContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  avatarOuterRing: { borderColor: '#60a5fa' },
  avatarInnerDiamond: { borderColor: '#3b82f6', backgroundColor: '#172554' },
  avatarCore: { backgroundColor: '#bfdbfe' },

  aiBubble: { backgroundColor: '#1e293b', borderColor: '#334155' },
  aiMessageText: { color: '#e2e8f0' },
  mdHeading: { color: '#f8fafc' },
  mdQuoteBlock: { borderLeftColor: '#475569', backgroundColor: '#0f172a' },
  mdQuoteText: { color: '#cbd5e1' },
  mdDivider: { backgroundColor: '#334155' },
  
  inputContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  input: { color: '#f8fafc' },

  disclaimerText: { color: '#64748b' }
});