/**
 * Gmail-related constants
 */

/**
 * Time buffer before token expiry to trigger refresh (5 minutes)
 */
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Token health monitoring buffer (24 hours)
 * Tokens expiring within this window will be proactively refreshed
 */
export const TOKEN_HEALTH_BUFFER_MS = 24 * 60 * 60 * 1000;

/**
 * Gmail labels that indicate irrelevant emails (spam, promotions, etc.)
 * Emails with these labels will be skipped during processing
 */
export const IRRELEVANT_GMAIL_LABELS = [
  'SPAM',
  'DRAFT',
  'TRASH',
  'CATEGORY_FORUMS',
  'CATEGORY_SOCIAL',
  'CATEGORY_UPDATES',
  'CATEGORY_PROMOTIONS',
] as const;

/**
 * Gmail label indicating sent emails
 */
export const GMAIL_SENT_LABEL = 'SENT';

/**
 * Patterns to detect quoted/reply content in emails
 * Used to extract only new content from email threads
 */
export const EMAIL_QUOTE_PATTERNS = [
  /On .+? wrote:/i, // Gmail: "On Jan 22, 2024, John wrote:"
  /On .+?,? .+? <.+?> wrote:/i, // Gmail with email: "On Mon, Jan 22, 2024, John <john@email.com> wrote:"
  /From:.+?Sent:.+?To:/s, // Outlook format
  /_{10,}/, // Yahoo separator (10+ underscores)
  /-{5,} ?Forwarded message ?-{5,}/i, // Forwarded message
  /-{5,} ?Original [Mm]essage ?-{5,}/i, // Original message
  /\n> .+/m, // Lines starting with > (quoted text)
  /^>+ /m, // Start of line with > quote markers
] as const;

/**
 * Patterns indicating automated/marketing/B2B-outreach emails (NOT customer emails)
 *
 * Two buckets:
 *   1. Classic transactional/marketing tells (unsubscribe footer, tracking pixel, etc.)
 *   2. B2B sales prospecting / account-management outreach tells — these messages are
 *      hand-crafted by a human, look like personal mail, land in Gmail's Primary tab,
 *      and have nothing to do with the merchant's WooCommerce store. Anything that
 *      matches here is short-circuited before we burn an OpenAI call on it.
 */
export const AUTOMATED_EMAIL_PATTERNS = [
  /unsubscribe/i,
  /click here to view/i,
  /view in browser/i,
  /<img[^>]+tracking/i,
  /pixel\.gif/i,
  /email was sent to/i,
  /you('re| are) receiving this/i,
  /update (your )?preferences/i,
  /privacy policy/i,
  /terms of service/i,

  /\b(account|sales|business development|partnerships?)\s+(manager|executive|representative|director|lead)\b/i,
  /\b(bdr|sdr|ae|csm|account exec)\b/i,
  /\b(schedule|book|set ?up)\s+(a|an)?\s*(meeting|call|demo|chat|sync|intro|discovery)\b/i,
  /\benroll\s+(in|to)\b[^.\n]{0,80}\b(webinar|workshop|training|program|bootcamp)\b/i,
  /\b(register|sign ?up)\s+for\s+(our|the)\b[^.\n]{0,80}\b(webinar|event|workshop)\b/i,
  /\b(monthly|quarterly|annual)\s+(budget|spend|recurring revenue|business review|qbr)\b/i,
  /\$\s?\d{1,3}(,\d{3})*\s*(\/|per\s+)?\s*(month|mo\.?|year|yr\.?|annual|annually)\s+(budget|spend|goal|target)/i,
  /\bI('| a)m reaching out\b/i,
  /\bI wanted to (follow up|reach out|connect|introduce)\b/i,
  /\bjust (following up|circling back|checking in)\b/i,
  /\b(we|our team|our company)\s+help(s)?\s+(businesses|companies|brands|merchants)\s+like yours\b/i,
  /\bI noticed (your|that)\b[^.\n]{0,80}\b(company|business|store|website|brand|launch)\b/i,
  /\bbased on (your|the) (past|previous|recent)\s+(meeting|conversation|call|notes)\b/i,
  /\bpowered by\s+[A-Z][A-Za-z0-9& ]{2,}/,
  /\bon behalf of\s+[A-Z][A-Za-z0-9& ]{2,}/,
  /\b(press|media|pr) (inquiry|inquiries|request)\b/i,
  /\b(guest post|link.?building|seo audit|backlink)\b/i,
  /\b(influencer|brand ambassador|sponsorship|collab(oration)?)\s+(opportunity|inquiry|proposal|partnership)\b/i,
  /\b(investment|funding|venture|portfolio company)\s+(opportunity|inquiry|proposal)\b/i,
  /\bjob (application|inquiry)\b|\bapplying for\b|\bI'm interested in (the|a) (role|position|opening)\b/i,
] as const;

/**
 * Patterns indicating customer support emails
 */
export const CUSTOMER_EMAIL_PATTERNS = [
  /\?/, // Questions
  /order #?\d+/i, // Order references
  /where is my/i,
  /when will/i,
  /haven'?t received/i,
  /tracking/i,
  /status/i,
  /help/i,
  /refund/i,
  /cancel/i,
  /issue/i,
  /problem/i,
  /delayed/i,
  /late/i,
  /wrong/i,
  /missing/i,
] as const;

/**
 * Thresholds for email classification
 */
export const EMAIL_CLASSIFICATION_THRESHOLDS = {
  /** Minimum body length to be considered a valid email */
  MIN_BODY_LENGTH: 10,

  /** Minimum customer pattern matches to classify as customer email */
  MIN_CUSTOMER_MATCHES: 2,

  /** Maximum word count for short customer emails */
  SHORT_EMAIL_WORD_COUNT: 200,

  /** Maximum word count for medium customer emails */
  MEDIUM_EMAIL_WORD_COUNT: 500,

  /** Maximum HTML tags for plain text emails */
  PLAIN_TEXT_TAG_COUNT: 10,

  /** Maximum HTML tags for customer emails */
  CUSTOMER_EMAIL_TAG_COUNT: 20,
} as const;

/**
 * Content type mappings
 */
export const CONTENT_TYPES = {
  HTML: 'text/html; charset="utf-8"',
  PLAIN: 'text/plain; charset="utf-8"',
} as const;

/**
 * Gmail API constants
 */
export const GMAIL_API = {
  /** Gmail user identifier for API calls */
  USER_ID: 'me',

  /** Message format for fetching raw messages */
  FORMAT_RAW: 'raw',

  /** Message format for fetching metadata only */
  FORMAT_METADATA: 'metadata',

  /** Message format for minimal data */
  FORMAT_MINIMAL: 'minimal',

  /** History type for new messages */
  HISTORY_TYPE_MESSAGE_ADDED: 'messageAdded',
} as const;
