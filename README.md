# CardVision — Webcam + Roboflow Workflow (WebRTC)

Painel responsivo com quatro quadrantes: webcam, probabilidades das 52 cartas, probabilidades por naipe, e probabilidades de vermelho/preto, **sem reposição**.

## Workflow Roboflow (conferido via OAuth/MCP)

- Nome: **Cards vcards-ksgh0-2-rfdetr-small-t1 Logic**
- Workspace (slug): `cardsdetection-pwqty`
- Workflow ID (slug): `cards-vcards-ksgh0-2-rfdetr-small-t1-logic`
- Entrada declarada: `image` (`InferenceImage`)
- Parâmetros declarados: **nenhum**
- Saída declarada: `predictions` (JsonField); não possui saída de imagem anotada
- O modelo interno do Workflow é `cardsdetection-pwqty/cards-ksgh0-2-rfdetr-small-t1`.

**Resposta real observada em `workflows_run`:** lista com um item por imagem; o campo `predictions` contém `{image:{width,height},predictions:[{class,confidence,x,y,width,height,...}]}`. O exemplo real de uma imagem de teste reconheceu `5_ouros` com confiança ~0,481, e não tem saídas de imagem base64.

## Executar

1. É necessário Node.js 20.19+ ou 22.12+, Chrome/Edge/Firefox com suporte WebRTC, e acesso à câmera em `localhost` ou HTTPS.
2. Copie `.env.example` para `.env` e preencha apenas `ROBOFLOW_API_KEY` com a chave privada de seu workspace. **Não coloque a chave no frontend, GitHub, URLs, screenshots ou logs.** O arquivo `.env` está ignorado pelo Git.
3. Rode:

```bash
npm install
npm run dev
```

4. Abra `http://localhost:5173`. Clique em **Ativar webcam** para **iniciar uma sessão WebRTC com a nuvem Roboflow**. Apenas o áudio está desativado; o vídeo é transmitido ao Roboflow enquanto a sessão está ativa. Clique em **Parar** para encerrar.
5. A sessão solicita a GPU `webrtc-gpu-small`, região `us` e `processing_timeout=180` segundos. O frontend também encerra automaticamente a webcam em aproximadamente 175 segundos. A primeira conexão pode demorar devido à inicialização/carga do modelo. O serviço pode consumir **créditos por tempo de GPU**. Consulte sua assinatura no Roboflow antes de usar continuamente.

A conexão WebRTC usa `@roboflow/inference-sdk` no navegador com o proxy local `POST /api/init-webrtc`. O backend fixa o workspace, o Workflow, a entrada e a saída; o frontend nunca recebe a chave privada.

A versão publicada do Workflow retorna **dados**, não um vídeo anotado. Por isso, mostramos a câmera local com caixas desenhadas no `canvas`, usando as detecções recebidas pelo canal de dados WebRTC.

## Como o baralho é atualizado

- O detector identifica uma carta em pelo menos **dois frames consecutivos com confiança ≥80%**.
- A contagem só é alterada **depois que a carta desaparece da imagem por dois frames**. Ex.: mostre 5♦ e retire-o da câmera.
- O limiar ótimo F1 de 30% no teste Roboflow é distinto do critério conservador de registro automático de 80%. Caso haja muitas cartas não registradas, avalie o modelo com webcam antes de diminuir o limiar. Detecções erradas devem ser corrigidas com **Desfazer última**.
- Uma carta retirada não pode ser registrada de novo; após reiniciar ou desfazer, as probabilidades são recalculadas. O histórico do baralho permanece no armazenamento local.
- Caso o reconhecimento automático esteja indisponível, as cartas podem ser registradas manualmente pelo seletor.

Com `N` cartas restantes, a probabilidade de uma carta específica ainda presente é `100/N`; a de um naipe/cor é `100 × contagem_do_grupo / N`. As cartas removidas têm 0%. Com N=0 não há próximo sorteio.

## API local

- `GET /api/health`: status da configuração (sem revelar credenciais).
- `POST /api/init-webrtc`: inicia WebRTC na infraestrutura serverless, aceitando apenas uma oferta SDP do navegador e aplicando a configuração fixa do Workflow.
- `POST /api/stop-webrtc`: solicita encerramento da sessão remota registrada pelo servidor. Se o encerramento não puder ser confirmado, o limite de processamento remoto de 180 segundos permanece como proteção.
- `POST /api/detect`: opção de teste com **uma imagem JPEG/PNG/WebP** enviada no campo `image`. O backend chama o **mesmo Workflow** via `POST https://serverless.roboflow.com/cardsdetection-pwqty/workflows/cards-vcards-ksgh0-2-rfdetr-small-t1-logic`, passa `inputs.image` em base64 e interpreta a lista de saídas. Esta rota não é o caminho de streaming.

As chamadas de inicialização, término e imagem autenticam com `Authorization: Bearer` no servidor. Nunca enviam a chave na URL, no corpo da requisição ou no código do navegador. Retentativas exponenciais são usadas apenas para erros temporários e com limites de tempo.

## Testes

```bash
npm test
```

O arquivo `tests/workflow-client.test.js` contém um teste de contrato para a **resposta real amostrada do Workflow**, um teste de imagem com HTTP simulado (que verifica cabeçalho Bearer e nomes de saída), testes de SDP, erros e retentativas. Inclui também um teste ao vivo **opcional**, que só roda quando `ROBOFLOW_API_KEY` estiver presente no ambiente:

```bash
node --test tests/workflow-client.test.js
```

O teste ao vivo usa uma imagem de teste existente no workspace e pode consumir créditos. Nunca grave a imagem nem a chave no repositório.

Os testes de `src/workflow-events.js` verificam a leitura de `serialized_output_data`, prevenção de duplicatas, rejeição de baixa confiança e confirmação da retirada.

## Limitações

- A execução via Roboflow MCP de **uma imagem real** foi concluída com resposta válida. A sessão WebRTC do navegador e a conexão com a chave privada precisam ser verificadas no computador que hospeda o projeto.
- O backend é um serviço local, limitado a `127.0.0.1`. Para implantar publicamente, adicione autenticação, controles de sessões, HTTPS e proteção contra uso indevido de recursos antes de expor o proxy.
- TURN pode ser necessário em redes restritas; nesta integração é usado o STUN padrão do SDK, sem expor credenciais privadas.
- O streaming envia frames para um serviço externo e pode implicar cobrança por tempo de uso.
