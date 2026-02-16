import { Command } from 'commander';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, inArray } from 'drizzle-orm';
import * as fs from 'fs';
import {
  approvalQueue,
  approvalQueueActions,
  approvalQueueActivityLog,
  emails,
  emailThreads,
  escalations,
  users,
} from '../src/database/schema';

interface UserMapping {
  localUserId: string;
  localUserEmail: string;
  productionUserId?: string;
  productionUserEmail?: string;
}

interface MigrationData {
  users: any[];
  emailThreads: any[];
  emails: any[];
  escalations: any[];
  approvalQueue: any[];
  approvalQueueActions: any[];
  approvalQueueActivityLog: any[];
  userMapping: UserMapping[];
}

interface MigrationStats {
  usersMatched: number;
  emailThreadsImported: number;
  emailsImported: number;
  escalationsImported: number;
  approvalQueueImported: number;
  actionsImported: number;
  activityLogsImported: number;
  errors: string[];
}

class DataMigrationService {
  private sourceDb: ReturnType<typeof drizzle>;
  private targetDb: ReturnType<typeof drizzle>;
  private userIdMap: Map<string, string> = new Map(); // localUserId -> productionUserId

  constructor(sourceConnectionString: string, targetConnectionString: string) {
    const sourcePool = new Pool({ connectionString: sourceConnectionString });
    const targetPool = new Pool({ connectionString: targetConnectionString });

    this.sourceDb = drizzle(sourcePool);
    this.targetDb = drizzle(targetPool);
  }

  /**
   * Helper: Convert date strings to Date objects
   */
  private convertDates(obj: any, dateFields: string[]): any {
    const result = { ...obj };
    for (const field of dateFields) {
      if (result[field]) {
        if (typeof result[field] === 'string') {
          const date = new Date(result[field]);
          // Only set if valid date
          if (!isNaN(date.getTime())) {
            result[field] = date;
          } else {
            result[field] = null; // Invalid date becomes null
          }
        }
      } else {
        // Keep null/undefined as is
        result[field] = result[field] === undefined ? undefined : null;
      }
    }
    return result;
  }

  /**
   * Step 1: Export data from source (local) database
   */
  async exportData(outputFile: string, userIds?: string[]): Promise<void> {
    console.log('📤 Exporting data from source database...\n');

    try {
      // Get users to export
      const usersToExport = userIds?.length
        ? await this.sourceDb.select().from(users).where(inArray(users.id, userIds))
        : await this.sourceDb.select().from(users);

      const userIdList = usersToExport.map((u) => u.id);
      console.log(`Found ${usersToExport.length} users to export`);

      // Export email threads
      const emailThreadsData = await this.sourceDb
        .select()
        .from(emailThreads)
        .where(inArray(emailThreads.userId, userIdList));
      console.log(`Found ${emailThreadsData.length} email threads`);

      const threadIdList = emailThreadsData.map((t) => t.id);

      // Export emails
      const emailsData = threadIdList.length
        ? await this.sourceDb.select().from(emails).where(inArray(emails.threadId, threadIdList))
        : [];
      console.log(`Found ${emailsData.length} emails`);

      // Export escalations
      const escalationsData = threadIdList.length
        ? await this.sourceDb
            .select()
            .from(escalations)
            .where(inArray(escalations.threadId, threadIdList))
        : [];
      console.log(`Found ${escalationsData.length} escalations`);

      const escalationIds = escalationsData.map((e) => e.id);

      // Export approval queue
      const approvalQueueData = await this.sourceDb
        .select()
        .from(approvalQueue)
        .where(inArray(approvalQueue.userId, userIdList));
      console.log(`Found ${approvalQueueData.length} approval queue items`);

      const approvalQueueIds = approvalQueueData.map((a) => a.id);

      // Export approval queue actions
      const actionsData = approvalQueueIds.length
        ? await this.sourceDb
            .select()
            .from(approvalQueueActions)
            .where(inArray(approvalQueueActions.approvalQueueId, approvalQueueIds))
        : [];
      console.log(`Found ${actionsData.length} approval queue actions`);

      // Export activity logs
      const activityLogsData = approvalQueueIds.length
        ? await this.sourceDb
            .select()
            .from(approvalQueueActivityLog)
            .where(inArray(approvalQueueActivityLog.approvalQueueId, approvalQueueIds))
        : [];
      console.log(`Found ${activityLogsData.length} activity logs`);

      // Create user mapping template
      const userMapping: UserMapping[] = usersToExport.map((user) => ({
        localUserId: user.id,
        localUserEmail: user.email,
        productionUserId: undefined,
        productionUserEmail: undefined,
      }));

      const migrationData: MigrationData = {
        users: usersToExport,
        emailThreads: emailThreadsData,
        emails: emailsData,
        escalations: escalationsData,
        approvalQueue: approvalQueueData,
        approvalQueueActions: actionsData,
        approvalQueueActivityLog: activityLogsData,
        userMapping,
      };

      // Write to file
      fs.writeFileSync(outputFile, JSON.stringify(migrationData, null, 2));

      console.log(`\n✅ Data exported to: ${outputFile}`);
      console.log('\n📝 Next steps:');
      console.log('1. Open the exported file');
      console.log(
        '2. Fill in the "productionUserId" and "productionUserEmail" in the userMapping section',
      );
      console.log('3. Run the import command with the updated file\n');
    } catch (error) {
      console.error('❌ Export failed:', error);
      throw error;
    }
  }

  /**
   * Step 2: Import data to target (production) database
   */
  async importData(inputFile: string, dryRun: boolean = true): Promise<MigrationStats> {
    console.log(`📥 ${dryRun ? '[DRY RUN] ' : ''}Importing data to target database...\n`);

    const stats: MigrationStats = {
      usersMatched: 0,
      emailThreadsImported: 0,
      emailsImported: 0,
      escalationsImported: 0,
      approvalQueueImported: 0,
      actionsImported: 0,
      activityLogsImported: 0,
      errors: [],
    };

    try {
      // Read migration data
      const migrationData: MigrationData = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

      // Validate user mapping
      console.log('🔍 Validating user mapping...');
      for (const mapping of migrationData.userMapping) {
        if (!mapping.productionUserId) {
          const error = `Missing production user ID for local user: ${mapping.localUserEmail}`;
          stats.errors.push(error);
          console.error(`❌ ${error}`);
          continue;
        }

        // Verify production user exists
        const prodUser = await this.targetDb
          .select()
          .from(users)
          .where(eq(users.id, mapping.productionUserId))
          .limit(1);

        if (!prodUser.length) {
          const error = `Production user not found: ${mapping.productionUserId} (${mapping.productionUserEmail})`;
          stats.errors.push(error);
          console.error(`❌ ${error}`);
          continue;
        }

        this.userIdMap.set(mapping.localUserId, mapping.productionUserId);
        stats.usersMatched++;
        console.log(`✓ Mapped: ${mapping.localUserEmail} → ${prodUser[0].email}`);
      }

      if (stats.errors.length > 0) {
        console.error('\n❌ User mapping validation failed. Fix errors and try again.\n');
        return stats;
      }

      console.log(`\n✅ All ${stats.usersMatched} users mapped successfully\n`);

      if (dryRun) {
        console.log('📊 DRY RUN - Preview of what would be imported:\n');
        this.printMigrationSummary(migrationData);
        return stats;
      }

      // Start transaction
      console.log('🚀 Starting data import...\n');

      // Import email threads
      const threadIdMap = new Map<string, string>();
      for (const thread of migrationData.emailThreads) {
        const newUserId = this.userIdMap.get(thread.userId);
        if (!newUserId) {
          stats.errors.push(`No user mapping for thread ${thread.id}`);
          continue;
        }

        const threadData = this.convertDates(thread, ['createdAt', 'updatedAt']);

        const [imported] = await this.targetDb
          .insert(emailThreads)
          .values({
            ...threadData,
            userId: newUserId,
            id: undefined, // Let DB generate new ID
          })
          .returning({ id: emailThreads.id });

        threadIdMap.set(thread.id, imported.id);
        stats.emailThreadsImported++;
      }
      console.log(`✓ Imported ${stats.emailThreadsImported} email threads`);

      // Import emails
      for (const email of migrationData.emails) {
        const newUserId = this.userIdMap.get(email.userId);
        const newThreadId = threadIdMap.get(email.threadId);

        if (!newUserId || !newThreadId) {
          stats.errors.push(`Missing mapping for email ${email.id}`);
          continue;
        }

        const emailData = this.convertDates(email, ['createdAt', 'internalDate']);

        await this.targetDb.insert(emails).values({
          ...emailData,
          userId: newUserId,
          threadId: newThreadId,
          id: undefined,
        });

        stats.emailsImported++;
      }
      console.log(`✓ Imported ${stats.emailsImported} emails`);

      // Import escalations
      const escalationIdMap = new Map<string, string>();
      for (const escalation of migrationData.escalations) {
        const newUserId = this.userIdMap.get(escalation.userId);
        const newThreadId = threadIdMap.get(escalation.threadId);

        if (!newUserId || !newThreadId) {
          stats.errors.push(`Missing mapping for escalation ${escalation.id}`);
          continue;
        }

        const escalationData = this.convertDates(escalation, ['createdAt', 'resolvedAt']);

        const [imported] = await this.targetDb
          .insert(escalations)
          .values({
            ...escalationData,
            userId: newUserId,
            threadId: newThreadId,
            id: undefined,
          })
          .returning({ id: escalations.id });

        escalationIdMap.set(escalation.id, imported.id);
        stats.escalationsImported++;
      }
      console.log(`✓ Imported ${stats.escalationsImported} escalations`);

      // Import approval queue
      const approvalQueueIdMap = new Map<string, string>();
      for (const queue of migrationData.approvalQueue) {
        const newUserId = this.userIdMap.get(queue.userId);
        const newThreadId = threadIdMap.get(queue.threadId);
        const newEscalationId = queue.escalationId ? escalationIdMap.get(queue.escalationId) : null;

        if (!newUserId || !newThreadId) {
          stats.errors.push(`Missing mapping for approval queue ${queue.id}`);
          continue;
        }

        const queueData = this.convertDates(queue, [
          'createdAt',
          'updatedAt',
          'escalatedAt',
          'completedAt',
        ]);

        const [imported] = await this.targetDb
          .insert(approvalQueue)
          .values({
            ...queueData,
            userId: newUserId,
            threadId: newThreadId,
            escalationId: newEscalationId,
            id: undefined,
          })
          .returning({ id: approvalQueue.id });

        approvalQueueIdMap.set(queue.id, imported.id);
        stats.approvalQueueImported++;
      }
      console.log(`✓ Imported ${stats.approvalQueueImported} approval queue items`);

      // Import approval queue actions
      for (const action of migrationData.approvalQueueActions) {
        const newApprovalQueueId = approvalQueueIdMap.get(action.approvalQueueId);
        const newEscalationId = action.escalationId
          ? escalationIdMap.get(action.escalationId)
          : null;
        const newReviewedBy = action.reviewedBy ? this.userIdMap.get(action.reviewedBy) : null;

        if (!newApprovalQueueId) {
          stats.errors.push(`Missing approval queue mapping for action ${action.id}`);
          continue;
        }

        const actionData = this.convertDates(action, [
          'createdAt',
          'updatedAt',
          'reviewedAt',
          'executedAt',
        ]);

        await this.targetDb.insert(approvalQueueActions).values({
          ...actionData,
          approvalQueueId: newApprovalQueueId,
          escalationId: newEscalationId,
          reviewedBy: newReviewedBy,
          id: undefined,
        });

        stats.actionsImported++;
      }
      console.log(`✓ Imported ${stats.actionsImported} approval queue actions`);

      // Import activity logs
      for (const log of migrationData.approvalQueueActivityLog) {
        const newApprovalQueueId = approvalQueueIdMap.get(log.approvalQueueId);
        const newUserId = log.userId ? this.userIdMap.get(log.userId) : null;

        if (!newApprovalQueueId) {
          stats.errors.push(`Missing approval queue mapping for activity log ${log.id}`);
          continue;
        }

        const logData = this.convertDates(log, ['createdAt']);

        await this.targetDb.insert(approvalQueueActivityLog).values({
          ...logData,
          approvalQueueId: newApprovalQueueId,
          userId: newUserId,
          id: undefined,
        });

        stats.activityLogsImported++;
      }
      console.log(`✓ Imported ${stats.activityLogsImported} activity logs`);

      console.log('\n✅ Migration completed successfully!\n');
      this.printStats(stats);

      return stats;
    } catch (error) {
      console.error('❌ Import failed:', error);
      stats.errors.push(error.message);
      throw error;
    }
  }

  /**
   * Helper: Fetch production users for mapping
   */
  async getProductionUsers(): Promise<void> {
    console.log('📋 Production Users:\n');
    const prodUsers = await this.targetDb.select().from(users);

    prodUsers.forEach((user) => {
      console.log(`ID: ${user.id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Name: ${user.firstName} ${user.lastName}`);
      console.log('---');
    });
  }

  private printMigrationSummary(data: MigrationData): void {
    console.log('📊 Migration Summary:');
    console.log(`  Users mapped: ${data.userMapping.length}`);
    console.log(`  Email threads: ${data.emailThreads.length}`);
    console.log(`  Emails: ${data.emails.length}`);
    console.log(`  Escalations: ${data.escalations.length}`);
    console.log(`  Approval queue items: ${data.approvalQueue.length}`);
    console.log(`  Approval queue actions: ${data.approvalQueueActions.length}`);
    console.log(`  Activity logs: ${data.approvalQueueActivityLog.length}`);
    console.log('');
  }

  private printStats(stats: MigrationStats): void {
    console.log('📊 Import Statistics:');
    console.log(`  Users matched: ${stats.usersMatched}`);
    console.log(`  Email threads imported: ${stats.emailThreadsImported}`);
    console.log(`  Emails imported: ${stats.emailsImported}`);
    console.log(`  Escalations imported: ${stats.escalationsImported}`);
    console.log(`  Approval queue imported: ${stats.approvalQueueImported}`);
    console.log(`  Actions imported: ${stats.actionsImported}`);
    console.log(`  Activity logs imported: ${stats.activityLogsImported}`);
    if (stats.errors.length > 0) {
      console.log(`  Errors: ${stats.errors.length}`);
      stats.errors.forEach((err) => console.log(`    - ${err}`));
    }
    console.log('');
  }

  async close(): Promise<void> {
    // Close connections
  }
}

// CLI Setup
const program = new Command();

program
  .name('migrate-ai-assistant-data')
  .description('Migrate AI assistant data between environments with user mapping')
  .version('1.0.0');

program
  .command('export')
  .description('Export data from source database')
  .requiredOption('-s, --source <connectionString>', 'Source database connection string')
  .requiredOption('-o, --output <file>', 'Output file path')
  .option('-u, --users <userIds...>', 'Specific user IDs to export (optional)')
  .action(async (options) => {
    const service = new DataMigrationService(options.source, '');
    await service.exportData(options.output, options.users);
    await service.close();
  });

program
  .command('import')
  .description('Import data to target database')
  .requiredOption('-t, --target <connectionString>', 'Target database connection string')
  .requiredOption('-i, --input <file>', 'Input file path')
  .option('--no-dry-run', 'Actually perform the import (default is dry-run)')
  .action(async (options) => {
    const service = new DataMigrationService('', options.target);
    await service.importData(options.input, options.dryRun);
    await service.close();
  });

program
  .command('list-production-users')
  .description('List all users in production database')
  .requiredOption('-t, --target <connectionString>', 'Production database connection string')
  .action(async (options) => {
    const service = new DataMigrationService('', options.target);
    await service.getProductionUsers();
    await service.close();
  });

program.parse();
