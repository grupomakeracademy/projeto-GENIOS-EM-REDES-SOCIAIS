'use client';
import { Field } from '@/components/ui';
import type { Agent } from '@/lib/domain';
const purposes = {
  orchestrator: 'Agente / Orquestrador',
  text: 'Modelo de Texto',
  image: 'Modelo de Imagem',
  embedding: 'Memória semântica',
};
export function AgentModels({
  agent,
  onChange,
  disabled,
}: {
  agent: Agent;
  onChange: (a: Agent) => void;
  disabled: boolean;
}) {
  const configs = (agent.text_settings.ai_configs || {}) as Record<
    string,
    { provider: string; model: string }
  >;
  function change(p: string, c: { provider: string; model: string } | null) {
    const next = { ...configs };
    if (c) next[p] = c;
    else delete next[p];
    onChange({ ...agent, text_settings: { ...agent.text_settings, ai_configs: next } });
  }
  return (
    <>
      <h2>Modelos deste agente</h2>
      <p className="muted">Escolha modelos próprios ou mantenha o padrão do workspace.</p>
      <div className="grid two">
        {Object.entries(purposes).map(([p, label]) => (
          <fieldset
            key={p}
            disabled={disabled}
            style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}
          >
            <legend>{label}</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={!!configs[p]}
                onChange={(e) =>
                  change(p, e.target.checked ? { provider: 'openai', model: '' } : null)
                }
              />
              Personalizar para este agente
            </label>
            {configs[p] && (
              <>
                <Field label="Provedor">
                  <select
                    value={configs[p].provider}
                    onChange={(e) => change(p, { ...configs[p], provider: e.target.value })}
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
              </>
            )}
          </fieldset>
        ))}
      </div>
    </>
  );
}
