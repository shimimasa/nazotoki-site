import type { SessionRun, SessionParticipant } from '../../../lib/session-realtime';

export type Screen = 'join' | 'lobby' | 'connecting' | 'session' | 'ended';

export interface ScenarioContent {
  common_html: string;
  evidence_cards: { number: number; title: string; content_html: string }[];
  evidence5: { number: number; title: string; content_html: string } | null;
  characters?: { id: string; name: string; role: string; intro_html: string; public_html: string; imageUrl?: string }[];
}

export const PHASE_DISPLAY: Record<string, { icon: string; label: string; message: string }> = {
  prep: { icon: '\u2699\uFE0F', label: '\u6E96\u5099\u4E2D', message: '\u5148\u751F\u304C\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u6E96\u5099\u3057\u3066\u3044\u307E\u3059...' },
  intro: { icon: '\uD83D\uDCD6', label: '\u5C0E\u5165', message: '\u5148\u751F\u306E\u8AAC\u660E\u3092\u805E\u3044\u3066\u304F\u3060\u3055\u3044' },
  explore: { icon: '\uD83D\uDD0D', label: '\u63A2\u7D22', message: '\u8A3C\u62E0\u30AB\u30FC\u30C9\u3092\u8ABF\u3079\u307E\u3057\u3087\u3046\uFF01' },
  twist: { icon: '\u26A1', label: '\u53CD\u8EE2', message: '\u65B0\u3057\u3044\u8A3C\u62E0\u304C\u660E\u3089\u304B\u306B...\uFF01' },
  discuss: { icon: '\uD83D\uDCAC', label: '\u8B70\u8AD6', message: '\u30B0\u30EB\u30FC\u30D7\u3067\u8A71\u3057\u5408\u3044\u307E\u3057\u3087\u3046' },
  vote: { icon: '\uD83D\uDDF3\uFE0F', label: '\u6295\u7968', message: '\u72AF\u4EBA\u3060\u3068\u601D\u3046\u4EBA\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044' },
  truth: { icon: '\uD83C\uDFAC', label: '\u771F\u76F8', message: '\u5148\u751F\u306E\u753B\u9762\u3092\u898B\u3066\u304F\u3060\u3055\u3044' },
};

export const MAX_RETRIES = 5;
export const getBackoffDelay = (retryCount: number): number =>
  Math.min(3000 * Math.pow(2, retryCount), 30000);

export type { SessionRun, SessionParticipant };
