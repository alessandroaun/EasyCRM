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

// ============================================================================
// COMPONENTE: Avatar Vetorial Elegante da IA (Design Geométrico/Sofisticado)
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
// COMPONENTE: Animação "Pensando..." (3 Pontinhos fluídos)
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

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  // Função centralizada e ajustável para rolagem
  const scrollToBottom = (animated = true) => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated });
    }
  };

  // Carrega o histórico do banco de dados ao iniciar
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

          // Força o scroll imediato e sem animação assim que os dados entram na tela
          setTimeout(() => scrollToBottom(false), 50);
          setTimeout(() => scrollToBottom(false), 300);
        }
      } catch (error) {
        console.error("Erro ao carregar histórico:", error);
      }
    };
    loadHistory();
  }, []);

  const sendMessage = async () => {
    if (!inputText.trim()) return;

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
    setInputText('');
    setIsLoading(true);
    
    // Rola suavemente ao enviar mensagem
    setTimeout(() => scrollToBottom(true), 50);

    // Salva a mensagem do usuário no Supabase
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

      // Salva a resposta da IA no Supabase
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
      style={[styles.container, themeStyles.container]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.contentWrapper}>
        
        <FlatList
          ref={flatListRef}
          data={messages}
          style={{ flex: 1 }} 
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.chatListContent, isMobile && styles.chatListContentMobile]}
          onContentSizeChange={() => scrollToBottom(true)}
          onLayout={() => scrollToBottom(false)} // Garante que a primeira renderização inicie no final
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.floatingInputWrapper}>
          <View style={[styles.inputContainer, themeStyles.inputContainer]}>
            <TextInput
              style={[styles.input, themeStyles.input]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Pergunte sobre lances, objeções..."
              placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
              multiline
              onKeyPress={handleKeyPress}
              maxLength={1500}
            />
            <TouchableOpacity 
              style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]} 
              onPress={sendMessage}
              disabled={isLoading || !inputText.trim()}
            >
              <Text style={styles.sendButtonText}>Enviar</Text>
            </TouchableOpacity>
          </View>
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
  
  messageRow: { flexDirection: 'row', marginBottom: 24, maxWidth: '90%', alignItems: 'flex-end' },
  userRow: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  aiRow: { alignSelf: 'flex-start' },
  
  avatarContainer: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, position: 'relative' },
  avatarOuterRing: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1, opacity: 0.5 },
  avatarInnerDiamond: { position: 'absolute', width: 12, height: 12, borderWidth: 2, transform: [{ rotate: '45deg' }] },
  avatarCore: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
  
  messageBubble: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 24, flexShrink: 1 },
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
  
  inputContainer: { flexDirection: 'row', padding: 6, paddingLeft: 16, borderRadius: 24, alignItems: 'center', borderWidth: 1, ...Platform.select({ web: { boxShadow: '0px -4px 20px rgba(0,0,0,0.05)' } }) },
  input: { flex: 1, minHeight: 36, maxHeight: 120, paddingTop: 8, paddingBottom: 8, fontSize: 14, fontFamily: MODERN_FONT, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  sendButton: { backgroundColor: '#2563eb', height: 36, width: 75, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#ffffff', fontFamily: MODERN_FONT, fontWeight: '800', fontSize: 13 }
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
  input: { color: '#0f172a' }
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
  input: { color: '#f8fafc' }
});