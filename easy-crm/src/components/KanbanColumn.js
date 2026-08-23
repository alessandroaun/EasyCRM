// KanbanColumn
import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity, Pressable } from 'react-native';
import ClientCard from './ClientCard';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

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

  // Se a cor exata estiver mapeada, retorna a versão escura correspondente
  if (paletteMap[cleanHex]) {
    return paletteMap[cleanHex];
  }

  // Fallback genérico caso seja uma cor customizada: escurece de forma inteligente mantendo o tom
  let color = cleanHex.replace('#', '');
  if (color.length === 3) {
    color = color.split('').map(c => c + c).join('');
  }
  
  const num = parseInt(color, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  // Garante que cores pastéis (muito claras) ganhem profundidade escura sem virar cinza
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
      
      const handleDragOver = (e) => e.preventDefault();
      
      const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const dragType = e.dataTransfer.getData('dragType');
        
        if (dragType === 'client') {
          const clientId = e.dataTransfer.getData('clientId');
          const sourcePhaseId = e.dataTransfer.getData('sourcePhaseId');
          
          const targetNode = e.target.closest('[data-clientid]');
          const targetClientId = targetNode ? targetNode.getAttribute('data-clientid') : null;

          if (clientId && sourcePhaseId) {
            onDropClient(clientId, sourcePhaseId, phase.id, targetClientId);
          }
        }
      };

      node.addEventListener('dragover', handleDragOver);
      node.addEventListener('drop', handleDrop);
      
      return () => {
        node.removeEventListener('dragover', handleDragOver);
        node.removeEventListener('drop', handleDrop);
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
  
  // Aplica a cor mapeada correspondente no modo escuro ou a original no modo claro
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

      {/* CAIXINHA DE SELECIONAR TODOS DA FASE */}
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
    width: 270,
    borderRadius: 12, 
    paddingHorizontal: 12, 
    paddingTop: 16,
    paddingBottom: 4,
    marginRight: 16,
    maxHeight: '100%',
    borderWidth: 1,
    position: 'relative',
  },
  backdropOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingHorizontal: 4, position: 'relative', zIndex: 1 },
  titleContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap', gap: 8 },
  title: { fontFamily: MODERN_FONT, fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontFamily: MODERN_FONT, fontSize: 12, fontWeight: '700' },
  iconActionButton: { 
    width: 26, 
    height: 26, 
    borderRadius: 6, 
    justifyContent: 'center', 
    alignItems: 'center'
  },
  actionSymbol: { fontSize: 15, fontWeight: '600', lineHeight: 18, textAlign: 'center' },
  selectAllContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
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
  selectAllText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MODERN_FONT,
  },
  sortMenuDropdown: {
    position: 'absolute', top: 35, right: 0, width: 200, 
    borderRadius: 10, padding: 8, zIndex: 99999, borderWidth: 1,
  },
  sortMenuTitle: { fontSize: 11, fontWeight: '700', marginBottom: 6, paddingHorizontal: 6 },
  sortMenuItem: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6, marginBottom: 2 },
  sortMenuText: { fontSize: 12, fontWeight: '600' },
  scrollArea: { flex: 1 },
});

const lightStyles = StyleSheet.create({
  column: { borderColor: 'rgba(0,0,0,0.03)' },
  title: { color: '#111827' },
  badge: { backgroundColor: 'rgba(0,0,0,0.06)' },
  badgeText: { color: '#4B5563' },
  iconActionButton: { backgroundColor: 'rgba(0,0,0,0.04)' },
  actionSymbol: { color: '#4b5563' },
  selectAllContainer: { backgroundColor: 'rgba(255, 255, 255, 0.7)', borderColor: '#e2e8f0' },
  checkbox: { borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  selectAllText: { color: '#334155' },
  sortMenuDropdown: { backgroundColor: '#ffffff', borderColor: '#e2e8f0', ...Platform.select({ web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.15)' } }) },
  sortMenuTitle: { color: '#64748b' },
  sortMenuText: { color: '#1e293b' }
});

const darkStyles = StyleSheet.create({
  column: { borderColor: 'rgba(255,255,255,0.08)' },
  title: { color: '#f8fafc' },
  badge: { backgroundColor: 'rgba(255,255,255,0.15)' },
  badgeText: { color: '#f1f5f9' },
  iconActionButton: { backgroundColor: 'rgba(255,255,255,0.08)' },
  actionSymbol: { color: '#cbd5e1' },
  selectAllContainer: { backgroundColor: 'rgba(30, 41, 59, 0.8)', borderColor: '#334155' },
  checkbox: { borderColor: '#475569', backgroundColor: '#0f172a' },
  selectAllText: { color: '#f1f5f9' },
  sortMenuDropdown: { backgroundColor: '#1e293b', borderColor: '#334155', ...Platform.select({ web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.4)' } }) },
  sortMenuTitle: { color: '#94a3b8' },
  sortMenuText: { color: '#f8fafc' }
});