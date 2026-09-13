'use client';
import { useEffect, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Field, Button, Modal, Notice, api, useAction } from '@/components/ui';
const purposes = {
  orchestrator: 'Agente / Orquestrador',
  text: 'Modelo de Texto',
  image: 'Modelo de Imagem',
  embedding: 'Memória Semântica',
};
type Config = {
  purpose: string;
  provider: string;
  model: string;
  enabled?: boolean;
  active?: boolean;
  credentialConfigured?: boolean;
  apiKey?: string;
  useServerCredential?: boolean;
};
export function AgentModels({ agentId }: { agentId: string }) {
  const [configs, setConfigs] = useState<Record<string, Config>>({}),
    [canManage, setCanManage] = useState(false),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState('');
  const [locked, setLocked] = useState(false),
    [showAccess, setShowAccess] = useState(false),
    [restore, setRestore] = useState(false);
  const action = useAction();
  async function load() {
    const result = await api(`agents/${agentId}/ai`);
    setCanManage(result.canManage === true);
    setConfigs(Object.fromEntries(result.configs.map((c: Config) => [c.purpose, c])));
    setLoaded(true);
  }
  useEffect(() => {
    let disposed = false;
    api(`agents/${agentId}/ai`)
      .then((result) => {
        if (!disposed) {
          setCanManage(result.canManage === true);
          setConfigs(Object.fromEntries(result.configs.map((c: Config) => [c.purpose, c])));
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!disposed) setLoadError('Não foi possível carregar as configurações de IA.');
      });
    return () => {
      disposed = true;
    };
  }, [agentId]);
  useEffect(() => {
    if (!loaded || canManage) return;
    const timer = setTimeout(() => {
      setLocked(true);
      setShowAccess(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [loaded, canManage]);
  const managed = Object.values(configs).some((c) => c.active);
  function change(p: string, c: Config | null) {
    setConfigs((old) => {
      const next = { ...old };
      if (c) next[p] = c;
      else delete next[p];
      return next;
    });
  }
  return (
    <>
      <h2>Modelos deste agente</h2>
      <p className="muted">
        Configuração individual das quatro funções de Inteligência Artificial.
      </p>
      {loadError && <Notice message={loadError} error />}
      {!loaded && !loadError && <p role="status">Carregando configurações…</p>}
      <div className="agent-ai-container">
        <div className={`grid two ${locked ? 'agent-ai-blurred' : ''}`} inert={locked || undefined}>
          {Object.entries(purposes).map(([p, label]) => (
            <fieldset
              key={p}
              disabled={!loaded || !canManage || action.busy}
              className="agent-ai-card"
            >
              <legend>{label}</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!configs[p]}
                  onChange={(e) =>
                    change(
                      p,
                      e.target.checked ? { purpose: p, provider: 'openai', model: '' } : null,
                    )
                  }
                />
                Personalizar para este agente
              </label>
              {configs[p] ? (
                <>
                  <Field label="Provedor">
                    <select
                      value={configs[p].provider}
                      onChange={(e) =>
                        change(p, {
                          ...configs[p],
                          provider: e.target.value,
                          apiKey: '',
                          credentialConfigured: false,
                          useServerCredential: true,
                        })
                      }
                    >
                      <option value="openai">OpenAI</option>
                      <option value="google">Google</option>
                      {(p === 'text' || p === 'orchestrator') && (
                        <option value="anthropic">Anthropic</option>
                      )}
                    </select>
                  </Field>
                  <Field label="ID do modelo">
                    <input
                      required
                      value={configs[p].model}
                      maxLength={160}
                      onChange={(e) => change(p, { ...configs[p], model: e.target.value })}
                    />
                  </Field>
                  {canManage && (
                    <Field label="API Key">
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={configs[p].apiKey || ''}
                        maxLength={4096}
                        placeholder={
                          configs[p].credentialConfigured
                            ? 'API Key configurada — deixe vazio para manter'
                            : 'Opcional: usar credencial do servidor'
                        }
                        onChange={(e) =>
                          change(p, {
                            ...configs[p],
                            apiKey: e.target.value,
                            useServerCredential: false,
                          })
                        }
                      />
                    </Field>
                  )}
                  {configs[p].credentialConfigured && <small>API Key configurada ••••••••</small>}
                  {canManage && configs[p].credentialConfigured && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!configs[p].useServerCredential}
                        onChange={(e) =>
                          change(p, {
                            ...configs[p],
                            apiKey: '',
                            useServerCredential: e.target.checked,
                          })
                        }
                      />
                      Usar credencial do servidor
                    </label>
                  )}
                  <p className="muted">
                    {configs[p].active
                      ? 'Personalização validada'
                      : 'Personalização pendente de validação; o padrão do sistema permanece ativo.'}
                  </p>
                </>
              ) : (
                <p className="muted">Padrão do sistema</p>
              )}
            </fieldset>
          ))}
        </div>
        {locked && (
          <div className="agent-ai-lock">
            <LockKeyhole size={22} />
            <span>Configuração gerenciada pelo Administrador</span>
          </div>
        )}
      </div>
      {loaded && !canManage && (
        <p className="muted">
          {managed
            ? 'A configuração de Inteligência Artificial desta conta é gerenciada pelo Administrador. Para solicitar alterações, entre em contato com o Administrador.'
            : 'A edição destes recursos é exclusiva do Administrador.'}{' '}
          <a href="https://wa.me/5519988788759" target="_blank" rel="noreferrer">
            (19) 98878-8759
          </a>
        </p>
      )}
      <Notice {...action} />
      {canManage && (
        <div className="agent-save-actions">
          <Button secondary disabled={action.busy} onClick={() => setRestore(true)}>
            Restaurar padrão do sistema
          </Button>
          <Button
            busy={action.busy}
            onClick={() =>
              void action.act(async () => {
                if(!Object.keys(configs).length){setRestore(true);return;}
                const payload = Object.values(configs).map((c) => ({
                  purpose: c.purpose,
                  provider: c.provider,
                  model: c.model,
                  ...(c.apiKey ? { apiKey: c.apiKey } : {}),
                  useServerCredential: c.useServerCredential || false,
                }));
                try {
                  await api(`agents/${agentId}/ai`, 'POST', { action: 'save', configs: payload });
                  await load();
                } finally {
                  setConfigs((old) =>
                    Object.fromEntries(
                      Object.entries(old).map(([p, c]) => [p, { ...c, apiKey: '' }]),
                    ),
                  );
                }
              }, 'Configurações validadas e salvas.')
            }
          >
            Salvar alterações
          </Button>
        </div>
      )}
      {showAccess && (
        <Modal
          title="Acesso Restrito"
          icon={<LockKeyhole />}
          className="agent-access-modal"
          onClose={() => setShowAccess(false)}
        >
          <p>
            {managed
              ? 'A configuração de Inteligência Artificial desta conta é gerenciada pelo Administrador. Para solicitar alterações, entre em contato com o Administrador.'
              : 'Entre em contato com o Administrador para conhecer e contratar os recursos avançados de personalização de Inteligência Artificial pelo WhatsApp'}{' '}
            <a href="https://wa.me/5519988788759" target="_blank" rel="noreferrer">
              (19) 98878-8759
            </a>
            .
          </p>
          <Button onClick={() => setShowAccess(false)}>Entendi</Button>
        </Modal>
      )}
      {restore && (
        <Modal
          title="Restaurar padrão do sistema"
          onClose={() => {
            if (!action.busy) setRestore(false);
          }}
        >
          <p>
            Tem certeza de que deseja restaurar o padrão do sistema? As personalizações de IA deste
            agente serão removidas e ele voltará a utilizar as configurações globais definidas em
            Configurações → Inteligência Artificial.
          </p>
          <div className="agent-save-actions">
            <Button secondary disabled={action.busy} onClick={() => setRestore(false)}>
              Cancelar
            </Button>
            <Button
              busy={action.busy}
              onClick={() =>
                void action.act(async () => {
                  await api(`agents/${agentId}/ai`, 'POST', { action: 'restore', confirm: true });
                  setRestore(false);
                  await load();
                }, 'Padrão do sistema restaurado.')
              }
            >
              Restaurar padrão
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
