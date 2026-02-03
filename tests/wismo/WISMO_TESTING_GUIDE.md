# WISMO Workflow Testing Guide

## 🎯 Test Objectives
- Verify AI identity settings affect customer email generation
- Test different workflow paths (order found, not found, tracking available, etc.)
- Validate voice & settings configurations
- Ensure proper escalation handling

---

## 📋 Test Use Cases

### **Use Case 1: Happy Path - Professional Tone**
**Scenario**: Customer emails about order status, order is found with tracking

**Setup AI Identity**:
```json
{
  "aiAgentName": "Sarah",
  "businessType": "E-commerce",
  "aiAgentTitle": "Customer Support Specialist",
  "emailSalutation": "Hi",
  "companyNameForEmailSignature": "Acme Corporation",
  "brandVoice": "professional",
  "industrySpecificGuidance": true,
  "thankLoyalCustomers": false,
  "allowEmojiInResponses": false,
  "customInstructions": "Always provide order number and tracking links."
}
```

**Test Steps**:
1. Send email from customer with order number in subject/body
2. Ensure order exists in WooCommerce with tracking number
3. Trigger WISMO workflow

**Expected Results**:
- ✅ Action 1: Email marked as read
- ✅ Action 2: AI confidence verified
- ✅ Action 3: Order number extracted successfully
- ✅ Action 4: Order details fetched from WooCommerce
- ✅ Action 5: Acknowledgement email sent with:
  - Professional tone
  - No emojis
  - Salutation: "Hi [Customer],"
  - Signature: "Sarah\nCustomer Support Specialist\nAcme Corporation"
- ✅ Action 6-7: Tracking created in AfterShip
- ✅ Action 8: Tracking updates sent with professional tone
- ✅ Action 9: Final delivery notification

**Verify Email Content**:
- Check Gmail thread for acknowledgement
- Should have professional, polished language
- No emojis present
- E-commerce industry terminology used

---

### **Use Case 2: Friendly Tone with Emojis**
**Scenario**: Same happy path but with friendly, emoji-enabled AI

**Setup AI Identity**:
```json
{
  "aiAgentName": "Alex",
  "aiAgentTitle": "Support Specialist",
  "emailSalutation": "Hey",
  "companyNameForEmailSignature": "My Store",
  "brandVoice": "friendly",
  "thankLoyalCustomers": true,
  "allowEmojiInResponses": true,
  "customInstructions": "Keep it casual and fun!"
}
```

**Test Steps**: Same as Use Case 1

**Expected Results**:
- ✅ Emails use "Hey [Customer]," salutation
- ✅ Friendly, conversational tone throughout
- ✅ Emojis present (😊, 📦, 🎉, etc.)
- ✅ If repeat customer detected: "Thanks for being a loyal customer!"
- ✅ Casual language: "Awesome!", "Great news!", "We've got you covered!"
- ✅ Signature: "Alex\nSupport Specialist\nMy Store"

**Comparison Check**:
Compare email tone with Use Case 1 - should be noticeably warmer and more casual

---

### **Use Case 3: Sophisticated/Luxury Brand Tone**
**Scenario**: High-end brand with refined communication

**Setup AI Identity**:
```json
{
  "aiAgentName": "Jordan",
  "businessType": "Luxury Goods",
  "aiAgentTitle": "Client Services Specialist",
  "emailSalutation": "Dear",
  "companyNameForEmailSignature": "Prestige Boutique",
  "signatureFooter": "Exclusive Concierge Service: concierge@prestige.com",
  "brandVoice": "sophisticated",
  "industrySpecificGuidance": true,
  "thankLoyalCustomers": true,
  "allowEmojiInResponses": false
}
```

**Expected Results**:
- ✅ "Dear [Customer]," salutation
- ✅ Elevated, articulate language
- ✅ Luxury goods terminology
- ✅ Refined tone: "We are pleased to inform you...", "Your order is being carefully prepared..."
- ✅ Professional signature with concierge footer

---

### **Use Case 4: Custom Brand Voice with Instructions**
**Scenario**: Custom voice with specific guidelines

**Setup AI Identity**:
```json
{
  "aiAgentName": "Taylor",
  "emailSalutation": "Hello",
  "brandVoice": "custom",
  "customBrandVoice": "We speak with empathy and authenticity. Our tone is warm yet professional, focusing on building trust and reassuring customers.",
  "customInstructions": "Always apologize for any inconvenience. Offer to help with anything else. Never make promises about delivery dates."
}
```

**Expected Results**:
- ✅ Empathetic language throughout
- ✅ Apologies included in messages
- ✅ Offers additional help
- ✅ Avoids specific delivery date promises
- ✅ Trust-building phrases

---

### **Use Case 5: Order Not Found - Request Info (Action 3.1)**
**Scenario**: Customer email doesn't contain order number, can't find by email

**Setup AI Identity**: Use professional from Use Case 1

**Test Steps**:
1. Send email from NEW customer (email not in WooCommerce)
2. Don't include order number in email
3. Trigger WISMO workflow

**Expected Results**:
- ✅ Action 1: Email marked as read
- ✅ Action 2: AI confidence verified
- ✅ Action 3: Order extraction fails (no order number, email not found)
- ✅ **Action 3.1 TRIGGERED**:
  - Follow-up email sent requesting order information
  - Email should politely ask for order number or email used
  - Professional, apologetic tone
  - Check every 10 minutes for customer reply
- ✅ If customer replies with order info: Extract and continue workflow
- ✅ If no reply after 3 days: Escalate

**Manual Test for Reply**:
1. After workflow sends follow-up, reply to the Gmail thread with order number
2. Wait 10 minutes
3. Check workflow logs - should detect reply and continue

---

### **Use Case 6: Low AI Confidence - Escalation**
**Scenario**: AI classification confidence below threshold

**Test Steps**:
1. Send ambiguous email that's hard to classify
2. Modify classification confidence to < 70% (in email-pipeline code temporarily)

**Expected Results**:
- ✅ Action 1: Email marked as read
- ✅ Action 2: AI confidence check FAILS
- ✅ Escalation created with type: `LOW_CLASSIFICATION_CONFIDENCE`
- ✅ Workflow stops
- ✅ Email appears in approval queue for human review

---

### **Use Case 7: No Tracking Number - Wait and Retry**
**Scenario**: Order exists but tracking not available yet

**Test Steps**:
1. Create order in WooCommerce WITHOUT tracking number
2. Customer emails about order
3. Trigger workflow

**Expected Results**:
- ✅ Actions 1-5: Complete successfully
- ✅ **Action 6 TRIGGERED**: Wait for tracking number
  - Checks every 2 hours
  - Retries up to 7 days
- ✅ If tracking added: Continue to Action 7
- ✅ If no tracking after 7 days: Escalate

**Manual Test**:
1. Let workflow reach Action 6 (waiting state)
2. Add tracking number to WooCommerce order
3. Wait 2 hours (or modify interval for faster testing)
4. Workflow should detect tracking and continue

---

### **Use Case 8: Tracking Exception - Escalation**
**Scenario**: Package delivery has exception (failed delivery, lost, etc.)

**Test Steps**:
1. Complete happy path until Action 8 (monitoring tracking)
2. Simulate AfterShip status change to "Exception", "AttemptFail", or "Expired"

**Expected Results**:
- ✅ Action 8 detects exception status
- ✅ Escalation created with type: `AFTERSHIP_EXCEPTION`
- ✅ Workflow escalated
- ✅ Human notification for manual intervention

---

### **Use Case 9: Loyal Customer Recognition**
**Scenario**: Repeat customer with multiple orders

**Setup AI Identity**:
```json
{
  "aiAgentName": "Sarah",
  "emailSalutation": "Hi",
  "brandVoice": "friendly",
  "thankLoyalCustomers": true,
  "allowEmojiInResponses": true
}
```

**Test Steps**:
1. Use customer email that has 2+ previous orders in WooCommerce
2. Trigger workflow

**Expected Results**:
- ✅ AI detects repeat customer
- ✅ Acknowledgement includes: "Thank you for being a loyal customer!" or similar
- ✅ Extra appreciation in messages

---

### **Use Case 10: Industry-Specific Guidance**
**Scenario**: E-commerce with industry terminology

**Setup AI Identity**:
```json
{
  "businessType": "E-commerce",
  "brandVoice": "professional",
  "industrySpecificGuidance": true
}
```

**Expected Results**:
- ✅ E-commerce terminology used: "fulfillment", "inventory", "shipping carrier"
- ✅ Industry best practices applied
- ✅ Professional e-commerce tone

---

### **Use Case 11: Moderation Mode**
**Scenario**: Workflow requires human approval for each action

**Test Steps**:
1. Enable moderation for WISMO agent:
   - Update user_agents table: `requiresModeration = true`
2. Trigger workflow

**Expected Results**:
- ✅ Each action creates approval queue item
- ✅ Workflow pauses waiting for approval
- ✅ Human can approve/reject each action
- ✅ Can modify AI-generated messages before sending
- ✅ Workflow continues after approval

---

### **Use Case 12: Courier-Specific Tracking Links**
**Scenario**: Verify no AfterShip URLs sent to customers

**Test Steps**:
1. Complete workflow with tracking
2. Check all tracking update emails

**Expected Results**:
- ✅ NO AfterShip URLs (track.aftership.com) sent to customer
- ✅ Uses `courier_tracking_link` from AfterShip API
- ✅ Direct carrier links (USPS.com, FedEx.com, UPS.com, etc.)
- ✅ AI doesn't mention "AfterShip" or third-party tracking services

---

## 🛠️ Testing Tools & Commands

### Check Workflow Status
```bash
# Check Temporal workflow
temporal workflow describe --workflow-id workflow-thread-<thread-id>

# Check approval queue
curl http://localhost:3000/approval-queue \
  -H "Cookie: connect.sid=YOUR_SESSION"

# Check escalations
curl http://localhost:3000/ai-assistant/escalations \
  -H "Cookie: connect.sid=YOUR_SESSION"
```

### Database Queries
```sql
-- Check AI identity
SELECT * FROM ai_identity WHERE user_id = 'YOUR_USER_ID';

-- Check emails processed
SELECT * FROM emails WHERE user_id = 'YOUR_USER_ID' ORDER BY created_at DESC LIMIT 10;

-- Check approval queue
SELECT * FROM approval_queue WHERE user_id = 'YOUR_USER_ID' ORDER BY created_at DESC;

-- Check escalations
SELECT * FROM escalations WHERE user_id = 'YOUR_USER_ID' ORDER BY created_at DESC;
```

### Check Gmail Thread
1. Go to Gmail
2. Find the thread
3. Verify:
   - Email salutation matches configuration
   - Tone matches brand voice
   - Emojis present/absent based on setting
   - Signature formatted correctly
   - Custom instructions followed

---

## ✅ Test Checklist

### Identity Configuration Tests
- [ ] Professional tone (no emoji)
- [ ] Friendly tone (with emoji)
- [ ] Sophisticated tone
- [ ] Custom brand voice
- [ ] Custom instructions followed
- [ ] Industry-specific guidance applied
- [ ] Loyal customer recognition

### Workflow Path Tests
- [ ] Happy path: Order found, tracking available
- [ ] Order not found: Action 3.1 follow-up
- [ ] Order found by email (not in message)
- [ ] No tracking: Wait and retry
- [ ] Tracking exception: Escalation
- [ ] Low AI confidence: Escalation
- [ ] Customer reply handling

### Integration Tests
- [ ] Gmail thread replies work
- [ ] WooCommerce order fetching
- [ ] AfterShip tracking creation
- [ ] Tracking status monitoring
- [ ] Courier-specific links used
- [ ] No AfterShip branding exposed

### Email Quality Tests
- [ ] Salutation correct
- [ ] Agent name in signature
- [ ] Company name in signature
- [ ] Signature footer present
- [ ] Tone matches voice setting
- [ ] Emojis match setting
- [ ] Custom instructions applied
- [ ] No "Best Regards" or generic closings

---

## 🐛 Common Issues & Debugging

### Issue: Workflow not triggering
**Check**:
- Email-pipeline service running
- Gmail webhook configured
- User has OAuth connected

### Issue: Wrong tone in emails
**Check**:
- AI identity `brandVoice` setting
- `allowEmojiInResponses` boolean
- `customBrandVoice` if using custom

### Issue: Action 3.1 not triggering
**Check**:
- Order truly doesn't exist
- Email not in WooCommerce customers
- Check logs for Action 3 result

### Issue: Tracking links showing AfterShip
**Check**:
- Using `courier_tracking_link` not `tracking_number`
- Check wismo.workflow.ts lines 626-628 and 719-721

---

## 📊 Test Results Template

| Use Case | AI Identity | Status | Notes |
|----------|-------------|--------|-------|
| 1. Professional Happy Path | Professional/No Emoji | ✅ Pass | |
| 2. Friendly with Emoji | Friendly/Emoji | ✅ Pass | |
| 3. Sophisticated | Sophisticated | ✅ Pass | |
| 4. Custom Voice | Custom | ✅ Pass | |
| 5. Order Not Found | Professional | ✅ Pass | |
| 6. Low Confidence | Any | ✅ Pass | |
| 7. No Tracking | Professional | ✅ Pass | |
| 8. Tracking Exception | Professional | ✅ Pass | |
| 9. Loyal Customer | Friendly/Thank Loyal | ✅ Pass | |
| 10. Industry Guidance | E-commerce | ✅ Pass | |
| 11. Moderation Mode | Professional | ✅ Pass | |
| 12. Courier Links | Any | ✅ Pass | |

---

## 🚀 Quick Start Testing Script

```bash
# 1. Start services
npm run start:dev

# 2. In another terminal, start Temporal worker if not running
npm run temporal:worker

# 3. Configure AI identity via Swagger
# Open: http://localhost:3000/api-docs
# Go to: AI Team Center - Identity
# POST /ai-team-center/identity with Use Case 1 config

# 4. Send test email to your Gmail
# Subject: "Where is my order #12345?"
# Make sure order 12345 exists in WooCommerce

# 5. Monitor logs
tail -f logs/app.log

# 6. Check Gmail for AI responses
```

