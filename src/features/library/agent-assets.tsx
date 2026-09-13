'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
      Array.isArray(a.visual_settings.reference_ids) &&
      a.visual_settings.reference_ids.includes(assetId),
  );
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    action = useAction(),
    router = useRouter();
  return (
    <>
      <p className="muted">
        {assigned.length
          ? 'Agentes: ' + assigned.map((a) => a.name).join(', ')
          : 'Sem associação a agentes'}
      </p>
      {canEdit && (
        <Button
          secondary
          onClick={() => {
            setSelected(assigned.map((a) => a.id));
            setOpen(true);
          }}
        >
          Associar a agentes
        </Button>
      )}
      {open && (
        <Modal title="Agentes que utilizam este arquivo" onClose={() => setOpen(false)}>
          {agents.map((a) => (
            <label className="check" key={a.id}>
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id),
                  )
                }
              />
              {a.name}
            </label>
          ))}
          <Notice {...action} />
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
        </Modal>
      )}
    </>
  );
}
