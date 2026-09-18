import React from 'react';
import { 
  Modal, View, Text, TouchableOpacity, StyleSheet, Platform 
} from 'react-native';

import { MODERN_FONT, TOKENS } from '../theme/tokens';

export default function FilterModal({ visible, onClose, activeFilter, onSelectFilter, isDarkMode }) {
  
  const handleSelect = (filterType) => {
    onSelectFilter(filterType);
    onClose();
  };

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  const FilterOption = ({ value, label }) => {
    const isActive = activeFilter === value;
    return (
      <TouchableOpacity 
        style={[styles.filterOption, isActive && (isDarkMode ? darkStyles.activeOption : styles.activeOption)]}
        onPress={() => handleSelect(value)}
      >
        <Text style={[styles.optionText, themeStyles.optionText, isActive && (isDarkMode ? darkStyles.activeOptionText : styles.activeOptionText)]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        
        <TouchableOpacity activeOpacity={1} style={[styles.dropdownMenu, themeStyles.dropdownMenu]}>
          <FilterOption value="TODOS" label="Todos os Leads" />
          <FilterOption value="AUTO" label="Auto" />
          <FilterOption value="IMOVEL" label="Imóvel" />
          <FilterOption value="INVESTIMENTO" label="Investimento" />
          <FilterOption value="INSTAGRAM" label="Instagram" />
          <FilterOption value="FACEBOOK" label="Facebook" />
          <FilterOption value="COM_WA" label="Possui WhatsApp" />
          <FilterOption value="SEM_WA" label="Sem WhatsApp" />
        </TouchableOpacity>

      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, 
    backgroundColor: 'transparent', 
    justifyContent: 'flex-start', 
    alignItems: 'flex-start',
    paddingTop: 56, 
    paddingLeft: 180,
  },
  dropdownMenu: {
    borderRadius: 12, 
    borderWidth: 1,
    padding: 6,
    minWidth: 160,
    ...Platform.select({ 
      web: { outlineStyle: 'none', boxShadow: '0 12px 28px rgba(0,0,0,0.15)' },
      default: { elevation: 5 }
    })
  },
  filterOption: {
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    borderRadius: 8, 
    backgroundColor: 'transparent',
    ...Platform.select({ web: { cursor: 'pointer', transition: 'all 0.15s ease' } })
  },
  activeOption: {
    backgroundColor: '#eff6ff', 
  },
  optionText: {
    fontSize: 12, 
    fontWeight: '600',
    fontFamily: MODERN_FONT,
  },
  activeOptionText: {
    color: '#2563eb',
    fontWeight: '800'
  }
});

/* Estilos de Tema Claro */
const lightStyles = StyleSheet.create({
  dropdownMenu: {
    backgroundColor: TOKENS.light.surface, 
    borderColor: TOKENS.light.border,
  },
  optionText: {
    color: TOKENS.light.textSecondary, 
  }
});

/* Estilos de Tema Escuro */
const darkStyles = StyleSheet.create({
  dropdownMenu: {
    backgroundColor: TOKENS.dark.surface, 
    borderColor: TOKENS.dark.border,
  },
  optionText: {
    color: TOKENS.dark.textSecondary, 
  },
  activeOption: {
    backgroundColor: '#1e3a8a',
  },
  activeOptionText: {
    color: '#93c5fd',
    fontWeight: '800'
  }
});