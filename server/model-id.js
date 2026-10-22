// New Roboflow model IDs: workspace/project-version-architecture-tN.
// Legacy aliases (project/version) remain supported when Roboflow resolves them.
export function isValidModelId(value) {
  if (typeof value !== 'string') return false;
  return /^[a-z0-9][a-z0-9_-]*\/(?:[1-9][0-9]*|[a-z0-9][a-z0-9_-]*)$/i.test(value.trim());
}
