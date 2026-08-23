import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';

const MODERN_FONT = Platform.OS === 'web' ? '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'System';

export default function ReportModal({ visible, onClose, report, boardData, isDarkMode }) {
  if (!report) return null;

  let dadosExtra = { fase: 'Todas as Fases', tag: 'Todas as Tags / Origens', leads: [], items: [] };

  // Lê prioritariamente da nova coluna estruturada do Supabase (detalhes_json)
  if (report.detalhes_json) {
    dadosExtra.fase = report.detalhes_json.fase || dadosExtra.fase;
    dadosExtra.tag = report.detalhes_json.tag || dadosExtra.tag;
    dadosExtra.leads = report.detalhes_json.leads || [];
    dadosExtra.items = report.detalhes_json.items || [];
  } else if (report.mensagem && report.mensagem.includes('[DADOS_EXTRA:')) {
    // Compatibilidade de fallback com o modelo antigo baseado em texto na coluna mensagem
    try {
      const startIndex = report.mensagem.indexOf('[DADOS_EXTRA:');
      const jsonString = report.mensagem.substring(startIndex + 13, report.mensagem.lastIndexOf(']'));
      const parsedData = JSON.parse(jsonString);
      if (parsedData) {
        dadosExtra.fase = parsedData.fase || dadosExtra.fase;
        dadosExtra.tag = parsedData.tag || dadosExtra.tag;
        dadosExtra.leads = parsedData.leads || [];
        dadosExtra.items = parsedData.items || [];
      }
    } catch (e) {
      console.error("Erro ao decodificar DADOS_EXTRA antigo:", e);
    }
  }

  let mensagemResumida = report.mensagem || '';
  if (mensagemResumida.includes('[DADOS_EXTRA:')) {
    mensagemResumida = mensagemResumida.split('[DADOS_EXTRA:')[0].trim();
  }

  let faseExibida = dadosExtra.fase;
  if (faseExibida === 'all' || !faseExibida) {
    faseExibida = 'Todas as Fases';
  } else if (boardData?.phases) {
    const encontrada = boardData.phases.find(p => p.id === faseExibida);
    if (encontrada) faseExibida = encontrada.title;
  }

  let tagExibida = dadosExtra.tag;
  if (!tagExibida || tagExibida === 'all') {
    tagExibida = 'Todas as Tags / Origens';
  }

  const themeStyles = isDarkMode ? darkStyles : lightStyles;

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, themeStyles.modalContainer]}>
          
          <View style={[styles.header, themeStyles.header]}>
            <View>
              <Text style={[styles.title, themeStyles.title]}>Relatório do Disparo</Text>
              <Text style={[styles.subtitle, themeStyles.subtitle]}>Detalhamento da campanha de disparo em massa</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, themeStyles.closeBtn]}>
              <Text style={[styles.closeBtnText, themeStyles.closeBtnText]}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={true}>
            
            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, themeStyles.metricCard, { borderLeftColor: '#2563eb' }]}>
                <Text style={[styles.metricLabel, themeStyles.metricLabel]}>Total de Leads</Text>
                <Text style={[styles.metricValue, themeStyles.metricValue]}>{report.total_alvos || 0}</Text>
              </View>
              <View style={[styles.metricCard, themeStyles.metricCard, { borderLeftColor: '#16a34a' }]}>
                <Text style={[styles.metricLabel, themeStyles.metricLabel]}>Sucesso</Text>
                <Text style={[styles.metricValue, themeStyles.metricValue, { color: '#16a34a' }]}>{report.sucesso || 0}</Text>
              </View>
              <View style={[styles.metricCard, themeStyles.metricCard, { borderLeftColor: '#dc2626' }]}>
                <Text style={[styles.metricLabel, themeStyles.metricLabel]}>Falhas</Text>
                <Text style={[styles.metricValue, themeStyles.metricValue, { color: '#dc2626' }]}>{report.falha || 0}</Text>
              </View>
              <View style={[styles.metricCard, themeStyles.metricCard, { borderLeftColor: '#9333ea' }]}>
                <Text style={[styles.metricLabel, themeStyles.metricLabel]}>Status</Text>
                <Text style={[styles.metricValue, themeStyles.metricValue, { fontSize: 13, color: '#9333ea' }]}>{report.status}</Text>
              </View>
            </View>

            <View style={[styles.sectionContainer, themeStyles.sectionContainer]}>
              <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Parâmetros Utilizados</Text>
              <View style={styles.infoGrid}>
                <View style={[styles.infoItem, themeStyles.infoItem]}>
                  <Text style={[styles.infoLabel, themeStyles.infoLabel]}>Fase:</Text>
                  <Text style={[styles.infoVal, themeStyles.infoVal]} numberOfLines={1}>{faseExibida}</Text>
                </View>
                <View style={[styles.infoItem, themeStyles.infoItem]}>
                  <Text style={[styles.infoLabel, themeStyles.infoLabel]}>Origem / Categoria:</Text>
                  <Text style={[styles.infoVal, themeStyles.infoVal]} numberOfLines={1}>{tagExibida}</Text>
                </View>
                <View style={[styles.infoItem, themeStyles.infoItem]}>
                  <Text style={[styles.infoLabel, themeStyles.infoLabel]}>Conta WhatsApp:</Text>
                  <Text style={[styles.infoVal, themeStyles.infoVal]} numberOfLines={1}>+{report.whatsapp_numero}</Text>
                </View>
                <View style={[styles.infoItem, themeStyles.infoItem]}>
                  <Text style={[styles.infoLabel, themeStyles.infoLabel]}>Início / Término:</Text>
                  <Text style={[styles.infoVal, themeStyles.infoVal]} numberOfLines={1}>{report.inicio} ➔ {report.fim}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.sectionContainer, themeStyles.sectionContainer]}>
              <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>💬 Conteúdo da Mensagem Disparada</Text>
              
              {dadosExtra.items && dadosExtra.items.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {dadosExtra.items.map((item, idx) => (
                    <View key={idx} style={[styles.itemCard, themeStyles.itemCard]}>
                      <View style={styles.itemHeader}>
                        <Text style={[styles.itemTypeTitle, themeStyles.itemTypeTitle]}>
                          {item.type === 'text' ? '📝 Texto' : item.type === 'image' ? '🖼️ Imagem' : item.type === 'video' ? '🎥 Vídeo' : '🎵 Áudio'}
                        </Text>
                        <View style={[styles.badge, item.isVariation ? styles.badgeAlt : styles.badgeFixo]}>
                          <Text style={[styles.badgeText, item.isVariation ? styles.badgeTextAlt : styles.badgeTextFixo]}>
                            {item.isVariation ? 'Alternado' : 'Fixo'}
                          </Text>
                        </View>
                      </View>
                      
                      {(item.type === 'image' || item.type === 'video' || item.type === 'audio') && (
                        <View style={[styles.mediaAttachedBox, themeStyles.mediaAttachedBox]}>
                          <Text style={[styles.mediaAttachedText, themeStyles.mediaAttachedText]}>
                            📎 Mídia anexada no disparo {item.file?.name ? `(${item.file.name})` : ''}
                          </Text>
                        </View>
                      )}

                      {(item.text || item.caption || item.content) ? (
                        <Text style={[styles.msgText, themeStyles.msgText, { marginTop: 4 }]}>
                          {item.text || item.caption || item.content}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={[styles.msgContainer, themeStyles.msgContainer]}>
                  <Text style={[styles.msgText, themeStyles.msgText]}>{mensagemResumida}</Text>
                  <Text style={[styles.emptyLeadsText, themeStyles.emptyLeadsText, {marginTop: 8}]}>
                    * Detalhamento bloco a bloco indisponível para este histórico antigo.
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.sectionContainer, themeStyles.sectionContainer]}>
              <View style={styles.leadsHeaderRow}>
                <Text style={[styles.sectionTitle, themeStyles.sectionTitle, { marginBottom: 0 }]}>Leads Alcançados na Campanha</Text>
                <Text style={styles.leadsCountBadge}>{dadosExtra.leads?.length || report.total_alvos} registros</Text>
              </View>

              <View style={[styles.tableHeader, themeStyles.tableHeader]}>
                <Text style={[styles.th, themeStyles.th, { flex: 2 }]}>Nome do Lead</Text>
                <Text style={[styles.th, themeStyles.th, { flex: 1.5 }]}>Telefone / WhatsApp</Text>
                <Text style={[styles.th, themeStyles.th, { flex: 1, textAlign: 'right' }]}>Status Envio</Text>
              </View>

              {dadosExtra.leads && dadosExtra.leads.length > 0 ? (
                dadosExtra.leads.map((lead, i) => {
                  const isFalha = lead.status === 'Falha';
                  return (
                    <View key={i} style={[styles.tableRow, themeStyles.tableRow, i % 2 === 0 ? themeStyles.rowEven : themeStyles.rowOdd]}>
                      <Text style={[styles.td, themeStyles.td, { flex: 2, fontWeight: '600' }]} numberOfLines={1}>{lead.name}</Text>
                      <Text style={[styles.td, themeStyles.td, { flex: 1.5 }, isDarkMode ? { color: '#94a3b8' } : { color: '#475569' }]}>{lead.phone}</Text>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <View style={isFalha ? styles.statusPillError : styles.statusPillSuccess}>
                          <Text style={isFalha ? styles.statusPillTextError : styles.statusPillTextSuccess}>
                            {isFalha ? 'Falha' : 'Entregue'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={[styles.emptyLeadsBox, themeStyles.emptyLeadsBox]}>
                  <Text style={[styles.emptyLeadsText, themeStyles.emptyLeadsText]}>Nenhum detalhe individual de lead registrado para este histórico.</Text>
                </View>
              )}
            </View>

          </ScrollView>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '92%', maxWidth: 780, height: '90%', borderRadius: 20, overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0px 20px 40px rgba(0,0,0,0.2)' } }) },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800', fontFamily: MODERN_FONT },
  subtitle: { fontSize: 13, marginTop: 2, fontFamily: MODERN_FONT },
  closeBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 16, fontWeight: 'bold', fontFamily: MODERN_FONT },

  content: { flex: 1, padding: 24 },

  metricsGrid: { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  metricCard: { flex: 1, minWidth: 140, padding: 14, borderRadius: 12, borderLeftWidth: 4, borderWidth: 1 },
  metricLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4, fontFamily: MODERN_FONT },
  metricValue: { fontSize: 18, fontWeight: '800', fontFamily: MODERN_FONT },

  sectionContainer: { marginBottom: 24, padding: 16, borderRadius: 14, borderWidth: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12, fontFamily: MODERN_FONT },
  
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  infoItem: { width: '48%', padding: 10, borderRadius: 8, borderWidth: 1 },
  infoLabel: { fontSize: 11, fontWeight: '600', fontFamily: MODERN_FONT },
  infoVal: { fontSize: 13, fontWeight: '700', marginTop: 2, fontFamily: MODERN_FONT },

  msgContainer: { padding: 14, borderRadius: 8, borderWidth: 1 },
  msgText: { fontSize: 13, fontStyle: 'italic', lineHeight: 18, fontFamily: MODERN_FONT },

  // Estilos dos Novos Cards de Detalhamento
  itemCard: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemTypeTitle: { fontSize: 13, fontWeight: '700', fontFamily: MODERN_FONT },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeFixo: { backgroundColor: '#e0f2fe' },
  badgeAlt: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 10, fontWeight: '700', fontFamily: MODERN_FONT, textTransform: 'uppercase' },
  badgeTextFixo: { color: '#0284c7' },
  badgeTextAlt: { color: '#d97706' },
  mediaAttachedBox: { padding: 8, borderRadius: 6, marginBottom: 6 },
  mediaAttachedText: { fontSize: 12, fontStyle: 'italic', fontFamily: MODERN_FONT },

  leadsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  leadsCountBadge: { backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontFamily: MODERN_FONT },
  
  tableHeader: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginBottom: 4 },
  th: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', fontFamily: MODERN_FONT },
  
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1 },
  td: { fontSize: 13, fontFamily: MODERN_FONT },

  statusPillSuccess: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusPillTextSuccess: { color: '#16a34a', fontSize: 11, fontWeight: '700', fontFamily: MODERN_FONT },

  statusPillError: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusPillTextError: { color: '#dc2626', fontSize: 11, fontWeight: '700', fontFamily: MODERN_FONT },

  emptyLeadsBox: { padding: 20, alignItems: 'center', borderRadius: 8, borderWidth: 1 },
  emptyLeadsText: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', fontFamily: MODERN_FONT }
});

/* Estilos de Tema Claro */
const lightStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#ffffff' },
  header: { backgroundColor: '#f8fafc', borderBottomColor: '#e2e8f0' },
  title: { color: '#0f172a' },
  subtitle: { color: '#64748b' },
  closeBtn: { backgroundColor: '#e2e8f0' },
  closeBtnText: { color: '#334155' },
  metricCard: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  metricLabel: { color: '#64748b' },
  metricValue: { color: '#0f172a' },
  sectionContainer: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  sectionTitle: { color: '#1e293b' },
  infoItem: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  infoLabel: { color: '#64748b' },
  infoVal: { color: '#0f172a' },
  msgContainer: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  msgText: { color: '#334155' },
  
  // Tema claro dos cards
  itemCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  itemTypeTitle: { color: '#0f172a' },
  mediaAttachedBox: { backgroundColor: '#f1f5f9' },
  mediaAttachedText: { color: '#475569' },

  tableHeader: { backgroundColor: '#e2e8f0' },
  th: { color: '#475569' },
  tableRow: { borderBottomColor: '#e2e8f0' },
  rowEven: { backgroundColor: '#ffffff' },
  rowOdd: { backgroundColor: '#f8fafc' },
  td: { color: '#1e293b' },
  emptyLeadsBox: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  emptyLeadsText: { color: '#94a3b8' }
});

/* Estilos de Tema Escuro */
const darkStyles = StyleSheet.create({
  modalContainer: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },
  header: { backgroundColor: '#0f172a', borderBottomColor: '#334155' },
  title: { color: '#f8fafc' },
  subtitle: { color: '#94a3b8' },
  closeBtn: { backgroundColor: '#334155' },
  closeBtnText: { color: '#94a3b8' },
  metricCard: { backgroundColor: '#0f172a', borderColor: '#334155' },
  metricLabel: { color: '#94a3b8' },
  metricValue: { color: '#f8fafc' },
  sectionContainer: { backgroundColor: '#0f172a', borderColor: '#334155' },
  sectionTitle: { color: '#f8fafc' },
  infoItem: { backgroundColor: '#1e293b', borderColor: '#334155' },
  infoLabel: { color: '#94a3b8' },
  infoVal: { color: '#f8fafc' },
  msgContainer: { backgroundColor: '#1e293b', borderColor: '#334155' },
  msgText: { color: '#cbd5e1' },

  // Tema escuro dos cards
  itemCard: { backgroundColor: '#1e293b', borderColor: '#334155' },
  itemTypeTitle: { color: '#f8fafc' },
  mediaAttachedBox: { backgroundColor: '#0f172a' },
  mediaAttachedText: { color: '#94a3b8' },

  tableHeader: { backgroundColor: '#334155' },
  th: { color: '#cbd5e1' },
  tableRow: { borderBottomColor: '#334155' },
  rowEven: { backgroundColor: '#1e293b' },
  rowOdd: { backgroundColor: '#0f172a' },
  td: { color: '#f8fafc' },
  emptyLeadsBox: { backgroundColor: '#1e293b', borderColor: '#334155' },
  emptyLeadsText: { color: '#94a3b8' }
});