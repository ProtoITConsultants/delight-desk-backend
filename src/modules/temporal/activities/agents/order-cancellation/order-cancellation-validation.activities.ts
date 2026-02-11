// import { Injectable, Logger } from '@nestjs/common';
// import { Activity, ActivityMethod } from 'nestjs-temporal-core';
// import { DatabaseService } from '../../../../../database/database.service';
//
// /**
//  * Order Cancellation Validation Activities
//  * Handles duplicate detection and rate limiting for cancellation requests
//  */
// @Injectable()
// @Activity()
// export class OrderCancellationValidationActivities {
//   private readonly logger = new Logger(OrderCancellationValidationActivities.name);
//
//   constructor(private readonly databaseService: DatabaseService) {}
//
//   /**
//    * Check for duplicate cancellation request
//    * A request is duplicate if same order was requested within last 1 hour
//    * @param userId - User ID
//    * @param orderNumber - Order number
//    * @returns True if duplicate found, false otherwise
//    */
//   @ActivityMethod({ name: 'checkDuplicateRequest' })
//   async checkDuplicateRequest(userId: string, orderNumber: string): Promise<boolean> {
//     try {
//       this.logger.log(`Checking duplicate request for order: ${orderNumber}`, { userId });
//
//       const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
//
//       // Query database for recent requests for the same order
//       const result = await this.databaseService.db.execute(
//         `SELECT COUNT(*) as count
//          FROM cancellation_requests
//          WHERE user_id = ?
//          AND order_number = ?
//          AND created_at > ?
//          AND status != 'failed'`,
//         [userId, orderNumber, oneHourAgo],
//       );
//
//       const count = result.rows[0]?.count || 0;
//       const isDuplicate = count > 0;
//
//       this.logger.log(`Duplicate check result for order ${orderNumber}: ${isDuplicate}`, {
//         count,
//         userId,
//       });
//
//       return isDuplicate;
//     } catch (error) {
//       this.logger.error(`Failed to check duplicate request for order: ${orderNumber}`, {
//         error: error.message,
//         userId,
//       });
//       // On error, allow the request to proceed (fail open)
//       return false;
//     }
//   }
//
//   /**
//    * Check rate limit for cancellation requests
//    * Returns true if user has exceeded 5 requests in last 24 hours
//    * @param userId - User ID
//    * @returns True if rate limit exceeded, false otherwise
//    */
//   @ActivityMethod({ name: 'checkRateLimit' })
//   async checkRateLimit(userId: string): Promise<boolean> {
//     try {
//       this.logger.log(`Checking rate limit for user: ${userId}`);
//
//       const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
//
//       // Query database for requests in last 24 hours
//       const result = await this.databaseService.db.execute(
//         `SELECT COUNT(*) as count
//          FROM cancellation_requests
//          WHERE user_id = ?
//          AND created_at > ?`,
//         [userId, twentyFourHoursAgo],
//       );
//
//       const count = result.rows[0]?.count || 0;
//       const limitExceeded = count >= 5;
//
//       this.logger.log(`Rate limit check for user ${userId}: ${limitExceeded}`, {
//         count,
//         limit: 5,
//       });
//
//       return limitExceeded;
//     } catch (error) {
//       this.logger.error(`Failed to check rate limit for user: ${userId}`, {
//         error: error.message,
//       });
//       // On error, allow the request to proceed (fail open)
//       return false;
//     }
//   }
//
//   /**
//    * Record a cancellation request in the database
//    * Used for duplicate detection and rate limiting
//    * @param userId - User ID
//    * @param orderNumber - Order number
//    * @param emailId - Email ID that triggered the request
//    * @param workflowId - Temporal workflow ID
//    * @returns Request record ID
//    */
//   @ActivityMethod({ name: 'recordCancellationRequest' })
//   async recordCancellationRequest(
//     userId: string,
//     orderNumber: string,
//     emailId: string,
//     workflowId: string,
//   ): Promise<string> {
//     try {
//       this.logger.log(`Recording cancellation request for order: ${orderNumber}`, {
//         userId,
//         workflowId,
//       });
//
//       const result = await this.databaseService.db.execute(
//         `INSERT INTO cancellation_requests
//          (user_id, order_number, email_id, workflow_id, status, created_at)
//          VALUES (?, ?, ?, ?, 'processing', ?)`,
//         [userId, orderNumber, emailId, workflowId, new Date()],
//       );
//
//       const requestId = result.insertId?.toString() || '';
//
//       this.logger.log(`Cancellation request recorded for order: ${orderNumber}`, {
//         requestId,
//         userId,
//       });
//
//       return requestId;
//     } catch (error) {
//       this.logger.error(`Failed to record cancellation request for order: ${orderNumber}`, {
//         error: error.message,
//         userId,
//       });
//       throw error;
//     }
//   }
//
//   /**
//    * Update cancellation request status
//    * @param requestId - Request record ID
//    * @param status - New status (processing, completed, failed, cancelled)
//    * @param metadata - Additional metadata to store
//    */
//   @ActivityMethod({ name: 'updateCancellationRequestStatus' })
//   async updateCancellationRequestStatus(
//     requestId: string,
//     status: string,
//     metadata?: Record<string, any>,
//   ): Promise<void> {
//     try {
//       this.logger.log(`Updating cancellation request ${requestId} to status: ${status}`);
//
//       await this.databaseService.db.execute(
//         `UPDATE cancellation_requests
//          SET status = ?,
//              metadata = ?,
//              updated_at = ?
//          WHERE id = ?`,
//         [status, JSON.stringify(metadata || {}), new Date(), requestId],
//       );
//
//       this.logger.log(`Cancellation request ${requestId} updated to status: ${status}`);
//     } catch (error) {
//       this.logger.error(`Failed to update cancellation request ${requestId}`, {
//         error: error.message,
//         status,
//       });
//       throw error;
//     }
//   }
//
//   /**
//    * Validate customer email matches order email
//    * Security check to ensure customer owns the order
//    * @param customerEmail - Email from the cancellation request
//    * @param orderEmail - Email associated with the order in WooCommerce
//    * @returns True if emails match, false otherwise
//    */
//   @ActivityMethod({ name: 'validateCustomerEmail' })
//   async validateCustomerEmail(customerEmail: string, orderEmail: string): Promise<boolean> {
//     try {
//       // Normalize emails for comparison
//       const normalizedCustomerEmail = customerEmail.toLowerCase().trim();
//       const normalizedOrderEmail = orderEmail.toLowerCase().trim();
//
//       const isValid = normalizedCustomerEmail === normalizedOrderEmail;
//
//       this.logger.log(`Customer email validation result: ${isValid}`, {
//         customerEmail: normalizedCustomerEmail,
//         orderEmail: normalizedOrderEmail,
//       });
//
//       return isValid;
//     } catch (error) {
//       this.logger.error('Failed to validate customer email', {
//         error: error.message,
//       });
//       // On error, reject for security
//       return false;
//     }
//   }
// }
