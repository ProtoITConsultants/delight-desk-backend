# DelightDesk Backend - Claude Context

## Project Overview

**DelightDesk** is a B2B SaaS backend for AI-powered email automation and customer support. It integrates with email providers (Gmail, Outlook), e-commerce platforms (WooCommerce), and AI (OpenAI GPT-4o) to automatically respond to customer emails with order status and shipping information.

**Key Innovation**: Uses Temporal.io distributed workflows for complex, long-running email resolution processes with human-in-the-loop approval capabilities.

## Tech Stack

- **Framework**: NestJS 11.0.1 (TypeScript 5.7.3)
- **Database**: PostgreSQL with Drizzle ORM 0.44.5
- **Workflows**: Temporal.io 1.14.0
- **AI**: OpenAI 6.10.0 (GPT-4o model)
- **Auth**: Passport.js 0.7.0, express-session with PostgreSQL store
- **Email Providers**: Google Gmail API v160.0.0, Microsoft Graph Client 3.0.7
- **E-commerce**: WooCommerce REST API 1.0.2
- **Shipping**: Aftership SDK 15.0.1
- **Email Service**: SendGrid
- **Build**: SWC for fast transpilation
- **Testing**: Jest

## Architecture

### Monolithic Design with Domain Modules
Single NestJS application organized by domain (auth, users, agents, billing, etc.) with shared database and infrastructure. Temporal handles background jobs instead of separate worker processes.

### Core Design Patterns
1. **Repository Pattern**: 15 repository classes in `/database/repos/` for centralized data access
2. **Service Layer Pattern**: Controllers → Services → Repositories
3. **Temporal Workflow Pattern**: Long-running async processes with signal-based communication
4. **Pub/Sub Pattern**: Gmail (Google Pub/Sub) and Outlook (webhooks) for email notifications
5. **Dependency Injection**: NestJS constructor-based DI

## Project Structure

```
src/
├── main.ts                          # Bootstrap
├── app.module.ts                    # Root module
├── common/                          # Shared constants (agent-types.ts)
├── decorators/                      # Custom decorators (@CurrentUserId)
├── guards/                          # Auth guards (SessionGuard)
├── database/
│   ├── database.module.ts           # DB connection factory
│   ├── schema/                      # Drizzle schemas (18 tables)
│   ├── repos/                       # Data access layer (15 repositories)
│   ├── seeds/                       # Initial data (agents, billing plans)
│   └── repositories.module.ts       # Repository exports
├── modules/                         # Feature modules
│   ├── auth/                        # Signup, login, password reset
│   ├── users/                       # User management, profiles
│   ├── accounts/                    # Profile updates, account deletion
│   ├── agents/                      # AI agent configuration
│   │   └── ai-assistant/            # Escalation handling
│   ├── email-pipeline/              # Email processing orchestration
│   │   ├── temporal/
│   │   │   ├── workflows/           # processEmailWorkflow, handleWismo
│   │   │   ├── activities/          # Email activities
│   │   │   └── infra.module.ts      # Temporal connection setup
│   │   └── utils/                   # classification.util, ai-response.util
│   ├── google-oauth/                # Gmail OAuth & email handling
│   ├── microsoft-oauth/             # Outlook OAuth & email handling
│   ├── woocommerce/                 # Store connections & order management
│   ├── openai/                      # GPT-4o integration
│   ├── aftership/                   # Package tracking
│   ├── billing/                     # Subscriptions & plans
│   ├── sendgrid/                    # Email delivery
│   └── contact-us/                  # Contact form submissions
```

## Database Schema

### Core Tables

**users**: Core user data with authentication, subscription info, email signature fields
- Fields: id (UUID), email, password (hashed), role (user/admin), firstName, lastName, company, phone
- Signature: signatureName, signatureTitle, signatureCompany, signaturePhone, signatureEmail, signatureLogo, signaturePhoto
- Billing: stripeCustomerId, stripeSubscriptionId
- Security: passwordResetToken, passwordResetExpiresAt
- Status: isActive, lastLoginAt

**agents**: AI agent definitions (7 types)
- Types: wismo, subscription, product, returns, promo_code, address_change, order_cancellation
- Fields: id, name, type, description, icon

**user_agents**: Junction table for agent enablement per user
- Fields: userId (FK), agentId (FK), isEnabled, requiresModeration

**billing_plans**: Subscription plan definitions
- Fields: id, name, displayName, price, resolutions, costPerResolution, emailLimit, features (JSONB array)

**subscriptions**: User subscription records
- Fields: userId (FK), planId (FK), stripeSubscriptionId, status (active|trialing|past_due|canceled)
- Tracking: currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, resolutionsRemaining

**user_oauth_accounts**: OAuth credentials for email providers
- Fields: userId (FK), email, provider (google|microsoft), providerUserId
- Tokens: accessToken, refreshToken, scopes, expiresAt
- Provider-specific: subscriptionId, subscriptionExpiry (Outlook), lastHistoryId (Gmail)

**user_store_connections**: WooCommerce store links
- Fields: userId (FK), platform (woocommerce), storeUrl, apiKey, apiSecret
- Status: connectionMethod (oauth|manual), isActive

**email_threads**: Email conversation threads
- Fields: id (UUID), threadId (unique, from provider), userId (FK), subject, workflowId

**emails**: Individual email messages
- Fields: id (UUID), messageId (unique), threadId (FK), userId (FK)
- Content: fromEmail, toEmail, cc, bcc, subject, body, snippet, direction (incoming|outgoing)
- Pipeline: executionId, status, confidence (0-100), category, priority, agentType
- Response: response, metadata (JSONB)
- Workflow: approvedBy/At, rejectedBy/At, editedBy, resolvedAt, escalatedAt, escalationReason

**escalations**: Human review queue
- Fields: id, workflowId, threadId, userId, status (open|resolved|rejected), reason, metadata (JSONB)

### Key Relationships
- Users ↔ Agents: Many-to-many through user_agents
- Users → Subscriptions → BillingPlans: 1:N:1
- Users → UserOAuthAccounts: 1:N (multiple OAuth connections)
- Users → UserStoreConnections: 1:N (multiple WooCommerce stores)
- Users → EmailThreads → Emails: 1:N:N hierarchy
- EmailThreads → Escalations: 1:1 (when AI needs human review)

## Modules & API Endpoints

### Authentication (`/auth`)
- `POST /auth/signup` - Register new user
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token

**Service**: AuthService handles bcrypt hashing, session management, SendGrid email delivery

### Users (`/users`)
- `GET /users/verify-admin` - Check if user is admin
- `GET /users/me` - Get current user profile
- `GET /users` - List all users (admin only)
- `GET /users/connections` - Get user's store connections
- `DELETE /users/:id` - Delete user by ID (admin only)

**Service**: UsersService handles CRUD, OAuth associations, session cleanup

### Accounts (`/accounts`)
- `GET /accounts/profile` - Get account profile
- `PATCH /accounts/profile` - Update account profile
- `PATCH /accounts/change-password` - Change password
- `DELETE /accounts/delete` - Delete account

### Agents (`/agents`)
- `GET /agents` - Get available agents for user
- `GET /agents/settings` - Get system settings
- `PATCH /agents/settings` - Update system settings
- `PATCH /agents/:agentId` - Update agent enablement/moderation

**Service**: AgentsService validates WooCommerce connection for WISMO agent, manages per-user agent settings

### Billing (`/subscriptions`)
- `GET /subscriptions/:userId` - Get user subscriptions

**Service**: SubscriptionService handles manual subscription creation, resolution limits

### Google OAuth (`/google-oauth`)
- `GET /google-oauth/login` - Initiate Google OAuth
- `GET /google-oauth/callback` - OAuth callback handler
- `DELETE /google-oauth/disconnect` - Disconnect Google account
- `POST /google-oauth/gmail/webhook` - Gmail push notification handler

**Service**: GoogleOauthService manages Gmail API client with auto-refresh, watch setup, Pub/Sub webhooks

### Microsoft OAuth (`/microsoft-oauth`)
- `GET /microsoft-oauth/login` - Initiate Microsoft OAuth
- `GET /microsoft-oauth/callback` - OAuth callback handler
- `DELETE /microsoft-oauth/disconnect` - Disconnect Microsoft account
- `GET|POST /microsoft-oauth/outlook/webhook` - Outlook notification handler

**Service**: MicrosoftOauthService manages Graph API client, webhook subscriptions, token refresh

### WooCommerce (`/woocommerce`)
- `POST /woocommerce/init-oauth` - Start OAuth flow
- `POST|GET /woocommerce/callback` - OAuth callback
- `POST /woocommerce/manual-connect` - Manual store connection
- `DELETE /woocommerce/disconnect` - Disconnect store
- `POST /woocommerce/webhook/order-updated` - Order update webhook (HMAC-SHA256 validated)

**Services**:
- WooCommerceService: OAuth flow, webhook validation
- WooCommerceRestApiService: REST API calls to stores (orders, products, customers, tracking)

### Email Pipeline (`/email-pipeline`)
- `GET /email-pipeline/test` - Test email processing
- `GET /email-pipeline/workflow` - Get workflow state

**Service**: EmailPipelineService orchestrates Temporal workflows, classification, thread state tracking

## Email Processing Workflow

### Complete Flow
```
Incoming Email → Classification → Order Detection → WooCommerce Lookup
→ Aftership Tracking → Response Generation → Human Approval/Escalation → Send Reply
```

### 1. Email Ingestion
- Gmail/Outlook webhook triggers
- Email extracted with full headers, body, attachments
- Stored in PostgreSQL with thread association

### 2. Classification (OpenAI GPT-4o)
Uses `classification.util.ts` to analyze email content:
- **Categories**: wismo, subscription, product, returns, promo_code, address_change, order_cancellation, escalation, thankful
- **Outputs**: confidence (0-100), reasoning, priority (low|medium|high|urgent), sentiment (positive|neutral|negative)
- **Temperature**: 0.3 for consistency
- **Escalation Rule**: If confidence < 70%, immediately escalate to human

### 3. Order Number Extraction
- Regex-based extraction from email body
- Fallback: Query most recent order by customer email from WooCommerce
- Handles multiple order numbers

### 4. WooCommerce Order Lookup
- Retrieve order by ID from user's connected store
- Extract order status, items, customer details
- Get tracking information from custom fields or plugins

### 5. Aftership Tracking Status
- Create/retrieve tracking entry by tracking number
- Get delivery status and checkpoint history
- **Retry Logic**: Check every 2 hours for up to 7 days if not delivered

### 6. AI Response Generation
Uses `ai-response.util.ts` to create reply:
- Personalized response based on order status and tracking info
- Empathetic customer service tone
- Includes tracking details and delivery expectations
- **Temperature**: 0.7 (creative but consistent)
- **Max tokens**: ~300

### 7. Human-in-the-Loop Approval
- If moderation required for agent: Wait for approval signal
- Responses can be approved, rejected (with reason), or edited
- Audit trail: approvedBy, approvedAt, rejectedBy, rejectedAt fields

### 8. Response Delivery
- Reply sent via Gmail/Outlook thread (maintains conversation context)
- User signature automatically injected
- Status updated to resolved

### Escalation Scenarios
Emails escalate to human review when:
- Classification confidence < 70%
- Order number not found in email or WooCommerce
- No WooCommerce connection for user
- Tracking status check exceeds 7 days
- Aftership API errors
- Data inconsistencies

## Temporal Workflows

### Email Processing Workflow (`processEmailWorkflow`)
```typescript
// Queue-based signal handler for multiple emails in same thread
async function processEmailWorkflow(workflowInput: WorkFlowInput) {
  const workflowInputQueue: WorkFlowInput[] = [workflowInput];

  setHandler(threadMessage, (input) => {
    workflowInputQueue.push(input);
  });

  while (true) {
    await condition(() => workflowInputQueue.length > 0);
    const input = workflowInputQueue.shift();

    switch (input.classification.category) {
      case 'wismo':
        return await handleWismo(input);
      // Other agent types...
    }
  }
}
```

### WISMO Workflow (`handleWismo`)
**State Machine Steps**:
1. **Classification Check**: Validate confidence ≥ 70% (else escalate)
2. **Order Detection**: Extract order ID from email (else try email lookup)
3. **WooCommerce Query**: Fetch order details (else escalate if not found)
4. **Tracking Retrieval**: Get from Aftership (else escalate on API errors)
5. **Status Polling**: If not delivered, retry every 2 hours for max 7 days
6. **Response Generation**: Create AI response with OpenAI
7. **Human Approval**: Wait for approval signal (if moderation enabled)
8. **Email Send**: Reply via Gmail/Outlook thread
9. **State Query**: Query handlers for real-time workflow inspection

**Key Features**:
- Signal handlers for incoming emails and human responses
- Query handlers for monitoring workflow state
- Exponential retry with caps
- Long-running (days) with sleep intervals
- Maintains email thread context throughout

**Connection**:
- Namespace: `quickstart-developer-560d694a-dd.pj8ty`
- Task Queue: `emailTaskQueue`
- Endpoint: `ap-south-1.aws.api.temporal.io:7233` (TLS-secured)

## External Integrations

### Google Gmail
- **OAuth 2.0**: Offline access with consent screen
- **API**: Gmail API v1 (read/modify/send emails, watch inbox)
- **Pub/Sub**: Push notifications for new emails
- **Scopes**: openid, email, profile, gmail.readonly, gmail.modify, gmail.send
- **Token Management**: Automatic refresh when expired

### Microsoft Outlook/Office 365
- **OAuth 2.0**: Azure AD multi-tenant integration
- **API**: Microsoft Graph (Mail.Read, Mail.ReadWrite, Mail.Send, User.Read)
- **Webhooks**: Real-time email notification subscriptions
- **Scopes**: offline_access for refresh tokens

### WooCommerce
- **OAuth**: 3-legged OAuth flow with callback
- **Manual**: Consumer Key/Secret pair
- **Operations**: Orders, products, customers, webhooks, plugin status checks
- **Security**: HMAC-SHA256 signature validation for webhooks
- **Tracking**: Custom fields extraction for order tracking

### Aftership
- **SDK**: Official Aftership SDK 15.0.1
- **Operations**: Create tracking, query status, checkpoint retrieval, duplicate handling
- **Carriers**: Multiple supported shipping carriers

### SendGrid
- **API**: Transactional email delivery
- **Use Cases**: Password reset emails, contact form notifications
- **Templates**: HTML email generation

### OpenAI
- **Model**: gpt-4o (latest multimodal model)
- **Use Cases**: Email classification (JSON structured output), AI response generation
- **Temperature**: 0.3 for classification (deterministic), 0.7 for responses (creative)

## Authentication & Authorization

### Authentication Strategy
**Session-Based** with PostgreSQL storage:
- Store: `connect-pg-simple` with `user_sessions` table
- Cookie: Secure, HttpOnly, SameSite=none
- TTL: 7 days (604,800,000ms default)
- Trust Proxy: Enabled for production

**Password Security**:
- Hashing: bcrypt with 10 rounds
- Reset Tokens: UUIDs, time-limited (1 hour)
- Never stored in plaintext

**OAuth 2.0**:
- Google: Desktop/Web app flow with offline access
- Microsoft: Azure AD with tenant ID support
- WooCommerce: 3-legged OAuth

### Authorization Strategy
**Role-Based Access Control (RBAC)**:
- Roles: `user`, `admin`
- Field: `users.role` (varchar, default 'user')

**Guards**:
- `SessionGuard`: Checks `req.session.userId`
- `AuthGuard('google')`: Passport Google OAuth validation
- `AuthGuard('microsoft')`: Passport Microsoft OAuth validation

**Protected Routes**:
- All `/agents` endpoints require SessionGuard
- All `/users` endpoints require SessionGuard
- Admin operations check `users.isAdmin()` method
- `@CurrentUserId()` decorator extracts userId from session

### Security Features
- CORS enabled with configurable origins
- HTTPS-enforced cookies in production
- Webhook signature validation (HMAC-SHA256)
- Raw body capture for crypto operations
- Environment-based configuration

## Key Services

### OpenAIService (`openai.service.ts`)
- GPT-4o chat completion requests
- JSON response formatting with structured outputs
- Temperature and token control

### AftershipService (`aftership.service.ts`)
- Package tracking creation and status retrieval
- Duplicate tracking handling
- Checkpoint data access

### AiAssistantService (`ai-assistant.service.ts`)
- Escalation record creation
- Escalation query for users

### SendgridService (`sendgrid.service.ts`)
- Email delivery via SendGrid API
- Password reset emails
- Contact inquiry emails

## Important Files to Reference

### Core Configuration
- `src/main.ts` - Bootstrap, CORS, session setup, raw body parser
- `src/app.module.ts` - Root module with all feature module imports
- `src/database/database.module.ts` - Drizzle connection factory

### Database Layer
- `src/database/schema/*.schema.ts` - All table definitions (18 schemas)
- `src/database/repos/*.repository.ts` - All data access repositories (15 repos)
- `src/database/repositories.module.ts` - Repository module with exports

### Email Processing
- `src/modules/email-pipeline/temporal/workflows/email.workflow.ts` - Main workflow
- `src/modules/email-pipeline/temporal/workflows/wismo.workflow.ts` - WISMO handler
- `src/modules/email-pipeline/utils/classification.util.ts` - OpenAI classification
- `src/modules/email-pipeline/utils/ai-response.util.ts` - AI response generation
- `src/modules/email-pipeline/temporal/activities/email.activities.ts` - Temporal activities

### Agent Configuration
- `src/common/agent-types.ts` - Agent type constants
- `src/database/seeds/agents.seed.ts` - Default agent definitions

### OAuth Integration
- `src/modules/google-oauth/google.strategy.ts` - Passport Google strategy
- `src/modules/microsoft-oauth/microsoft.strategy.ts` - Passport Microsoft strategy

## Environment Variables Required

```bash
# Database
DATABASE_URL=postgresql://...

# Session
SESSION_SECRET=...
SESSION_TTL=604800000

# Temporal
TEMPORAL_ADDRESS=ap-south-1.aws.api.temporal.io:7233
TEMPORAL_NAMESPACE=quickstart-developer-560d694a-dd.pj8ty
TEMPORAL_TASK_QUEUE=emailTaskQueue

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/google-oauth/callback

# Microsoft OAuth
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=...
MICROSOFT_REDIRECT_URI=http://localhost:3000/microsoft-oauth/callback

# WooCommerce
WOOCOMMERCE_REDIRECT_URI=http://localhost:3000/woocommerce/callback

# OpenAI
OPENAI_API_KEY=...

# Aftership
AFTERSHIP_API_KEY=...

# SendGrid
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=...

# Frontend (for CORS)
FRONTEND_URL=http://localhost:5173
```

## Common Development Tasks

### Running the Application
```bash
npm install
npm run start:dev
```

### Database Migrations
```bash
# Generate migration
npm run drizzle:generate

# Push to database
npm run drizzle:push

# Run seeds
npm run seed
```

### Testing
```bash
npm run test
npm run test:watch
npm run test:cov
```

### Build
```bash
npm run build
npm run start:prod
```

## Notable Architectural Decisions

1. **Temporal for Email Processing**: Instead of traditional message queues (RabbitMQ, Kafka), uses Temporal for durability, retries, and complex state management
2. **Direct OAuth Integration**: No third-party aggregation (Auth0), manages multiple providers with Passport.js
3. **Inline AI Classification**: Every email classified on-demand via OpenAI for up-to-date context (trade-off: latency vs freshness)
4. **Multi-Email-Provider Support**: Abstractions allow Gmail and Outlook (and future providers)
5. **Moderation Layer**: Per-agent human approval enforcement with full audit trail
6. **PostgreSQL for Everything**: Sessions, entity data, no separate cache layer (Redis)
7. **Type Safety Throughout**: Drizzle auto-generates TypeScript types, DTOs with class-validator, minimal `any` usage

## Scalability Considerations

- Temporal enables horizontal scaling of workflow processing
- Stateless services (session stored in DB, not memory)
- Email processing decoupled from API requests
- OAuth token refresh handles long-lived connections
- Database read replicas possible with Drizzle

## Current Development Status

Based on git status, recent work includes:
- Email pipeline implementation with Temporal workflows
- Email threads and escalations schema additions
- Agent and user-agent relationship updates
- OAuth repository refactoring
- Aftership integration module
- Billing and subscription system updates
- New database migrations (0014-0018)

## Testing

Test file exists: `tests/test-email-pipeline.ts` for email pipeline testing.

## When Making Changes

1. **Database Changes**: Update schema in `src/database/schema/`, then run `npm run drizzle:generate` and `npm run drizzle:push`
2. **New Modules**: Create in `src/modules/`, import in `app.module.ts`
3. **New Repositories**: Create in `src/database/repos/`, export in `repositories.module.ts`
4. **New API Endpoints**: Create controller, import module in `app.module.ts`
5. **Temporal Workflows**: Add in `src/modules/email-pipeline/temporal/workflows/`, register in workflow client
6. **Environment Variables**: Add to `.env` and document in this file

## Code Style

- TypeScript strict mode enabled
- Prettier for formatting
- ESLint for linting
- NestJS decorators (@Injectable, @Controller, @Get, etc.)
- Async/await preferred over promises
- Constructor-based dependency injection
- Repository pattern for data access
- DTOs for request/response validation
