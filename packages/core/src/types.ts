export type ReplayClass =
  | "portable-public"
  | "portable-token"
  | "session-cookie"
  | "browser-bound";

export type HealthStatus = "healthy" | "shaky" | "broken";

export type AdviceKind = "danger" | "improve" | "healthy";

export type AdviceArea =
  | "api"
  | "images"
  | "performance"
  | "security"
  | "privacy"
  | "a11y"
  | "seo"
  | "runtime";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type ResourceType =
  | "document"
  | "script"
  | "stylesheet"
  | "image"
  | "font"
  | "xhr"
  | "fetch"
  | "media"
  | "websocket"
  | "other";

export interface NetworkEntry {
  id: string;
  method: string;
  url: string;
  resourceType: ResourceType;
  status?: number;
  durationMs?: number;
  transferSize?: number;
  decodedSize?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  initiator?: string;
  failed?: boolean;
  error?: string;
  timestamp: number;
  firstParty: boolean;
}

export interface ImageEntry {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  bytes?: number;
  broken?: boolean;
  lazy?: boolean;
}

export interface ConsoleEntry {
  level: "error" | "warn" | "info" | "log";
  message: string;
  stack?: string;
  timestamp: number;
}

export interface PerfSnapshot {
  totalTransferBytes: number;
  totalDecodedBytes: number;
  requestCount: number;
  failedCount: number;
  byType: Record<string, { count: number; bytes: number }>;
  firstPartyBytes: number;
  thirdPartyBytes: number;
  firstPartyRequests: number;
  thirdPartyRequests: number;
  ttfbMs?: number;
  domContentLoadedMs?: number;
  loadEventMs?: number;
  fullyLoadedMs?: number;
  lcpMs?: number;
  fcpMs?: number;
  cls?: number;
  inpMs?: number;
  lcpElement?: string;
  clsElement?: string;
  inpElement?: string;
  slowestApis: Array<{ url: string; durationMs: number; status?: number }>;
  largestResources: Array<{ url: string; bytes: number; type: string }>;
}

export interface CookieEntry {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  firstParty: boolean;
}

export interface ScriptEntry {
  src?: string;
  inline: boolean;
  async: boolean;
  defer: boolean;
  module: boolean;
  firstParty: boolean;
  hasSri: boolean;
}

export interface SeoSnapshot {
  title?: string;
  description?: string;
  canonical?: string;
  ogTitle?: string;
  ogImage?: string;
  h1Count: number;
  jsonLdCount: number;
}

export interface DomHealth {
  nodeCount: number;
  maxDepth: number;
  iframeCount: number;
  inlineScriptBytes: number;
}

export interface LinkEntry {
  href: string;
  text: string;
  external: boolean;
  nofollow: boolean;
}

export interface FormEntry {
  action?: string;
  method: string;
  insecureAction: boolean;
  fieldCount: number;
  missingLabels: number;
}

export interface TrackerEntry {
  domain: string;
  name: string;
  type: "analytics" | "ads" | "social" | "other";
}

export interface FingerprintEvent {
  api: string;
  timestamp: number;
}

export interface WellKnownFiles {
  robotsTxt?: { status: number; preview?: string };
  sitemapXml?: { status: number };
  securityTxt?: { status: number; preview?: string };
  manifest?: { status: number; name?: string };
  adsTxt?: { status: number };
}

export interface TechSignal {
  name: string;
  category: string;
  evidence: string;
}

export interface RuntimeSnapshot {
  serviceWorkers: string[];
  cacheNames: string[];
  indexedDbNames: string[];
  workerCount: number;
  sourceMapUrls: string[];
}

export interface SecuritySnapshot {
  headers: Record<string, string>;
  hasHsts: boolean;
  hasCsp: boolean;
  hasXfo: boolean;
  hasReferrerPolicy: boolean;
  hasPermissionsPolicy: boolean;
  mixedContentUrls: string[];
}

export interface Finding {
  id: string;
  ruleId: string;
  severity: Severity;
  title: string;
  plainTitle: string;
  detail?: Record<string, unknown>;
  area: AdviceArea;
}

export interface AdviceCard {
  id: string;
  kind: AdviceKind;
  area: AdviceArea;
  severity: Severity;
  title: string;
  whyItMatters: string;
  suggestion: string;
  relatedFindingId?: string;
}

export interface PortableApi {
  id: string;
  method: string;
  url: string;
  replayClass: ReplayClass;
  authType?: string;
  humanName: string;
  purpose: string;
  status?: number;
  durationMs?: number;
  headers?: Record<string, string>;
  body?: string;
  redactedCodegen?: {
    curl: string;
    fetch: string;
    python: string;
  };
}

export interface ApiEndpoint {
  key: string;
  method: string;
  origin: string;
  path: string;
  count: number;
  statuses: number[];
  avgDurationMs?: number;
  humanName: string;
  purpose: string;
  replayClass?: ReplayClass;
}

export interface AutopsySession {
  tabId: number;
  pageUrl: string;
  pageTitle?: string;
  startedAt: number;
  requests: NetworkEntry[];
  apiCatalog: ApiEndpoint[];
  portableApis: PortableApi[];
  images: ImageEntry[];
  console: ConsoleEntry[];
  performance: PerfSnapshot;
  cookies: CookieEntry[];
  storage: {
    local: Record<string, string>;
    session: Record<string, string>;
  };
  scripts: ScriptEntry[];
  security: SecuritySnapshot;
  seo: SeoSnapshot;
  a11y?: unknown;
  links: LinkEntry[];
  forms: FormEntry[];
  trackers: TrackerEntry[];
  fingerprinting: FingerprintEvent[];
  wellKnown: WellKnownFiles;
  dom: DomHealth;
  stack: TechSignal[];
  runtime: RuntimeSnapshot;
  findings: Finding[];
  advice: AdviceCard[];
  htmlSnapshot?: string;
  screenshotDataUrl?: string;
}

export interface AutopsySummary {
  health: HealthStatus;
  pageSizeBytes: number;
  loadTimeMs?: number;
  lcpMs?: number;
  requestCount: number;
  failedCount: number;
  dangerCount: number;
  improveCount: number;
  portableApiCount: number;
  /** Short list subtitle (not the full brief story). */
  storyLine?: string;
  /** Page document title for listing. */
  pageTitle?: string;
  /** SEO / meta description for listing. */
  subtitle?: string;
  /** Canonical normalized page URL. */
  pageUrl?: string;
  origin?: string;
  stackChips?: string[];
}

export interface Brief {
  story: string;
  health: HealthStatus;
  apiCards: Array<{
    name: string;
    purpose: string;
    status: string;
    audience?: string;
  }>;
  dangerCards: AdviceCard[];
  improveCards: AdviceCard[];
  healthyCards: AdviceCard[];
  model?: string;
  generatedAt: string;
}

export interface SavePayload {
  title: string;
  pageUrl: string;
  origin: string;
  summary: AutopsySummary;
  payload: AutopsySession;
  htmlSnapshot?: string;
  /** @deprecated Never sent — screenshots are not stored. */
  screenshotBase64?: string;
  includesSecrets: boolean;
  findings: Finding[];
  portableApis: PortableApi[];
  advice: AdviceCard[];
  brief?: Brief;
}

/** Chunked cloud save steps (extension → API). */
export type SaveUploadStep =
  | "meta"
  | "session"
  | "session_patch"
  | "findings"
  | "portable"
  | "finish";

export interface SaveMetaChunk {
  step: "meta";
  title: string;
  pageUrl: string;
  origin: string;
  summary: AutopsySummary;
  htmlSnapshot?: string;
  includesSecrets?: boolean;
}

export interface SaveSessionChunk {
  step: "session";
  id: string;
  payload: AutopsySession;
}

/** Merge fields into the stored session JSON (optionally append requests). */
export interface SaveSessionPatchChunk {
  step: "session_patch";
  id: string;
  patch: Partial<AutopsySession>;
  /** When true, `patch.requests` are appended instead of replacing. */
  appendRequests?: boolean;
}

export interface SaveFindingsChunk {
  step: "findings";
  id: string;
  findings: Finding[];
}

export interface SavePortableChunk {
  step: "portable";
  id: string;
  portableApis: PortableApi[];
}

export interface SaveFinishChunk {
  step: "finish";
  id: string;
  advice: AdviceCard[];
  brief?: Brief;
  findings?: Finding[];
  portableApis?: PortableApi[];
}

export type SaveUploadChunk =
  | SaveMetaChunk
  | SaveSessionChunk
  | SaveSessionPatchChunk
  | SaveFindingsChunk
  | SavePortableChunk
  | SaveFinishChunk;
