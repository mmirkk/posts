export type SocialNetwork = "facebook" | "instagram" | "tiktok" | "youtube" | "twitter" | "otro";

export type MatchType = "exacta" | "por_url" | "por_titulo" | "aproximada" | "dudosa" | "sin_coincidencia" | "no_aplica";
export type ComplianceStatus =
  | "segun_plan"
  | "anticipada"
  | "demorada"
  | "modificada"
  | "no_publicada"
  | "no_planificada"
  | "coincidencia_dudosa"
  | "datos_incompletos";

export interface PlannedPost {
  id: string;
  sourceRow: number;
  plannedDate: string;
  title: string;
  description: string;
  normalizedDescription: string;
  network: SocialNetwork;
  networkLabel: string;
  accountGroup: string;
  account: string;
  campaign: string;
  assetLink: string;
  publishedLinkHint: string;
  official: boolean;
  incomplete: boolean;
  matchingDescription?: string;
  matchingNormalizedDescription?: string;
  matchingDescriptionFromUrl?: boolean;
}

export interface ActualPost {
  id: string;
  postId: string;
  profileId: string;
  actualDate: string;
  publishedAt: string;
  description: string;
  normalizedDescription: string;
  network: SocialNetwork;
  profile: string;
  profileGroup: string;
  campaign: string;
  url: string;
  mediaType: string;
  mediaUrls: string[];
  deleted: boolean;
  status: string;
  reach: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
}

export type ManualReviewValue = "approved" | "rejected";

export interface ManualReviewDecision {
  plannedId: string;
  actualId: string;
  decision: ManualReviewValue;
  updatedAt: string;
}

export interface DifferenceSummary {
  addedTokens: string[];
  removedTokens: string[];
  linksChanged: boolean;
  hashtagsChanged: boolean;
  emojisChanged: boolean;
  summary: string[];
}

export interface ReportRecord {
  id: string;
  plannedId: string | null;
  plannedSourceRow: number | null;
  actualId: string | null;
  plannedDate: string | null;
  actualDate: string | null;
  dayDifference: number | null;
  plannedDescription: string;
  actualDescription: string;
  plannedNormalized: string;
  actualNormalized: string;
  matchType: MatchType;
  similarity: number | null;
  confidence: number | null;
  status: ComplianceStatus;
  temporalStatus: "en_fecha" | "dentro_tolerancia" | "anticipada" | "demorada" | "no_aplica";
  network: SocialNetwork;
  account: string;
  campaign: string;
  postUrl: string;
  mediaType: string;
  mediaUrls: string[];
  title: string;
  observations: string[];
  manualReview: boolean;
  differences: DifferenceSummary | null;
  alternativeCandidates: Array<{ actualId: string; description: string; similarity: number; date: string; network: SocialNetwork }>;
  deleted: boolean;
  reach: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface QualitySummary {
  plannedRows: number;
  plannedExpanded: number;
  plannedEmptyDescriptions: number;
  plannedEmptyDates: number;
  plannedDuplicateKeys: number;
  actualRowsConsidered: number;
  actualEmptyDescriptions: number;
  actualDuplicatePostIds: number;
  deletedActualPosts: number;
  sheetHasTypeColumn: boolean;
  officialRule: string;
  officialProfileIds: number;
  officialProfiles: Array<{
    profileId: string;
    profile: string;
    networks: SocialNetwork[];
    evidenceUrls: number;
    exactPlanMatches: number;
    rows: number;
    firstDate: string;
    lastDate: string;
  }>;
  tableName: string;
  sheetHasThemeColumn: boolean;
}

export interface ThemeNetworkMetric {
  theme: string;
  network: SocialNetwork;
  posts: number;
  reach: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  topPost: {
    id: string;
    description: string;
    url: string;
    date: string;
    profile: string;
    engagement: number;
    reach: number;
  } | null;
}

export interface NetworkEngagementMetric extends Omit<ThemeNetworkMetric, "theme"> {}
export interface ThemeEngagementMetric extends Omit<ThemeNetworkMetric, "network"> {}

export interface ReportAnalytics {
  postsByNetwork: Array<{ network: SocialNetwork; planned: number; posted: number; matched: number }>;
  themes: Array<{ theme: string; planned: number; posted: number }>;
  engagementByNetwork: NetworkEngagementMetric[];
  engagementByTheme: ThemeEngagementMetric[];
  engagementByThemeNetwork: ThemeNetworkMetric[];
  totals: { reach: number; engagement: number; likes: number; comments: number; shares: number };
}

export interface ReportMetrics {
  planned: number;
  actual: number;
  matched: number;
  exact: number;
  byUrl: number;
  byTitle: number;
  approximate: number;
  onTime: number;
  withinTolerance: number;
  early: number;
  delayed: number;
  notPublished: number;
  unplanned: number;
  doubtful: number;
  incomplete: number;
  modified: number;
  compliancePct: number;
  exactCompliancePct: number;
  exactOnTimePct: number;
  modifiedPct: number;
  averageDayDeviation: number | null;
}

export interface UpcomingContent {
  sourceRow: number;
  plannedDate: string;
  title: string;
  description: string;
  campaign: string;
  hasPublishedLinkHint: boolean;
  targets: Array<{ network: SocialNetwork; account: string }>;
}

export interface ReportResponse {
  generatedAt: string;
  sourceFreshness: { sheetFetchedAt: string; databaseMaxPublishedAt: string | null };
  config: { toleranceDays: number; approximateThreshold: number; doubtfulThreshold: number };
  availableWeeks: Array<{ value: string; from: string; to: string; label: string; isCurrent: boolean }>;
  upcoming: {
    asOf: string;
    through: string | null;
    plannedContents: number;
    plannedTargets: number;
    items: UpcomingContent[];
  };
  window: {
    from: string;
    to: string;
    dataThrough: string;
    isCurrent: boolean;
    isAll: boolean;
    label: string;
    timezone: string;
    rule: string;
    nextDisplayDay: string;
  };
  metrics: ReportMetrics;
  analytics: ReportAnalytics;
  quality: QualitySummary;
  records: ReportRecord[];
}
