# CardVision — Detecção de cartas + Roboflow

Frontend responsivo com webcam, probabilidades de **52 cartas sem reposição** e backend Node.js preparado para chamar um **modelo treinado no Roboflow**. Não é necessário baixar o dataset para utilizar o modelo hospedado.

## Integração do seu projeto Roboflow

1. No Roboflow, confirme em **Classes & Tags** que existem classes que distinguem *valor e naipe* (`3_of_clubs`, `AS`, `queen_of_hearts` etc.). Se existir apenas `Cards`, o modelo poderá localizar cartas, mas **não conseguirá identificar qual carta**.
2. Em **Versions**, crie uma versão com o dataset anotado (treino/validação/teste). Use **Train Model** se ainda não existir um modelo treinado. Escolha o modelo e depois abra **Deploy** para obter o identificador exato da versão (por exemplo, `nome-do-projeto/1`).
3. Copie `.env.example` para `.env` na raiz. No `.env`, preencha `ROBOFLOW_MODEL_ID` e `ROBOFLOW_API_KEY` com seus próprios dados. **Não publique a chave, não a envie pelo chat e não coloque no frontend.** O `.env` já está no `.gitignore`.
4. Execute:

```bash
npm install
npm run dev
```

5. Abra o endereço do Vite exibido no terminal (normalmente `http://localhost:5173`). Ative a webcam. O endpoint padrão do frontend `/api/detect` já utiliza o proxy local e encaminha as imagens ao Roboflow por meio do servidor Node na porta 3001.

> Requer Node.js 20.19+ ou 22.12+. A webcam precisa de permissão e de contexto `localhost` ou HTTPS.

## Como funciona

- Superior esquerdo: webcam e caixas sobre as cartas detectadas, indicação da última carta reconhecida, registro manual e configurações.
- Superior direito: 52 cartas, filtros por naipe e probabilidade de cada carta ainda disponível.
- Inferior esquerdo: proporção de cada um dos quatro naipes restantes.
- Inferior direito: proporções das cores vermelha e preta restantes.
- Cartas já removidas recebem 0% e não são removidas novamente. Há confirmação da mesma carta em **dois frames consecutivos** com confiança mínima de **80%**, além de intervalo mínimo de três segundos entre registros.
- Botões para desfazer e reiniciar e persistência local de cartas removidas.

**Confiança do modelo** indica a certeza da identificação visual. **Probabilidade da próxima carta** é calculada apenas pelo baralho restante, supondo sorteio uniforme, e não representa a confiança da IA.

## Convenções de nomes de classes

São aceitas, entre outras: `3_of_clubs`, `3 of clubs`, `3C`, `Ace of Spades`, `AS`, `Queen of Hearts`, `Q-hearts`. No formulário manual: `♣` paus, `♥` copas, `♦` ouros, `♠` espadas.

Se o seu projeto usa outros nomes, crie um arquivo de mapeamento JSON inspirado em `server/class-map.example.json` e indique `ROBOFLOW_CLASS_MAP=./server/seu-mapa.json` no `.env`. Exemplo:

```json
{
  "3_de_paus": "3-clubs",
  "Rainha de Copas": "Q-hearts"
}
```

A imagem anotada deve permitir identificar a carta; uma classe única `Cards` não fornece essa informação. Para nomes personalizados, as entradas no mapa são obrigatórias.

## API

### Saúde e configuração

```http
GET /api/health
```

Retorna `{"configured":true,"provider":"roboflow"}` quando existe configuração válida no servidor. A chave nunca é devolvida.

### Detecção

```http
POST /api/detect
Content-Type: multipart/form-data
image=<frame JPEG>
```

O backend envia o conteúdo como base64 para a API hospedada do Roboflow e devolve uma resposta padronizada:

```json
{
  "card": "3-clubs",
  "confidence": 0.96,
  "image": {"width":640,"height":360},
  "predictions": [
    {"card":"3-clubs","label":"3_of_clubs","confidence":0.96,"x":270,"y":180,"width":120,"height":190}
  ],
  "unknownClasses": []
}
```

A API usa requisições à infraestrutura hospedada do Roboflow e pode consumir créditos. O frontend solicita aproximadamente um frame a cada 1,3 segundo enquanto a câmera está ativa; desative a câmera para interromper. Se não existir modelo treinado ou as classes forem genéricas, a detecção automática ainda não funcionará; o registro manual continua disponível.

## Comandos

```bash
npm test       # testes de lógica e normalização de resposta
npm run build  # frontend de produção
npm start      # servidor que entrega dist/ + API na porta 3001
```

As probabilidades são `100 * quantidade_da_categoria / total_restante`; para uma carta ainda presente, `100 / total_restante`. Com zero cartas não existe próximo sorteio, exibindo 0%.
