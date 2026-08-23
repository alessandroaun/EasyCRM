import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Pressable, Linking, Animated, Easing, Modal } from 'react-native';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

export default function ClientCard({ client, phaseId, onDelete, onOpen, onAddComment, onDropClient, isBulkSelecting, isSelected, onToggleSelect, isDarkMode }) {
  const cardRef = useRef(null);
  const [pulseColor, setPulseColor] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Estados e Refs do Modal de Exclusão
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteScale = useRef(new Animated.Value(0.8)).current;
  const deleteOpacity = useRef(new Animated.Value(0)).current;

  // Motor em tempo real: Cor e Pulsação
  useEffect(() => {
    const checkAppointmentStatus = () => {
      if (!client.appointments || client.appointments.length === 0) {
        setPulseColor(null);
        return;
      }

      const now = new Date();
      const activeAppts = client.appointments
        .filter(a => !a.notified && new Date(a.dateTime) > now)
        .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

      if (activeAppts.length === 0) {
        setPulseColor(null);
        return;
      }

      const nextApptTime = new Date(activeAppts[0].dateTime).getTime();
      const timeLeft = nextApptTime - now.getTime();
      const hoursLeft = timeLeft / (1000 * 60 * 60);

      if (hoursLeft > 24) setPulseColor('#22c55e');      // Verde
      else if (hoursLeft > 4) setPulseColor('#eab308'); // Amarelo
      else setPulseColor('#ef4444');                    // Vermelho
    };

    checkAppointmentStatus();
    const interval = setInterval(checkAppointmentStatus, 30000);
    return () => clearInterval(interval);
  }, [client.appointments]);

  // Efeito visual do pulsar
  useEffect(() => {
    if (pulseColor) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' })
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [pulseColor, pulseAnim]);

  // =========================================================================
  // MOTOR TÁTIL SUPREMO (FANTASMA + AUTO-SCROLL HORIZONTAL + TRAVA CLIQUE)
  // =========================================================================
  useEffect(() => {
    if (Platform.OS === 'web' && cardRef.current) {
      const node = cardRef.current;
      const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

      // 1. DRAG PARA COMPUTADOR
      if (!isTouchDevice) node.setAttribute('draggable', 'true');

      const handleDragStart = (e) => {
        if (isBulkSelecting || isTouchDevice) return e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.setData('dragType', 'client');
        e.dataTransfer.setData('clientId', client.id);
        e.dataTransfer.setData('sourcePhaseId', phaseId);
        
      };

      let pressTimer = null;
      let isDragging = false;
      let ghost = null;
      let initialX = 0, initialY = 0;
      let offsetX = 0, offsetY = 0;
      let touchStartTime = 0;
      
      let scrollInterval = null;
      let currentTouchX = 0;
      let scrollContainer = null;

      const cleanupGhost = () => {
        if (ghost && document.body.contains(ghost)) document.body.removeChild(ghost);
        ghost = null;
        isDragging = false;
        node.style.opacity = '1';
        document.body.style.overflow = '';
        
        if (scrollInterval) {
          clearInterval(scrollInterval);
          scrollInterval = null;
        }
      };

      const handleClick = (e) => {
        if (isBulkSelecting) {
          e.stopPropagation();
          e.preventDefault();
          if (onToggleSelect) onToggleSelect(client.id);
          return;
        }

        const pressDuration = Date.now() - touchStartTime;

        if (isDragging || (isTouchDevice && touchStartTime > 0 && pressDuration > 300)) {
          e.stopPropagation();
          e.preventDefault();
          touchStartTime = 0;
          return;
        }

        const text = e.target.innerText || '';
        if (text === '✕' || text.includes('WA') || text.includes('Ligar') || text.includes(client.phone)) return;
        if (onOpen) onOpen(client, phaseId);
      };

      const handleTouchStart = (e) => {
        if (isBulkSelecting || !isTouchDevice || e.touches.length > 1) return;
        
        const text = e.target.innerText || '';
        if (text === '✕' || text.includes('WA') || text.includes('Ligar')) return;

        const touch = e.touches[0];
        initialX = touch.clientX;
        initialY = touch.clientY;
        currentTouchX = touch.clientX;
        touchStartTime = Date.now();

        pressTimer = setTimeout(() => {
          isDragging = true;
          if (navigator.vibrate) navigator.vibrate(40);
          
          document.body.style.overflow = 'hidden';

          const rect = node.getBoundingClientRect();
          offsetX = touch.clientX - rect.left;
          offsetY = touch.clientY - rect.top;

          ghost = node.cloneNode(true);
          ghost.style.position = 'fixed';
          ghost.style.zIndex = '999999';
          ghost.style.opacity = '0.95';
          ghost.style.margin = '0';
          ghost.style.boxShadow = '0px 15px 30px rgba(0,0,0,0.3)';
          ghost.style.transform = 'scale(1.03)'; 
          ghost.style.setProperty('pointer-events', 'none', 'important');
          
          ghost.style.left = `${touch.clientX - offsetX}px`;
          ghost.style.top = `${touch.clientY - offsetY}px`;
          ghost.style.width = `${rect.width}px`;
          ghost.style.height = `${rect.height}px`;

          document.body.appendChild(ghost);
          node.style.opacity = '0.4';

          scrollContainer = node.parentElement;
          while (scrollContainer && scrollContainer !== document.body) {
            if (scrollContainer.scrollWidth > scrollContainer.clientWidth) break;
            scrollContainer = scrollContainer.parentElement;
          }
          if (!scrollContainer) scrollContainer = document.scrollingElement || document.documentElement;

          scrollInterval = setInterval(() => {
            if (!isDragging) return;
            const edge = 80; 
            const speed = 12; 

            if (currentTouchX < edge) {
              scrollContainer.scrollLeft -= speed; 
            } else if (currentTouchX > window.innerWidth - edge) {
              scrollContainer.scrollLeft += speed; 
            }
          }, 16);

        }, 350); 
      };

      const handleTouchMove = (e) => {
        if (isBulkSelecting) return;
        const touch = e.touches[0];
        currentTouchX = touch.clientX;

        if (!isDragging) {
          if (Math.abs(touch.clientX - initialX) > 10 || Math.abs(touch.clientY - initialY) > 10) {
            clearTimeout(pressTimer);
          }
          return;
        }

        if (e.cancelable) e.preventDefault(); 
        
        if (ghost) {
          ghost.style.left = `${touch.clientX - offsetX}px`;
          ghost.style.top = `${touch.clientY - offsetY}px`;
        }
      };

      const handleTouchEnd = (e) => {
        if (isBulkSelecting) return;
        clearTimeout(pressTimer);
        
        if (!isDragging) {
          cleanupGhost();
          return;
        }
        
        const touch = e.changedTouches[0];
        const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);

        cleanupGhost();

        if (targetElement) {
          const targetColumn = targetElement.closest('[data-phaseid]');
          const targetCard = targetElement.closest('[data-clientid]');

          if (targetColumn && onDropClient) {
            const targetPhaseId = targetColumn.getAttribute('data-phaseid');
            const targetClientId = targetCard ? targetCard.getAttribute('data-clientid') : null;
            onDropClient(client.id, phaseId, targetPhaseId, targetClientId);
          }
        }
      };

      const handleTouchCancel = () => {
        clearTimeout(pressTimer);
        cleanupGhost();
      };

      node.addEventListener('dragstart', handleDragStart);
      node.addEventListener('click', handleClick);
      node.addEventListener('touchstart', handleTouchStart, { passive: true });
      node.addEventListener('touchmove', handleTouchMove, { passive: false });
      node.addEventListener('touchend', handleTouchEnd);
      node.addEventListener('touchcancel', handleTouchCancel);
      
      return () => {
        clearTimeout(pressTimer);
        cleanupGhost();
        node.removeEventListener('dragstart', handleDragStart);
        node.removeEventListener('click', handleClick);
        node.removeEventListener('touchstart', handleTouchStart);
        node.removeEventListener('touchmove', handleTouchMove);
        node.removeEventListener('touchend', handleTouchEnd);
        node.removeEventListener('touchcancel', handleTouchCancel);
      };
    }
  }, [client, phaseId, onOpen, onDropClient, isBulkSelecting, isSelected, onToggleSelect]);

  const openDeleteModal = (e) => {
    if (Platform.OS === 'web' && e && e.stopPropagation) e.stopPropagation();
    setIsDeleting(true);
    deleteScale.setValue(0.8);
    deleteOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(deleteScale, { toValue: 1, friction: 6, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(deleteOpacity, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' })
    ]).start();
  };

  const closeDeleteModal = (callback) => {
    Animated.parallel([
      Animated.timing(deleteScale, { toValue: 0.8, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(deleteOpacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' })
    ]).start(() => {
      setIsDeleting(false);
      if (typeof callback === 'function') callback();
    });
  };

  const formatCategory = (rawCategory) => {
    if (!rawCategory) return null;
    const text = rawCategory.toLowerCase();
    if (text.includes('auto') || text.includes('carro')) return 'Auto';
    if (text.includes('imóvel') || text.includes('casa') || text.includes('apartamento')) return 'Imóvel';
    if (text.includes('moto')) return 'Moto';
    if (text.includes('caminhão') || text.includes('pesado')) return 'Pesados';
    if (text.includes('investimento')) return 'Investimento';
    if (text.includes('serviço')) return 'Serviços';
    return rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1).replace(/_/g, ' ');
  };

  const getTempStyle = (temp) => {
    const t = temp?.toLowerCase() || '';
    if (t.includes('quente')) return { bg: isDarkMode ? '#7f1d1d' : '#fee2e2', color: isDarkMode ? '#fca5a5' : '#dc2626' };
    if (t.includes('morno')) return { bg: isDarkMode ? '#78350f' : '#fef3c7', color: isDarkMode ? '#fde047' : '#d97706' };
    if (t.includes('frio')) return { bg: isDarkMode ? '#0c4a6e' : '#e0f2fe', color: isDarkMode ? '#7dd3fc' : '#0284c7' };
    return { bg: isDarkMode ? '#334155' : '#f1f5f9', color: isDarkMode ? '#cbd5e1' : '#475569' };
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handlePhoneCall = (e) => {
    if (Platform.OS === 'web' && e && e.stopPropagation) e.stopPropagation();
    const cleanPhone = client.phone?.replace(/\D/g, '');
    if (cleanPhone) {
      if (onAddComment) onAddComment(client.id, phaseId, "📞 Sistema: Clicou no botão de ligar no cliente.");
      Linking.openURL(`tel:+${cleanPhone}`);
    }
  };

  const handleWhatsAppClick = (e) => {
    if (Platform.OS === 'web' && e && e.stopPropagation) e.stopPropagation();
    const cleanPhone = client.phone?.replace(/\D/g, '');
    if (cleanPhone) {
      if (onAddComment) onAddComment(client.id, phaseId, "💬 Sistema: Clicou no botão de falar no WhatsApp.");
      Linking.openURL(`https://wa.me/${cleanPhone}`);
    }
  };

  const daysInactive = () => {
    const lastMoveDate = client.updatedAt || client.createdAt;
    if (!lastMoveDate) return 0;
    return Math.floor(Math.abs(new Date() - new Date(lastMoveDate)) / (1000 * 60 * 60 * 24));
  };
  
  const commentsCount = client.comments ? client.comments.length : 0;
  const completedApptsCount = client.appointments ? client.appointments.filter(a => a.notified).length : 0;

  const buildTags = () => {
    const tags = [];
    
    // Se fechou negócio, foca só nas tags dos contratos fechados
    if (client.dealClosed && client.contracts && client.contracts.length > 0) {
      const closedCategories = new Set(client.contracts.map(c => formatCategory(c.categoria)).filter(Boolean));
      Array.from(closedCategories).forEach((cat, index) => {
        tags.push({ id: `closed_cat_${index}`, text: cat, bg: isDarkMode ? '#064e3b' : '#dcfce7', color: isDarkMode ? '#86efac' : '#16a34a' });
      });
      return tags.slice(0, 4);
    }

    // Regras normais de tags caso não esteja fechado
    const cleanCategory = formatCategory(client.category);
    if (cleanCategory) tags.push({ id: 'cat', text: cleanCategory, bg: isDarkMode ? '#581c87' : '#f3e8ff', color: isDarkMode ? '#d8b4fe' : '#7e22ce' });
    if (client.leadTemp) {
      const style = getTempStyle(client.leadTemp);
      tags.push({ id: 'temp', text: client.leadTemp, bg: style.bg, color: style.color });
    }
    if (client.bidAmount && client.bidAmount.trim() !== '' && client.bidAmount.trim().toLowerCase() !== 'não') {
      tags.push({ id: 'bid', text: 'Com Lance', bg: isDarkMode ? '#064e3b' : '#dcfce7', color: isDarkMode ? '#86efac' : '#16a34a' });
    }
    if (client.winProbability) {
      tags.push({ id: 'prob', text: `${client.winProbability}%`, bg: isDarkMode ? '#065f46' : '#ecfdf5', color: isDarkMode ? '#6ee7b7' : '#059669' });
    }
    if (client.platform) {
      tags.push({ id: 'plat', text: client.platform, bg: isDarkMode ? '#1e3a8a' : '#e0e7ff', color: isDarkMode ? '#93c5fd' : '#4f46e5' });
    }
    return tags.slice(0, 4);
  };

  const calculateTotalCredit = () => {
    if (!client.contracts) return 0;
    return client.contracts.reduce((total, c) => {
      const valStr = (c.valorContrato || '').replace(/\D/g, '');
      const valNum = valStr ? parseInt(valStr, 10) / 100 : 0;
      return total + valNum;
    }, 0);
  };

  // Separa e garante que apenas 2 linhas cheguem ao componente Text
  // Assim, as reticências "..." só aparecerão se O TEXTO DAQUELAS 2 LINHAS for muito largo
  const displayInfoText = client.initialInfo 
    ? client.initialInfo.split('\n').filter(l => l.trim().length > 0).slice(0, 2).join('\n')
    : 'Clique para ver detalhes...';

  const tagsToRender = buildTags();
  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  return (
    <>
      <View 
        ref={cardRef} 
        data-card-container
        dataSet={{ clientid: client.id }} 
        style={[
          styles.card, 
          themeStyles.card,
          client.dealClosed && { borderLeftColor: '#10b981' }, 
          pulseColor && !client.dealClosed && { borderColor: pulseColor, borderWidth: 2 },
          isBulkSelecting && isSelected && { backgroundColor: isDarkMode ? '#1e3a8a' : '#eff6ff', borderColor: '#2563eb', borderWidth: 2 }
        ]}
      >
        {isBulkSelecting && (
          <TouchableOpacity 
            style={[styles.checkboxContainer, themeStyles.checkboxContainer]} 
            onPress={() => onToggleSelect && onToggleSelect(client.id)}
          >
            <View style={[styles.checkbox, themeStyles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.checkboxLabel, themeStyles.checkboxLabel]}>Selecionar para transferência</Text>
          </TouchableOpacity>
        )}

        <View style={styles.headerContainer}>
          <View style={styles.headerTextContainer}>
            <View style={styles.nameRow}>
              
              {pulseColor && !client.dealClosed && (
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Text style={styles.pulsingClock}>⏰</Text>
                </Animated.View>
              )}

              <Text style={[styles.name, themeStyles.name]} numberOfLines={1}>{client.name}</Text>
              
              {commentsCount > 0 && (
                <View style={[styles.commentBadge, themeStyles.commentBadge]}>
                  <Text style={[styles.commentBadgeText, themeStyles.commentBadgeText]}>{commentsCount} {commentsCount === 1 ? 'comentário' : 'comentários'}</Text>
                </View>
              )}

              {completedApptsCount > 0 && (
                <View style={[styles.apptBadge, themeStyles.apptBadge]}>
                  <Text style={[styles.apptBadgeText, themeStyles.apptBadgeText]}>{completedApptsCount}A</Text>
                </View>
              )}

              {daysInactive() >= 7 && (
                <View style={[styles.inactiveBadge, themeStyles.inactiveBadge]}>
                  <Text style={[styles.inactiveText, themeStyles.inactiveText]}>{daysInactive()}d</Text>
                </View>
              )}
            </View>

            {client.createdAt && (
              <Text style={[styles.dateText, themeStyles.dateText]}>{formatDateTime(client.createdAt)}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.deleteButton} onPress={openDeleteModal}>
            <Text style={[styles.deleteIcon, themeStyles.deleteIcon]}>✕</Text>
          </TouchableOpacity>
        </View>
        
        <Pressable style={styles.clickableArea} onPress={() => { if (!isBulkSelecting && Platform.OS !== 'web' && onOpen) onOpen(client, phaseId); }}>
          
          <View style={styles.phoneRow}>
            <Text style={[styles.phoneText, themeStyles.phoneText]}>{client.phone || 'Sem telefone'}</Text>
            {client.phone && (
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity 
                  data-card-action-btn
                  style={[
                    styles.btnActionWA, 
                    client.whatsappError ? (isDarkMode ? { backgroundColor: '#7f1d1d' } : { backgroundColor: '#fee2e2' }) : (isDarkMode ? { backgroundColor: '#064e3b' } : { backgroundColor: '#dcfce7' })
                  ]} 
                  onPress={handleWhatsAppClick}
                >
                  <Text 
                    style={[
                      styles.btnActionTextWA, 
                      client.whatsappError ? (isDarkMode ? { color: '#fca5a5' } : { color: '#dc2626' }) : (isDarkMode ? { color: '#86efac' } : { color: '#16a34a' })
                    ]}
                  >
                    WA
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity data-card-action-btn style={[styles.btnActionCall, themeStyles.btnActionCall]} onPress={handlePhoneCall}>
                  <Text style={[styles.btnActionTextCall, themeStyles.btnActionTextCall]}>Ligar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {client.dealClosed ? (
            <View style={styles.dealClosedContainer}>
              <Text style={styles.dealClosedDateText}>Contrato fechado no dia {client.dealClosedDate ? new Date(client.dealClosedDate).toLocaleDateString('pt-BR') : 'N/A'}</Text>
              
              <View style={styles.dealStatusWrapper}>
                 <Text style={styles.dealStatusLabel}>Status:</Text>
                 <Text style={[styles.dealStatusValue, client.clientStatus === 'Cliente Contemplado' ? styles.statusContemplado : (client.clientStatus === 'Cliente Cancelado' ? styles.statusCancelado : styles.statusDefault)]}>
                   {client.clientStatus || 'Cliente Não Contemplado'}
                 </Text>
              </View>

              <Text style={styles.dealCreditText}>
                Crédito Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculateTotalCredit())}
              </Text>
            </View>
          ) : (
            <Text style={[styles.info, themeStyles.info]} numberOfLines={2}>{displayInfoText}</Text>
          )}
          
          <View style={styles.tagsContainer}>
            {tagsToRender.map(tag => (
              <Text key={tag.id} style={[styles.tag, { backgroundColor: tag.bg, color: tag.color }]}>{tag.text}</Text>
            ))}
          </View>

        </Pressable>
      </View>

      {isDeleting && (
        <Modal transparent={true} visible={isDeleting} onRequestClose={() => closeDeleteModal()}>
          <View style={styles.modalOverlay}>
            <Animated.View style={[styles.alertBox, themeStyles.alertBox, { opacity: deleteOpacity, transform: [{ scale: deleteScale }] }]}>
              <Text style={styles.alertIcon}>⚠️</Text>
              <Text style={[styles.alertTitle, themeStyles.alertTitle]}>Excluir Card?</Text>
              <Text style={[styles.alertMessage, themeStyles.alertMessage]}>Tem certeza que deseja enviar "{client.name}" para a lixeira? Você poderá restaurá-lo depois se precisar.</Text>
              
              <View style={styles.alertButtonRow}>
                <TouchableOpacity style={[styles.cancelBtn, themeStyles.cancelBtn]} onPress={() => closeDeleteModal()}>
                  <Text style={[styles.cancelBtnText, themeStyles.cancelBtnText]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={() => closeDeleteModal(() => onDelete(client.id, phaseId))}>
                  <Text style={styles.confirmBtnText}>Sim, excluir</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: { 
    padding: 10, 
    borderRadius: 8, 
    marginBottom: 8, 
    borderLeftWidth: 4, 
    borderLeftColor: '#3b82f6', 
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: MODERN_FONT,
  },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  headerTextContainer: { flex: 1, marginRight: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' },
  name: { fontSize: 14, fontWeight: 'bold', flexShrink: 1 },
  pulsingClock: { fontSize: 12 },
  commentBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  commentBadgeText: { fontSize: 9, fontWeight: '700' },
  apptBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  apptBadgeText: { fontSize: 9, fontWeight: 'bold' },
  inactiveBadge: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  inactiveText: { fontSize: 10, fontWeight: 'bold' },
  dateText: { fontSize: 9, marginTop: 2 },
  deleteButton: { paddingLeft: 8, paddingBottom: 4 },
  deleteIcon: { fontSize: 12, fontWeight: 'bold' },
  clickableArea: { paddingTop: 0, paddingBottom: 0 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  phoneText: { fontSize: 13, fontWeight: '500' },
  actionButtonsContainer: { flexDirection: 'row', gap: 4 },
  btnActionWA: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  btnActionTextWA: { fontSize: 10, fontWeight: 'bold' },
  btnActionCall: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  btnActionTextCall: { fontSize: 10, fontWeight: 'bold' },
  
  dealClosedContainer: { backgroundColor: '#ecfdf5', padding: 8, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#a7f3d0' },
  dealClosedDateText: { fontSize: 11, fontWeight: 'bold', color: '#047857', marginBottom: 4 },
  dealStatusWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  dealStatusLabel: { fontSize: 11, fontWeight: '600', color: '#065f46', marginRight: 4 },
  dealStatusValue: { fontSize: 11, fontWeight: 'bold' },
  statusContemplado: { color: '#2563eb' },
  statusCancelado: { color: '#dc2626' },
  statusDefault: { color: '#d97706' },
  dealCreditText: { fontSize: 13, fontWeight: '800', color: '#064e3b' },

  info: { fontSize: 12, marginBottom: 6, lineHeight: 16 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, 
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  alertBox: { padding: 24, borderRadius: 16, alignItems: 'center', width: 320 },
  alertIcon: { fontSize: 48, marginBottom: 12 },
  alertTitle: { fontFamily: MODERN_FONT, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  alertMessage: { fontFamily: MODERN_FONT, fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  alertButtonRow: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelBtnText: { fontFamily: MODERN_FONT, fontWeight: '700', fontSize: 14 },
  confirmBtn: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  confirmBtnText: { fontFamily: MODERN_FONT, color: '#ffffff', fontWeight: '700', fontSize: 14 }
});

const lightStyles = StyleSheet.create({
  card: { 
    backgroundColor: '#FFFFFF', 
    ...Platform.select({ 
      web: { 
        boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)', 
        userSelect: 'none', 
        WebkitUserSelect: 'none', 
        WebkitTouchCallout: 'none' 
      }, 
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 } 
    }) 
  },
  checkboxContainer: { borderBottomColor: '#f1f5f9' },
  checkbox: { borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  checkboxLabel: { color: '#64748b' },
  name: { color: '#1e293b' },
  commentBadge: { backgroundColor: '#e0e7ff' },
  commentBadgeText: { color: '#4f46e5' },
  apptBadge: { backgroundColor: '#fef3c7' },
  apptBadgeText: { color: '#d97706' },
  inactiveBadge: { backgroundColor: '#fee2e2' },
  inactiveText: { color: '#dc2626' },
  dateText: { color: '#94a3b8' },
  deleteIcon: { color: '#94a3b8' },
  phoneText: { color: '#475569' },
  btnActionCall: { backgroundColor: '#f1f5f9' },
  btnActionTextCall: { color: '#475569' },
  info: { color: '#475569' },
  alertBox: { backgroundColor: '#ffffff', ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(0,0,0,0.2)' } }) },
  alertTitle: { color: '#1e293b' },
  alertMessage: { color: '#475569' },
  cancelBtn: { backgroundColor: '#f1f5f9' },
  cancelBtnText: { color: '#475569' }
});

const darkStyles = StyleSheet.create({
  card: { 
    backgroundColor: '#1e293b', 
    ...Platform.select({ 
      web: { 
        boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)', 
        userSelect: 'none', 
        WebkitUserSelect: 'none', 
        WebkitTouchCallout: 'none' 
      }, 
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 2 } 
    }) 
  },
  checkboxContainer: { borderBottomColor: '#334155' },
  checkbox: { borderColor: '#475569', backgroundColor: '#0f172a' },
  checkboxLabel: { color: '#94a3b8' },
  name: { color: '#f8fafc' },
  commentBadge: { backgroundColor: '#312e81' },
  commentBadgeText: { color: '#818cf8' },
  apptBadge: { backgroundColor: '#451a03' },
  apptBadgeText: { color: '#fbbf24' },
  inactiveBadge: { backgroundColor: '#450a0a' },
  inactiveText: { color: '#f87171' },
  dateText: { color: '#64748b' },
  deleteIcon: { color: '#94a3b8' },
  phoneText: { color: '#cbd5e1' },
  btnActionCall: { backgroundColor: '#334155' },
  btnActionTextCall: { color: '#cbd5e1' },
  info: { color: '#94a3b8' },
  alertBox: { backgroundColor: '#1e293b', ...Platform.select({ web: { boxShadow: '0px 10px 25px rgba(0,0,0,0.4)' } }) },
  alertTitle: { color: '#f8fafc' },
  alertMessage: { color: '#94a3b8' },
  cancelBtn: { backgroundColor: '#334155' },
  cancelBtnText: { color: '#cbd5e1' }
});