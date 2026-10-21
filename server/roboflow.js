import { normalizeCard } from '../src/deck.js';

// Roboflow class names may be "3C", "3_clubs", "3 of clubs", etc.
// Optional map handles project-specific names without changing the 52-card model.
export function cardFromClass(className, classMap = {}) {
  if (typeof className !== 'string') return null;
  const raw = className.trim();
  const mapped = classMap[raw] ?? classMap[raw.toLowerCase()] ?? raw;
  if (typeof mapped !== 'string') return null;
  let label = mapped.trim().toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-(of|de|do|da)-/g, '-')
    .replace(/-{2,}/g, '-');
  const numberNames = { one: 'A', ace: 'A', as: 'A', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', jack: 'J', queen: 'Q', king: 'K' };
  const parts = label.split('-');
  if (parts.length > 1 && numberNames[parts[0]]) parts[0] = numberNames[parts[0]];
  label = parts.join('-');
  return normalizeCard(label);
}

// Returns *model confidence*, never the probability of the next card.
export function adaptRoboflowResponse(response, classMap = {}) {
  const entries = Array.isArray(response?.predictions) ? response.predictions : [];
  const predictions = entries.map(p => {
    const card = cardFromClass(p.class, classMap);
    return {
      card: card?.id ?? null,
      label: typeof p.class === 'string' ? p.class : '',
      confidence: Number.isFinite(Number(p.confidence)) ? Math.min(1, Math.max(0, Number(p.confidence))) : 0,
      x: Number.isFinite(Number(p.x)) ? Number(p.x) : null,
      y: Number.isFinite(Number(p.y)) ? Number(p.y) : null,
      width: Number.isFinite(Number(p.width)) ? Number(p.width) : null,
      height: Number.isFinite(Number(p.height)) ? Number(p.height) : null,
    };
  }).sort((a, b) => b.confidence - a.confidence);
  const best = predictions.find(p => p.card !== null);
  return {
    card: best?.card ?? null,
    confidence: best?.confidence ?? 0,
    predictions,
    image: response?.image ?? null,
    unknownClasses: [...new Set(predictions.filter(p => p.card === null).map(p => p.label))].slice(0, 10),
  };
}
