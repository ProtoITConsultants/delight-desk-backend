import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApprovalQueueRepository } from '../../database/repos/approval-queue.repository';
import { ApprovalQueueActionsRepository } from '../../database/repos/approval-queue-actions.repository';
import { EscalationsRepository } from '../../database/repos/escalations.repository';
import { SystemSettingsRepository } from '../../database/repos/system-settings.repository';
import {
  EditAndApproveDto,
  GetApprovalQueueDto,
  GetWorkflowProgressItemsDto,
  RejectItemDto,
} from './approval-queue.dto';
import {
  ApprovalProgressStage,
  ApprovalProgressStageStatus,
  ApprovalQueueActionProgressResponse,
  ApprovalQueueStatsResponse,
  PaginatedWorkflowProgressResponse,
  ProgressFulfillmentMethod,
  QueueAction,
  StageBlueprint,
  WorkflowProgressListItem,
} from './approval-queue.types';
import {
  CUSTOM_WAREHOUSE_STAGES,
  SHIPBOB_STAGES,
  SHIPSTATION_STAGES,
  SELF_FULFILLMENT_STAGES,
  ADDRESS_CHANGE_SELF_STAGES,
  ADDRESS_CHANGE_CUSTOM_WAREHOUSE_STAGES,
} from './approval-queue-progress.constants';
import { HumanDecision } from '../temporal/workflows/types';
import { InfraService } from '../temporal/infra.service';
import { ApprovalQueueEventsService } from './approval-queue-events.service';
import { ActivityLogEventsService } from '../dashboard/activity-log/activity-log-events.service';

@Injectable()
export class ApprovalQueueService {
  constructor(
    private readonly approvalQueueRepository: ApprovalQueueRepository,
    private readonly approvalQueueActionsRepository: ApprovalQueueActionsRepository,
    private readonly escalationsRepository: EscalationsRepository,
    private readonly systemSettingsRepository: SystemSettingsRepository,
    private readonly infraService: InfraService,
    private readonly approvalQueueEventsService: ApprovalQueueEventsService,
    private readonly activityLogEventsService: ActivityLogEventsService,
  ) {}

  streamQueueUpdates(userId: string): Observable<MessageEvent> {
    return this.approvalQueueEventsService.subscribe(userId);
  }

  getStreamStats() {
    return this.approvalQueueEventsService.getStreamStats();
  }

  async getApprovalQueueItems(userId: string, dto: GetApprovalQueueDto): Promise<any> {
    const { page = 1, limit = 20, status, category } = dto;

    const offset = (page - 1) * limit;

    const filters = {
      userId,
      status,
      category,
      limit: limit,
      offset,
    };

    const items = await this.approvalQueueRepository.getApprovalQueueWithFilters(filters);
    const totalItems = items.length > 0 ? items[0].totalItems : 0;
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 0;

    if (items.length === 0) {
      return {
        data: [],
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNextPage: false,
          hasPreviousPage: page > 1,
        },
      };
    }

    const ids = items.map((item) => item.approval.id);
    const allActions = await this.approvalQueueActionsRepository.getActionsForApprovalQueueIds(ids);

    const escalationIds = allActions
      .map((action) => action.escalationId)
      .filter((id): id is string => Boolean(id));
    const escalationReasonById =
      escalationIds.length > 0
        ? new Map(
            (await this.escalationsRepository.findByIds(escalationIds)).map((escalation) => [
              escalation.id,
              escalation.reason,
            ]),
          )
        : new Map<string, string>();

    const actionsByApprovalId = allActions.reduce<Record<string, typeof allActions>>(
      (acc, action) => {
        const key = action.approvalQueueId;
        if (!acc[key]) acc[key] = [];
        acc[key].push(action);
        return acc;
      },
      {},
    );

    const data = items.map((item) => {
      const actions = actionsByApprovalId[item.approval.id] ?? [];

      return {
        id: item.approval.id,
        workflowId: item.approval.workflowId,
        status: item.approval.status,
        category: item.approval.category,
        customerEmail: item.approval.customerEmail,
        customerName: item.approval.customerName,
        emailSubject: item.approval.emailSubject,
        originalCustomerEmailBody: item.approval.emailBody,
        createdAt: item.approval.createdAt,
        workflowActions: actions.map((action) => ({
          id: action.id,
          name: action.name,
          description: action.description,
          actionDetails: action.actionDetails,
          status: action.actionStatus,
          step: action.actionStep,
          createdAt: action.createdAt,
          proposedEmailBody: action.proposedEmailBody,
          escalationId: action.escalationId,
          escalationReason:
            action.escalationReason ?? escalationReasonById.get(action.escalationId ?? '') ?? null,
        })),
      };
    });

    return {
      data,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getWorkflowProgressItems(
    userId: string,
    dto: GetWorkflowProgressItemsDto,
  ): Promise<PaginatedWorkflowProgressResponse> {
    const { page = 1, limit = 20, status, category } = dto;
    const offset = (page - 1) * limit;

    const filters = {
      userId,
      status,
      category,
      limit,
      offset,
    };

    const items = await this.approvalQueueRepository.getApprovalQueueWithFilters(filters);
    const totalItems = items.length > 0 ? items[0].totalItems : 0;
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 0;

    if (items.length === 0) {
      return {
        data: [],
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNextPage: false,
          hasPreviousPage: page > 1,
        },
      };
    }

    const ids = items.map((item) => item.approval.id);
    const allActions = await this.approvalQueueActionsRepository.getActionsForApprovalQueueIds(ids);
    const userSettings = await this.systemSettingsRepository.findByUser(userId);
    const actionsByApprovalId = allActions.reduce<Record<string, QueueAction[]>>((acc, action) => {
      const key = action.approvalQueueId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(action);
      return acc;
    }, {});

    const data: WorkflowProgressListItem[] = items.map((item) => {
      const actions = actionsByApprovalId[item.approval.id] ?? [];
      const actionProgress =
        item.approval.category === 'order_cancellation'
          ? this.buildOrderCancellationProgress(
              item.approval.status,
              actions,
              userSettings?.fulfillmentMethod,
            )
          : item.approval.category === 'address_change'
            ? this.buildAddressChangeProgress(
                item.approval.status,
                actions,
                userSettings?.fulfillmentMethod,
              )
            : null;

      return {
        id: item.approval.id,
        status: item.approval.status,
        category: item.approval.category,
        customerEmail: item.approval.customerEmail,
        customerName: item.approval.customerName,
        orderNumber: this.extractOrderNumber(actions),
        createdAt: item.approval.createdAt,
        actionProgress,
      };
    });

    return {
      data,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async approveAction(userId: string, actionId: string, reviewedBy: string) {
    const action = await this.approvalQueueActionsRepository.findById(actionId);

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    const workflow = await this.approvalQueueRepository.findById(action.approvalQueueId, userId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have permission to approve this action');
    }

    if (action.actionStatus !== 'pending_approval') {
      throw new BadRequestException(`Cannot approve action with status: ${action.actionStatus}`);
    }

    // Update action status
    const updated = await this.approvalQueueActionsRepository.updateAction(actionId, {
      actionStatus: 'approved',
    });

    // Send signal to Temporal workflow to continue execution
    // Pass the action ID so the workflow can route the response to the correct action
    await this.infraService.sendApprovalSignalToWorkflow(
      workflow.workflowId,
      {
        decision: HumanDecision.APPROVE,
        respondedBy: reviewedBy,
        respondedAt: new Date(),
      },
      actionId, // Pass action ID
    );

    this.approvalQueueEventsService.emitQueueUpdated(userId, 'action_approved');
    this.activityLogEventsService.emitActivityUpdated(userId, 'action_approved');

    return { message: 'Action approved successfully' };
  }

  async rejectAction(userId: string, actionId: string, reviewedBy: string, dto: RejectItemDto) {
    const action = await this.approvalQueueActionsRepository.findById(actionId);

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    const workflow = await this.approvalQueueRepository.findById(action.approvalQueueId, userId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have permission to reject this action');
    }

    if (action.actionStatus !== 'pending_approval') {
      throw new BadRequestException(`Cannot reject action with status: ${action.actionStatus}`);
    }

    // Update action status
    const updated = await this.approvalQueueActionsRepository.updateAction(actionId, {
      actionStatus: 'rejected',
    });

    // Send signal to Temporal workflow
    // Pass the action ID so the workflow can route the response to the correct action
    await this.infraService.sendApprovalSignalToWorkflow(
      workflow.workflowId,
      {
        decision: HumanDecision.REJECT,
        respondedBy: reviewedBy,
        respondedAt: new Date(),
        notes: dto.notes,
      },
      actionId, // Pass action ID
    );

    this.approvalQueueEventsService.emitQueueUpdated(userId, 'action_rejected');
    this.activityLogEventsService.emitActivityUpdated(userId, 'action_rejected');

    return { message: 'Action rejected successfully' };
  }

  async editAndApprove(userId: string, actionId: string, dto: EditAndApproveDto) {
    const action = await this.approvalQueueActionsRepository.findById(actionId);

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    const workflow = await this.approvalQueueRepository.findById(action.approvalQueueId, userId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have permission to edit this action');
    }

    if (action.actionStatus !== 'pending_approval') {
      throw new BadRequestException(`Cannot edit action with status: ${action.actionStatus}`);
    }

    // Update action with edited response
    await this.approvalQueueActionsRepository.updateAction(actionId, {
      actionStatus: 'approved',
      proposedEmailBody: dto.editedResponse,
    });

    // Send signal to Temporal workflow with edited response
    // Pass the action ID so the workflow can route the response to the correct action
    await this.infraService.sendApprovalSignalToWorkflow(
      workflow.workflowId,
      {
        decision: HumanDecision.MODIFY_AND_APPROVE,
        modifiedData: {
          message: dto.editedResponse,
        },
        respondedBy: userId,
        respondedAt: new Date(),
      },
      actionId, // Pass action ID
    );

    this.approvalQueueEventsService.emitQueueUpdated(userId, 'action_edited_and_approved');
    this.activityLogEventsService.emitActivityUpdated(userId, 'action_edited_and_approved');

    return { message: 'Action edited and approved successfully' };
  }

  async cancelWorkflow(userId: string, workflowId: string) {
    const workflow = await this.approvalQueueRepository.findByWorkflowId(workflowId, userId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const nonCancellableStatuses = ['completed', 'escalated', 'cancelled'];
    if (nonCancellableStatuses.includes(workflow.status)) {
      throw new BadRequestException(`Cannot cancel a workflow with status: ${workflow.status}`);
    }

    await this.infraService.cancelWorkflow(workflowId);

    await this.approvalQueueRepository.cancelWorkflowTransactionally(workflow.id, userId);

    this.approvalQueueEventsService.emitQueueUpdated(userId, 'workflow_cancelled');
    this.activityLogEventsService.emitActivityUpdated(userId, 'workflow_cancelled');

    return { message: 'Workflow cancelled successfully' };
  }

  async getStats(userId: string): Promise<ApprovalQueueStatsResponse> {
    return await this.approvalQueueRepository.getStats(userId);
  }

  private buildOrderCancellationProgress(
    workflowStatus: string,
    actions: QueueAction[],
    configuredMethod: string | null | undefined,
  ): ApprovalQueueActionProgressResponse {
    const fulfillmentMethod = this.resolveFulfillmentMethod(configuredMethod, actions);
    const stages = this.buildStagesForMethod(fulfillmentMethod);
    const timeline = stages.map((stage) => this.buildStageProgress(stage, actions, workflowStatus));

    let currentStep: ApprovalProgressStage | null =
      timeline.find((stage) => stage.status === 'blocked') ||
      timeline.find((stage) => stage.status === 'in_progress') ||
      timeline.find((stage) => stage.status === 'pending') ||
      null;

    if (workflowStatus === 'completed') {
      const completedStages = timeline.filter((stage) => stage.status === 'completed');
      currentStep = completedStages.length > 0 ? completedStages[completedStages.length - 1] : null;
    }

    return {
      fulfillmentMethod,
      currentStep,
      timeline,
    };
  }

  private buildAddressChangeProgress(
    workflowStatus: string,
    actions: QueueAction[],
    configuredMethod: string | null | undefined,
  ): ApprovalQueueActionProgressResponse {
    const fulfillmentMethod = this.resolveFulfillmentMethod(configuredMethod, actions);
    const stages = this.buildACStagesForMethod(fulfillmentMethod);
    const timeline = stages.map((stage) => this.buildStageProgress(stage, actions, workflowStatus));

    let currentStep: ApprovalProgressStage | null =
      timeline.find((stage) => stage.status === 'blocked') ||
      timeline.find((stage) => stage.status === 'in_progress') ||
      timeline.find((stage) => stage.status === 'pending') ||
      null;

    if (workflowStatus === 'completed') {
      const completedStages = timeline.filter((stage) => stage.status === 'completed');
      currentStep = completedStages.length > 0 ? completedStages[completedStages.length - 1] : null;
    }

    return {
      fulfillmentMethod,
      currentStep,
      timeline,
    };
  }

  private resolveFulfillmentMethod(
    configuredMethod: string | null | undefined,
    actions: QueueAction[],
  ): ProgressFulfillmentMethod {
    const actionTypes = new Set(
      actions.map((action) => this.normalizeActionType(action.actionType)),
    );
    const hasShipBobSignal = this.actionsContainKeyword(actions, 'shipbob');
    const hasShipStationSignal = this.actionsContainKeyword(actions, 'shipstation');

    // Custom warehouse has unique action types that no other method uses.
    if (actionTypes.has('contact_warehouse') || actionTypes.has('wait_for_warehouse_reply')) {
      return 'custom_warehouse';
    }

    // ShipBob / ShipStation share generic action types with self flow, so detect
    // using provider-specific text in action descriptions/details.
    if (hasShipBobSignal) {
      return 'shipbob';
    }
    if (hasShipStationSignal) {
      return 'shipstation';
    }

    // If cancellation/refund/address-change actions exist and no provider-specific signals
    // were found, this is the self-fulfillment flow.
    if (
      actionTypes.has('process_cancellation') ||
      actionTypes.has('process_refund') ||
      actionTypes.has('process_address_change')
    ) {
      return 'self';
    }

    // For early-stage workflows where provider-specific actions haven't executed yet,
    // fall back to configured method.
    if (
      configuredMethod === 'self' ||
      configuredMethod === 'custom_warehouse' ||
      configuredMethod === 'shipstation' ||
      configuredMethod === 'shipbob'
    ) {
      return configuredMethod;
    }

    return 'unknown';
  }

  private buildStagesForMethod(fulfillmentMethod: ProgressFulfillmentMethod): StageBlueprint[] {
    if (fulfillmentMethod === 'custom_warehouse') {
      return CUSTOM_WAREHOUSE_STAGES;
    }
    if (fulfillmentMethod === 'shipbob') {
      return SHIPBOB_STAGES;
    }
    if (fulfillmentMethod === 'shipstation') {
      return SHIPSTATION_STAGES;
    }

    // Default order-cancellation map for self + unknown, so UI always has a stable timeline.
    return SELF_FULFILLMENT_STAGES;
  }

  private buildACStagesForMethod(fulfillmentMethod: ProgressFulfillmentMethod): StageBlueprint[] {
    if (fulfillmentMethod === 'custom_warehouse') {
      return ADDRESS_CHANGE_CUSTOM_WAREHOUSE_STAGES;
    }

    // self, shipbob, shipstation and unknown all share the same address-change stage layout.
    return ADDRESS_CHANGE_SELF_STAGES;
  }

  private buildStageProgress(
    stage: StageBlueprint,
    actions: QueueAction[],
    workflowStatus: string,
  ): ApprovalProgressStage {
    const stageActionTypeSet = new Set(
      stage.actionTypes.map((actionType) => this.normalizeActionType(actionType)),
    );
    const stageActions = actions.filter((action) => {
      const normalizedActionType = this.normalizeActionType(action.actionType);
      if (!stageActionTypeSet.has(normalizedActionType)) {
        return false;
      }
      return this.actionBelongsToStage(stage.key, normalizedActionType, action.actionStep);
    });
    const actionStatuses = stageActions.map((action) => action.actionStatus);
    const blockedStatuses = new Set(['failed', 'escalated', 'rejected']);
    const inProgressStatuses = new Set([
      'pending_approval',
      'approved',
      'executing',
      'awaiting_customer_reply',
    ]);

    let status: ApprovalProgressStageStatus = 'pending';
    if (actionStatuses.some((actionStatus) => blockedStatuses.has(actionStatus))) {
      status = 'blocked';
    } else if (actionStatuses.some((actionStatus) => inProgressStatuses.has(actionStatus))) {
      status = 'in_progress';
    } else if (actionStatuses.some((actionStatus) => actionStatus === 'executed')) {
      status = 'completed';
    }

    if (status === 'pending' && workflowStatus === 'cancelled') {
      status = 'cancelled';
    }
    if (status === 'pending' && workflowStatus === 'completed') {
      status = 'completed';
    }

    return {
      key: stage.key,
      label: stage.label,
      order: stage.order,
      status,
    };
  }

  private normalizeActionType(actionType: string): string {
    return actionType.replace(/^oc_/, '');
  }

  /**
   * Some action types (notably fetch_order_details) appear in multiple phases:
   * - step 4: WooCommerce order fetch during identification
   * - step 6.x: fulfillment-provider order fetch during eligibility checks
   *
   * Disambiguate by action step so timeline stages don't get double-blocked.
   */
  private actionBelongsToStage(stageKey: string, actionType: string, actionStep: string): boolean {
    if (actionType !== 'fetch_order_details') {
      return true;
    }

    const stepNumber = Number.parseFloat(actionStep);
    if (Number.isNaN(stepNumber)) {
      return true;
    }

    if (stageKey === 'identify_order') {
      return stepNumber < 6;
    }

    if (stageKey === 'check_eligibility') {
      return stepNumber >= 6 && stepNumber < 7;
    }

    return true;
  }

  private actionsContainKeyword(actions: QueueAction[], keyword: string): boolean {
    const normalizedKeyword = keyword.toLowerCase();
    return actions.some((action) => {
      const haystack = [action.name, action.description, action.actionDetails]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedKeyword);
    });
  }

  private extractOrderNumber(actions: QueueAction[]): string | null {
    const regex = /order\s*#?(\d+)/i;

    for (const action of actions) {
      const sources = [action.description, action.actionDetails];
      for (const text of sources) {
        if (!text) continue;
        const match = text.match(regex);
        if (match?.[1]) {
          return match[1];
        }
      }
    }

    return null;
  }
}
