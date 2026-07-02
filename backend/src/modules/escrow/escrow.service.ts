import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES, ESCROW_JOBS } from '../queues/queues.constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const PLATFORM_FEE_PCT = 0.10;

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.ESCROW) private readonly escrowQueue: Queue,
  ) {}

  /** Initiate escrow — returns Chapa/Telebirr payment link */
  async initiate(clientId: string, freelanceJobId: string) {
    const job = await this.prisma.freelanceJob.findFirst({ 
      where: { id: freelanceJobId, clientId },
      include: { client: true, contract: true }
    });
    if (!job) throw new NotFoundException('Gig not found');

    // Use the agreed contract amount if a contract exists, otherwise fall back to budgetMax
    // Best practice: escrow should only be initiated after a bid is accepted and a contract exists
    const grossAmount = job.contract ? job.contract.agreedAmount : job.budgetMax;
    if (!job.contract) {
      this.logger.warn(`Escrow initiated without a contract for job ${freelanceJobId} — using budgetMax. Consider initiating escrow after bid acceptance.`);
    }

    const platformFee  = Math.round(grossAmount * PLATFORM_FEE_PCT);
    const netAmount    = grossAmount - platformFee;

    const escrow = await this.prisma.escrowTransaction.create({
      data: { freelanceJobId, grossAmount, platformFee, netAmount, status: 'PENDING' },
    });

    let checkoutUrl = `${this.config.get('FRONTEND_URL')}/freelance/pay?escrow=${escrow.id}`;
    
    const chapaSecret = this.config.get<string>('CHAPA_SECRET_KEY');
    if (chapaSecret) {
      try {
        const response = await fetch('https://api.chapa.co/v1/transaction/initialize', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${chapaSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: grossAmount.toString(),
            currency: 'ETB',
            email: job.client.email,
            first_name: job.client.firstName,
            last_name: job.client.lastName,
            tx_ref: escrow.id,
            callback_url: this.config.get<string>('CHAPA_CALLBACK_URL'),
            return_url: this.config.get<string>('CHAPA_RETURN_URL'),
            customization: {
              title: 'Beleqet Escrow',
              description: `Payment for Gig: ${job.title}`,
            }
          }),
        });

        const data = await response.json();
        if (data.status === 'success') {
          checkoutUrl = data.data.checkout_url;
        } else {
          this.logger.warn(`Chapa initialization failed: ${data.message}`);
        }
      } catch (err) {
        this.logger.error(`Failed to reach Chapa: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Escrow initiated: ${escrow.id} for job ${freelanceJobId} — amount: ETB ${grossAmount}`);
    return { escrowId: escrow.id, checkoutUrl, grossAmount, platformFee, netAmount };
  }

  /** Called by Chapa webhook — verifies signature, marks escrow funded */
  async handleWebhook(payload: { reference: string; status: string; [k: string]: unknown }) {
    await this.escrowQueue.add(ESCROW_JOBS.PROCESS_WEBHOOK, payload);
  }

  /** Called when employer approves milestone */
  async releaseMilestone(milestoneId: string, clientId: string) {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, contract: { clientId } },
      include: { contract: { include: { freelanceJob: { include: { escrowTx: true } } } } },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.milestone.update({
        where: { id: milestoneId },
        data: { status: 'APPROVED', approvedAt: new Date() },
      });

      await tx.eventLog.create({
        data: {
          eventType: 'milestone.approved',
          entityId: milestoneId,
          entityType: 'Milestone',
          payload: { 
            milestoneId, 
            freelancerId: milestone.contract.freelancerId, 
            amount: milestone.amount 
          },
          processedBy: EscrowService.name,
        },
      });
    });

    try {
      // Add to wallet pending balance (3-day hold)
      await this.escrowQueue.add(ESCROW_JOBS.AUTO_RELEASE, {
        milestoneId,
        freelancerId: milestone.contract.freelancerId,
        amount: milestone.amount,
        releaseAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
      });
    } catch (err) {
      this.logger.error(`Failed to enqueue auto-release for milestone ${milestoneId}`, err instanceof Error ? err.stack : err);
    }

    this.logger.log(`Milestone ${milestoneId} approved — payout queued`);
    return { success: true };
  }
}
