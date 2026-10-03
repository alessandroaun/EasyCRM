import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { aiAgentsService } from '../services/aiAgentsService';
import { crmActivityTracker } from '../utils/crmActivityTracker';
import { useAuth } from './AuthContext';
import { isClosedPhase } from '../hooks/useAIPipelineAutomator';

const BoardContext = createContext();

export function BoardProvider({ children }) {
  const { user, userProfile } = useAuth();
  const [boardData, setBoardData] = useState(null);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [currentBoardUserId, setCurrentBoardUserId] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [systemNotifications, setSystemNotifications] = useState([]);
  const [activeNotifications, setActiveNotifications] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  const isSavingRef = useRef(false);
  const activeFetchIdRef = useRef(0);
  const loadedBoardUserIdRef = useRef(null);

  const showToast = (message, type = 'info') => {
    const toastId = Date.now();
    if (typeof message === 'object' && message !== null) {
      setToastMessage({ id: toastId, type, ...message });
    } else {
      setToastMessage({ id: toastId, text: message, type });
    }
    setTimeout(() => {
      setToastMessage((prev) => (prev?.id === toastId ? null : prev));
    }, 5000);
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*');

      if (error) {
        console.error('[BoardContext] Erro ao buscar usuários:', error);
        return;
      }

      if (data) {
        const sorted = [...data].sort((a, b) => {
          if (a.id === user?.id) return -1;
          if (b.id === user?.id) return 1;
          return 0;
        });
        setUsersList(sorted);
      }
    } catch (e) {
      console.warn('[BoardContext] Falha na busca de usuários:', e);
    }
  };

  // Carregar lista de vendedores e gestores caso seja Admin, Gerente ou Supervisor
  useEffect(() => {
    const role = (userProfile?.role || '').toLowerCase();
    if (['admin', 'administrador', 'gerente', 'supervisor'].includes(role)) {
      fetchUsers();
    }
  }, [userProfile, user]);

  // Carregar Board inicial e alternar entre usuários com isolamento estrito
  useEffect(() => {
    const targetUserId = currentBoardUserId || user?.id;
    if (!targetUserId) {
      setBoardData(null);
      setLoadingBoard(false);
      loadedBoardUserIdRef.current = null;
      return;
    }

    const currentFetchId = ++activeFetchIdRef.current;
    setLoadingBoard(true);
    setBoardData(null);
    loadedBoardUserIdRef.current = null;

    const fetchBoard = async () => {
      try {
        const { data: boards, error } = await supabase
          .from('crm_boards')
          .select('id, data_payload')
          .eq('user_id', targetUserId)
          .ilike('id', 'board_%')
          .order('id', { ascending: false })
          .limit(1);

        // Se uma nova alternância de usuário foi solicitada durante a requisição, descarta resposta obsoleta
        if (currentFetchId !== activeFetchIdRef.current) return;

        if (error) {
          console.error('[BoardContext] Erro ao buscar board:', error);
        } else if (boards && boards.length > 0) {
          setBoardData(boards[0].data_payload);
          loadedBoardUserIdRef.current = targetUserId;
        } else {
          // Criar board padrão inicial apenas se não houver board existente para este usuário
          const defaultData = {
            phases: [
              { id: 'phase_1', title: 'Novo Cliente', color: '#f1f5f9', clients: [] },
              { id: 'phase_2', title: 'Tentou Contato', color: '#e0f2fe', clients: [] },
              { id: 'phase_3', title: 'Contato Realizado', color: '#fef9c3', clients: [] },
              { id: 'phase_4', title: 'Em Negociação', color: '#ffedd5', clients: [] },
              { id: 'phase_5', title: 'StandBY', color: '#e2e8f0', clients: [] },
              { id: 'phase_6', title: 'Perdidos', color: '#fee2e2', clients: [] },
              { id: 'phase_7', title: 'Fechados', color: '#dcfce7', clients: [] }
            ],
            trash: []
          };
          const newBoardId = `board_${Date.now()}`;
          await supabase.from('crm_boards').insert([
            { id: newBoardId, user_id: targetUserId, data_payload: defaultData }
          ]);
          if (currentFetchId === activeFetchIdRef.current) {
            setBoardData(defaultData);
            loadedBoardUserIdRef.current = targetUserId;
          }
        }
      } catch (err) {
        console.error('[BoardContext] Falha ao carregar board:', err);
      } finally {
        if (currentFetchId === activeFetchIdRef.current) {
          setLoadingBoard(false);
        }
      }
    };

    fetchBoard();

    // Inscrição Realtime no Supabase protegida por targetUserId e fetchId
    const channel = supabase
      .channel(`realtime-board-${targetUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crm_boards',
          filter: `user_id=eq.${targetUserId}`
        },
        (payload) => {
          if (currentFetchId === activeFetchIdRef.current && !isSavingRef.current && payload.new?.data_payload) {
            setBoardData(payload.new.data_payload);
            loadedBoardUserIdRef.current = targetUserId;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentBoardUserId, user?.id]);

  // Sincronizar alterações com o Supabase com blindagem de propriedade
  const saveBoard = async (newBoardData) => {
    const targetUserId = currentBoardUserId || user?.id;
    if (!targetUserId || !newBoardData) return;

    // Blindagem de integridade: se o board em memória for de outro usuário, aborta para não contaminar
    if (loadedBoardUserIdRef.current && loadedBoardUserIdRef.current !== targetUserId) {
      console.warn(`[BoardContext] saveBoard bloqueado por segurança: loadedUserId (${loadedBoardUserIdRef.current}) != targetUserId (${targetUserId})`);
      return;
    }

    setBoardData(newBoardData);
    loadedBoardUserIdRef.current = targetUserId;
    isSavingRef.current = true;

    try {
      const { data: boards, error: boardsErr } = await supabase
        .from('crm_boards')
        .select('id')
        .eq('user_id', targetUserId)
        .ilike('id', 'board_%')
        .order('id', { ascending: false })
        .limit(1);

      if (boardsErr) {
        console.error('[BoardContext] Erro ao buscar board no Supabase:', boardsErr);
      } else if (boards && boards.length > 0) {
        const { error: updateErr } = await supabase
          .from('crm_boards')
          .update({ data_payload: newBoardData })
          .eq('id', boards[0].id)
          .eq('user_id', targetUserId);

        if (updateErr) {
          console.error('[BoardContext] Erro ao sincronizar board no Supabase:', updateErr);
        }
      }
    } catch (e) {
      console.error('[BoardContext] Exceção ao sincronizar:', e);
    } finally {
      setTimeout(() => {
        isSavingRef.current = false;
      }, 800);
    }
  };

  // Funções Utilitárias do Pipeline
  const moveClient = (clientId, sourcePhaseId, targetPhaseId, targetIndex = 0) => {
    if (!boardData) return;
    const cloned = JSON.parse(JSON.stringify(boardData));
    const sPhase = cloned.phases.find(p => p.id === sourcePhaseId);
    const tPhase = cloned.phases.find(p => p.id === targetPhaseId);
    if (!sPhase || !tPhase) return;

    const clientIdx = sPhase.clients.findIndex(c => c.id === clientId);
    if (clientIdx === -1) return;

    const [client] = sPhase.clients.splice(clientIdx, 1);
    
    // Inserir registro no histórico do cliente e atualizar data de última interação
    const nowIso = new Date().toISOString();
    client.updatedAt = nowIso;

    // Detecta se a coluna de destino ou de origem é de fechamento
    const isTargetClosed = isClosedPhase(tPhase.title);
    const isSourceClosed = isClosedPhase(sPhase.title);

    if (isTargetClosed) {
      client.dealClosed = true;
      client.dealClosedDate = client.dealClosedDate || nowIso;
      client.winProbability = '100';
      client.aiScore = 100;
      client.leadTemp = 'Quente';
      if (!client.clientStatus) client.clientStatus = 'Cliente Não Contemplado';
    } else if (isSourceClosed) {
      // Se estava em Fechados e foi reaberto para uma coluna ativa
      client.dealClosed = false;
      client.winProbability = client.winProbability === '100' ? '50' : client.winProbability;
    }

    if (!client.comments) client.comments = [];
    client.comments.unshift({
      id: Date.now().toString(),
      text: isTargetClosed
        ? `🏆 Sistema: Lead movido para "${tPhase.title}" (Venda Marcada como Fechada).`
        : `Sistema: Lead movido de "${sPhase.title}" para "${tPhase.title}".`,
      date: nowIso
    });

    if (targetIndex >= 0 && targetIndex <= tPhase.clients.length) {
      tPhase.clients.splice(targetIndex, 0, client);
    } else {
      tPhase.clients.push(client);
    }

    saveBoard(cloned);

    // Registra interação no rastreador para a esteira de 2h de Minha Central
    crmActivityTracker.recordInteraction('MOVE_LEAD', { clientId, sourcePhase: sPhase.title, targetPhase: tPhase.title });

    // ATIVAÇÃO AUTOMÁTICA DA INTELIGÊNCIA EM SEGUNDO PLANO (Apenas para leads em pré-venda ativa)
    if (!isTargetClosed) {
      setTimeout(async () => {
        try {
          const clientWithPhase = { ...client, currentPhaseTitle: tPhase.title };
          const analysis = await aiAgentsService.qualifyLeadCommercial(clientWithPhase);
          if (analysis) {
            const score = Number(analysis.score) || 50;
            const tempRaw = (analysis.temperatura || '').toLowerCase();
            const tempFormatted = tempRaw === 'quente' ? 'Quente' : (tempRaw === 'morno' ? 'Morno' : 'Frio');

            setBoardData((prevBoard) => {
              if (!prevBoard?.phases) return prevBoard;
              const updatedBoard = JSON.parse(JSON.stringify(prevBoard));
              let foundClient = null;
              for (const p of updatedBoard.phases) {
                const c = (p.clients || []).find(item => String(item.id) === String(clientId));
                if (c) {
                  c.aiScore = score;
                  c.leadTemp = tempFormatted;
                  c.aiIntelligenceUpdatedAt = new Date().toISOString();
                  foundClient = c;
                  break;
                }
              }
              if (foundClient) {
                saveBoard(updatedBoard);
              }
              return updatedBoard;
            });
            console.log(`[BoardContext] Inteligência atualizada em segundo plano para "${client.name}" (${sPhase.title} ➔ ${tPhase.title}). Score: ${score}% (${tempFormatted}).`);
          }
        } catch (eAi) {
          console.warn('[BoardContext] Falha na qualificação em segundo plano após movimentação:', eAi.message);
        }
      }, 400);
    }
  };

  // Adiciona um comentário/atividade ao histórico de um lead de forma atômica
  const addLeadComment = async (leadId, commentText) => {
    if (!boardData?.phases || !leadId || !commentText) return false;
    const cloned = JSON.parse(JSON.stringify(boardData));
    let found = false;

    for (const phase of cloned.phases) {
      for (const client of phase.clients || []) {
        if (client.id === leadId) {
          if (!client.comments) client.comments = [];
          client.comments.unshift({
            id: `comm_${Date.now()}`,
            text: commentText,
            date: new Date().toISOString()
          });
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (found) {
      await saveBoard(cloned);
      return true;
    }
    return false;
  };

  return (
    <BoardContext.Provider
      value={{
        boardData,
        loadingBoard,
        currentBoardUserId,
        setCurrentBoardUserId,
        usersList,
        refreshUsers: fetchUsers,
        saveBoard,
        addLeadComment,
        moveClient,
        recordCRMActivity: (type, meta) => crmActivityTracker.recordInteraction(type, meta),
        systemNotifications,
        setSystemNotifications,
        activeNotifications,
        setActiveNotifications,
        toastMessage,
        showToast
      }}
    >
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard() {
  const context = useContext(BoardContext);
  if (!context) throw new Error('useBoard deve ser usado dentro de BoardProvider');
  return context;
}
