'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Notice, api, useAction } from '@/components/ui';
export function AssignConnection({
  connection,
  agents,
  canEdit,
}: {
  connection: { id: string; channel: string; account_name: string };
  agents: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [id, setId] = useState(''),
    action = useAction(),
    router = useRouter();
  return (
    <Card>
      <h3>
        {connection.account_name} · {connection.channel}
      </h3>
      <p>Esta conexão ainda não possui agente responsável.</p>
      {canEdit && (
        <>
          <Field label="Vincular ao agente">
            <select value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Selecione um agente</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Button
            disabled={!id}
            busy={action.busy}
            onClick={() =>
              void action.act(async () => {
                await api('channels', 'POST', {
                  action: 'assign',
                  agent_id: id,
                  connection_id: connection.id,
                  channel: connection.channel,
                });
                router.refresh();
              })
            }
          >
            Vincular conexão
          </Button>
          <Notice {...action} />
        </>
      )}
    </Card>
  );
}
