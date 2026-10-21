# CardVision — Dashboard de detecção de cartas

Frontend responsivo para um baralho de 52 cartas sem reposição. Quatro quadrantes: webcam, probabilidade de cada carta, probabilidades de naipes e probabilidades de vermelho/preto.

## Executar

```bash
npm install
npm run dev
```

Use localhost ou HTTPS para permitir o acesso à webcam.

## Detecção automática

O frontend não inclui um classificador de imagens. Clique na engrenagem e configure uma API que receba `POST multipart/form-data` com imagem JPEG no campo `image`. Ela deve devolver `{"card":"AS","confidence":0.99}` (ou `{"rank":"A","suit":"spades","confidence":0.99}`). A carta é registrada após duas detecções consecutivas com confiança >= 0,8, respeitando um intervalo de 3 segundos. Configure CORS no backend. Sem API, é possível registrar a carta pelo seletor manual.

## Probabilidade

- Carta restante: 100/N%; carta já retirada: 0%.
- Naipe: 100 × quantidade do naipe / N%.
- Cor: 100 × quantidade da cor / N%.

N é a quantidade total de cartas restantes. Quando N=0 não há próximo sorteio e a interface mostra 0%.

## Testes

`npm test` executa seis testes de probabilidade, validação e casos extremos.
