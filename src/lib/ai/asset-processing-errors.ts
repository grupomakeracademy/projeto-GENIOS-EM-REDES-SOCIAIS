const messages: Record<string, string> = {
  authentication_error: 'O serviço de análise recusou a credencial configurada. Peça ao administrador para verificar a chave da OpenAI.',
  openai_credential_missing: 'A análise visual precisa de uma chave da OpenAI configurada pelo administrador.',
  storage_download_failed: 'Não foi possível acessar o arquivo. Tente novamente ou peça ao administrador para verificar o armazenamento.',
  asset_persistence_failed: 'Não foi possível salvar o resultado da análise. Tente novamente.',
  asset_not_found: 'O arquivo não foi encontrado ou não está disponível nesta conta.',
  rate_limit: 'O serviço de análise está recebendo muitas solicitações. Aguarde e tente novamente.',
  provider_quota_exceeded: 'O serviço de análise está sem saldo disponível. Entre em contato com o administrador.',
  timeout: 'A análise demorou além do esperado. Tente novamente.',
  provider_unavailable: 'O serviço de análise está temporariamente indisponível. Tente novamente.',
  content_policy: 'O serviço não pôde analisar este arquivo. Verifique o conteúdo ou utilize outra referência.',
  invalid_output: 'O serviço retornou uma análise incompleta. Tente processar novamente.',
  provider_request_rejected: 'O serviço não aceitou o arquivo para análise. Peça ao administrador para verificar o formato e a configuração.',
};
export function assetProcessingCode(error: unknown) {
  if (error instanceof Error && error.name === 'ZodError') return 'invalid_output';
  if (error instanceof SyntaxError) return 'invalid_output';
  const message = error instanceof Error ? error.message : '';
  return Object.hasOwn(messages, message) ? message : 'asset_processing_failed';
}
export function assetProcessingMessage(code?: string) {
  return code && Object.hasOwn(messages, code) ? messages[code] : 'Não foi possível processar o arquivo. Tente novamente ou entre em contato com o administrador.';
}
