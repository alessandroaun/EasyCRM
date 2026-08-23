import React from 'react';
import { 
  Modal, View, Text, TouchableOpacity, StyleSheet, Platform 
} from 'react-native';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

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
    // Posiciona exatamente embaixo da barra superior onde fica o botão de filtro
    justifyContent: 'flex-start', 
    alignItems: 'flex-start',
    paddingTop: 56, 
    paddingLeft: 180, // Ajuste fino horizontal para alinhar diretamente abaixo do botão "Filtro"
  },
  dropdownMenu: {
    borderRadius: 8, 
    borderWidth: 1,
    padding: 4,
    minWidth: 140, // Largura compacta ajustada ao texto
    ...Platform.select({ 
      web: { outlineStyle: 'none', boxShadow: '0px 10px 25px rgba(0,0,0,0.12)' },
      default: { elevation: 5 }
    })
  },
  filterOption: {
    paddingVertical: 7, 
    paddingHorizontal: 10, 
    borderRadius: 6, 
    backgroundColor: 'transparent',
  },
  activeOption: {
    backgroundColor: '#eff6ff', 
  },
  optionText: {
    fontSize: 13, 
    fontWeight: '600',
    fontFamily: MODERN_FONT,
  },
  activeOptionText: {
    color: '#2563eb',
    fontWeight: '700'
  }
});

/* Estilos de Tema Claro */
const lightStyles = StyleSheet.create({
  dropdownMenu: {
    backgroundColor: '#ffffff', 
    borderColor: '#cbd5e1',
  },
  optionText: {
    color: '#475569', 
  }
});

/* Estilos de Tema Escuro */
const darkStyles = StyleSheet.create({
  dropdownMenu: {
    backgroundColor: '#1e293b', 
    borderColor: '#334155',
  },
  optionText: {
    color: '#94a3b8', 
  },
  activeOption: {
    backgroundColor: '#1e3a8a',
  },
  activeOptionText: {
    color: '#93c5fd',
    fontWeight: '700'
  }
});