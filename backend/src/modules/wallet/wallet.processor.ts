import { Processor, Process } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES, WALLET_JOBS } from '../queues/queues.constants';

interface ReleasePendingPayload {
  userId: string;
  amount: number;
  milestoneId?: string;
}

@Injectable()
@Processor(QUEUE_NAMES.WALLET)
export class WalletProcessor {
  private readonly logger = new Logger(WalletProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process(WALLET_JOBS.RELEASE_PENDING)
  async handleReleasePending(job: BullJob<ReleasePendingPayload>) {
    const { userId, amount, milestoneId } = job.data;

    const wallet = await this.prisma.freelancerWallet.upsert({
      where: { userId },
      update: {
        pendingBalance:   { decrement: amount },
        availableBalance: { increment: amount },
      },
      create: {
        userId,
        pendingBalance: 0,
        availableBalance: amount,
      },
    });

    await this.prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'CREDIT_AVAILABLE',
        amount,
        note: milestoneId
          ? `Milestone payout cleared — 3-day hold complete`
          : 'Hold period cleared',
        milestoneId,
      },
    });

    this.logger.log(`[wallet] Released ETB ${amount} from pending → available for user ${userId}`);
  }
}
