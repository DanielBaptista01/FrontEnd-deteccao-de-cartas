export const SUITS = [
  { id: 'clubs', label: 'Paus', symbol: '♣', color: 'black' },
  { id: 'hearts', label: 'Copas', symbol: '♥', color: 'red' },
  { id: 'diamonds', label: 'Ouros', symbol: '♦', color: 'red' },
  { id: 'spades', label: 'Espadas', symbol: '♠', color: 'black' }
];
export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export const DECK = SUITS.flatMap(suit => RANKS.map(rank => ({ id: `${rank}-${suit.id}`, rank, suit: suit.id, symbol: suit.symbol, color: suit.color, label: `${rank}${suit.symbol}` })));
const suitAliases = { clubs:'clubs', club:'clubs', paus:'clubs', '♣':'clubs', c:'clubs', hearts:'hearts', heart:'hearts', copas:'hearts', '♥':'hearts', h:'hearts', diamonds:'diamonds', diamond:'diamonds', ouros:'diamonds', '♦':'diamonds', d:'diamonds', spades:'spades', spade:'spades', espadas:'spades', '♠':'spades', s:'spades' };
const rankAliases = { ace:'A', as:'A', ás:'A', jack:'J', valete:'J', queen:'Q', dama:'Q', king:'K', rei:'K' };
export function normalizeCard(input) {
  if (input && typeof input === 'object') {
    if (typeof input.id === 'string' && !input.rank && !input.suit) return normalizeCard(input.id);
    if (input.rank != null && input.suit != null) return normalizeCard(`${input.rank}-${input.suit}`);
    return null;
  }
  if (typeof input !== 'string') return null;
  let text = input.trim().toLowerCase();
  let rank, suit;
  const dashed = text.match(/^(.+?)[-_ ](clubs|club|paus|hearts|heart|copas|diamonds|diamond|ouros|spades|spade|espadas|c|h|d|s|♣|♥|♦|♠)$/i);
  if (dashed) {rank = dashed[1]; suit = dashed[2];}
  else {
    const compact = text.match(/^(10|[a2-9jqk])([chds♣♥♦♠])$/i);
    if (!compact) return null;
    rank = compact[1]; suit = compact[2];
  }
  const normalizedRank = rankAliases[rank] ?? rank.toUpperCase();
  const normalizedSuit = suitAliases[suit];
  return DECK.find(card => card.rank === normalizedRank && card.suit === normalizedSuit) ?? null;
}
export function probabilities(removedIds = []) {
  const removed = new Set(removedIds.filter(id => DECK.some(card => card.id === id)));
  const remaining = DECK.filter(card => !removed.has(card.id));
  const total = remaining.length;
  const percent = count => total ? (count / total) * 100 : 0;
  return {
    total, removed: removed.size,
    cards: DECK.map(card => ({ ...card, remaining: !removed.has(card.id), probability: removed.has(card.id) ? 0 : percent(1) })),
    suits: SUITS.map(suit => ({ ...suit, count: remaining.filter(card => card.suit === suit.id).length, probability: percent(remaining.filter(card => card.suit === suit.id).length) })),
    colors: ['red','black'].map(color => ({ color, count: remaining.filter(card => card.color === color).length, probability: percent(remaining.filter(card => card.color === color).length) }))
  };
}
