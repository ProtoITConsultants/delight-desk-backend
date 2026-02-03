-- WISMO Testing Helper Queries
-- Use these to check workflow state during testing

-- ============================================
-- Check Current AI Identity Configuration
-- ============================================
-- Replace 'YOUR_USER_ID' with your actual user ID
SELECT
    ai_agent_name,
    brand_voice,
    custom_brand_voice,
    email_salutation,
    company_name_for_email_signature,
    industry_specific_guidance,
    thank_loyal_customers,
    allow_emoji_in_responses,
    custom_instructions,
    created_at,
    updated_at
FROM ai_identity
WHERE user_id = 'YOUR_USER_ID';

-- ============================================
-- Check Recent Emails Processed
-- ============================================
SELECT
    id,
    subject,
    from_email,
    thread_id,
    message_id,
    created_at
FROM emails
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- Check Approval Queue Status
-- ============================================
SELECT
    id,
    workflow_id,
    status,
    customer_email,
    email_subject,
    category,
    confidence,
    created_at,
    updated_at
FROM approval_queue
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- Check Approval Queue Actions (Detailed)
-- ============================================
SELECT
    aqa.id,
    aqa.action_type,
    aqa.action_step,
    aqa.action_status,
    aqa.description,
    aqa.auto_approved,
    aqa.executed_at,
    aqa.escalated_during_execution,
    aq.workflow_id,
    aq.customer_email,
    aqa.created_at
FROM approval_queue_actions aqa
JOIN approval_queue aq ON aqa.approval_queue_id = aq.id
WHERE aq.user_id = 'YOUR_USER_ID'
ORDER BY aqa.created_at DESC
LIMIT 20;

-- ============================================
-- Check Recent Escalations
-- ============================================
SELECT
    id,
    type,
    reason,
    customer_email,
    email_subject,
    ai_suggested_response,
    ai_suggested_response_confidence,
    status,
    created_at,
    resolved_at
FROM escalations
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- Check Email Threads
-- ============================================
SELECT
    id,
    thread_id,
    subject,
    participant_email,
    created_at,
    updated_at
FROM email_threads
WHERE user_id = 'YOUR_USER_ID'
ORDER BY updated_at DESC
LIMIT 10;

-- ============================================
-- Get Workflow Stats by Status
-- ============================================
SELECT
    status,
    COUNT(*) as count,
    MAX(created_at) as last_created
FROM approval_queue
WHERE user_id = 'YOUR_USER_ID'
GROUP BY status;

-- ============================================
-- Get Actions by Type (See which actions are most common)
-- ============================================
SELECT
    aqa.action_type,
    aqa.action_status,
    COUNT(*) as count
FROM approval_queue_actions aqa
JOIN approval_queue aq ON aqa.approval_queue_id = aq.id
WHERE aq.user_id = 'YOUR_USER_ID'
GROUP BY aqa.action_type, aqa.action_status
ORDER BY count DESC;

-- ============================================
-- Get Failed/Escalated Actions
-- ============================================
SELECT
    aqa.action_type,
    aqa.action_step,
    aqa.description,
    aqa.execution_error,
    aqa.escalation_id,
    aq.workflow_id,
    aq.customer_email,
    aqa.created_at
FROM approval_queue_actions aqa
JOIN approval_queue aq ON aqa.approval_queue_id = aq.id
WHERE aq.user_id = 'YOUR_USER_ID'
  AND (aqa.action_status = 'escalated' OR aqa.escalated_during_execution = true)
ORDER BY aqa.created_at DESC;

-- ============================================
-- Check if Customer is Loyal (Multiple Orders)
-- ============================================
-- This query is for WooCommerce database
-- Useful to verify loyal customer recognition
-- SELECT
--     billing_email,
--     COUNT(*) as order_count,
--     MAX(date_created) as last_order_date
-- FROM wp_wc_orders
-- WHERE billing_email = 'customer@example.com'
-- GROUP BY billing_email;

-- ============================================
-- Cleanup Test Data (Use with caution!)
-- ============================================
-- Uncomment only when you want to reset test data

-- DELETE FROM approval_queue_actions
-- WHERE approval_queue_id IN (
--     SELECT id FROM approval_queue WHERE user_id = 'YOUR_USER_ID'
-- );

-- DELETE FROM approval_queue WHERE user_id = 'YOUR_USER_ID';
-- DELETE FROM escalations WHERE user_id = 'YOUR_USER_ID';
-- DELETE FROM emails WHERE user_id = 'YOUR_USER_ID';
