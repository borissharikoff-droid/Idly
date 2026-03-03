export function isFeatureEnabled(key: string, fallback = true): boolean {
  if (typeof window === 'undefined') return fallback
  const raw = localStorage.getItem(`grindly_flag_${key}`)
  if (raw === null) return fallback
  return raw === '1' || raw === 'true'
}

export const FEATURE_FLAGS = {
  get progressTimeline() { return isFeatureEnabled('progress_timeline', true) },
  get socialFeed() { return isFeatureEnabled('social_feed', true) },
  get skillCompetitions() { return isFeatureEnabled('skill_competitions', true) },
}
