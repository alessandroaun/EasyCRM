// KanbanColumn
import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity, Pressable } from 'react-native';
import ClientCard from './ClientCard';

import { MODERN_FONT, TOKENS } from '../theme/tokens';

// Mapeamento inteligente das cores pastéis da paleta para versões escuras sólidas e sofisticadas no modo escuro
const getDarkPaletteColor = (hexColor, isDark) => {
  if (!isDark || !hexColor || typeof hexColor !== 'string') return hexColor;
  
  const cleanHex = hexColor.trim().toLowerCase();

  // Dicionário de conversão exato para as cores da paleta do CRM
  const paletteMap = {
    // Verde claro pastel -> Verde escuro profissional
    '#e8f8f0': '#064e3b',
    '#d1fae5': '#065f46',
    '#e6f4ea': '#064e3b',
    
    // Amarelo claro pastel -> Amarelo/Dourado escuro fechado
    '#fef3c7': '#78350f',
    '#fef9c3': '#713f12',
    '#fffbeb': '#78350f',

    // Laranja / Bege / Pêssego pastel -> Laranja/Marrom escuro fechado
    '#ffedd5': '#7c2d12',
    '#fed7aa': '#9a3412',
    '#fae8d4': '#7c2d12',

    // Vermelho / Rosa pastel -> Vermelho escuro / Vinho fechado
    '#fee2e2': '#7f1d1d',
    '#fce7f3': '#831843',
    '#ffe4e6': '#881337',

    // Azul / Azul claro pastel -> Azul escuro corporativo
    '#e0f2fe': '#0c4a6e',
    '#dbeafe': '#1e3a8a',
    '#f0f9ff': '#082f49',

    // Roxo / Lilás pastel -> Roxo escuro fechado
    '#f3e8ff': '#581c87',
    '#fae8ff': '#701a75',
  };

  if (paletteMap[cleanHex]) {
    return paletteMap[cleanHex];
  }

  let color = cleanHex.replace('#', '');
  if (color.length === 3) {
    color = color.split('').map(c => c + c).join('');
  }
  
  const num = parseInt(color, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.floor(r * 0.25);
  g = Math.floor(g * 0.25);
  b = Math.floor(b * 0.25);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

export default function KanbanColumn({ phase, onDropClient, onDeleteClient, onOpenClient, onEditPhase, onReorderPhase, onAddComment, isBulkSelecting, selectedLeadIds, onToggleSelectLead, onSelectAllInPhase, onDeselectAllInPhase, isDarkMode, isAdmin }) {
  const columnRef = useRef(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && columnRef.current) {
      const node = columnRef.current;
      
      const clearHoverSpaces = () => {
        const spacedCards = document.querySelectorAll('.drag-hover-space');
        spacedCards.forEach(c => c.classList.remove('drag-hover-space'));
      };

      const handleDragOver = (e) => {
        e.preventDefault();
        
        const targetCard = e.target.closest('[data-clientid]');
        if (targetCard) {
          const draggedId = window.__draggedClientId;
          
          const rect = targetCard.getBoundingClientRect();
          const isTopHalf = e.clientY < rect.top + (rect.height / 2);
          
          let cardToPush = isTopHalf ? targetCard : targetCard.nextElementSibling;
          
          // Impede o auto-recuo se o card que o cursor tenta empurrar for o próprio card arrastado!
          if (cardToPush && cardToPush.getAttribute('data-clientid') === draggedId) {
             clearHoverSpaces();
             return;
          }

          if (cardToPush) {
            if (!cardToPush.classList.contains('drag-hover-space')) {
              clearHoverSpaces();
              cardToPush.classList.add('drag-hover-space');
            }
          } else {
            clearHoverSpaces(); 
          }
        }
      };
      
      const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const dragType = e.dataTransfer.getData('dragType');
        
        if (dragType === 'client') {
          const clientId = e.dataTransfer.getData('clientId') || window.__draggedClientId;
          const sourcePhaseId = e.dataTransfer.getData('sourcePhaseId');
          
          const spacedCard = node.querySelector('.drag-hover-space');
          let targetClientId = spacedCard ? spacedCard.getAttribute('data-clientid') : null;

          clearHoverSpaces();

          if (clientId && sourcePhaseId) {
            onDropClient(clientId, sourcePhaseId, phase.id, targetClientId);
          }
        }
      };

      node.addEventListener('dragover', handleDragOver);
      node.addEventListener('drop', handleDrop);
      document.addEventListener('dragend', clearHoverSpaces); 
      
      return () => {
        node.removeEventListener('dragover', handleDragOver);
        node.removeEventListener('drop', handleDrop);
        document.removeEventListener('dragend', clearHoverSpaces);
      };
    }
  }, [phase.id, onDropClient]);

  const handleSortClients = (criteria) => {
    setShowSortMenu(false);
    if (!phase.clients) return;

    let sorted = [...phase.clients];

    switch (criteria) {
      case 'alpha_asc': 
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'date_desc': 
        sorted.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        break;
      case 'date_asc': 
        sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        break;
      case 'comments_desc': 
        sorted.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
        break;
      case 'appts_desc': 
        sorted.sort((a, b) => (b.appointments?.length || 0) - (a.appointments?.length || 0));
        break;
      case 'bid_first': 
        sorted.sort((a, b) => {
          const hasBidA = a.bidAmount && a.bidAmount.trim() !== '' && a.bidAmount.trim().toLowerCase() !== 'não' ? 1 : 0;
          const hasBidB = b.bidAmount && b.bidAmount.trim() !== '' && b.bidAmount.trim().toLowerCase() !== 'não' ? 1 : 0;
          return hasBidB - hasBidA;
        });
        break;
      default:
        break;
    }

    phase.clients = sorted;
  };

  const phaseClientIds = phase.clients.map(c => c.id);
  const isAllSelected = phaseClientIds.length > 0 && phaseClientIds.every(id => selectedLeadIds?.includes(id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      if (onDeselectAllInPhase) onDeselectAllInPhase(phaseClientIds);
    } else {
      if (onSelectAllInPhase) onSelectAllInPhase(phaseClientIds);
    }
  };

  const themeStyles = isDarkMode ? darkStyles : lightStyles;
  const defaultPhaseBg = isDarkMode ? '#1e293b' : '#F3F4F6';
  
  const adjustedPhaseColor = getDarkPaletteColor(phase.color, isDarkMode) || (phase.color || defaultPhaseBg);

  return (
    <View 
      ref={columnRef} 
      dataSet={{ phaseid: phase.id }} 
      style={[
        styles.column, 
        themeStyles.column,
        { backgroundColor: adjustedPhaseColor }
      ]}
    >
      
      {showSortMenu && (
        <Pressable style={styles.backdropOverlay} onPress={() => setShowSortMenu(false)} />
      )}

      <View style={[styles.header, showSortMenu && { zIndex: 9999 }]}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, themeStyles.title]} numberOfLines={1}>{phase.title}</Text>
          <View style={[styles.badge, themeStyles.badge]}>
            <Text style={[styles.badgeText, themeStyles.badgeText]}>{phase.clients.length}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>         
          <TouchableOpacity style={[styles.iconActionButton, themeStyles.iconActionButton]} onPress={() => setShowSortMenu(!showSortMenu)} title="Ordenar Fase">
            <Text style={[styles.actionSymbol, themeStyles.actionSymbol]} suppressHighlighting={true}>⇅</Text>
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity style={[styles.iconActionButton, themeStyles.iconActionButton]} onPress={() => onEditPhase(phase)} title="Configurar Fase">
              <Text style={[styles.actionSymbol, themeStyles.actionSymbol]} suppressHighlighting={true}>⚙</Text>
            </TouchableOpacity>
          )}
        </View>

        {showSortMenu && (
          <View style={[styles.sortMenuDropdown, themeStyles.sortMenuDropdown]}>
            <Text style={[styles.sortMenuTitle, themeStyles.sortMenuTitle]}>Ordenar Fases por:</Text>
            <TouchableOpacity style={[styles.sortMenuItem, themeStyles.sortMenuItem]} onPress={() => handleSortClients('alpha_asc')}>
              <Text style={[styles.sortMenuText, themeStyles.sortMenuText]}>Ordem Alfabética (A-Z)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortMenuItem, themeStyles.sortMenuItem]} onPress={() => handleSortClients('date_desc')}>
              <Text style={[styles.sortMenuText, themeStyles.sortMenuText]}>Mais Antigos Primeiro</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortMenuItem, themeStyles.sortMenuItem]} onPress={() => handleSortClients('date_asc')}>
              <Text style={[styles.sortMenuText, themeStyles.sortMenuText]}>Mais Novos Primeiro</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortMenuItem, themeStyles.sortMenuItem]} onPress={() => handleSortClients('comments_desc')}>
              <Text style={[styles.sortMenuText, themeStyles.sortMenuText]}>Mais Comentários</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortMenuItem, themeStyles.sortMenuItem]} onPress={() => handleSortClients('appts_desc')}>
              <Text style={[styles.sortMenuText, themeStyles.sortMenuText]}>Mais Agendamentos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortMenuItem, themeStyles.sortMenuItem]} onPress={() => handleSortClients('bid_first')}>
              <Text style={[styles.sortMenuText, themeStyles.sortMenuText]}>Quem Possui Lance</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isBulkSelecting && phase.clients.length > 0 && (
        <TouchableOpacity style={[styles.selectAllContainer, themeStyles.selectAllContainer]} onPress={handleToggleSelectAll}>
          <View style={[styles.checkbox, themeStyles.checkbox, isAllSelected && styles.checkboxSelected]}>
            {isAllSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={[styles.selectAllText, themeStyles.selectAllText]}>Selecionar Todos ({phase.clients.length})</Text>
        </TouchableOpacity>
      )}
      
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollArea}>
        {phase.clients.map((client) => (
          <ClientCard 
            key={client.id} 
            client={client} 
            phaseId={phase.id} 
            onDelete={onDeleteClient} 
            onOpen={onOpenClient} 
            onAddComment={onAddComment} 
            onDropClient={onDropClient}
            isBulkSelecting={isBulkSelecting}
            isSelected={selectedLeadIds?.includes(client.id)}
            onToggleSelect={onToggleSelectLead}
            isDarkMode={isDarkMode}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { 
    width: 226,
    borderRadius: 14, 
    paddingHorizontal: 10, 
    paddingTop: 14,
    paddingBottom: 6,
    marginRight: 12,
    maxHeight: '100%',
    borderWidth: 1,
    position: 'relative',
  },
  backdropOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4, position: 'relative', zIndex: 1 },
  titleContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap', gap: 6 },
  title: { fontFamily: MODERN_FONT, fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontFamily: MODERN_FONT, fontSize: 11, fontWeight: '800' },
  iconActionButton: { 
    width: 24, 
    height: 24, 
    borderRadius: 6, 
    justifyContent: 'center', 
    alignItems: 'center',
    ...Platform.select({ web: { cursor: 'pointer', transition: 'all 0.15s ease' } })
  },
  actionSymbol: { fontSize: 13, fontWeight: '700', lineHeight: 16, textAlign: 'center' },
  selectAllContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 10,
    gap: 8,
    borderWidth: 1,
    ...Platform.select({ web: { cursor: 'pointer' } })
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  selectAllText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MODERN_FONT,
  },
  sortMenuDropdown: {
    position: 'absolute', top: 32, right: 0, width: 200, 
    borderRadius: 12, padding: 8, zIndex: 99999, borderWidth: 1,
    ...Platform.select({ web: { boxShadow: '0 12px 28px rgba(0,0,0,0.15)' } })
  },
  sortMenuTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6, paddingHorizontal: 6, fontFamily: MODERN_FONT },
  sortMenuItem: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, marginBottom: 2, ...Platform.select({ web: { cursor: 'pointer' } }) },
  sortMenuText: { fontSize: 12, fontWeight: '600', fontFamily: MODERN_FONT },
  scrollArea: { flex: 1 },
});

const lightStyles = StyleSheet.create({
  column: { borderColor: TOKENS.light.borderSubtle },
  title: { color: TOKENS.light.textPrimary },
  badge: { backgroundColor: 'rgba(0,0,0,0.06)' },
  badgeText: { color: TOKENS.light.textSecondary },
  iconActionButton: { backgroundColor: 'rgba(0,0,0,0.04)' },
  actionSymbol: { color: TOKENS.light.textSecondary },
  selectAllContainer: { backgroundColor: 'rgba(255, 255, 255, 0.7)', borderColor: TOKENS.light.border },
  checkbox: { borderColor: TOKENS.light.border, backgroundColor: '#ffffff' },
  selectAllText: { color: TOKENS.light.textPrimary },
  sortMenuDropdown: { backgroundColor: TOKENS.light.surface, borderColor: TOKENS.light.border },
  sortMenuTitle: { color: TOKENS.light.textMuted },
  sortMenuText: { color: TOKENS.light.textPrimary }
});

const darkStyles = StyleSheet.create({
  column: { borderColor: 'rgba(255,255,255,0.06)' },
  title: { color: TOKENS.dark.textPrimary },
  badge: { backgroundColor: 'rgba(255,255,255,0.12)' },
  badgeText: { color: TOKENS.dark.textSecondary },
  iconActionButton: { backgroundColor: 'rgba(255,255,255,0.06)' },
  actionSymbol: { color: TOKENS.dark.textSecondary },
  selectAllContainer: { backgroundColor: 'rgba(30, 41, 59, 0.8)', borderColor: TOKENS.dark.border },
  checkbox: { borderColor: TOKENS.dark.border, backgroundColor: '#0f172a' },
  selectAllText: { color: TOKENS.dark.textPrimary },
  sortMenuDropdown: { backgroundColor: TOKENS.dark.surface, borderColor: TOKENS.dark.border },
  sortMenuTitle: { color: TOKENS.dark.textMuted },
  sortMenuText: { color: TOKENS.dark.textPrimary }
});