'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Check, Users } from 'lucide-react';
import { Button, Modal, Notice, api, useAction } from '@/components/ui';

export type AssetAgent = { id: string; name: string; visual_settings: Record<string, unknown> };

export function AssetAgents({
  assetId,
  agents,
  canEdit,
}: {
  assetId: string;
  agents: AssetAgent[];
  canEdit: boolean;
}) {
  const assigned = agents.filter(
    (a) =>
      Array.isArray(a.visual_settings?.reference_ids) &&
      (a.visual_settings.reference_ids as string[]).includes(assetId),
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');
  const action = useAction();
  const router = useRouter();

  const handleOpen = () => {
    setSelected(assigned.map((a) => a.id));
    setFilterText('');
    setOpen(true);
  };

  const filteredAgents = filterText.trim()
    ? agents.filter((a) => a.name.toLowerCase().includes(filterText.toLowerCase()))
    : agents;

  const selectAll = () => setSelected(agents.map((a) => a.id));
  const deselectAll = () => setSelected([]);

  return (
    <>
      <div style={{ minHeight: 28, margin: '8px 0' }}>
        {assigned.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {assigned.map((a) => (
              <span
                key={a.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: '11px',
                  fontWeight: 600,
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                }}
              >
                <Bot size={12} />
                {a.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '12px' }}>
            Sem associação a agentes
          </p>
        )}
      </div>

      {canEdit && (
        <Button secondary onClick={handleOpen} style={{ width: '100%', marginTop: 4 }}>
          <Users size={15} style={{ marginRight: 6 }} />
          Associar a agentes
        </Button>
      )}

      {open && (
        <Modal
          title="Associar Arquivo aos Agentes"
          subtitle="Selecione um ou mais agentes criados para utilizar esta imagem como referência de identidade visual."
          onClose={() => setOpen(false)}
        >
          {agents.length > 4 && (
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Filtrar agentes..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '13px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                }}
              />
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              fontSize: '12px',
              color: '#64748b',
            }}
          >
            <span>
              {selected.length} de {agents.length} agente(s) selecionado(s)
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={selectAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: 0,
                }}
              >
                Marcar todos
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={deselectAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: 0,
                }}
              >
                Desmarcar todos
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: '45vh',
              overflowY: 'auto',
              padding: '2px 0',
            }}
          >
            {filteredAgents.length > 0 ? (
              filteredAgents.map((a) => {
                const isChecked = selected.includes(a.id);
                return (
                  <label
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: isChecked ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                      background: isChecked ? '#f0f7ff' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, a.id]
                            : selected.filter((id) => id !== a.id),
                        )
                      }
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: isChecked ? '#3b82f6' : '#e2e8f0',
                          color: isChecked ? '#ffffff' : '#64748b',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Bot size={16} />
                      </div>
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>{a.name}</strong>
                    </div>
                    {isChecked && (
                      <span style={{ color: '#2563eb', display: 'grid', placeItems: 'center' }}>
                        <Check size={16} />
                      </span>
                    )}
                  </label>
                );
              })
            ) : (
              <p className="muted" style={{ textAlign: 'center', padding: 16 }}>
                Nenhum agente encontrado.
              </p>
            )}
          </div>

          <Notice {...action} />

          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button secondary type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              busy={action.busy}
              onClick={() =>
                void action.act(async () => {
                  await api('assets', 'PATCH', {
                    action: 'associate',
                    id: assetId,
                    agent_ids: selected,
                  });
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              Salvar associações
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
